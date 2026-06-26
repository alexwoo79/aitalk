// src/composables/use-rust-bridge.ts
//
// Rust 后端桥接层（Tauri invoke 封装）
//
// 将所有 Tauri Rust 命令封装为类型安全的 async 函数。
// 浏览器环境下自动降级到前端 JS 实现。

import { invoke } from '@tauri-apps/api/core'
import type { ApiResult, ChartPayload, SheetInfo } from '@/types/data'

// ─────────────────────────────────────────────────────────────────────────────
// 检测 Tauri 环境
// ─────────────────────────────────────────────────────────────────────────────

const isTauri = (): boolean => {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 文件加载
// ─────────────────────────────────────────────────────────────────────────────

/** 加载单个 CSV/Excel 文件 */
export async function loadFile(
  path: string,
  skipHead = 0,
  skipTail = 0,
  headerRow = -1,
  headerLocked = false,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadFile 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_file', {
    path,
    skipHead,
    skipTail,
    headerRow,
    headerLocked,
  })
}

/** 批量加载多个文件 */
export async function loadFiles(paths: string[]): Promise<ApiResult<ChartPayload[]>> {
  if (!isTauri()) throw new Error('loadFiles 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload[]>>('load_files', { paths })
}

/** 获取当前 DataFrame 的元信息（前 200 行预览） */
export async function getDataframeInfo(): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('getDataframeInfo 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('get_dataframe_info')
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel 选区
// ─────────────────────────────────────────────────────────────────────────────

/** 列出 Excel 工作簿的所有工作表 */
export async function listExcelSheets(path: string): Promise<ApiResult<SheetInfo[]>> {
  if (!isTauri()) throw new Error('listExcelSheets 仅在 Tauri 环境下可用')
  return invoke<ApiResult<SheetInfo[]>>('list_excel_sheets', { path })
}

/** 加载 Excel 工作簿的指定工作表 */
export async function loadExcelSheet(
  path: string,
  sheetIndex: number,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadExcelSheet 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_excel_sheet', { path, sheetIndex })
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据合并
// ─────────────────────────────────────────────────────────────────────────────

/** JOIN 当前活跃表与指定数据集 */
export async function joinDatasets(
  rightDatasetId: string,
  leftOn: string[],
  rightOn: string[],
  how: 'inner' | 'left' | 'right' | 'outer' = 'left',
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('joinDatasets 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('join_datasets', {
    rightDatasetId,
    leftOn,
    rightOn,
    how,
  })
}

/** 纵向拼接当前活跃表与指定数据集 */
export async function concatDatasets(
  rightDatasetId: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('concatDatasets 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('concat_datasets', { rightDatasetId })
}

// ─────────────────────────────────────────────────────────────────────────────
// 聚合计算
// ─────────────────────────────────────────────────────────────────────────────

/** 分组聚合 */
export async function groupbyAgg(
  groupCols: string[],
  aggCol: string,
  aggFunc: 'sum' | 'mean' | 'count' | 'min' | 'max',
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('groupbyAgg 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('groupby_agg', {
    groupCols,
    aggCol,
    aggFunc,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 环境检测（供外部使用）
// ─────────────────────────────────────────────────────────────────────────────

export { isTauri }
