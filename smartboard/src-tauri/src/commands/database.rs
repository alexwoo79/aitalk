// src-tauri/src/commands/database.rs
//
// SQL 数据库接入（MySQL / PostgreSQL / SQLite）
//
// 通过连接字符串连接远程数据库，执行 SELECT 查询并转为 DataFrame。

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::fs;
use mysql::prelude::*;
use tokio_postgres::NoTls;

use crate::commands::loader::load_file_impl;
use crate::df_util::df_to_payload;
use crate::state::{register_dataset, replace_active_dataframe};
use crate::types::{ApiResult, ChartPayload};
use crate::df_util::convert_ms_timestamps;

// ─────────────────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct DbTableInfo {
    pub name: String,
    pub columns: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DbTestResult {
    pub driver: String,
    pub version: String,
    pub tables: Vec<DbTableInfo>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn detect_sql_driver(conn: &str) -> &'static str {
    let s = conn.trim().to_lowercase();
    if s.starts_with("mysql://") { return "mysql"; }
    if s.starts_with("postgres://") || s.starts_with("postgresql://") { return "postgres"; }
    if s.starts_with("sqlite://") || s.starts_with("sqlite:") || s == ":memory:" { return "sqlite"; }
    if !s.contains("://") { return "sqlite"; }
    "unknown"
}

fn csv_escape(raw: &str) -> String {
    if raw.contains(',') || raw.contains('"') || raw.contains('\n') || raw.contains('\r') {
        let escaped = raw.replace('"', "\"\"");
        return format!("\"{escaped}\"");
    }
    raw.to_string()
}

fn temp_csv_path() -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    std::env::temp_dir().join(format!("smartboard_sql_{}.csv", ts))
}

/// MySQL 查询 → CSV 文本
fn query_mysql(connection_string: &str, query: &str) -> Result<String> {
    let opts = mysql::Opts::from_url(connection_string)
        .map_err(|e| anyhow::anyhow!("MySQL 连接串解析失败: {e}"))?;
    let mut conn = mysql::Conn::new(opts)
        .map_err(|e| anyhow::anyhow!("MySQL 连接失败: {e}"))?;

    let result: Vec<mysql::Row> = conn
        .query(query)
        .map_err(|e| anyhow::anyhow!("MySQL 查询失败: {e}"))?;

    if result.is_empty() {
        return Ok(String::new());
    }

    // Get column names from first row
    let col_count = result[0].columns().len();
    let headers: Vec<String> = (1..=col_count).map(|i| format!("Column_{i}")).collect();

    let mut csv_text = String::new();
    csv_text.push_str(&headers.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(","));
    csv_text.push('\n');

    for row in &result {
        let mut line = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let val: mysql::Value = row.get(i).unwrap_or(mysql::Value::NULL);
            let text = match val {
                mysql::Value::NULL => String::new(),
                mysql::Value::Int(n) => n.to_string(),
                mysql::Value::UInt(n) => n.to_string(),
                mysql::Value::Float(f) => f.to_string(),
                mysql::Value::Double(f) => f.to_string(),
                mysql::Value::Bytes(b) => String::from_utf8_lossy(&b).to_string(),
                mysql::Value::Date(y, m, d, 0, 0, 0, _) => format!("{y:04}-{m:02}-{d:02}"),
                mysql::Value::Date(y, m, d, h, min, s, _) => format!("{y:04}-{m:02}-{d:02} {h:02}:{min:02}:{s:02}"),
                mysql::Value::Time(..) => val.as_sql(true),
                // Remove the unreachable 'other' pattern since we've covered all variants
                // If you want to handle any future variants, you could use:
                // _ => format!("{:?}", val),
            };
            line.push(csv_escape(&text));
        }
        csv_text.push_str(&line.join(","));
        csv_text.push('\n');
    }
    Ok(csv_text)
}

/// PostgreSQL 查询 → CSV 文本
async fn query_postgres(connection_string: &str, query: &str) -> Result<String> {
    let (client, conn) = tokio_postgres::connect(connection_string, NoTls)
        .await
        .map_err(|e| anyhow::anyhow!("PostgreSQL 连接失败: {e}"))?;

    // 后台驱动连接事件循环
    tokio::spawn(async move {
        if let Err(e) = conn.await {
            eprintln!("PG connection closed: {e}");
        }
    });

    let rows = client.query(query, &[])
        .await
        .map_err(|e| anyhow::anyhow!("PostgreSQL 查询失败: {e}"))?;

    if rows.is_empty() {
        return Ok(String::new());
    }

    let col_count = rows[0].len();
    let headers: Vec<String> = (1..=col_count).map(|i| format!("Column_{i}")).collect();

    let mut csv_text = String::new();
    csv_text.push_str(&headers.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(","));
    csv_text.push('\n');

    for row in &rows {
        let mut line = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let text: String = pg_cell_to_text(row, i);
            line.push(csv_escape(&text));
        }
        csv_text.push_str(&line.join(","));
        csv_text.push('\n');
    }

    Ok(csv_text)
}

