// src-tauri/src/commands/merge.rs
//
// 数据表合并命令（Merge / Join / Concat Commands）
//
// 支持两种合并模式：
//   1. join_datasets   — 横向 JOIN（inner / left / right / outer）
//   2. concat_datasets — 纵向 CONCAT（上下堆叠）

use anyhow::{bail, Result};
use polars::prelude::*;

use crate::df_util::df_to_payload;
use crate::state::{get_active_df, get_dataset_by_id, register_dataset, replace_active_dataframe};
use crate::types::{ApiResult, ChartPayload};

// ─────────────────────────────────────────────────────────────────────────────
// join_datasets
// ─────────────────────────────────────────────────────────────────────────────

/// JOIN 当前活跃表（左表）与指定数据集（右表）按键列。
///
/// 参数：
///   right_dataset_id  — 右表的数据集 ID
///   left_on           — 左表连接键列名列表
///   right_on          — 右表连接键列名列表（与 left_on 一一对应）
///   how               — 连接类型："inner" | "left" | "right" | "outer"
#[tauri::command]
pub async fn join_datasets(
    right_dataset_id: String,
    left_on: Vec<String>,
    right_on: Vec<String>,
    how: String,
) -> ApiResult<ChartPayload> {
    if left_on.is_empty() || left_on.len() != right_on.len() {
        return ApiResult::failure("连接键不能为空，且左右键列数量必须相等");
    }

    let left_df = match get_active_df() {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let right_rec = match get_dataset_by_id(&right_dataset_id) {
        Some(rec) => rec,
        None => return ApiResult::failure("找不到指定的右表数据集"),
    };

    match join_impl(&left_df, &right_rec.df, &left_on, &right_on, &how) {
        Ok(result) => {
            replace_active_dataframe(&result, false);
            let _ = register_dataset(&result, "JOIN结果".to_string(), "join_datasets".to_string());
            match df_to_payload(&result, None) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// concat_datasets
// ─────────────────────────────────────────────────────────────────────────────

/// 纵向拼接当前活跃表与指定数据集。
#[tauri::command]
pub async fn concat_datasets(right_dataset_id: String) -> ApiResult<ChartPayload> {
    let left_df = match get_active_df() {
        Ok(df) => df,
        Err(e) => return ApiResult::failure(e.to_string()),
    };

    let right_rec = match get_dataset_by_id(&right_dataset_id) {
        Some(rec) => rec,
        None => return ApiResult::failure("找不到指定的右表数据集"),
    };

    match concat_impl(&[(*left_df).clone(), (*right_rec.df).clone()]) {
        Ok(result) => {
            replace_active_dataframe(&result, false);
            let _ =
                register_dataset(&result, "CONCAT结果".to_string(), "concat_datasets".to_string());
            match df_to_payload(&result, None) {
                Ok(p) => ApiResult::success(p),
                Err(e) => ApiResult::failure(e.to_string()),
            }
        }
        Err(e) => ApiResult::failure(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

fn join_impl(
    left: &DataFrame,
    right: &DataFrame,
    left_on: &[String],
    right_on: &[String],
    how: &str,
) -> Result<DataFrame> {
    use std::collections::HashSet;

    let join_type = match how {
        "inner" => JoinType::Inner,
        "left" => JoinType::Left,
        "right" => JoinType::Right,
        "outer" | "full" => JoinType::Full,
        other => bail!("不支持的连接类型: {} (支持 inner/left/right/outer)", other),
    };

    let left_keys: Vec<Expr> = left_on.iter().map(|c| col(c.as_str())).collect();
    let right_keys: Vec<Expr> = right_on.iter().map(|c| col(c.as_str())).collect();

    // Find overlapping column names to suffix on right side
    let right_cols: HashSet<&str> = right
        .get_column_names()
        .iter()
        .map(|s| s.as_str())
        .collect();
    let left_cols: HashSet<&str> = left
        .get_column_names()
        .iter()
        .map(|s| s.as_str())
        .collect();
    let overlap: Vec<String> = right_cols
        .intersection(&left_cols)
        .filter(|c| !right_on.contains(&c.to_string()))
        .map(|c| c.to_string())
        .collect();

    let mut right_renamed = right.clone();
    for col_name in &overlap {
        let new_name = format!("{}_right", col_name);
        if let Ok(_) = right_renamed.rename(col_name.as_str(), new_name.as_str().into()) {
            // renamed successfully
        }
    }

    let right_lf = right_renamed.lazy();

    let result = left
        .clone()
        .lazy()
        .join(right_lf, left_keys, right_keys, JoinArgs::new(join_type))
        .collect()?;

    Ok(result)
}

fn concat_impl(dfs: &[DataFrame]) -> Result<DataFrame> {
    if dfs.is_empty() {
        bail!("没有要合并的数据集");
    }
    if dfs.len() == 1 {
        return Ok(dfs[0].clone());
    }

    // Use vertical concatenation
    let mut result = dfs[0].clone();
    for df in &dfs[1..] {
        result.vstack_mut(df)?;
    }
    Ok(result)
}
