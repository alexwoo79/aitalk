// 统一 Dashboard 计算 — 一次 IPC，全部结果
// 前端传筛选条件 + 计算规格，Rust 计算后返回所有结果

use crate::state::get_active_df;
use crate::types::ApiResult;
use polars::prelude::*;
use std::collections::HashMap;

#[derive(Debug, Default, serde::Deserialize)]
pub struct FilterInput {
    #[serde(default)]
    pub dimension_filters: HashMap<String, String>,
    #[serde(default)]
    pub date_column: String,
    #[serde(default)]
    pub date_start: String,
    #[serde(default)]
    pub date_end: String,
    #[serde(default)]
    pub search_text: String,
    #[serde(default)]
    pub condition: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct KpiInput {
    pub label: String,
    pub column: String,
    pub agg: String,
    #[serde(default)]
    pub filter: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ChartInput {
    pub key: String,
    pub dim_col: String,
    pub metric_col: String,
    pub agg: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ComputeRequest {
    #[serde(default)]
    pub filters: FilterInput,
    #[serde(default)]
    pub kpis: Vec<KpiInput>,
    #[serde(default)]
    pub charts: Vec<ChartInput>,
    #[serde(default)]
    pub summary: HashMap<String, String>,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct GroupbyItem {
    pub label: String,
    pub value: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct ComputeResponse {
    pub row_count: usize,
    pub kpi_values: HashMap<String, f64>,
    pub chart_data: HashMap<String, Vec<GroupbyItem>>,
    pub summary_values: HashMap<String, f64>,
}

#[tauri::command]
pub async fn compute_dashboard(request_json: String) -> ApiResult<ComputeResponse> {
    let req: ComputeRequest = match serde_json::from_str(&request_json) {
        Ok(v) => v,
        Err(e) => return ApiResult::failure(format!("请求 JSON 解析失败: {e}")),
    };

    let df = match get_active_df() {
        Ok(v) => v,
        Err(e) => return ApiResult::failure(e.to_string()),
    };
    let filtered = match apply_dim_date_filters(&df, &req.filters) {
        Ok(v) => v,
        Err(e) => return ApiResult::failure(e),
    };
    let row_count = filtered.height();

    let mut kpi_values = HashMap::new();
    for kpi in &req.kpis {
        let kpi_df = if kpi.filter.is_empty() {
            filtered.clone()
        } else {
            match parse_condition_expr(
                &kpi.filter,
                &filtered
                    .get_column_names()
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>(),
            ) {
                Some(expr) => filtered
                    .clone()
                    .lazy()
                    .filter(expr)
                    .collect()
                    .unwrap_or_else(|_| filtered.clone()),
                None => filtered.clone(),
            }
        };
        kpi_values.insert(
            kpi.label.clone(),
            compute_one(&kpi_df, &kpi.column, &kpi.agg),
        );
    }

    let mut chart_data = HashMap::new();
    for chart in &req.charts {
        let items = compute_groupby(&filtered, &chart.dim_col, &chart.metric_col, &chart.agg)
            .unwrap_or_default();
        chart_data.insert(chart.key.clone(), items);
    }

    let mut summary_values = HashMap::new();
    for (cn, agg) in &req.summary {
        summary_values.insert(cn.clone(), compute_one(&filtered, cn, agg));
    }

    ApiResult::success(ComputeResponse {
        row_count,
        kpi_values,
        chart_data,
        summary_values,
    })
}

fn apply_dim_date_filters(df: &DataFrame, f: &FilterInput) -> Result<DataFrame, String> {
    let names: Vec<String> = df
        .get_column_names()
        .iter()
        .map(|n| n.to_string())
        .collect();
    let mut df = df.clone().lazy();

    let has_dim = f
        .dimension_filters
        .iter()
        .any(|(_, v)| !v.is_empty() && v.as_str() != "__all__");
    if has_dim {
        let exprs: Vec<Expr> = f
            .dimension_filters
            .iter()
            .filter(|(_, v)| !v.is_empty() && v.as_str() != "__all__")
            .filter(|(c, _)| names.iter().any(|n| n == *c))
            .map(|(c, v)| col(c.as_str()).eq(lit(v.as_str())))
            .collect();
        if !exprs.is_empty() {
            df = df.filter(exprs.into_iter().reduce(|a, b| a.and(b)).unwrap());
        }
    }

    if !f.date_column.is_empty()
        && !f.date_start.is_empty()
        && !f.date_end.is_empty()
        && names.iter().any(|n| n == &f.date_column)
    {
        df = df.filter(
            col(f.date_column.as_str())
                .gt_eq(lit(f.date_start.as_str()))
                .and(col(f.date_column.as_str()).lt_eq(lit(f.date_end.as_str()))),
        );
    }

    // 搜索文本：在所有列中 contains_literal 匹配（Polars 0.54+）
    if !f.search_text.is_empty() {
        let q = f.search_text.as_str();
        let str_exprs: Vec<Expr> = names
            .iter()
            .map(|n| {
                col(n.as_str())
                    .cast(DataType::String)
                    .str()
                    .contains_literal(lit(q))
            })
            .collect();
        if !str_exprs.is_empty() {
            df = df.filter(str_exprs.into_iter().reduce(|a, b| a.or(b)).unwrap());
        }
    }

    // 条件表达式：& (AND) / | (OR) / = != > < >= <= in ~
    if !f.condition.is_empty() {
        if let Some(expr) = parse_condition_expr(&f.condition, &names) {
            df = df.filter(expr);
        }
    }

    df.collect().map_err(|e| format!("筛选失败: {e}"))
}

// ──────────────── 条件表达式解析 ────────────────

#[derive(Debug)]
struct Cond {
    column: String,
    op: String,
    value: String,
}

/// 解析 "列名 运算符 值" 单个条件（纯字符串操作，无正则依赖）
fn parse_one_cond(s: &str) -> Option<Cond> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    // in 操作符
    if let Some(idx) = s.find(" in ") {
        return Some(Cond {
            column: s[..idx].trim().to_string(),
            op: "in".into(),
            value: s[idx + 4..].trim().to_string(),
        });
    }
    // contains: ~ ～ contains
    for sep in &[" ~ ", " ～ ", " contains "] {
        if let Some(idx) = s.find(sep) {
            return Some(Cond {
                column: s[..idx].trim().to_string(),
                op: "contains".into(),
                value: s[idx + sep.len()..].trim().to_string(),
            });
        }
    }
    // 标准比较 != >= <= > < =
    for op_str in &["!=", ">=", "<=", "=", ">", "<"] {
        if let Some(idx) = s.find(op_str) {
            let col = s[..idx].trim().to_string();
            if col.is_empty() {
                continue;
            }
            let val = s[idx + op_str.len()..].trim().to_string();
            let op = match *op_str {
                "=" => "eq",
                "!=" => "ne",
                ">" => "gt",
                ">=" => "gte",
                "<" => "lt",
                "<=" => "lte",
                _ => continue,
            };
            return Some(Cond {
                column: col,
                op: op.to_string(),
                value: val,
            });
        }
    }
    None
}

/// 解析完整条件表达式：& = AND组, | = OR组内
fn parse_condition_expr(cond: &str, names: &[String]) -> Option<Expr> {
    let cond = cond.trim();
    if cond.is_empty() {
        return None;
    }

    // 大小写不敏感列名映射
    let resolve_col = |c: &str| -> String {
        let lower = c.to_lowercase();
        names
            .iter()
            .find(|n| n.to_lowercase() == lower)
            .cloned()
            .unwrap_or_else(|| c.to_string())
    };

    // 按 & 拆分 AND 组
    let and_groups: Vec<&str> = cond
        .split('&')
        .map(|g| g.trim())
        .filter(|g| !g.is_empty())
        .collect();
    if and_groups.is_empty() {
        return None;
    }

    let mut and_exprs: Vec<Expr> = Vec::new();

    for group in &and_groups {
        // 按 | 拆分 OR 子条件
        let or_parts: Vec<&str> = group
            .split('|')
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .collect();
        if or_parts.is_empty() {
            continue;
        }

        let mut or_exprs: Vec<Expr> = Vec::new();
        for part in &or_parts {
            if let Some(cond) = parse_one_cond(part) {
                let col_name = resolve_col(&cond.column);
                if let Some(expr) = cond_to_expr(&col_name, &cond.op, &cond.value) {
                    or_exprs.push(expr);
                }
            }
        }
        if !or_exprs.is_empty() {
            and_exprs.push(or_exprs.into_iter().reduce(|a, b| a.or(b)).unwrap());
        }
    }

    if and_exprs.is_empty() {
        None
    } else {
        Some(and_exprs.into_iter().reduce(|a, b| a.and(b)).unwrap())
    }
}

/// 单个条件 → Polars Expr
fn cond_to_expr(col_name: &str, op: &str, value: &str) -> Option<Expr> {
    match op {
        "eq" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).eq(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).eq(lit(value)))
            }
        }
        "ne" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).neq(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).neq(lit(value)))
            }
        }
        "gt" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).gt(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).gt(lit(value)))
            }
        }
        "gte" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).gt_eq(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).gt_eq(lit(value)))
            }
        }
        "lt" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).lt(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).lt(lit(value)))
            }
        }
        "lte" => {
            if let Ok(n) = value.replace(',', "").parse::<f64>() {
                Some(col(col_name).cast(DataType::Float64).lt_eq(lit(n)))
            } else {
                Some(col(col_name).cast(DataType::String).lt_eq(lit(value)))
            }
        }
        "contains" => Some(
            col(col_name)
                .cast(DataType::String)
                .str()
                .contains_literal(lit(value)),
        ),
        "in" => {
            let clean = value.replace(['[', ']', '(', ')', '"', '\''], "");
            let items: Vec<&str> = clean
                .split([',', '，', '、', ';'])
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if items.is_empty() {
                return None;
            }
            let exprs: Vec<Expr> = items
                .iter()
                .map(|item| {
                    if item.parse::<f64>().is_ok() {
                        col(col_name)
                            .cast(DataType::Float64)
                            .eq(lit(item.parse::<f64>().unwrap()))
                    } else {
                        col(col_name).cast(DataType::String).eq(lit(*item))
                    }
                })
                .collect();
            Some(exprs.into_iter().reduce(|a, b| a.or(b)).unwrap())
        }
        _ => None,
    }
}

