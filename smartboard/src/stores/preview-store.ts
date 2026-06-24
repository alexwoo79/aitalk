import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardSpec, KpiSpec, ChartSpec, FilterSpec, TableSpec } from '@/types/spec'
import { useDataStore } from './data-store'
import { useConfigStore } from './config-store'
import { aggregate } from '@/core/aggregator'
import { applyFilter } from '@/core/filter'

export const usePreviewStore = defineStore('preview', () => {
  const filteredRows = ref<Record<string, string | number>[]>([])
  const filterValues = ref<Record<string, string>>({})
  const dateRange = ref<{ start: string; end: string }>({ start: '', end: '' })
  const activeDateColumn = ref('')
  const searchText = ref('')
  const conditionFilter = ref('')

  const dataStore = useDataStore()
  const configStore = useConfigStore()

  // 从 config 构建 spec
  function buildSpec(): DashboardSpec | null {
    const ds = dataStore.dataSet
    const cfg = configStore.config
    if (!ds || !cfg) return null

    const excluded = dataStore.excludedColumns

    const defaults = cfg.metricDefaults || {}

    const kpis: KpiSpec[] = cfg.kpis
      .filter((k) => k.selected !== false)
      .map((k) => {
      const def = defaults[k.column]
      const useGlobal = def && (!def.sections || def.sections.includes('kpi'))
      // 仅在 per-item 标记为继承全局时，才完整套用全局默认
      if (useGlobal && (k.format === 'global' || k.format === 'number' || !k.format)) {
        return {
          column: k.column, label: k.label, agg: k.agg,
          format: def.format || '',
          prefix: def.prefix || '',
          unit: def.unit,
          decimals: def.decimals,
          filter: k.filter,
          formula: k.formula,
        }
      }
      return {
        column: k.column, label: k.label, agg: k.agg,
        format: k.format, prefix: k.prefix, unit: k.unit,
        decimals: k.decimals,
        filter: k.filter,
        formula: k.formula,
      }
    })

    const charts: ChartSpec[] = cfg.charts
      .filter((c) => c.selected !== false)
      .map((c) => {
      // 收集该图表涉及的指标 + 全部启用了图表的全局格式（因 Dashboard 可切换额外指标）
      const allMetrics = new Set<string>()
      if (c.metrics) c.metrics.forEach(m => allMetrics.add(m))
      if (c.metric) allMetrics.add(c.metric)
      if (c.clusterMetrics) c.clusterMetrics.forEach(m => allMetrics.add(m))
      // 也加入所有启用了 chart 的全局指标列，确保 Dashboard 切换指标时格式可用
      for (const key of Object.keys(defaults)) {
        const d = defaults[key]
        if (d && (!d.sections || d.sections.includes('chart')) && d.format && d.format !== 'global') {
          allMetrics.add(key)
        }
      }
      const mf: Record<string, any> = {}
      const ma: Record<string, string> = {}
      for (const m of allMetrics) {
        const def = defaults[m]
        if (!def || (def.sections && !def.sections.includes('chart'))) continue
        mf[m] = { format: def.format || '', unit: def.unit, prefix: def.prefix || '', decimals: def.decimals }
      }
      return {
        type: c.type, title: c.title,
        dimension: c.dimension, metric: c.metric, metrics: c.metrics,
        dateColumn: c.dateColumn, agg: c.agg,
        k: c.k, clusterMetrics: c.clusterMetrics,
        filter: c.filter, format: undefined, unit: undefined,
        metricFormats: Object.keys(mf).length > 0 ? mf : undefined,
        metricAggs: c.metricAggs,
      }
    })

    const filters: FilterSpec[] = cfg.filters.map((f) => ({ column: f }))

    const table: TableSpec = {
      columns: cfg.table.columns.length > 0 ? cfg.table.columns : ds.headers.filter((h) => !excluded.has(h)),
      sortBy: cfg.table.sortBy || '',
      summaryAggs: cfg.table.summaryAggs,
      columnColors: cfg.table.columnColors,
      columnTextColors: cfg.table.columnTextColors,
      columnTextRules: cfg.table.columnTextRules,
      rowConditionColors: cfg.table.rowConditionColors,
    }

    // Date range detection（使用配置的时间列或自动检测）
    let dateRangeSpec: DashboardSpec['dateRange'] | undefined
    const allDateCols = ds.headers.filter((h) => ds.classifications[h]?.type === 'date' && !excluded.has(h))
    const configuredDates = cfg.dateColumns && cfg.dateColumns.length > 0 ? cfg.dateColumns : allDateCols
    const dateCol = configuredDates.length > 0 ? configuredDates[0] : undefined
    if (dateCol) {
      const dates = ds.rows
        .map((r) => String(r[dateCol] ?? ''))
        .filter((v) => v !== '')
        .sort()
      if (dates.length > 0) {
        dateRangeSpec = { column: dateCol, min: dates[0], max: dates[dates.length - 1] }
      }
    }

    return {
      title: cfg.title || 'Dashboard',
      primaryMetric: ds.primaryMetric && !excluded.has(ds.primaryMetric) ? ds.primaryMetric : null,
      chartDimensions: ds.chartDimensions.filter((d) => !excluded.has(d)),
      columns: ds.classifications,
      kpis,
      charts,
      filters,
      table,
      analyses: {},
      dateRange: dateRangeSpec,
      dateColumns: configuredDates,
      layout: cfg.layout,
      metricDefaults: defaults,
    }
  }

  // 应用筛选条件
  function applyFilters() {
    const ds = dataStore.dataSet
    if (!ds) {
      filteredRows.value = []
      return
    }

    let rows = [...ds.rows]

    // Apply dimension filters
    for (const [col, val] of Object.entries(filterValues.value)) {
      if (val && val !== '__all__') {
        rows = rows.filter((r) => String(r[col] ?? '').trim() === val)
      }
    }

    // Apply date range（使用当前活跃的时间列）
    if (dateRange.value.start && dateRange.value.end) {
      const dateCol = activeDateColumn.value || ds.headers.find((h) => ds.classifications[h]?.type === 'date' && !dataStore.excludedColumns.has(h))
      if (dateCol) {
        const start = dateRange.value.start
        const end = dateRange.value.end
        rows = rows.filter((r) => {
          const d = String(r[dateCol] ?? '')
          return d >= start && d <= end
        })
      }
    }

    // Apply keyword search
    if (searchText.value.trim()) {
      const q = searchText.value.trim().toLowerCase()
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
      )
    }

    // Apply condition filter
    if (conditionFilter.value.trim()) {
      console.log('[preview] conditionFilter 输入:', JSON.stringify(conditionFilter.value))
      const before = rows.length
      rows = applyFilter(rows, undefined, conditionFilter.value)
      console.log('[preview] 条件筛选: ' + before + ' → ' + rows.length + ' 行')
    }

    filteredRows.value = rows
  }

  // 计算单列聚合值
  function computeColumnValue(
    column: string,
    agg: string,
    rows: Record<string, string | number>[],
    filter?: string,
  ): number {
    const filtered = applyFilter(rows, filter)
    if (agg === 'count') return filtered.length
    const values = filtered.map((r) => {
      const v = r[column]
      if (v === undefined || v === null || v === '') return 0
      if (typeof v === 'number') return v
      const s = String(v).replace(/,/g, '').replace(/%/g, '').trim()
      const n = Number(s)
      return isNaN(n) ? 0 : n
    })
    switch (agg) {
      case 'sum': return values.reduce((a, b) => a + b, 0)
      case 'avg': return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      case 'min': return values.length > 0 ? Math.min(...values) : 0
      case 'max': return values.length > 0 ? Math.max(...values) : 0
      default: return values.reduce((a, b) => a + b, 0)
    }
  }

  // 计算 KPI 值
  function computeKpiValue(kpi: KpiSpec): number {
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])

    // 公式 KPI
    if (kpi.formula && kpi.formula.variables.length > 0) {
      const sharedFilter = kpi.formula.filter || kpi.filter
      const varValues = kpi.formula.variables.map((v) => {
        // 变量筛选 & 共享筛选（用 & 连接叠加）
        const combined = [v.filter, sharedFilter].filter(Boolean).join(' & ')
        return computeColumnValue(v.column, v.agg, rows, combined || undefined)
      })
      try {
        let expr = kpi.formula.expression
        for (let i = 0; i < varValues.length; i++) {
          expr = expr.replace(new RegExp(`\\[${i}\\]`, 'g'), String(varValues[i]))
        }
        const result = new Function(`"use strict"; return (${expr})`)()
        if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
          return result
        }
        console.warn('[KPI Formula] 计算结果无效:', kpi.label, expr, '→', result)
        return 0
      } catch (e) {
        console.warn('[KPI Formula] 表达式错误:', kpi.label, kpi.formula.expression, e)
        return 0
      }
    }

    // 单列 KPI
    return computeColumnValue(kpi.column, kpi.agg, rows, kpi.filter)
  }

  // 获取筛选选项
  function getFilterOptions(column: string): string[] {
    const ds = dataStore.dataSet
    if (!ds) return []
    const unique = new Set<string>()
    for (const row of ds.rows) {
      const v = String(row[column] ?? '').trim()
      if (v) unique.add(v)
    }
    return [...unique].sort()
  }

  // 聚合数据（图表用）
  function getAggData(dimCol: string, metricCol: string, agg: string = 'sum') {
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])
    return aggregate(rows, dimCol, metricCol, agg as any)
  }

  const rowCount = computed(() => filteredRows.value.length || (dataStore.dataSet?.rows.length ?? 0))

  return {
    filteredRows,
    filterValues,
    dateRange,
    activeDateColumn,
    searchText,
    conditionFilter,
    rowCount,
    buildSpec,
    applyFilters,
    computeKpiValue,
    getFilterOptions,
    getAggData,
  }
})
