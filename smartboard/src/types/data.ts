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

/** 解析后的数据集 */
export interface DataSet {
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
}

/** 解析原始文件结果（解析后、分类前） */
export interface ParsedFile {
  headers: string[]
  rows: Record<string, string | number>[]
  rawRows: (string | number)[][]
}
