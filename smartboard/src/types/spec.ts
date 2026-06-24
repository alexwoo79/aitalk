import type { ColumnClassification } from './data'
import type { LayoutItem } from './config'

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
  /** 可用的时间列（展示页可切换） */
  dateColumns?: string[]
  /** 画布布局 */
  layout?: LayoutItem[]
  /** 全局指标格式默认值，按列名 key */
  metricDefaults?: Record<string, MetricDefault>
}

export interface MetricDefault {
  format?: string
  unit?: 'yuan' | 'wan' | 'yi'
  prefix?: string
  decimals?: number
  sections?: ('kpi' | 'chart' | 'table')[]
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
  /** 货币单位: 元 / 万元 / 亿元（仅 format='currency' 时生效） */
  unit?: 'yuan' | 'wan' | 'yi'
  /** 小数位数 */
  decimals?: number
  /** 多列公式 KPI */
  formula?: {
    variables: { column: string; agg: string; filter?: string }[]
    expression: string
    filter?: string
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
  /** 行级筛选条件，格式: "列名 运算符 值" */
  filter?: string
  /** 数字格式 */
  format?: string
  /** 货币单位（仅 format='currency'） */
  unit?: 'yuan' | 'wan' | 'yi'
  /** 各指标独立格式（key=指标名），覆盖全局 format/unit */
  metricFormats?: Record<string, { format?: string; unit?: 'yuan' | 'wan' | 'yi'; prefix?: string; decimals?: number }>
  /** 各指标独立聚合方式（key=指标名），覆盖全局 agg */
  metricAggs?: Record<string, string>
}

/** 筛选项 */
export interface FilterSpec {
  column: string
}

/** 行条件颜色规则 */
export interface RowConditionColor {
  condition: string
  color: string
  textColor?: string
}

/** 列条件字体色规则 */
export interface ColumnTextRule {
  condition: string
  color: string
}

/** 数据表 */
export interface TableSpec {
  columns: string[]
  sortBy: string
  rowLimit?: number | 'all'
  summaryAggs?: Record<string, 'sum' | 'avg' | 'count' | 'unique_count' | 'min' | 'max'>
  columnColors?: Record<string, string>
  columnTextColors?: Record<string, string>
  columnTextRules?: Record<string, ColumnTextRule[]>
  rowConditionColors?: RowConditionColor[]
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
