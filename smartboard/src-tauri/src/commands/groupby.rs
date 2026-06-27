// src-tauri/src/commands/groupby.rs
//
// 分组聚合命令（GroupBy Aggregation Command）
//
// 所有聚合计算均在 Rust 全量 DataFrame 上执行，前端不再做数据循环。

use anyhow::{bail, Result};
use polars::prelude::*;

use crate::df_util::df_to_payload;
use crate::state::get_active_df;
use crate::types::{ApiResult, ChartPayload};

// ─────────────────────────────────────────────────────────────────────────────
// Tauri command
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn groupby_agg(
    group_cols: Vec<String>,
    agg_col: String,
    agg_func: String,
) -> ApiResult<ChartPayload> {
    let df = match get_active_df() {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };
    match groupby_agg_impl(&df, &group_cols, &agg_col, &agg_func) {
        Ok(result_df) => match df_to_payload(&result_df, None) {
            Ok(p) => ApiResult::success(p),
            Err(e) => ApiResult::failure(e.to_string()),
        },
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

pub fn groupby_agg_impl(
    df: &DataFrame,
    group_cols: &[String],
    agg_col: &str,
    agg_func: &str,
) -> Result<DataFrame> {
    if group_cols.is_empty() {
        bail!("分组列不能为空");
    }

    let agg_expr = match agg_func {
        "sum" => col(agg_col).sum(),
        "mean" => col(agg_col).mean(),
        "count" => col(agg_col).count(),
        "min" => col(agg_col).min(),
        "max" => col(agg_col).max(),
        other => bail!("不支持的聚合函数: {} (支持 sum/mean/count/min/max)", other),
    }
    .alias(agg_col);

    let result = df
        .clone()
        .lazy()
        .group_by(
            group_cols
                .iter()
                .map(|c| col(c.as_str()))
                .collect::<Vec<_>>(),
        )
        .agg([agg_expr])
        .sort(
            group_cols.iter().map(|c| c.as_str()).collect::<Vec<_>>(),
            SortMultipleOptions::default(),
        )
        .collect()?;

    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI & Chart commands — 全量 DataFrame 上执行，零截断
// ─────────────────────────────────────────────────────────────────────────────

/// KPI 规格（前端 JSON 传入）。
#[derive(Debug, serde::Deserialize)]
struct KpiSpecInput {
    label: String,
    column: String,
    agg: String,
}

/// KPI 计算结果。
#[derive(Debug, serde::Serialize)]
pub struct KpiValueOutput {
    label: String,
    value: f64,
}

/// 对全量 DataFrame 批量计算 KPI 值。
///
/// 参数 `kpis_json` 是 JSON 数组: `[{"label":"总销售额","column":"销售额","agg":"sum"}]`
/// 支持 agg: sum / mean / count / min / max
#[tauri::command]
pub async fn compute_kpi_values(kpis_json: String) -> ApiResult<Vec<KpiValueOutput>> {
    let df = match get_active_df() {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let specs: Vec<KpiSpecInput> = match serde_json::from_str(&kpis_json) {
        Ok(v) => v,
        Err(e) => return ApiResult::failure(format!("KPI JSON 解析失败: {e}")),
    };

    let mut results = Vec::with_capacity(specs.len());

    for spec in &specs {
        let col_name = spec.column.as_str();
        let value = if spec.agg == "count" {
            df.height() as f64
        } else if spec.agg == "unique_count" {
            let s = match df.column(col_name) {
                Ok(s) => s,
                Err(e) => return ApiResult::failure(format!("列 '{}' 不存在: {e}", col_name)),
            };
            match s {
                Column::Series(series) => series.n_unique().unwrap_or(0) as f64,
                _ => 0.0,
            }
        } else if !df.get_column_names().iter().any(|c| c.as_str() == col_name) {
            return ApiResult::failure(format!("列 '{}' 不存在", col_name));
        } else {
            let s = df.column(col_name).unwrap();
            // Extract sum/mean/min/max from Column (Polars 0.53 has Column enum)
            let value = match spec.agg.as_str() {
                "sum" => column_sum(s),
                "mean" | "avg" => column_mean(s),
                "min" => column_min(s),
                "max" => column_max(s),
                other => return ApiResult::failure(format!("不支持的聚合: {other}")),
            };
            value
        };
        results.push(KpiValueOutput {
            label: spec.label.clone(),
            value,
        });
    }

    ApiResult::success(results)
}

/// 图表聚合数据项。
#[derive(Debug, serde::Serialize)]
pub struct ChartDataItem {
    label: String,
    value: f64,
}

// ── Column aggregation helpers (Polars 0.53 Column enum) ──

fn column_as_f64_series(col: &Column) -> Option<Series> {
    match col {
        Column::Series(s) => s.cast(&DataType::Float64).ok(),
        _ => None,
    }
}

fn column_sum(col: &Column) -> f64 {
    column_as_f64_series(col)
        .and_then(|s| s.sum::<f64>().ok())
        .unwrap_or(0.0)
}

fn column_mean(col: &Column) -> f64 {
    column_as_f64_series(col)
        .and_then(|s| s.mean())
        .unwrap_or(0.0)
}

fn column_min(col: &Column) -> f64 {
    column_as_f64_series(col)
        .and_then(|s| s.min::<f64>().ok().flatten())
        .unwrap_or(0.0)
}

fn column_max(col: &Column) -> f64 {
    column_as_f64_series(col)
        .and_then(|s| s.max::<f64>().ok().flatten())
        .unwrap_or(0.0)
}

/// 对全量 DataFrame 做分组聚合，返回图表数据。
///
/// 相当于: `df.groupby(dim_col).agg(col(metric_col).sum())`
/// 支持 agg: sum / mean / count / min / max
#[tauri::command]
pub async fn compute_chart_data(
    dim_col: String,
    metric_col: String,
    agg_func: String,
) -> ApiResult<Vec<ChartDataItem>> {
    let df = match get_active_df() {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let group_by_col = col(dim_col.as_str()).alias("__label__");

    let agg_expr = if agg_func == "count" {
        col(metric_col.as_str()).count().alias("__value__")
    } else {
        // Cast to f64, then aggregate — use separate lazy ops
        let casted = col(metric_col.as_str()).cast(DataType::Float64);
        match agg_func.as_str() {
            "sum" => casted.sum().alias("__value__"),
            "mean" | "avg" => casted.mean().alias("__value__"),
            "min" => casted.min().alias("__value__"),
            "max" => casted.max().alias("__value__"),
            _ => casted.sum().alias("__value__"),
        }
    };

    let agg_df = match df
        .clone()
        .lazy()
        .group_by([group_by_col])
        .agg([agg_expr])
        .sort(
            ["__value__"],
            SortMultipleOptions::default().with_order_descending(true),
        )
        .collect()
    {
        Ok(r) => r,
        Err(e) => return ApiResult::failure(format!("图表聚合失败: {e}")),
    };

    let labels = match agg_df.column("__label__") {
        Ok(c) => c,
        Err(e) => return ApiResult::failure(format!("聚合结果缺少分组列: {e}")),
    };
    let values = match agg_df.column("__value__") {
        Ok(c) => c,
        Err(e) => return ApiResult::failure(format!("聚合结果缺少值列: {e}")),
    };

    let n = agg_df.height();
    let mut items = Vec::with_capacity(n);

    // Helper to get str from Column
    let get_str = |col: &Column, i: usize| -> String {
        match col {
            Column::Series(s) => match s.get(i) {
                Ok(AnyValue::String(v)) => v.to_string(),
                Ok(AnyValue::StringOwned(v)) => v.to_string(),
                Ok(v) => format!("{v}"),
                Err(_) => String::new(),
            },
            _ => String::new(),
        }
    };
    let get_f64 = |col: &Column, i: usize| -> f64 {
        match col {
            Column::Series(s) => match s.get(i) {
                Ok(AnyValue::Float64(f)) => f,
                Ok(AnyValue::Int64(v)) => v as f64,
                Ok(AnyValue::Int32(v)) => v as f64,
                Ok(AnyValue::UInt32(v)) => v as f64,
                Ok(AnyValue::UInt64(v)) => v as f64,
                _ => 0.0,
            },
            _ => 0.0,
        }
    };

    for i in 0..n {
        items.push(ChartDataItem {
            label: get_str(labels, i),
            value: get_f64(values, i),
        });
    }

    ApiResult::success(items)
}
