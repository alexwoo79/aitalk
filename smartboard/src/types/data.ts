/** 列分类结果 */
export interface ColumnClassification {
  type: 'numeric' | 'categorical' | 'date' | 'text'
  role: 'metric' | 'dimension' | 'time_axis' | 'label' | 'ignore'
  format: 'number' | 'integer' | 'percent' | 'currency' | 'text' | 'date'
  label: string
  prefix: string
  uniqueCount: number
  uniqueRatio: number
  numericRatio: number
  dateRatio: number
  stats?: ColumnStats
  topValues?: [string, number][]
  /** 格式异常但被容忍解析的数量（仅采样范围内） */
  dirtyCount?: number
}

/** 数值列统计 */
export interface ColumnStats {
  sum: number
  avg: number
  min: number
  max: number
  count: number
  nonzero: number
  nonzeroRatio: number
}

/** 数据质量摘要 */
export interface DataQualitySummary {
  /** 存在脏数据的列 */
  dirtyColumns: { column: string; dirtyCount: number; totalCount: number; samples: string[] }[]
  /** 是否有任何脏数据 */
  hasIssues: boolean
}

/** 解析后的数据集 */
export interface DataSet {
  /** 数据集唯一 ID（Rust 端生成） */
  id: string
  headers: string[]
  rows: Record<string, string | number>[]
  rawRows: (string | number)[][]
  classifications: Record<string, ColumnClassification>
  primaryMetric: string | null
  chartDimensions: string[]
  filePath: string
  fileName: string
  /** 文件元数据（加载时收集，供 save 使用） */
  fileSize?: number
  fileModified?: string
  fileHash?: string
  /** 数据质量摘要 */
  dataQuality?: DataQualitySummary
  /** 如果是 Excel 工作表，记录所属工作簿和 sheet 名 */
  sheetName?: string
  sheetIndex?: number
  /** 实际总行数（后端传入，可能大于 rows.length） */
  totalRows?: number
}

/** 解析原始文件结果（解析后、分类前） */
export interface ParsedFile {
  headers: string[]
  rows: Record<string, string | number>[]
  rawRows: (string | number)[][]
}

// ─────────────────────────────────────────────────────────────────────────────
// 多表支持类型（Phase 1）
// ─────────────────────────────────────────────────────────────────────────────

/** 表间关联关系 */
export interface Relation {
  id: string
  leftTableId: string
  leftColumn: string
  rightTableId: string
  rightColumn: string
  joinType: 'left' | 'inner' | 'right' | 'outer'
}

/** Excel 工作表信息（对应 Rust SheetInfo） */
export interface SheetInfo {
  name: string
  index: number
  rows: number
  cols: number
}

/** Excel 工作簿元数据 */
export interface ExcelWorkbookMeta {
  path: string
  sheets: SheetInfo[]
}

/** 数据集元数据（对应 Rust DatasetMeta） */
export interface DatasetMeta {
  id: string
  name: string
  path: string
  size_bytes: number
  modified_at_ms: number
  created_at_ms: number
}

/** Rust API 通用响应包装 */
export interface ApiResult<T> {
  ok: boolean
  data: T | null
  error: string | null
}

/** Rust ChartPayload 对应的前端类型 */
export interface ChartPayload {
  columns: { name: string; dtype: string; nullable: boolean }[]
  rows: Record<string, unknown>[]
  total_rows: number
  notices: string[]
  semantics?: DatasetSemantics
}

/** 数据集语义信息 */
export interface DatasetSemantics {
  columns: SemanticColumnInfo[]
  measure_columns: string[]
  dimension_columns: string[]
  categorical_columns: string[]
  time_columns: string[]
  id_columns: string[]
  boolean_columns: string[]
  business_tags: string[]
}

/** 语义列信息 */
export interface SemanticColumnInfo {
  name: string
  dtype: string
  nullable: boolean
  semantic_type: string
  analytic_role: string
  business_tags: string[]
}

/** 多表状态 */
export interface MultiTableState {
  tables: Map<string, DataSet>
  activeTableId: string | null
  relations: Relation[]
  mainTableId: string | null
  /** Excel 工作簿元数据（用于 sheet 切换） */
  excelWorkbooks: Map<string, ExcelWorkbookMeta>
}
