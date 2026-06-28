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

/** 行条件颜色规则 */
export interface RowConditionColor {
  /** 筛选条件，格式同 filter 语法: "列名 运算符 值" */
  condition: string
  /** CSS 背景颜色值，如 #ff0000 / rgb(255,0,0) */
  color: string
  /** CSS 字体颜色值 */
  textColor?: string
}

/** 列条件字体色规则（仅按值比较，不需要列名） */
export interface ColumnTextRule {
  /** 值条件，如 "> 100" / "< 0" / "= 张三" */
  condition: string
  /** CSS 颜色值 */
  color: string
}

/** 数据表配置 */
export interface TableConfig {
  /** 显示的列 */
  columns: string[]
  /** 排序列（可选），空字符串表示不排序 */
  sortBy?: string
  /** 行数限制：数字或 'all' 表示全部（已废弃，始终显示全部） */
  rowLimit?: number | 'all'
  /** 底部汇总行：列名 -> 聚合函数 */
  summaryAggs?: Record<string, 'sum' | 'avg' | 'count' | 'unique_count' | 'min' | 'max'>
  /** 列背景色：列名 -> CSS 颜色 */
  columnColors?: Record<string, string>
  /** 列字体色：列名 -> CSS 颜色 */
  columnTextColors?: Record<string, string>
  /** 列条件字体色：列名 -> 按值条件着色的规则列表 */
  columnTextRules?: Record<string, ColumnTextRule[]>
  /** 行条件颜色：满足条件时整行着色 */
  rowConditionColors?: RowConditionColor[]
  /** 列显示顺序（拖拽排序），未包含的列追加到末尾 */
  columnOrder?: string[]
  /** 计算列（公式生成的行内数据） */
  computedColumns?: ComputedColumn[]
}

/** 计算列：基于已有列的公式生成新数据列 */
export interface ComputedColumn {
  name: string
  /** 变量列表，alias(A/B/C…) 在 expression 中引用 */
  variables: { alias: string; column: string; filter?: string }[]
  /** 表达式，如 "A + B * C"，用 alias 引用 */
  expression: string
  /** 共享筛选（对所有变量生效） */
  filter?: string
  /** 是否显示在表格中 */
  selected?: boolean
}

/** 画布布局项（拖拽位置/大小） */
export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

/** 用户配置（表单输出，等价于 YAML 模板） */
export interface DashboardConfig {
  title: string
  kpis: KpiFormItem[]
  filters: string[]
  /** 可用的时间切片列（多选，展示页可动态切换） */
  dateColumns?: string[]
  charts: ChartFormItem[]
  table: TableConfig
  /** 全局指标格式默认值，按列名 key，KPI/图表单独设定会覆盖此值 */
  metricDefaults?: Record<string, MetricDefault>
  /** 画布布局（拖拽位置/大小），为空时自动生成 */
  layout?: LayoutItem[]
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
  /** 多列公式 KPI（A/B/C 别名 + 表达式内嵌聚合） */
  formula?: {
    variables: { alias: string; column: string; filter?: string }[]
    expression: string
    filter?: string
  }
  /** 是否选中（用于预览渲染过滤，默认 true） */
  selected?: boolean
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
  /** 是否选中（用于预览渲染过滤，默认 true） */
  selected?: boolean
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
