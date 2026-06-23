import type { ChartSpec } from './spec'

/** 全局指标格式默认值 —— 在 ConfigView KPI 区域上方统一设定 */
export interface MetricDefault {
  format?: string        // 'number' | 'integer' | 'percent' | 'currency'
  unit?: 'yuan' | 'wan' | 'yi'
  prefix?: string
  decimals?: number      // 小数位数，默认 2
  /** 生效区域（未选中的区域不受全局影响） */
  sections?: ('kpi' | 'chart' | 'table')[]
}

/** 用户配置（表单输出，等价于 YAML 模板） */
export interface DashboardConfig {
  title: string
  kpis: KpiFormItem[]
  filters: string[]
  charts: ChartFormItem[]
  table: { sortBy: string; topN: number; columns: string[] }
  /** 全局指标格式默认值，按列名 key，KPI/图表单独设定会覆盖此值 */
  metricDefaults?: Record<string, MetricDefault>
}

/** KPI 表单项 */
export interface KpiFormItem {
  column: string
  label: string
  agg: 'sum' | 'avg' | 'count' | 'min' | 'max'
  format: string
  prefix: string
  /** 货币单位: 元 / 万元 / 亿元（仅 format='currency' 时生效） */
  unit?: 'yuan' | 'wan' | 'yi'
  /** 小数位数 */
  decimals?: number
  /** 行筛选（单列 + 公式均可用） */
  filter?: string
  /** 多列公式 KPI */
  formula?: {
    variables: { column: string; agg: string; filter?: string }[]
    expression: string
    filter?: string
  }
}

/** 图表表单项 */
export interface ChartFormItem {
  id: string
  type: ChartSpec['type']
  title: string
  dimension?: string
  metrics?: string[]
  metric?: string
  dateColumn?: string
  agg?: string
  k?: number
  clusterMetrics?: string[]
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

/** 图表类型选项 */
export const CHART_TYPES = [
  { value: 'bar', labelKey: 'chartType.bar' },
  { value: 'doughnut', labelKey: 'chartType.doughnut' },
  { value: 'horizontal_bar', labelKey: 'chartType.horizontalBar' },
  { value: 'histogram', labelKey: 'chartType.histogram' },
  { value: 'line', labelKey: 'chartType.line' },
  { value: 'timeseries', labelKey: 'chartType.timeseries' },
  { value: 'decile', labelKey: 'chartType.decile' },
  { value: 'cluster', labelKey: 'chartType.cluster' },
] as const

/** 聚合函数选项 */
export const AGG_OPTIONS = [
  { value: 'sum', labelKey: 'config.aggSum' },
  { value: 'avg', labelKey: 'config.aggAvg' },
  { value: 'count', labelKey: 'config.aggCount' },
  { value: 'min', labelKey: 'config.aggMin' },
  { value: 'max', labelKey: 'config.aggMax' },
] as const

/** KPI 格式选项 */
export const KPI_FORMAT_OPTIONS = [
  { value: 'global', labelKey: 'kpiFormat.global' },
  { value: 'number', labelKey: 'kpiFormat.number' },
  { value: 'currency', labelKey: 'kpiFormat.currency' },
  { value: 'percent', labelKey: 'kpiFormat.percent' },
  { value: 'integer', labelKey: 'kpiFormat.integer' },
] as const
