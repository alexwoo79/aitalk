// src-tauri/src/commands/loader.rs
//
// 文件加载命令（File Loading Commands）
//
// 负责 CSV / Excel 文件读取，将解析结果存入全局状态。

use anyhow::{bail, Result};
use calamine::{open_workbook_auto, Data as XlDataType, Reader};
use polars::prelude::*;
use std::path::Path;

use crate::df_util::df_to_payload;
use crate::state::{register_dataset, replace_active_dataframe, GLOBAL_DF};
use crate::types::{ApiResult, ChartPayload};

// ─────────────────────────────────────────────────────────────────────────────
// Path normalization
// ─────────────────────────────────────────────────────────────────────────────

/// Normalize a file path that may be a `file://` URL with percent-encoding.
pub fn normalize_file_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(stripped) = trimmed.strip_prefix("file://") {
        percent_decode(stripped)
    } else {
        trimmed.to_string()
    }
}

fn percent_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
                continue;
            }
            result.push('%');
            result.push_str(&hex);
        } else {
            result.push(c);
        }
    }
    result
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

/// Load a CSV or Excel file into the global DataFrame.
///
/// Parameters:
///   path       — file path (supports file:// URL)
///   skip_head  — rows to skip from the top
///   skip_tail  — rows to skip from the bottom
///   header_row — row index to use as header (-1 = auto-detect)
///   header_locked — if true, do not auto-detect header
#[tauri::command]
pub async fn load_file(
    path: String,
    skip_head: usize,
    skip_tail: usize,
    header_row: i64,
    header_locked: bool,
) -> ApiResult<ChartPayload> {
    let normalized = normalize_file_path(&path);
    match load_file_impl(&normalized, skip_head, skip_tail, header_row, header_locked) {
        Ok(df) => {
            let payload = df_to_payload(&df, None);
            replace_active_dataframe(&df, true);
            let file_name = Path::new(&normalized)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("加载数据")
                .to_string();
            let _ = register_dataset(&df, file_name, "load_file".to_string());
            payload.map_or_else(
                |e| ApiResult::failure(e.to_string()),
                ApiResult::success,
            )
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

/// Load multiple files and register each as a dataset.
#[tauri::command]
pub async fn load_files(paths: Vec<String>) -> ApiResult<Vec<ChartPayload>> {
    let mut results = Vec::new();
    for path in &paths {
        let normalized = normalize_file_path(path);
        match load_file_impl(&normalized, 0, 0, -1, false) {
            Ok(df) => {
                let file_name = Path::new(&normalized)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let _ = register_dataset(&df, file_name.clone(), "load_files".to_string());

                // Set the first file as active
                if results.is_empty() {
                    replace_active_dataframe(&df, false);
                }

                match df_to_payload(&df, None) {
                    Ok(p) => results.push(p),
                    Err(e) => return ApiResult::failure(e.to_string()),
                }
            }
            Err(e) => return ApiResult::failure(e.to_string()),
        }
    }
    ApiResult::success(results)
}

/// Get basic info about the currently loaded DataFrame.
#[tauri::command]
pub async fn get_dataframe_info() -> ApiResult<ChartPayload> {
    let df = {
        let guard = GLOBAL_DF.lock().unwrap();
        match guard.as_ref() {
            None => return ApiResult::failure("没有加载数据"),
            Some(df) => df.clone(),
        }
    };
    df_to_payload(&df, None)
        .map_or_else(|e| ApiResult::failure(e.to_string()), ApiResult::success)
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/// Load a file (CSV or Excel) and return a Polars DataFrame.
pub fn load_file_impl(
    path: &str,
    skip_head: usize,
    skip_tail: usize,
    _header_row: i64,
    _header_locked: bool,
) -> Result<DataFrame> {
    let path = Path::new(path);
    if !path.exists() {
        bail!("文件不存在: {}", path.display());
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "csv" | "tsv" | "txt" => load_csv(path, skip_head, skip_tail),
        "xlsx" | "xls" | "xlsm" | "ods" => load_excel_first_sheet(path, skip_head, skip_tail),
        other => bail!("不支持的文件格式: .{} (支持 CSV, Excel)", other),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel date serial number conversion
// ─────────────────────────────────────────────────────────────────────────────

/// Convert an Excel date serial number to YYYY-MM-DD string.
/// Handles the Excel 1900 leap-year bug: serial >= 61 needs 1-day offset.
pub fn excel_serial_to_date(serial: f64) -> String {
    if !serial.is_finite() || serial < 1.0 {
        return serial.to_string();
    }
    // Excel epoch: 1899-12-30 (day 0 = 1900-01-00 in Excel's world)
    let days = serial.floor() as i64;
    // Excel incorrectly treats 1900 as a leap year; serial >= 61 means we are past
    // the fictional Feb 29, 1900 and must subtract 1 day.
    let adjusted = if days >= 61 { days - 1 } else { days };
    if let Some(base) = chrono::NaiveDate::from_ymd_opt(1899, 12, 30) {
        let d = base + chrono::Duration::days(adjusted);
        return d.format("%Y-%m-%d").to_string();
    }
    serial.to_string()
}

/// Heuristic: detect if a column name suggests it holds date values.
pub fn is_date_column_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("date")
        || lower.contains("日期")
        || lower.contains("时间")
        || lower.contains("time")
        || lower.contains("day")
        || lower.contains("month")
        || lower.contains("year")
        || lower.contains("年")
        || lower.contains("月")
        || lower.contains("日")
        || lower.contains("出生")
        || lower.contains("birth")
        || lower.contains("成立")
        || lower.contains("创建")
        || lower.contains("到期")
}

/// Convert a calamine cell value to string, applying date conversion when appropriate.
pub fn cell_to_string(cell: &XlDataType, is_date_col: bool) -> String {
    // Helper: if a float looks like a date serial number, convert it
    let try_date = |f: &f64| -> Option<String> {
        let n = *f;
        if is_date_col && n.is_finite() && n >= 30000.0 && n <= 80000.0 && n == n.trunc() {
            return Some(excel_serial_to_date(n));
        }
        None
    };

    match cell {
        XlDataType::String(s) => s.clone(),
        XlDataType::Float(f) => {
            if let Some(date_str) = try_date(f) {
                return date_str;
            }
            if *f == f.trunc() && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        XlDataType::Int(i) => format!("{}", i),
        XlDataType::Bool(b) => format!("{}", b),
        XlDataType::DateTime(dt) => {
            // Use calamine's built-in as_datetime() which handles 1900/1904 date systems
            if let Some(d) = dt.as_datetime() {
                d.format("%Y-%m-%d").to_string()
            } else {
                excel_serial_to_date(dt.as_f64())
            }
        }
        XlDataType::DateTimeIso(d) => d.clone(),
        XlDataType::DurationIso(d) => d.clone(),
        XlDataType::Empty => String::new(),
        XlDataType::Error(_) => String::new(),
    }
}

fn load_csv(path: &Path, skip_head: usize, skip_tail: usize) -> Result<DataFrame> {
    let df = CsvReadOptions::default()
        .with_has_header(true)
        .with_skip_rows(skip_head)
        .with_skip_rows_after_header(0)
        .with_infer_schema_length(None)
        .map_parse_options(|opts| {
            opts.with_truncate_ragged_lines(true)
        })
        .try_into_reader_with_file_path(Some(path.to_path_buf()))?
        .finish()?;

    let df = crate::df_util::convert_ms_timestamps(&df);

    // Use Polars lazy API for skip_tail
    if skip_tail > 0 {
        let n = df.height();
        if skip_tail < n {
            return Ok(df.slice(0, n - skip_tail));
        }
    }
    Ok(df)
}

fn load_excel_first_sheet(path: &Path, skip_head: usize, skip_tail: usize) -> Result<DataFrame> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| anyhow::anyhow!("无法打开 Excel 文件: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        bail!("Excel 文件不包含任何工作表");
    }

    let first_sheet = &sheet_names[0];
    let range = workbook
        .worksheet_range(first_sheet)
        .map_err(|e| anyhow::anyhow!("无法读取工作表 '{}': {}", first_sheet, e))?;

    let mut iter = range.rows();

    // Extract headers from first row
    let header_row = match iter.next() {
        Some(row) => row,
        None => bail!("工作表为空"),
    };

    let headers: Vec<String> = header_row
        .iter()
        .enumerate()
        .map(|(i, cell)| match cell {
            XlDataType::String(s) => s.clone(),
            XlDataType::Float(f) => format!("{}", f),
            XlDataType::Int(i) => format!("{}", i),
            _ => format!("Column_{}", i + 1),
        })
        .collect();

    // Pre-compute which columns are date columns by name heuristic
    let date_col_mask: Vec<bool> = headers
        .iter()
        .map(|h| is_date_column_name(h))
        .collect();

    // Build columns
    let mut columns: Vec<Vec<String>> = headers.iter().map(|_| Vec::new()).collect();
    let mut row_count = 0;

    for (row_idx, row) in iter.enumerate() {
        if row_idx < skip_head {
            continue;
        }
        row_count += 1;
        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx >= columns.len() {
                break;
            }
            let is_date_col = date_col_mask.get(col_idx).copied().unwrap_or(false);
            let val = cell_to_string(cell, is_date_col);
            columns[col_idx].push(val);
        }
        // Fill missing columns with empty string
        for col_idx in row.len()..columns.len() {
            columns[col_idx].push(String::new());
        }
    }

    // Trim tail
    if skip_tail > 0 && skip_tail < row_count {
        let keep = row_count - skip_tail;
        for col in columns.iter_mut() {
            col.truncate(keep);
        }
    }

    // Build DataFrame from columns
    let height = columns.first().map(|c| c.len()).unwrap_or(0);
    let series_vec: Vec<Series> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| Series::new(h.into(), &columns[i]))
        .collect();

    let mut df = DataFrame::new(
        height,
        series_vec
            .into_iter()
            .map(|s| s.into())
            .collect::<Vec<Column>>(),
    )?;

    // Try to cast numeric columns
    df = auto_cast_numeric(df);

    Ok(df)
}

/// Try to cast string columns that look numeric to Float64.
pub fn auto_cast_numeric(df: DataFrame) -> DataFrame {
    let mut df = df;
    let col_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();

    for name in col_names {
        if let Ok(s) = df.column(&name) {
            // Skip if already numeric
            if s.dtype().is_numeric() {
                continue;
            }
            // Try to cast to Float64
            let str_series = s.cast(&DataType::String).ok();
            if let Some(str_s) = str_series {
                let mut numeric_count: usize = 0;
                let mut non_empty_count: usize = 0;
                for opt in str_s.str().unwrap().iter() {
                    if let Some(v) = opt {
                        let trimmed = v.trim();
                        if !trimmed.is_empty() {
                            non_empty_count += 1;
                            if trimmed.parse::<f64>().is_ok() {
                                numeric_count += 1;
                            }
                        }
                    }
                }
                // 仅当所有非空值都能解析为数值时才转换，避免脏数据被静默置为 null
                if non_empty_count > 0 && numeric_count == non_empty_count {
                    if let Ok(casted) = str_s.cast(&DataType::Float64) {
                        let _ = df.replace(&name, casted);
                    }
                }
            }
        }
    }
    df
}
