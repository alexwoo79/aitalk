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

/// Display row limit for detail tables (frontend-side only).
/// Backend sends ALL rows; frontend truncates for rendering.
pub const DISPLAY_LIMIT: usize = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Build a DataFrame from a list of Polars Columns.
pub fn dataframe_from_columns(columns: Vec<Column>) -> polars::prelude::PolarsResult<DataFrame> {
    let height = columns.first().map(|c| c.len()).unwrap_or(0);
    DataFrame::new(height, columns)
}

/// Convert millisecond Unix timestamps in numeric columns to date strings.
///
/// Detects columns where values are in the 13-digit millisecond range
/// (2001-2100) and converts them to YYYY-MM-DD format.
pub fn convert_ms_timestamps(df: &DataFrame) -> DataFrame {
    // Time range: 2001-01-01 to 2100-01-01 as ms timestamps
    const MS_MIN: i64 = 978_307_200_000; // 2001-01-01
    const MS_MAX: i64 = 4_102_444_800_000; // 2100-01-01

    let n_rows = df.height();
    if n_rows == 0 {
        return df.clone();
    }

    let cols: Vec<Column> = df
        .columns()
        .iter()
        .map(|s| {
            let dtype = s.dtype();
            // Only check integer columns
            let is_int = matches!(
                dtype,
                DataType::Int64 | DataType::Int32 | DataType::UInt32 | DataType::UInt64
            );
            if !is_int {
                return s.clone().into();
            }

            // Sample up to 20 values to check if this looks like a ms timestamp column
            let sample_n = n_rows.min(20);
            let mut ms_count = 0usize;
            let mut total = 0usize;
            for i in 0..sample_n {
                if let Ok(AnyValue::Int64(v)) = s.get(i) {
                    total += 1;
                    if v >= MS_MIN && v <= MS_MAX {
                        ms_count += 1;
                    }
                } else if let Ok(AnyValue::Int32(v)) = s.get(i) {
                    total += 1;
                    let v = v as i64;
                    if v >= MS_MIN && v <= MS_MAX {
                        ms_count += 1;
                    }
                } else if let Ok(AnyValue::UInt32(v)) = s.get(i) {
                    total += 1;
                    let v = v as i64;
                    if v >= MS_MIN && v <= MS_MAX {
                        ms_count += 1;
                    }
                }
            }

            // If >60% of sampled non-null values are in ms range, convert the column
            if total > 0 && (ms_count as f64 / total as f64) > 0.6 {
                let date_strings: Vec<Option<String>> = (0..n_rows)
                    .map(|i| {
                        let ms = match s.get(i) {
                            Ok(AnyValue::Int64(v)) => v,
                            Ok(AnyValue::Int32(v)) => v as i64,
                            Ok(AnyValue::UInt32(v)) => v as i64,
                            _ => return None,
                        };
                        let secs = ms / 1000;
                        let nanos = ((ms % 1000) * 1_000_000) as u32;
                        DateTime::from_timestamp(secs, nanos)
                            .map(|dt| dt.naive_utc().format("%Y-%m-%d").to_string())
                    })
                    .collect();
                Column::new(s.name().clone(), date_strings).into()
            } else {
                s.clone().into()
            }
        })
        .collect();

    DataFrame::new_with_broadcast(n_rows, cols).unwrap_or_else(|_| df.clone())
}

/// Convert a Polars DataFrame into a ChartPayload for frontend consumption.
pub fn df_to_payload(df: &DataFrame, limit: Option<usize>) -> Result<ChartPayload> {
    let total_rows = df.height();
    let preview_n = limit.unwrap_or(500).min(total_rows);

    let columns: Vec<ColumnInfo> = df
        .columns()
        .iter()
        .map(|s| ColumnInfo {
            name: s.name().to_string(),
            dtype: format!("{}", s.dtype()),
            nullable: s.null_count() > 0,
        })
        .collect();

    let column_names: Vec<String> = df
        .get_column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();

    // 预提取所有列的 AnyValue 向量，避免逐 cell 调用 column()
    let col_data: Vec<Vec<AnyValue>> = column_names
        .iter()
        .map(|name| {
            df.column(name.as_str())
                .map(|c| {
                    (0..preview_n)
                        .map(|i| c.get(i).unwrap_or(AnyValue::Null))
                        .collect()
                })
                .unwrap_or_default()
        })
        .collect();

    let mut rows: Vec<RowMap> = Vec::new();
    for row_idx in 0..preview_n {
        let mut row_map = RowMap::with_capacity(column_names.len());
        for (col_idx, col_name) in column_names.iter().enumerate() {
            let json_val = v_to_json(&col_data[col_idx][row_idx]);
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
