// src-tauri/src/commands/excel_selection.rs
//
// Excel 选区命令（Excel Sheet Selection Commands）
//
// 负责 Excel 工作表的列出、选择加载，以及从剪贴板读取 Excel/WPS 当前选区。

use anyhow::{anyhow, bail, Result};
use calamine::{open_workbook_auto, Data as XlDataType, Reader};
use polars::prelude::*;
use std::path::Path;

use crate::commands::loader::{auto_cast_numeric, cell_to_string, is_date_column_name};
use crate::df_util::df_to_payload;
use crate::state::{register_dataset, replace_active_dataframe};
use crate::types::{ApiResult, ChartPayload, SheetInfo};

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

/// List all sheet names and dimensions in an Excel workbook.
#[tauri::command]
pub async fn list_excel_sheets(path: String) -> ApiResult<Vec<SheetInfo>> {
    let normalized = crate::commands::loader::normalize_file_path(&path);
    match list_sheets_impl(&normalized) {
        Ok(sheets) => ApiResult::success(sheets),
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

/// Load a specific sheet from an Excel workbook by index (0-based).
#[tauri::command]
pub async fn load_excel_sheet(path: String, sheet_index: usize) -> ApiResult<ChartPayload> {
    tokio::task::spawn_blocking(move || {
    let normalized = crate::commands::loader::normalize_file_path(&path);
    match load_sheet_impl(&normalized, sheet_index) {
        Ok(df) => {
            let sheet_name = get_sheet_name_impl(&normalized, sheet_index)
                .unwrap_or_else(|| format!("Sheet_{}", sheet_index + 1));

            let payload = df_to_payload(&df, None);
            replace_active_dataframe(&df, true);
            let _ = register_dataset(&df, sheet_name, "excel_sheet".to_string());

            payload.map_or_else(|e| ApiResult::failure(e.to_string()), ApiResult::success)
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
    }).await.unwrap_or_else(|e| ApiResult::failure(format!("spawn_blocking error: {e}")))
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/// List all sheet names with row/column counts.
pub fn list_sheets_impl(path: &str) -> Result<Vec<SheetInfo>> {
    let path = Path::new(path);
    if !path.exists() {
        bail!("文件不存在: {}", path.display());
    }

    let mut workbook =
        open_workbook_auto(path).map_err(|e| anyhow!("无法打开 Excel 文件: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let mut sheets = Vec::with_capacity(sheet_names.len());

    for (index, name) in sheet_names.iter().enumerate() {
        match workbook.worksheet_range(name) {
            Ok(range) => {
                let rows = range.rows().count();
                let cols = range
                    .rows()
                    .next()
                    .map(|r| r.len())
                    .unwrap_or(0);
                // 过滤掉少于 2 行的工作表（无数据或仅有表头）
                if rows < 2 {
                    continue;
                }
                sheets.push(SheetInfo {
                    name: name.clone(),
                    index,
                    rows,
                    cols,
                });
            }
            Err(_) => {
                sheets.push(SheetInfo {
                    name: name.clone(),
                    index,
                    rows: 0,
                    cols: 0,
                });
            }
        }
    }

    Ok(sheets)
}

/// Load a specific sheet as a DataFrame.
pub fn load_sheet_impl(path: &str, sheet_index: usize) -> Result<DataFrame> {
    let path = Path::new(path);
    let mut workbook =
        open_workbook_auto(path).map_err(|e| anyhow!("无法打开 Excel 文件: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_index >= sheet_names.len() {
        bail!(
            "工作表索引 {} 超出范围 (共 {} 个工作表)",
            sheet_index,
            sheet_names.len()
        );
    }

    let sheet_name = &sheet_names[sheet_index];
    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| anyhow!("无法读取工作表 '{}': {}", sheet_name, e))?;

    let mut iter = range.rows();
    let header_row = match iter.next() {
        Some(row) => row,
        None => bail!("工作表 '{}' 为空", sheet_name),
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

    let mut columns: Vec<Vec<String>> = headers.iter().map(|_| Vec::new()).collect();

    for row in iter {
        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx >= columns.len() {
                break;
            }
            let is_date_col = date_col_mask.get(col_idx).copied().unwrap_or(false);
            let val = cell_to_string(cell, is_date_col);
            columns[col_idx].push(val);
        }
        for col_idx in row.len()..columns.len() {
            columns[col_idx].push(String::new());
        }
    }

    let series_vec: Vec<Series> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| Series::new(h.into(), &columns[i]))
        .collect();
    let height = columns.first().map(|c| c.len()).unwrap_or(0);

    let mut df = DataFrame::new(
        height,
        series_vec
            .into_iter()
            .map(|s| s.into())
            .collect::<Vec<Column>>(),
    )?;

    df = auto_cast_numeric(df);

    Ok(df)
}

/// Get sheet name by index.
pub fn get_sheet_name_impl(path: &str, sheet_index: usize) -> Option<String> {
    let path = Path::new(path);
    let workbook = open_workbook_auto(path).ok()?;
    let sheet_names = workbook.sheet_names().to_vec();
    sheet_names.get(sheet_index).cloned()
}