/// PG Row 单元格 → 文本
fn pg_cell_to_text(row: &tokio_postgres::Row, i: usize) -> String {
    if let Ok(v) = row.try_get::<_, Option<String>>(i) { return v.unwrap_or_default(); }
    if let Ok(v) = row.try_get::<_, Option<i64>>(i) { return v.map(|x| x.to_string()).unwrap_or_default(); }
    if let Ok(v) = row.try_get::<_, Option<i32>>(i) { return v.map(|x| x.to_string()).unwrap_or_default(); }
    if let Ok(v) = row.try_get::<_, Option<f64>>(i) { return v.map(|x| x.to_string()).unwrap_or_default(); }
    if let Ok(v) = row.try_get::<_, Option<bool>>(i) { return v.map(|x| x.to_string()).unwrap_or_default(); }
    if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDateTime>>(i) {
        return v.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default();
    }
    if let Ok(v) = row.try_get::<_, Option<chrono::NaiveDate>>(i) {
        return v.map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
    }
    String::new()
}

fn query_sqlite_csv(path: &str, query: &str) -> Result<String> {
    let conn = rusqlite::Connection::open(path)
        .with_context(|| format!("打开 SQLite 失败: {path}"))?;

    let mut stmt = conn.prepare(query).context("SQL 预处理失败")?;
    let col_count = stmt.column_count();
    if col_count == 0 { bail!("SQL 未返回可读取列"); }

    let headers: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut csv_text = String::new();
    csv_text.push_str(&headers.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(","));
    csv_text.push('\n');

    let mut rows = stmt.query([]).context("SQL 执行失败")?;
    while let Ok(Some(row)) = rows.next() {
        let mut line = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let v = row.get_ref(i).with_context(|| format!("读取第 {} 列失败", i + 1))?;
            let text = match v {
                rusqlite::types::ValueRef::Null => String::new(),
                rusqlite::types::ValueRef::Integer(i) => i.to_string(),
                rusqlite::types::ValueRef::Real(f) => f.to_string(),
                rusqlite::types::ValueRef::Text(t) => String::from_utf8_lossy(t).to_string(),
                rusqlite::types::ValueRef::Blob(b) => format!("<blob:{}bytes>", b.len()),
            };
            line.push(csv_escape(&text));
        }
        csv_text.push_str(&line.join(","));
        csv_text.push('\n');
    }
    Ok(csv_text)
}

