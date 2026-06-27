// src-tauri/src/commands/datasource.rs
//
// 多数据源接入命令（Data Source Commands）
//
// 支持：剪贴板粘贴 / JSON 文件 / Parquet 文件 / URL 拉取 / SQLite 数据库

use anyhow::{anyhow, bail, Result};
use polars::prelude::*;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::commands::loader::load_file_impl;
use crate::df_util::{df_to_payload, CHART_LIMIT};
use crate::state::{register_dataset, replace_active_dataframe};
use crate::types::{ApiResult, ChartPayload};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn now_ts_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Register the DataFrame as the active dataset and return a ChartPayload.
fn set_loaded_df(df: DataFrame, dataset_name: String, source: &str) -> ApiResult<ChartPayload> {
    let df = crate::df_util::convert_ms_timestamps(&df);
    let payload = df_to_payload(&df, Some(CHART_LIMIT));
    replace_active_dataframe(&df, true);
    if let Err(e) = register_dataset(&df, dataset_name, source.to_string()) {
        eprintln!("register_dataset failed: {e}");
    }
    match payload {
        Ok(p) => ApiResult::success(p),
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

fn temp_csv_path(prefix: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("{}_{}.csv", prefix, now_ts_secs()))
}

/// Escape a single cell value for CSV output.
fn csv_escape_cell(raw: &str) -> String {
    let needs_quote =
        raw.contains(',') || raw.contains('"') || raw.contains('\n') || raw.contains('\r');
    if !needs_quote {
        return raw.to_string();
    }
    let escaped = raw.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets URL helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Check if a URL is a Google Sheets spreadsheet link.
fn is_gsheet_url(url: &str) -> bool {
    url.contains("docs.google.com/spreadsheets")
}

/// Extract the spreadsheet ID from a Google Sheets URL.
fn extract_gsheet_id(url: &str) -> Option<String> {
    let marker = "/spreadsheets/d/";
    let start = url.find(marker)? + marker.len();
    let rest = &url[start..];
    let end = rest.find('/').unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

/// Extract the sheet gid from a Google Sheets URL (if present).
fn extract_gsheet_gid(url: &str) -> Option<String> {
    let marker = "gid=";
    let start = url.find(marker)? + marker.len();
    let digits: String = url[start..].chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() { None } else { Some(digits) }
}

/// Convert a Google Sheets URL to the CSV export URL.
fn gsheet_to_export_url(url: &str) -> String {
    let sid = extract_gsheet_id(url).unwrap_or_default();
    let mut export = format!(
        "https://docs.google.com/spreadsheets/d/{sid}/export?format=csv"
    );
    if let Some(gid) = extract_gsheet_gid(url) {
        export.push_str("&gid=");
        export.push_str(&gid);
    }
    export
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON → DataFrame
// ─────────────────────────────────────────────────────────────────────────────

/// Parse a serde_json::Value into a Polars DataFrame.
/// Supports:
///   - Array of objects:  [{"a":1},{"a":2}]
///   - Single object:     {"a":1,"b":2}  → 1 row
///   - Object with array value: {"data":[{"a":1}]} → extracts first array found
pub fn json_to_df(value: serde_json::Value) -> Result<DataFrame> {
    let rows: Vec<serde_json::Map<String, serde_json::Value>> = match value {
        serde_json::Value::Array(arr) => arr
            .into_iter()
            .filter_map(|v| v.as_object().cloned())
            .collect(),
        serde_json::Value::Object(obj) => {
            // Search for the first array-typed value as the data container
            let mut list_hit: Option<Vec<serde_json::Map<String, serde_json::Value>>> = None;
            for v in obj.values() {
                if let serde_json::Value::Array(arr) = v {
                    let mapped: Vec<_> =
                        arr.iter().filter_map(|x| x.as_object().cloned()).collect();
                    if !mapped.is_empty() {
                        list_hit = Some(mapped);
                        break;
                    }
                }
            }
            list_hit.unwrap_or_else(|| vec![obj])
        }
        _ => bail!("JSON 根节点必须是对象或对象数组"),
    };

    if rows.is_empty() {
        bail!("JSON 中未找到可转换的对象行");
    }

    // Collect all unique keys across rows
    let mut keys: BTreeSet<String> = BTreeSet::new();
    for row in &rows {
        for k in row.keys() {
            keys.insert(k.clone());
        }
    }

    let mut cols: Vec<Column> = Vec::with_capacity(keys.len());
    for k in keys {
        let values: Vec<Option<String>> = rows
            .iter()
            .map(|r| {
                r.get(&k).map(|v| match v {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Array(_) | serde_json::Value::Object(_) => v.to_string(),
                })
            })
            .collect();
        cols.push(Series::new(k.into(), values).into());
    }

    crate::df_util::dataframe_from_columns(cols)
        .map_err(|e| anyhow!("构造 DataFrame 失败: {e}"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Clipboard Paste
// ─────────────────────────────────────────────────────────────────────────────

/// Parse tab-separated clipboard text into a DataFrame.
///
/// Parameters:
///   text       — clipboard text (TSV format)
///   has_header — whether the first row is a header
#[tauri::command]
pub async fn paste_from_clipboard(
    text: String,
    has_header: bool,
) -> ApiResult<ChartPayload> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return ApiResult::failure("剪贴板内容为空");
    }

    // Parse TSV from clipboard text: write to temp file then use Polars CsvReader
    let tmp = temp_csv_path("smartboard_clipboard");
    if let Err(e) = fs::write(&tmp, trimmed.as_bytes()) {
        return ApiResult::failure(format!("写入临时文件失败: {e}"));
    }
    let df = match CsvReadOptions::default()
        .with_has_header(has_header)
        .with_infer_schema_length(None)
        .map_parse_options(|opts| {
            opts.with_separator(b'\t')
                .with_truncate_ragged_lines(true)
        })
        .try_into_reader_with_file_path(Some(tmp.clone()))
    {
        Ok(reader) => match reader.finish() {
            Ok(df) => df,
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                return ApiResult::failure(format!("解析粘贴数据失败: {e}"));
            }
        },
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return ApiResult::failure(format!("读取粘贴数据失败: {e}"));
        }
    };
    let _ = fs::remove_file(&tmp);

    if df.height() == 0 {
        return ApiResult::failure("粘贴数据中没有可解析的行");
    }

    let name = format!("粘贴数据_{}", now_ts_secs());
    set_loaded_df(df, name, "paste_from_clipboard")
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: JSON file load
// ─────────────────────────────────────────────────────────────────────────────

/// Load a JSON file into the global DataFrame.
#[tauri::command]
pub async fn load_json_file(path: String) -> ApiResult<ChartPayload> {
    let normalized = crate::commands::loader::normalize_file_path(&path);
    let path = Path::new(&normalized);
    if !path.exists() {
        return ApiResult::failure(format!("文件不存在: {}", path.display()));
    }

    let content = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => return ApiResult::failure(format!("读取 JSON 文件失败: {e}")),
    };

    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => return ApiResult::failure(format!("JSON 解析失败: {e}")),
    };

    let df = match json_to_df(value) {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("JSON数据")
        .to_string();
    set_loaded_df(df, file_name, "load_json_file")
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Parquet file load
// ─────────────────────────────────────────────────────────────────────────────

/// Load a Parquet file into the global DataFrame.
#[tauri::command]
pub async fn load_parquet_file(path: String) -> ApiResult<ChartPayload> {
    let normalized = crate::commands::loader::normalize_file_path(&path);
    let path = Path::new(&normalized);
    if !path.exists() {
        return ApiResult::failure(format!("文件不存在: {}", path.display()));
    }

    let df = {
        let file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(e) => return ApiResult::failure(format!("无法打开 Parquet 文件: {e}")),
        };
        match ParquetReader::new(file).finish() {
            Ok(df) => df,
            Err(e) => return ApiResult::failure(format!("解析 Parquet 文件失败: {e}")),
        }
    };

    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Parquet数据")
        .to_string();
    set_loaded_df(df, file_name, "load_parquet_file")
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: URL / API Fetch
// ─────────────────────────────────────────────────────────────────────────────

/// Fetch data from a URL and load as DataFrame.
///
/// Parameters:
///   url     — data URL (CSV or JSON endpoint)
///   format  — "csv" | "json" | "auto" (auto-detect from Content-Type or body)
#[tauri::command]
pub async fn fetch_from_url(
    url: String,
    format: String,
    _has_header: bool,
) -> ApiResult<ChartPayload> {
    let endpoint = url.trim();
    if endpoint.is_empty() {
        return ApiResult::failure("URL 不能为空");
    }

    // Handle file:// URLs locally
    if endpoint.starts_with("file://") {
        let local_path = crate::commands::loader::normalize_file_path(endpoint);
        let path = Path::new(&local_path);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let df = match ext.as_str() {
            "json" => {
                let content = match fs::read_to_string(path) {
                    Ok(c) => c,
                    Err(e) => return ApiResult::failure(format!("读取文件失败: {e}")),
                };
                let value: serde_json::Value = match serde_json::from_str(&content) {
                    Ok(v) => v,
                    Err(e) => return ApiResult::failure(format!("JSON 解析失败: {e}")),
                };
                match json_to_df(value) {
                    Ok(df) => df,
                    Err(e) => return ApiResult::failure(e.to_string()),
                }
            }
            "parquet" => {
                let file = match std::fs::File::open(path) {
                    Ok(f) => f,
                    Err(e) => return ApiResult::failure(format!("无法打开文件: {e}")),
                };
                match ParquetReader::new(file).finish() {
                    Ok(df) => df,
                    Err(e) => return ApiResult::failure(format!("解析 Parquet 失败: {e}")),
                }
            }
            _ => {
                // Fall back to standard file loader for CSV/Excel
                match load_file_impl(&local_path, 0, 0, -1, false) {
                    Ok(df) => df,
                    Err(e) => return ApiResult::failure(e.to_string()),
                }
            }
        };
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("本地数据")
            .to_string();
        return set_loaded_df(df, name, "fetch_from_url");
    }

    // ═════════════════════════════════════════════════════════════
    // Google Sheets: rewrite to CSV export URL
    // ═════════════════════════════════════════════════════════════
    let endpoint = if is_gsheet_url(endpoint) {
        gsheet_to_export_url(endpoint)
    } else {
        endpoint.to_string()
    };

    // HTTP/HTTPS fetch
    let client = match reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(12))
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(e) => return ApiResult::failure(format!("初始化 HTTP 客户端失败: {e}")),
    };

    let resp = match client
        .get(endpoint)
        .header("User-Agent", "SmartBoard/0.1")
        .header("Accept", "text/csv,application/json,*/*")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let kind = if e.is_timeout() {
                "请求超时"
            } else if e.is_connect() {
                "连接失败"
            } else {
                "请求异常"
            };
            return ApiResult::failure(format!("{kind}: {e}"));
        }
    };

    if !resp.status().is_success() {
        return ApiResult::failure(format!(
            "服务器返回状态码: {} ({})",
            resp.status().as_u16(),
            resp.status().canonical_reason().unwrap_or("unknown")
        ));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let body = match resp.text().await {
        Ok(t) => t,
        Err(e) => return ApiResult::failure(format!("读取响应体失败: {e}")),
    };

    let fmt = format.trim().to_lowercase();
    let is_json = fmt == "json"
        || (fmt == "auto"
            && (content_type.contains("application/json")
                || body.trim_start().starts_with('{')
                || body.trim_start().starts_with('[')));

    let df = if is_json {
        let value: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => return ApiResult::failure(format!("JSON 解析失败: {e}")),
        };
        match json_to_df(value) {
            Ok(df) => df,
            Err(e) => return ApiResult::failure(e.to_string()),
        }
    } else {
        // Treat as CSV
        let tmp = temp_csv_path("smartboard_url");
        if let Err(e) = fs::write(&tmp, body.as_bytes()) {
            return ApiResult::failure(format!("写入临时 CSV 失败: {e}"));
        }
        let output = load_file_impl(tmp.to_string_lossy().as_ref(), 0, 0, -1, false);
        let _ = fs::remove_file(&tmp);
        match output {
            Ok(df) => df,
            Err(e) => return ApiResult::failure(e.to_string()),
        }
    };

    let name = format!("URL数据_{}", now_ts_secs());
    set_loaded_df(df, name, "fetch_from_url")
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: SQLite database import
// ─────────────────────────────────────────────────────────────────────────────

/// List all user tables in a SQLite database.
#[tauri::command]
pub async fn list_sqlite_tables(path: String) -> ApiResult<Vec<SqliteTableInfo>> {
    let p = Path::new(&path);
    if !p.exists() {
        return ApiResult::failure(format!("数据库文件不存在: {}", path));
    }

    let conn = match rusqlite::Connection::open(p) {
        Ok(c) => c,
        Err(e) => return ApiResult::failure(format!("打开 SQLite 数据库失败: {e}")),
    };

    let mut stmt = match conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return ApiResult::failure(format!("查询数据库表失败: {e}")),
    };

    let mut tables: Vec<SqliteTableInfo> = Vec::new();
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| anyhow!("{e}"))
        .unwrap();

    for name_result in rows {
        let name = name_result.map_err(|e| anyhow!("{e}")).unwrap();
        // Get row count for each table
        let count_sql = format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\""));
        let row_count = conn
            .query_row(&count_sql, [], |row| row.get::<_, i64>(0))
            .unwrap_or(-1);

        // Get column names
        let col_sql = format!("PRAGMA table_info(\"{}\")", name.replace('"', "\"\""));
        let mut col_stmt = conn.prepare(&col_sql).map_err(|e| anyhow!("{e}")).unwrap();
        let col_names: Vec<String> = col_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| anyhow!("{e}"))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        tables.push(SqliteTableInfo {
            name,
            row_count: row_count.max(0) as usize,
            column_count: col_names.len(),
            columns: col_names,
        });
    }

    ApiResult::success(tables)
}