fn compute_one(df: &DataFrame, column: &str, agg: &str) -> f64 {
    if agg == "count" {
        return df.height() as f64;
    }
    let c = match df.column(column) {
        Ok(c) => c,
        Err(_) => return 0.0,
    };
    if agg == "unique_count" {
        return match c {
            Column::Series(s) => s.n_unique().unwrap_or(0) as f64,
            _ => 0.0,
        };
    }
    let series = match c {
        Column::Series(s) => match s.cast(&DataType::Float64) {
            Ok(v) => v,
            Err(_) => return 0.0,
        },
        _ => return 0.0,
    };
    match agg {
        "sum" => series.sum::<f64>().unwrap_or(0.0),
        "avg" | "mean" => series.mean().unwrap_or(0.0),
        "min" => series.min::<f64>().unwrap_or(None).unwrap_or(0.0),
        "max" => series.max::<f64>().unwrap_or(None).unwrap_or(0.0),
        _ => 0.0,
    }
}

fn compute_groupby(
    df: &DataFrame,
    dim_col: &str,
    metric_col: &str,
    agg: &str,
) -> Result<Vec<GroupbyItem>, String> {
    if df.get_column_names().iter().all(|c| c.as_str() != dim_col) {
        return Ok(vec![]);
    }
    let agg_col = if agg == "count" {
        col(dim_col).count().alias("__v__")
    } else {
        match agg {
            "sum" => col(metric_col).cast(DataType::Float64).sum(),
            "avg" | "mean" => col(metric_col).cast(DataType::Float64).mean(),
            "min" => col(metric_col).cast(DataType::Float64).min(),
            "max" => col(metric_col).cast(DataType::Float64).max(),
            _ => col(metric_col).cast(DataType::Float64).sum(),
        }
        .alias("__v__")
    };
    let r = df
        .clone()
        .lazy()
        .group_by([col(dim_col)])
        .agg([agg_col])
        .sort(
            ["__v__"],
            SortMultipleOptions::default().with_order_descending(true),
        )
        .collect()
        .map_err(|e| format!("groupby失败: {e}"))?;
    let labels = r.column(dim_col).map_err(|e| format!("缺分组列: {e}"))?;
    let values = r.column("__v__").map_err(|e| format!("缺值列: {e}"))?;
    let n = r.height();
    let mut items = Vec::with_capacity(n);
    for i in 0..n {
        let label = match labels {
            Column::Series(s) => match s.get(i) {
                Ok(AnyValue::String(v)) => v.to_string(),
                Ok(AnyValue::StringOwned(v)) => v.to_string(),
                Ok(v) => format!("{v}"),
                Err(_) => String::new(),
            },
            _ => String::new(),
        };
        let value = match values {
            Column::Series(s) => match s.get(i) {
                Ok(AnyValue::Float64(f)) => f,
                Ok(AnyValue::Int64(v)) => v as f64,
                Ok(AnyValue::Int32(v)) => v as f64,
                Ok(AnyValue::UInt32(v)) => v as f64,
                Ok(AnyValue::UInt64(v)) => v as f64,
                _ => 0.0,
            },
            _ => 0.0,
        };
        items.push(GroupbyItem { label, value });
    }
    Ok(items)
}
