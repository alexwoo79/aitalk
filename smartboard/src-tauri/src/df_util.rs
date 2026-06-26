// src-tauri/src/df_util.rs
//
// DataFrame → ChartPayload 工具函数（DataFrame Utility Functions）
//
// 将 Polars DataFrame 序列化为前端可消费的 ChartPayload JSON 结构。

use anyhow::Result;
use chrono::{DateTime, Duration, NaiveDate};
use polars::prelude::*;
use serde_json;

use crate::types::{ChartPayload, ColumnInfo, DatasetSemantics, RowMap};

/// Default preview row limit.
pub const PREVIEW_LIMIT: usize = 200;

/// Default chart data row limit.
pub const CHART_LIMIT: usize = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Convert a Polars DataFrame into a ChartPayload for frontend consumption.
pub fn df_to_payload(df: &DataFrame, limit: Option<usize>) -> Result<ChartPayload> {
    let total_rows = df.height();
    let preview_n = limit.map(|l| l.min(total_rows)).unwrap_or(total_rows);

    let columns: Vec<ColumnInfo> = df
        .columns()
        .iter()
        .map(|s| ColumnInfo {
            name: s.name().to_string(),
            dtype: format!("{}", s.dtype()),
            nullable: s.null_count() > 0,
        })
        .collect();

    let mut rows: Vec<RowMap> = Vec::new();
    let n_rows = total_rows.min(preview_n);
    let column_names: Vec<String> = df
        .get_column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();

    for row_idx in 0..n_rows {
        let mut row_map = RowMap::new();
        for col_name in &column_names {
            let json_val = match df.column(col_name.as_str()) {
                Ok(col) => match col.get(row_idx) {
                    Ok(v) => v_to_json(&v),
                    Err(_) => serde_json::Value::Null,
                },
                Err(_) => serde_json::Value::Null,
            };
            row_map.insert(col_name.clone(), json_val);
        }
        rows.push(row_map);
    }

    Ok(ChartPayload {
        columns,
        rows,
        total_rows,
        notices: Vec::new(),
        semantics: DatasetSemantics::default(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// AnyValue → serde_json::Value conversion
// ─────────────────────────────────────────────────────────────────────────────

fn v_to_json(v: &AnyValue) -> serde_json::Value {
    match v {
        AnyValue::Null => serde_json::Value::Null,
        AnyValue::Boolean(b) => serde_json::Value::Bool(*b),
        AnyValue::Int8(i) => serde_json::json!(*i),
        AnyValue::Int16(i) => serde_json::json!(*i),
        AnyValue::Int32(i) => serde_json::json!(*i),
        AnyValue::Int64(i) => serde_json::json!(*i),
        AnyValue::UInt8(i) => serde_json::json!(*i),
        AnyValue::UInt16(i) => serde_json::json!(*i),
        AnyValue::UInt32(i) => serde_json::json!(*i),
        AnyValue::UInt64(i) => serde_json::json!(*i),
        AnyValue::Float32(f) => serde_json::json!(*f),
        AnyValue::Float64(f) => serde_json::json!(*f),
        AnyValue::String(s) => serde_json::Value::String(s.to_string()),
        AnyValue::StringOwned(s) => serde_json::Value::String(s.to_string()),
        AnyValue::Date(days) => {
            let epoch = NaiveDate::from_ymd_opt(1970, 1, 1);
            match epoch {
                Some(e) => match e.checked_add_signed(Duration::days(*days as i64)) {
                    Some(d) => serde_json::Value::String(d.format("%Y-%m-%d").to_string()),
                    None => serde_json::Value::Null,
                },
                None => serde_json::Value::Null,
            }
        }
        AnyValue::Datetime(ts, unit, _) => {
            let (div, mul) = match unit {
                TimeUnit::Nanoseconds => (1_000_000_000i64, 1u32),
                TimeUnit::Microseconds => (1_000_000i64, 1_000u32),
                TimeUnit::Milliseconds => (1_000i64, 1_000_000u32),
            };
            let secs = ts.div_euclid(div);
            let sub = ts.rem_euclid(div);
            let nanos = (sub as u32).saturating_mul(mul);
            match DateTime::from_timestamp(secs, nanos) {
                Some(dt) => serde_json::Value::String(
                    dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string(),
                ),
                None => serde_json::Value::Null,
            }
        }
        _ => serde_json::Value::Null,
    }
}
