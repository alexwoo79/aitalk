// src-tauri/src/types.rs
//
// 共享数据类型（Shared Data Types）
//
// 所有跨模块共用的数据结构定义集中在此文件。
// 前端通过 JSON 序列化接收这些类型，字段命名遵循 camelCase ↔ snake_case 自动转换。

use polars::prelude::DataFrame;
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// API 响应包装
// ─────────────────────────────────────────────────────────────────────────────

/// Generic API response wrapper sent back to the frontend.
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResult<T: Serialize> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResult<T> {
    pub fn success(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }
    pub fn failure(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 列信息
// ─────────────────────────────────────────────────────────────────────────────

/// Schema info for a single column.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub dtype: String,
    pub nullable: bool,
}

/// Semantic info for a single column (used by frontend classifier).
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SemanticColumnInfo {
    pub name: String,
    pub dtype: String,
    pub nullable: bool,
    pub semantic_type: String,
    pub analytic_role: String,
    pub business_tags: Vec<String>,
}

/// Semantic summary for the active dataset.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DatasetSemantics {
    pub columns: Vec<SemanticColumnInfo>,
    pub measure_columns: Vec<String>,
    pub dimension_columns: Vec<String>,
    pub categorical_columns: Vec<String>,
    pub time_columns: Vec<String>,
    pub id_columns: Vec<String>,
    pub boolean_columns: Vec<String>,
    pub business_tags: Vec<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据载荷
// ─────────────────────────────────────────────────────────────────────────────

/// Row data as a map of column name -> value.
pub type RowMap = serde_json::Map<String, serde_json::Value>;

/// Payload sent to frontend for chart rendering / data preview.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChartPayload {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<RowMap>,
    pub total_rows: usize,
    pub notices: Vec<String>,
    #[serde(default)]
    pub semantics: DatasetSemantics,
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据集元数据
// ─────────────────────────────────────────────────────────────────────────────

/// Dataset metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatasetMeta {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    pub created_at_ms: u64,
}

/// Runtime dataset entry (contains both meta and DataFrame).
#[derive(Debug, Clone)]
pub struct RuntimeDataset {
    pub meta: DatasetMeta,
    pub df: DataFrame,
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel 选区
// ─────────────────────────────────────────────────────────────────────────────

/// Info for a single sheet in an Excel workbook.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SheetInfo {
    pub name: String,
    pub index: usize,
    pub rows: usize,
    pub cols: usize,
}

/// Excel workbook metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExcelWorkbookMeta {
    pub path: String,
    pub sheets: Vec<SheetInfo>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 关联配置
// ─────────────────────────────────────────────────────────────────────────────

/// Join configuration.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JoinConfig {
    pub left_dataset_id: String,
    pub right_dataset_id: String,
    pub left_on: Vec<String>,
    pub right_on: Vec<String>,
    pub how: String, // "inner" | "left" | "right" | "outer"
}
