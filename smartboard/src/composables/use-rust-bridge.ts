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

// ── 统一 Dashboard 计算（一次 IPC）──

export interface DimensionFilter { column: string; value: string }
export interface KpiInput { label: string; column: string; agg: string; filter?: string }
export interface ChartInput { key: string; dimCol: string; metricCol: string; agg: string }
export interface ComputedColDef { name: string; variables: { alias: string; column: string }[]; expression: string }
export interface ComputeRequest {
  dimensionFilters?: Record<string, string>
  dateColumn?: string; dateStart?: string; dateEnd?: string
  searchText?: string; condition?: string
  kpis?: KpiInput[]; charts?: ChartInput[]; summary?: Record<string, string>
  computedColumns?: ComputedColDef[]
}
export interface ComputeResponse {
  row_count: number
  kpi_values: Record<string, number>
  chart_data: Record<string, { label: string; value: number }[]>
  summary_values: Record<string, number>
  /** Rust 计算列逐行数据（前端表格显示用，key=列名，value=按行序排列的值） */
  computed_columns: Record<string, number[]>
}

/** 一次 IPC 完成所有 Dashboard 计算（筛选 + KPI + 图表 + 合计） */
export async function computeDashboard(req: ComputeRequest): Promise<ApiResult<ComputeResponse>> {
  if (!isTauri()) throw new Error('computeDashboard 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ComputeResponse>>('compute_dashboard', { requestJson: JSON.stringify(req) })
}

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
// Rust 全量聚合（KPI & 图表）— 替代前端 JS 循环
// ─────────────────────────────────────────────────────────────────────────────

export interface KpiSpecInput {
  label: string
  column: string
  agg: string
}
export interface KpiValueOutput {
  label: string
  value: number
}
export interface ChartDataItem {
  label: string
  value: number
}

/** 批量计算 KPI 值（Rust 全量 DataFrame） */
export async function computeKpiValues(kpis: KpiSpecInput[]): Promise<ApiResult<KpiValueOutput[]>> {
  if (!isTauri()) throw new Error('computeKpiValues 仅在 Tauri 环境下可用')
  return invoke<ApiResult<KpiValueOutput[]>>('compute_kpi_values', { kpisJson: JSON.stringify(kpis) })
}

/** 图表分组聚合（Rust 全量 DataFrame） */
export async function computeChartData(
  dimCol: string, metricCol: string, aggFunc: string,
): Promise<ApiResult<ChartDataItem[]>> {
  if (!isTauri()) throw new Error('computeChartData 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartDataItem[]>>('compute_chart_data', { dimCol, metricCol, aggFunc })
}

/** 表格合计行计算 — 前端传入筛选后的行数据，Rust 计算各列聚合值 */
export async function computeTableSummary(
  rows: Record<string, string | number>[],
  summaryAggs: Record<string, string>,
): Promise<ApiResult<Record<string, number>>> {
  if (!isTauri()) throw new Error('computeTableSummary 仅在 Tauri 环境下可用')
  return invoke<ApiResult<Record<string, number>>>('compute_table_summary', {
    rowsJson: JSON.stringify(rows),
    summaryAggsJson: JSON.stringify(summaryAggs),
  })
}

/** 图表分组聚合 — 前端传入筛选后的行数据，Rust 做 groupby + agg */
export async function computeChartGroupbyFiltered(
  rows: Record<string, string | number>[],
  dimCol: string,
  metricCol: string,
  aggFunc: string,
): Promise<ApiResult<ChartDataItem[]>> {
  if (!isTauri()) throw new Error('computeChartGroupbyFiltered 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartDataItem[]>>('compute_chart_groupby_filtered', {
    rowsJson: JSON.stringify(rows),
    dimCol,
    metricCol,
    aggFunc,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 环境检测（供外部使用）
// ─────────────────────────────────────────────────────────────────────────────

export { isTauri }

// ─────────────────────────────────────────────────────────────────────────────
// 多数据源接入 (Phase 1-4)
// ─────────────────────────────────────────────────────────────────────────────

/** Phase 1: 粘贴剪贴板 TSV 数据 */
export async function pasteFromClipboard(
  text: string,
  hasHeader: boolean,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('pasteFromClipboard 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('paste_from_clipboard', { text, hasHeader })
}

/** Phase 2: 加载 JSON 文件 */
export async function loadJsonFile(path: string): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadJsonFile 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_json_file', { path })
}

/** Phase 2: 加载 Parquet 文件 */
export async function loadParquetFile(path: string): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadParquetFile 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_parquet_file', { path })
}

/** Phase 3: 从 URL 拉取数据 */
export async function fetchFromUrl(
  url: string,
  format: 'csv' | 'json' | 'auto' = 'auto',
  hasHeader = true,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('fetchFromUrl 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('fetch_from_url', { url, format, hasHeader })
}

/** Phase 4: SQLite 表信息 */
export interface SqliteTableInfo {
  name: string
  row_count: number
  column_count: number
  columns: string[]
}

/** Phase 4: 列出 SQLite 数据库中的所有表 */
export async function listSqliteTables(path: string): Promise<ApiResult<SqliteTableInfo[]>> {
  if (!isTauri()) throw new Error('listSqliteTables 仅在 Tauri 环境下可用')
  return invoke<ApiResult<SqliteTableInfo[]>>('list_sqlite_tables', { path })
}

/** Phase 4: 加载 SQLite 数据库中的指定表 */
export async function loadSqliteTable(
  path: string,
  tableName: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadSqliteTable 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_sqlite_table', { path, tableName })
}

/** Phase 4: 执行自定义 SQL 查询 */
export async function executeSqliteQuery(
  path: string,
  query: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('executeSqliteQuery 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('execute_sqlite_query', { path, query })
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL 数据库（MySQL / PostgreSQL / SQLite 统一接口）
// ─────────────────────────────────────────────────────────────────────────────

export interface DbTableInfo {
  name: string
  columns: string[]
}
export interface DbTestResult {
  driver: string
  version: string
  tables: DbTableInfo[]
}

export async function testDbConnection(connStr: string): Promise<ApiResult<DbTestResult>> {
  if (!isTauri()) throw new Error('testDbConnection 仅在 Tauri 环境下可用')
  return invoke<ApiResult<DbTestResult>>('test_db_connection', { connectionString: connStr })
}
export async function executeDbQuery(
  connStr: string, query: string, datasetName?: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('executeDbQuery 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('execute_db_query', { connectionString: connStr, query, datasetName })
}
export async function loadDbTable(
  connStr: string, tableName: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadDbTable 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_db_table', { connectionString: connStr, tableName })
}

// ─────────────────────────────────────────────────────────────────────────────
// 飞书多维表格
// ─────────────────────────────────────────────────────────────────────────────

export interface FeishuTableInfo {
  table_id: string
  name: string
  fields: string[]
}

export interface FeishuTestResult {
  ok: boolean
  message: string
  tables: FeishuTableInfo[]
}

/** 测试飞书连接，返回可用表格列表 */
export async function testFeishuConnection(
  appId: string, appSecret: string, baseUrl: string,
): Promise<ApiResult<FeishuTestResult>> {
  if (!isTauri()) throw new Error('testFeishuConnection 仅在 Tauri 环境下可用')
  return invoke<ApiResult<FeishuTestResult>>('test_feishu_connection', {
    appId, appSecret, baseUrl,
  })
}

/** 拉取飞书表格全部数据 */
export async function loadFeishuTable(
  appId: string, appSecret: string, baseUrl: string,
  tableId: string, tableName?: string,
): Promise<ApiResult<ChartPayload>> {
  if (!isTauri()) throw new Error('loadFeishuTable 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ChartPayload>>('load_feishu_table', {
    appId, appSecret, baseUrl, tableId, tableName,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 高级分析（Rust 端）
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeseriesResult {
  labels: string[]; values: number[]
  ma: (number | null)[]; mom: (number | null)[]; yoy: (number | null)[]
  trend: number[]; forecast_labels: string[]; forecast_values: number[]
}

export interface DecileResult {
  labels: string[]; counts: number[]; sums: number[]; avgs: number[]; ranges: string[]
}

export interface ClusterPoint { x: number; y: number; cluster: number; label: string }
export interface ClusterResult {
  points: ClusterPoint[]; centroids: [number, number][]
  col_x: string; col_y: string
}

/** 时序分析：按周期聚合 + MA/MoM/YoY/回归/预测 */
export async function computeTimeseries(
  rows: Record<string, unknown>[],
  dateCol: string, metricCol: string, period: string,
): Promise<ApiResult<TimeseriesResult>> {
  if (!isTauri()) throw new Error('computeTimeseries 仅在 Tauri 环境下可用')
  return invoke<ApiResult<TimeseriesResult>>('compute_timeseries', {
    rowsJson: JSON.stringify(rows), dateCol, metricCol, period,
  })
}

/** 十分位分析 */
export async function computeDeciles(
  rows: Record<string, unknown>[], metricCol: string,
): Promise<ApiResult<DecileResult>> {
  if (!isTauri()) throw new Error('computeDeciles 仅在 Tauri 环境下可用')
  return invoke<ApiResult<DecileResult>>('compute_deciles', {
    rowsJson: JSON.stringify(rows), metricCol,
  })
}

/** K-means 聚类 */
export async function computeClusters(
  rows: Record<string, unknown>[], metricCols: string[], k: number,
  xCol?: string, yCol?: string,
): Promise<ApiResult<ClusterResult>> {
  if (!isTauri()) throw new Error('computeClusters 仅在 Tauri 环境下可用')
  return invoke<ApiResult<ClusterResult>>('compute_clusters', {
    rowsJson: JSON.stringify(rows), metricCols, k, xCol, yCol,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 局域网分享 HTTP 服务器
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerInfo {
  url: string
  port: number
  ip: string
}

export interface ServerStatus {
  running: boolean
  url: string | null
  port: number | null
  ip: string | null
}

/** 启动局域网分享 HTTP 服务器（直接 serve 自包含 HTML） */
export async function startServer(
  port: number,
  html: string,
): Promise<ServerInfo> {
  if (!isTauri()) throw new Error('startServer 仅在 Tauri 环境下可用')
  return invoke<ServerInfo>('start_server', { port, html })
}

/** 停止局域网分享服务器 */
export async function stopServer(): Promise<void> {
  if (!isTauri()) throw new Error('stopServer 仅在 Tauri 环境下可用')
  return invoke<void>('stop_server')
}

/** 获取服务器当前状态 */
export async function getServerStatus(): Promise<ServerStatus> {
  if (!isTauri()) throw new Error('getServerStatus 仅在 Tauri 环境下可用')
  return invoke<ServerStatus>('get_server_status')
}

/** 更新服务器缓存的 HTML（Dashboard 数据变化时调用） */
export async function updateServerHtml(html: string): Promise<void> {
  if (!isTauri()) throw new Error('updateServerHtml 仅在 Tauri 环境下可用')
  return invoke<void>('update_server_html', { html })
}
