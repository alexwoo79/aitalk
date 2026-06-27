// src-tauri/src/commands/feishu.rs
//
// 飞书多维表格数据源接入
//
// 通过飞书开放 API 拉取 Bitable 数据，转换为 Polars DataFrame。

use anyhow::{bail, Context, Result};
use polars::prelude::*;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::df_util::df_to_payload;
use crate::state::{register_dataset, replace_active_dataframe};
use crate::types::{ApiResult, ChartPayload};

// ─────────────────────────────────────────────────────────────────────────────
// 飞书 API 类型
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct TenantTokenRequest {
    app_id: String,
    app_secret: String,
}

#[derive(Debug, Deserialize)]
struct TenantTokenResponse {
    #[allow(dead_code)]
    code: i32,
    tenant_access_token: String,
    #[allow(dead_code)]
    msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FeishuApiResponse<T> {
    code: i32,
    msg: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct TablesData {
    items: Vec<TableItem>,
}

#[derive(Debug, Deserialize)]
struct TableItem {
    table_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct RecordsData {
    items: Vec<RecordItem>,
    page_token: Option<String>,
    has_more: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RecordItem {
    fields: serde_json::Value,
}

// ─────────────────────────────────────────────────────────────────────────────
// 前端返回类型
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct FeishuTableInfo {
    pub table_id: String,
    pub name: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FeishuTestResult {
    pub ok: bool,
    pub message: String,
    pub tables: Vec<FeishuTableInfo>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 链接解析
// ─────────────────────────────────────────────────────────────────────────────

/// 从飞书多维表格链接提取 app_token（base ID）
///
/// 支持格式:
///   https://xxx.feishu.cn/base/BascNxxxxx?table=...
///   https://xxx.feishu.cn/base/BascNxxxxx
fn extract_app_token(url: &str) -> Result<String> {
    let trimmed = url.trim();

    // 如果直接是 app_token（如 BascNxxxxx）
    if trimmed.starts_with("Basc") || trimmed.starts_with("tbl") {
        return Ok(trimmed.to_string());
    }

    // 从 URL 提取: /base/XXX
    let marker = "/base/";
    if let Some(start) = trimmed.find(marker) {
        let rest = &trimmed[start + marker.len()..];
        let end = rest.find('?').unwrap_or(rest.len());
        let end_slash = rest[..end].find('/').unwrap_or(end);
        let token = &rest[..end_slash.min(end)];
        if !token.is_empty() {
            return Ok(token.to_string());
        }
    }

    bail!("无法从链接中提取 app_token，请检查格式。示例: https://xxx.feishu.cn/base/BascNxxxxx")
}

// ─────────────────────────────────────────────────────────────────────────────
// API 调用
// ─────────────────────────────────────────────────────────────────────────────

async fn get_tenant_token(app_id: &str, app_secret: &str) -> Result<String> {
    let client = Client::new();
    let resp: TenantTokenResponse = client
        .post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal")
        .json(&TenantTokenRequest {
            app_id: app_id.to_string(),
            app_secret: app_secret.to_string(),
        })
        .send()
        .await
        .context("请求飞书 token 失败")?
        .json()
        .await
        .context("解析飞书 token 响应失败")?;

    if resp.code != 0 {
        bail!("飞书认证失败 (code={}): {}", resp.code, resp.msg.unwrap_or_default());
    }
    Ok(resp.tenant_access_token)
}

async fn list_feishu_tables(
    token: &str,
    app_token: &str,
) -> Result<Vec<TableItem>> {
    let client = Client::new();
    let url = format!(
        "https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables"
    );

    let resp: FeishuApiResponse<TablesData> = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .context("请求飞书表格列表失败")?
        .json()
        .await
        .context("解析飞书表格列表失败")?;

    if resp.code != 0 {
        bail!("飞书获取表格列表失败 (code={}): {}",
            resp.code, resp.msg.unwrap_or_default());
    }

    Ok(resp.data.map(|d| d.items).unwrap_or_default())
}

async fn fetch_all_records(
    token: &str,
    app_token: &str,
    table_id: &str,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>> {
    let client = Client::new();
    let base_url = format!(
        "https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records"
    );

    let mut all_fields: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut req = client
            .get(&base_url)
            .bearer_auth(token)
            .query(&[("page_size", "500")]);

        if let Some(ref pt) = page_token {
            req = req.query(&[("page_token", pt.as_str())]);
        }

        let resp: FeishuApiResponse<RecordsData> = req
            .send()
            .await
            .context("请求飞书表格记录失败")?
            .json()
            .await
            .context("解析飞书表格记录失败")?;

        if resp.code != 0 {
            bail!("飞书获取记录失败 (code={}): {}",
                resp.code, resp.msg.unwrap_or_default());
        }

        if let Some(data) = resp.data {
            let items = data.items;
            if items.is_empty() {
                break;
            }
            for item in items {
                if let serde_json::Value::Object(fields) = item.fields {
                    all_fields.push(fields);
                }
            }
            page_token = data.page_token;
            if !data.has_more.unwrap_or(false) && page_token.is_none() {
                break;
            }
            if page_token.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    Ok(all_fields)
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON → DataFrame
// ─────────────────────────────────────────────────────────────────────────────

fn feishu_records_to_df(
    records: &[serde_json::Map<String, serde_json::Value>],
) -> Result<DataFrame> {
    if records.is_empty() {
        bail!("没有数据记录");
    }

    // 收集所有字段名（保持插入顺序）
    let mut keys: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for row in records {
        for k in row.keys() {
            if seen.insert(k.clone()) {
                keys.push(k.clone());
            }
        }
    }

    /// 格式化飞书字段值为字符串，毫秒时间戳自动转日期
    fn format_feishu_value(v: &serde_json::Value) -> String {
        const MS_MIN: i64 = 1_000_000_000_000;  // 2001-09-09
        const MS_MAX: i64 = 4_200_000_000_000;  // ~2103

        match v {
            serde_json::Value::Null => String::new(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Number(n) => {
                // 检测毫秒时间戳
                if let Some(i) = n.as_i64() {
                    if i >= MS_MIN && i <= MS_MAX {
                        let secs = i / 1000;
                        let nanos = ((i % 1000) * 1_000_000) as u32;
                        if let Some(dt) = chrono::DateTime::from_timestamp(secs, nanos) {
                            let cn = dt.with_timezone(
                                &chrono::FixedOffset::east_opt(8 * 3600).unwrap(),
                            );
                            let time_str = cn.format("%H%M%S").to_string();
                            if time_str == "000000" {
                                return cn.format("%Y-%m-%d").to_string();
                            }
                            return cn.format("%Y-%m-%d %H:%M:%S").to_string();
                        }
                    }
                }
                n.to_string()
            }
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Array(arr) => {
                arr.iter()
                    .map(|x| format_feishu_value(x))
                    .collect::<Vec<_>>()
                    .join(", ")
            }
            serde_json::Value::Object(obj) => {
                obj.get("text")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| v.to_string())
            }
        }
    }

    let mut cols: Vec<Column> = Vec::with_capacity(keys.len());
    for key in &keys {
        let values: Vec<Option<String>> = records
            .iter()
            .map(|row| {
                row.get(key).map(|v| format_feishu_value(v))
            })
            .collect();
        cols.push(Series::new(key.into(), values).into());
    }

    crate::df_util::dataframe_from_columns(cols)
        .map_err(|e| anyhow::anyhow!("构造 DataFrame 失败: {e}"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri 命令
// ─────────────────────────────────────────────────────────────────────────────

/// 测试飞书连接并返回可用表格列表
#[tauri::command]
pub async fn test_feishu_connection(
    app_id: String,
    app_secret: String,
    base_url: String,
) -> ApiResult<FeishuTestResult> {
    // 提取 app_token
    let app_token = match extract_app_token(&base_url) {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    // 获取 token
    let token = match get_tenant_token(&app_id, &app_secret).await {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    // 列出表格
    let tables = match list_feishu_tables(&token, &app_token).await {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    if tables.is_empty() {
        return ApiResult::success(FeishuTestResult {
            ok: true,
            message: "连接成功，但未找到数据表".to_string(),
            tables: vec![],
        });
    }

    // 获取每个表的字段信息（取前 1 条记录获取字段名）
    let mut table_infos = Vec::new();
    for table in &tables {
        let fields = match fetch_all_records(&token, &app_token, &table.table_id).await {
            Ok(records) => {
                if let Some(first) = records.first() {
                    first.keys().cloned().collect()
                } else {
                    vec![]
                }
            }
            Err(_) => vec![],
        };
        table_infos.push(FeishuTableInfo {
            table_id: table.table_id.clone(),
            name: table.name.clone(),
            fields,
        });
    }

    ApiResult::success(FeishuTestResult {
        ok: true,
        message: format!("连接成功，找到 {} 个数据表", tables.len()),
        tables: table_infos,
    })
}

/// 拉取飞书表格全部数据并加载为活跃数据集
#[tauri::command]
pub async fn load_feishu_table(
    app_id: String,
    app_secret: String,
    base_url: String,
    table_id: String,
    table_name: Option<String>,
) -> ApiResult<ChartPayload> {
    let app_token = match extract_app_token(&base_url) {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let token = match get_tenant_token(&app_id, &app_secret).await {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let records = match fetch_all_records(&token, &app_token, &table_id).await {
        Ok(r) => r,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    if records.is_empty() {
        return ApiResult::failure("表格中没有数据");
    }

    let df = match feishu_records_to_df(&records) {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let df = crate::df_util::convert_ms_timestamps(&df);

    let dataset_name = table_name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "飞书表格".to_string());

    let payload = df_to_payload(&df, None);
    replace_active_dataframe(&df, true);
    let _ = register_dataset(&df, dataset_name, "load_feishu_table".to_string());

    match payload {
        Ok(p) => ApiResult::success(p),
        Err(e) => ApiResult::failure(e.to_string()),
    }
}