/// Load a specific table from a SQLite database.
#[tauri::command]
pub async fn load_sqlite_table(
    path: String,
    table_name: String,
) -> ApiResult<ChartPayload> {
    let query = format!("SELECT * FROM \"{}\"", table_name.replace('"', "\"\""));
    load_sqlite_query(path, query, Some(table_name)).await
}

/// Execute a custom SQL SELECT query against a SQLite database.
#[tauri::command]
pub async fn execute_sqlite_query(
    path: String,
    query: String,
) -> ApiResult<ChartPayload> {
    let q = query.trim();
    if q.is_empty() {
        return ApiResult::failure("SQL 查询不能为空");
    }

    let upper = q.trim_start().to_uppercase();
    if !upper.starts_with("SELECT") && !upper.starts_with("WITH") {
        return ApiResult::failure("仅支持 SELECT 查询");
    }

    load_sqlite_query(path, query.to_string(), None).await
}

/// Internal helper: execute SQL query and return result as DataFrame.
async fn load_sqlite_query(
    path: String,
    query: String,
    table_name: Option<String>,
) -> ApiResult<ChartPayload> {
    let conn = match rusqlite::Connection::open(Path::new(&path)) {
        Ok(c) => c,
        Err(e) => return ApiResult::failure(format!("打开 SQLite 数据库失败: {e}")),
    };

    // Collect CSV text in a block so stmt/rows are dropped before conn
    let csv_text = {
        let mut stmt = match conn.prepare(&query) {
            Ok(s) => s,
            Err(e) => return ApiResult::failure(format!("SQL 预处理失败: {e}")),
        };

        let col_count = stmt.column_count();
        if col_count == 0 {
            return ApiResult::failure("SQL 未返回可读取的列（请使用 SELECT 查询）");
        }

        let headers: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

        let mut csv_text = String::new();
        csv_text.push_str(
            &headers
                .iter()
                .map(|h| csv_escape_cell(h))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv_text.push('\n');

        let mut rows = match stmt.query([]) {
            Ok(r) => r,
            Err(e) => return ApiResult::failure(format!("SQL 执行失败: {e}")),
        };

        while let Ok(Some(row)) = rows.next() {
            let mut line: Vec<String> = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let v = match row.get_ref(i) {
                    Ok(v) => v,
                    Err(e) => return ApiResult::failure(format!("读取第 {} 列失败: {e}", i + 1)),
                };
                let text = match v {
                    rusqlite::types::ValueRef::Null => String::new(),
                    rusqlite::types::ValueRef::Integer(i) => i.to_string(),
                    rusqlite::types::ValueRef::Real(f) => f.to_string(),
                    rusqlite::types::ValueRef::Text(t) => {
                        String::from_utf8_lossy(t).to_string()
                    }
                    rusqlite::types::ValueRef::Blob(b) => format!("<blob:{} bytes>", b.len()),
                };
                line.push(csv_escape_cell(&text));
            }
            csv_text.push_str(&line.join(","));
            csv_text.push('\n');
        }
        csv_text
    }; // stmt and rows dropped here, conn is free

    drop(conn);

    // Write to temp CSV and parse with Polars
    let tmp = temp_csv_path("smartboard_sqlite");
    if let Err(e) = fs::write(&tmp, csv_text.as_bytes()) {
        return ApiResult::failure(format!("写入临时 CSV 失败: {e}"));
    }

    let output = load_file_impl(tmp.to_string_lossy().as_ref(), 0, 0, -1, false);
    let _ = fs::remove_file(&tmp);

    match output {
        Ok(df) => {
            let name = table_name.unwrap_or_else(|| format!("SQL数据_{}", now_ts_secs()));
            set_loaded_df(df, name, "load_sqlite_query")
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite table info type
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SqliteTableInfo {
    pub name: String,
    pub row_count: usize,
    pub column_count: usize,
    pub columns: Vec<String>,
}
