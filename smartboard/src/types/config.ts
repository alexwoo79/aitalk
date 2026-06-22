import type { ChartSpec } from './spec'

/** 用户配置（表单输出，等价于 YAML 模板） */
export interface DashboardConfig {
  title: string
  kpis: KpiFormItem[]
  filters: string[]
  charts: ChartFormItem[]
  table: { sortBy: string; topN: number; columns: string[] }
}

/** KPI 表单项 */
export interface KpiFormItem {
  column: string
  label: string
  agg: 'sum' | 'avg' | 'count' | 'min' | 'max'
  format: string
  prefix: string
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
}

/** 图表类型选项 */
export const CHART_TYPES = [
  { value: 'bar', label: '柱状图' },
  { value: 'doughnut', label: '环形图' },
  { value: 'horizontal_bar', label: '水平柱图' },
  { value: 'histogram', label: '直方图' },
  { value: 'line', label: '折线图' },
  { value: 'timeseries', label: '时序分析' },
  { value: 'decile', label: '十分位' },
  { value: 'cluster', label: '聚类分析' },
] as const

/** 聚合函数选项 */
export const AGG_OPTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'count', label: '计数' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
] as const

/** KPI 格式选项 */
export const KPI_FORMAT_OPTIONS = [
  { value: 'number', label: '数字' },
  { value: 'currency', label: '货币' },
  { value: 'percent', label: '百分比' },
  { value: 'integer', label: '整数' },
] as const
