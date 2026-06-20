import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardSpec, KpiSpec, ChartSpec, FilterSpec, TableSpec } from '@/types/spec'
import { useDataStore } from './data-store'
import { useConfigStore } from './config-store'
import { aggregate } from '@/core/aggregator'

export const usePreviewStore = defineStore('preview', () => {
  const filteredRows = ref<Record<string, string | number>[]>([])
  const filterValues = ref<Record<string, string>>({})
  const dateRange = ref<{ start: string; end: string }>({ start: '', end: '' })
  const searchText = ref('')

  const dataStore = useDataStore()
  const configStore = useConfigStore()

  // 从 config 构建 spec
  function buildSpec(): DashboardSpec | null {
    const ds = dataStore.dataSet
    const cfg = configStore.config
    if (!ds || !cfg) return null

    const kpis: KpiSpec[] = cfg.kpis.map((k) => ({
      column: k.column,
      label: k.label,
      agg: k.agg,
      format: k.format,
      prefix: k.prefix,
    }))

    const charts: ChartSpec[] = cfg.charts.map((c) => ({
      type: c.type,
      title: c.title,
      dimension: c.dimension,
      metric: c.metric,
      metrics: c.metrics,
      dateColumn: c.dateColumn,
      agg: c.agg,
      k: c.k,
      clusterMetrics: c.clusterMetrics,
    }))

    const filters: FilterSpec[] = cfg.filters.map((f) => ({ column: f }))

    const table: TableSpec = {
      columns: cfg.table.columns.length > 0 ? cfg.table.columns : ds.headers,
      sortBy: cfg.table.sortBy,
      topN: cfg.table.topN,
    }

    // Date range detection
    let dateRangeSpec: DashboardSpec['dateRange'] | undefined
    const dateCol = ds.headers.find((h) => ds.classifications[h]?.type === 'date')
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
      primaryMetric: ds.primaryMetric,
      chartDimensions: ds.chartDimensions,
      columns: ds.classifications,
      kpis,
      charts,
      filters,
      table,
      analyses: {},
      dateRange: dateRangeSpec,
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

    // Apply date range
    if (dateRange.value.start && dateRange.value.end) {
      const dateCol = ds.headers.find((h) => ds.classifications[h]?.type === 'date')
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

    filteredRows.value = rows
  }

  // 计算 KPI 值
  function computeKpiValue(kpi: KpiSpec): number {
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])
    if (kpi.agg === 'count') return rows.length

    const values = rows.map((r) => {
      const v = r[kpi.column]
      if (v === undefined || v === null || v === '') return 0
      if (typeof v === 'number') return v
      const s = String(v).replace(/,/g, '').replace(/%/g, '').trim()
      const n = Number(s)
      return isNaN(n) ? 0 : n
    })

    switch (kpi.agg) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0)
      case 'avg':
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      case 'min':
        return Math.min(...values)
      case 'max':
        return Math.max(...values)
      default:
        return values.reduce((a, b) => a + b, 0)
    }
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
    searchText,
    rowCount,
    buildSpec,
    applyFilters,
    computeKpiValue,
    getFilterOptions,
    getAggData,
  }
})