/// 通过 SQL → CSV → Polars 方式加载数据
fn load_sql_result(csv_text: &str, source_name: &str, dataset_name: &str) -> ApiResult<ChartPayload> {
    let tmp = temp_csv_path();
    if let Err(e) = fs::write(&tmp, csv_text.as_bytes()) {
        return ApiResult::failure(format!("写入临时文件失败: {e}"));
    }
    let output = load_file_impl(tmp.to_string_lossy().as_ref(), 0, 0, -1, false);
    let _ = fs::remove_file(&tmp);

    match output {
        Ok(df) => {
            let df = convert_ms_timestamps(&df);
            let payload = df_to_payload(&df, None);
            replace_active_dataframe(&df, true);
            let _ = register_dataset(&df, dataset_name.to_string(), source_name.to_string());

            match payload {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri 命令
// ─────────────────────────────────────────────────────────────────────────────

/// 测试数据库连接，返回驱动类型、版本、表列表
#[tauri::command]
pub async fn test_db_connection(connection_string: String) -> ApiResult<DbTestResult> {
    let conn = connection_string.trim();
    if conn.is_empty() {
        return ApiResult::failure("连接字符串不能为空");
    }

    let driver = detect_sql_driver(conn);

    match driver {
        "mysql" => {
            let opts = mysql::Opts::from_url(conn)
                .map_err(|e| return ApiResult::<DbTestResult>::failure(format!("连接串解析失败: {e}"))).unwrap();
            let mut c = mysql::Conn::new(opts)
                .map_err(|e| return ApiResult::<DbTestResult>::failure(format!("连接失败: {e}"))).unwrap();

            let version: String = c.query_first("SELECT VERSION()")
                .unwrap_or(None)
                .map(|v: String| v)
                .unwrap_or_else(|| "unknown".to_string());

            let tables: Vec<DbTableInfo> = c
                .query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME")
                .map(|rows: Vec<mysql::Row>| {
                    rows.into_iter().map(|r| {
                        let name: String = r.get(0).unwrap_or_default();
                        DbTableInfo { name, columns: vec![] }
                    }).collect()
                })
                .unwrap_or_default();

            ApiResult::success(DbTestResult { driver: "mysql".to_string(), version, tables })
        }
        "postgres" => {
            let (client, conn) = match tokio_postgres::connect(conn, NoTls).await {
                Ok(v) => v,
                Err(e) => return ApiResult::failure(format!("连接失败: {e}")),
            };

            tokio::spawn(async move {
                if let Err(e) = conn.await {
                    eprintln!("PG connection closed: {e}");
                }
            });

            let version: String = client.query_one("SELECT VERSION()", &[])
                .await
                .map(|r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "unknown".to_string());

            let tables: Vec<DbTableInfo> = client
                .query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name", &[])
                .await
                .map(|rows| {
                    rows.iter().map(|r| {
                        let name: String = r.get(0);
                        DbTableInfo { name, columns: vec![] }
                    }).collect()
                })
                .unwrap_or_default();

            ApiResult::success(DbTestResult { driver: "postgres".to_string(), version, tables })
        }
        "sqlite" => {
            let path = conn
                .strip_prefix("sqlite://").or_else(|| conn.strip_prefix("sqlite:"))
                .unwrap_or(conn);
            let version = "SQLite (local)".to_string();

            let tables = match rusqlite::Connection::open(path) {
                Ok(conn) => {
                    let mut stmt = match conn.prepare(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                    ) {
                        Ok(s) => s,
                        Err(e) => return ApiResult::failure(format!("查询失败: {e}")),
                    };
                    let names: Vec<String> = stmt
                        .query_map([], |r| r.get(0))
                        .unwrap()
                        .filter_map(|r| r.ok())
                        .collect();
                    names.into_iter().map(|n| DbTableInfo { name: n, columns: vec![] }).collect()
                }
                Err(e) => return ApiResult::failure(format!("打开 SQLite 失败: {e}")),
            };

            ApiResult::success(DbTestResult {
                driver: "sqlite".to_string(),
                version,
                tables,
            })
        }
        _ => ApiResult::failure("不支持的数据库类型。支持: mysql://, postgres://, sqlite://"),
    }
}

/// 执行 SQL 查询并加载为数据集
#[tauri::command]
pub async fn execute_db_query(
    connection_string: String,
    query: String,
    dataset_name: Option<String>,
) -> ApiResult<ChartPayload> {
    let conn = connection_string.trim();
    let q = query.trim().trim_end_matches(';').trim();
    if conn.is_empty() { return ApiResult::failure("连接字符串不能为空"); }
    if q.is_empty() { return ApiResult::failure("SQL 查询不能为空"); }

    let upper = q.to_uppercase();
    if !upper.starts_with("SELECT") && !upper.starts_with("WITH") {
        return ApiResult::failure("仅支持 SELECT 查询");
    }

    let driver = detect_sql_driver(conn);
    let csv_text = match driver {
        "mysql" => match query_mysql(conn, q) {
            Ok(t) => t,
            Err(e) => return ApiResult::failure(e.to_string()),
        },
        "postgres" => match query_postgres(conn, q).await {
            Ok(t) => t,
            Err(e) => return ApiResult::failure(e.to_string()),
        },
        "sqlite" => {
            let path = conn.strip_prefix("sqlite://").or_else(|| conn.strip_prefix("sqlite:")).unwrap_or(conn);
            match query_sqlite_csv(path, q) {
                Ok(t) => t,
                Err(e) => return ApiResult::failure(e.to_string()),
            }
        }
        _ => return ApiResult::failure("不支持的数据库类型"),
    };

    let name = dataset_name.unwrap_or_else(|| format!("SQL查询"));
    load_sql_result(&csv_text, &format!("execute_db_query({driver})"), &name)
}

/// 加载数据库指定表
#[tauri::command]
pub async fn load_db_table(
    connection_string: String,
    table_name: String,
) -> ApiResult<ChartPayload> {
    let query = format!("SELECT * FROM {}", table_name);
    execute_db_query(connection_string, query, Some(table_name)).await
}