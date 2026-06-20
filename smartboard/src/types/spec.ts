import type { ColumnClassification } from './data'

/** Dashboard 完整规格（渲染引擎消费） */
export interface DashboardSpec {
  title: string
  primaryMetric: string | null
  chartDimensions: string[]
  columns: Record<string, ColumnClassification>
  kpis: KpiSpec[]
  charts: ChartSpec[]
  filters: FilterSpec[]
  table: TableSpec
  analyses: Record<string, AnalysisResult>
  dateRange?: { column: string; min: string; max: string }
}

/** KPI 卡片 */
export interface KpiSpec {
  column: string
  label: string
  agg: 'sum' | 'avg' | 'count' | 'min' | 'max'
  format: string
  prefix: string
  icon?: string
  filter?: string
  /** 多列公式 KPI */
  formula?: {
    variables: { column: string; agg: string; filter?: string }[]
    expression: string
  }
}

/** 图表 */
export interface ChartSpec {
  type: 'bar' | 'doughnut' | 'horizontal_bar' | 'histogram' | 'line'
    | 'timeseries' | 'decile' | 'cluster'
  title: string
  dimension?: string
  metric?: string
  metrics?: string[]
  dateColumn?: string
  analysis?: string
  analysisVariants?: { key: string; label: string }[]
  clusterMetrics?: string[]
  agg?: string
  k?: number
  _skip?: boolean
}

/** 筛选项 */
export interface FilterSpec {
  column: string
}

/** 数据表 */
export interface TableSpec {
  columns: string[]
  sortBy: string
  topN: number
}

/** 分析结果（时序/十分位/聚类） */
export type AnalysisResult = TimeseriesResult | DecileResult | ClusterResult

export interface TimeseriesResult {
  type: 'timeseries'
  dateColumn: string
  metric: string
  defaultPeriod: 'month' | 'quarter' | 'year'
  data: Record<string, TimeseriesData>
}

export interface TimeseriesData {
  labels: string[]
  values: number[]
  ma: (number | null)[]
  mom: (number | null)[]
  yoy: (number | null)[]
  trend: number[]
  forecast: { labels: string[]; values: number[] }
}

export interface DecileResult {
  type: 'decile'
  metric: string
  data: DecileData
}

export interface DecileData {
  labels: string[]
  counts: number[]
  sums: number[]
  avgs: number[]
  ranges: string[]
}

export interface ClusterResult {
  type: 'cluster'
  metrics: string[]
  k: number
  data: ClusterData
}

export interface ClusterData {
  points: { x: number; y: number; cluster: number; label: string }[]
  centroids: { x: number; y: number }[]
  colX: string
  colY: string
}
