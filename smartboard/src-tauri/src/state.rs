// src-tauri/src/state.rs
//
// 全局共享状态（Global Shared State）
//
// 所有跨命令共享的全局变量集中在此文件。
// 其他模块通过 `use crate::state::*` 引入全部状态。

use anyhow::Result;
use once_cell::sync::Lazy;
use polars::prelude::*;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::types::{DatasetMeta, RuntimeDataset};

// ─────────────────────────────────────────────────────────────────────────────
// Global in-memory state
// ─────────────────────────────────────────────────────────────────────────────

/// The currently loaded DataFrame (shared across all Tauri commands).
pub static GLOBAL_DF: Lazy<Mutex<Option<DataFrame>>> = Lazy::new(|| Mutex::new(None));

/// Snapshot of the DataFrame right after loading, used for rollback.
pub static ORIGINAL_DF: Lazy<Mutex<Option<DataFrame>>> = Lazy::new(|| Mutex::new(None));

/// History stack for step-wise clean undo.
pub static CLEAN_HISTORY: Lazy<Mutex<Vec<DataFrame>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Dataset registry for multi-table workflows.
pub static DATASET_REGISTRY: Lazy<Mutex<Vec<RuntimeDataset>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

/// Currently active dataset ID.
pub static ACTIVE_DATASET_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

/// Currently selected column names (for chart operations).
pub static SELECTED_COLS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

/// Global chart HTML store.
pub static GLOBAL_CHART_STORE: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ─────────────────────────────────────────────────────────────────────────────
// Dataset registry helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Register a dataset in the runtime registry.
pub fn register_dataset(df: &DataFrame, name: String, _source: String) -> Result<DatasetMeta> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let id = uuid::Uuid::new_v4().to_string();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let meta = DatasetMeta {
        id: id.clone(),
        name,
        path: String::new(),
        size_bytes: 0,
        modified_at_ms: now,
        created_at_ms: now,
    };

    let mut registry = DATASET_REGISTRY.lock().unwrap();
    registry.push(RuntimeDataset {
        meta: meta.clone(),
        df: df.clone(),
    });

    Ok(meta)
}

/// Replace the active DataFrame and optionally store it as a dataset.
pub fn replace_active_dataframe(df: &DataFrame, register: bool) {
    let mut global = GLOBAL_DF.lock().unwrap();
    *global = Some(df.clone());

    if register {
        let dataset_name = "current_dataset".to_string();
        let _ = register_dataset(df, dataset_name, "replace_active".to_string());
    }
}

/// Set the active dataset ID.
pub fn set_active_dataset_id(id: Option<String>) {
    let mut active = ACTIVE_DATASET_ID.lock().unwrap();
    *active = id;
}

/// Get a clone of the current active DataFrame.
pub fn get_active_df() -> Result<DataFrame> {
    let guard = GLOBAL_DF.lock().unwrap();
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("没有加载数据，请先上传文件"))
}

/// Get a dataset from registry by ID.
pub fn get_dataset_by_id(id: &str) -> Option<RuntimeDataset> {
    let registry = DATASET_REGISTRY.lock().unwrap();
    registry.iter().find(|r| r.meta.id == id).cloned()
}

/// List all registered datasets.
pub fn list_datasets() -> Vec<DatasetMeta> {
    let registry = DATASET_REGISTRY.lock().unwrap();
    registry.iter().map(|r| r.meta.clone()).collect()
}

/// Delete a dataset from registry by ID.
pub fn delete_dataset(id: &str) -> Result<()> {
    let mut registry = DATASET_REGISTRY.lock().unwrap();
    let len_before = registry.len();
    registry.retain(|r| r.meta.id != id);
    if registry.len() == len_before {
        anyhow::bail!("找不到数据集: {}", id);
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Clean history management
// ─────────────────────────────────────────────────────────────────────────────

/// Push the current DataFrame to the clean history stack.
pub fn push_clean_history() -> Result<()> {
    let df = GLOBAL_DF.lock().unwrap();
    if let Some(df) = df.as_ref() {
        let mut history = CLEAN_HISTORY.lock().unwrap();
        history.push(df.clone());
    }
    Ok(())
}

/// Pop the last state from the clean history stack.
pub fn pop_clean_history() -> Option<DataFrame> {
    let mut history = CLEAN_HISTORY.lock().unwrap();
    let popped = history.pop();
    if let Some(df) = &popped {
        *GLOBAL_DF.lock().unwrap() = Some(df.clone());
    }
    popped
}

/// Clear the clean history stack.
pub fn clear_clean_history() {
    let mut history = CLEAN_HISTORY.lock().unwrap();
    history.clear();
}
