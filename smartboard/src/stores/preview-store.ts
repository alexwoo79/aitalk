import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardSpec, KpiSpec, ChartSpec, FilterSpec, TableSpec } from '@/types/spec'
import { useDataStore } from './data-store'
import { useConfigStore } from './config-store'
import { aggregate } from '@/core/aggregator'
import { applyFilter } from '@/core/filter'
import { computeFormula } from '@/core/formula-engine'

export const usePreviewStore = defineStore('preview', () => {
  const filteredRows = ref<Record<string, string | number>[]>([])
  const filterValues = ref<Record<string, string>>({})
  const dateRange = ref<{ start: string; end: string }>({ start: '', end: '' })
  const activeDateColumn = ref('')
  const searchText = ref('')
  const conditionFilter = ref('')

  const dataStore = useDataStore()
  const configStore = useConfigStore()

  // 安全转换旧格式 formula（兼容 [0]/[1] 语法）
  function safeFormula(f: any): any {
    if (!f || !f.variables) return f
    // 新格式：已有 alias 字段 → 直接返回
    if (f.variables.length > 0 && f.variables[0].alias !== undefined) return f
    // 旧格式 → 转换为新格式（用默认别名 A, B, C...）
    const ALIAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return {
      variables: f.variables.map((v: any, i: number) => ({
        alias: ALIAS[i] || 'V' + i,
        column: v.column || '',
      })),
      expression: (f.rowExpression || f.expression || '').replace(/\[(\d+)\]/g, (_match: string, idx: string) => ALIAS[Number(idx)] || 'V' + idx),
      filter: f.filter,
    }
  }

  // Phase 4: 跨表 in-memory join
  function buildEffectiveDS(ds: import('@/types/data').DataSet): import('@/types/data').DataSet {
    const rels = dataStore.relations
    if (rels.length === 0) return ds

    let mergedRows = [...ds.rows]
    const mergedHeaders = [...ds.headers]
    const mergedClass: Record<string, any> = { ...ds.classifications }

    for (const rel of rels) {
      const rightDs = dataStore.tables[rel.rightTableId]
      if (!rightDs) continue

      const rightIndex = new Map<string, Record<string, string | number>>()
      for (const row of rightDs.rows) {
        const key = String(row[rel.rightColumn] ?? '')
        if (key) rightIndex.set(key, row)
      }

      const newRows: Record<string, string | number>[] = []
      for (const leftRow of mergedRows) {
        const key = String(leftRow[rel.leftColumn] ?? '')
        const rightRow = rightIndex.get(key)
        if (rightRow) {
          const merged = { ...leftRow }
          for (const rh of rightDs.headers) {
            if (rh === rel.rightColumn && mergedHeaders.includes(rh)) continue
            const prefixedKey = mergedHeaders.includes(rh)
              ? (rightDs.fileName || rightDs.sheetName || 'right') + '.' + rh
              : rh
            merged[prefixedKey] = rightRow[rh]
            if (!mergedHeaders.includes(prefixedKey)) {
              mergedHeaders.push(prefixedKey)
              if (rightDs.classifications[rh]) {
                mergedClass[prefixedKey] = rightDs.classifications[rh]
              }
            }
          }
          newRows.push(merged)
        } else if (rel.joinType !== 'inner') {
          newRows.push({ ...leftRow })
        }
      }
      mergedRows = newRows
    }

    return {
      ...ds,
      headers: mergedHeaders,
      rows: mergedRows,
      rawRows: mergedRows.map(r => mergedHeaders.map(h => r[h] ?? '')),
      classifications: mergedClass,
    }
  }

  // 从 config 构建 spec
  function buildSpec(): DashboardSpec | null {
    const ds = dataStore.dataSet
    const cfg = configStore.config
    if (!ds || !cfg) return null

    // Phase 4: 跨表 join
    const effectiveDS = dataStore.hasRelations ? buildEffectiveDS(ds) : ds

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
            formula: safeFormula(k.formula),
          }
        }
        return {
          column: k.column, label: k.label, agg: k.agg,
          format: k.format, prefix: k.prefix, unit: k.unit,
          decimals: k.decimals,
          filter: k.filter,
          formula: safeFormula(k.formula),
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
      columns: cfg.table.columns.length > 0 ? cfg.table.columns : effectiveDS.headers.filter((h) => !excluded.has(h)),
      sortBy: cfg.table.sortBy || '',
      summaryAggs: cfg.table.summaryAggs,
      columnColors: cfg.table.columnColors,
      columnTextColors: cfg.table.columnTextColors,
      columnTextRules: cfg.table.columnTextRules,
      rowConditionColors: cfg.table.rowConditionColors,
    }

    // Date range detection（使用配置的时间列或自动检测）
    let dateRangeSpec: DashboardSpec['dateRange'] | undefined
    const allDateCols = effectiveDS.headers.filter((h) => effectiveDS.classifications[h]?.type === 'date' && !excluded.has(h))
    const configuredDates = cfg.dateColumns && cfg.dateColumns.length > 0 ? cfg.dateColumns : allDateCols
    const dateCol = configuredDates.length > 0 ? configuredDates[0] : undefined
    if (dateCol) {
      const dates = effectiveDS.rows
        .map((r) => String(r[dateCol] ?? ''))
        .filter((v) => v !== '')
        .sort()
      if (dates.length > 0) {
        dateRangeSpec = { column: dateCol, min: dates[0], max: dates[dates.length - 1] }
      }
    }

    return {
      title: cfg.title || 'Dashboard',
      primaryMetric: effectiveDS.primaryMetric && !excluded.has(effectiveDS.primaryMetric) ? effectiveDS.primaryMetric : null,
      chartDimensions: effectiveDS.chartDimensions.filter((d) => !excluded.has(d)),
      columns: effectiveDS.classifications,
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

    const effectiveDS = dataStore.hasRelations ? buildEffectiveDS(ds) : ds
    let rows = [...effectiveDS.rows]

    // Apply dimension filters
    for (const [col, val] of Object.entries(filterValues.value)) {
      if (val && val !== '__all__') {
        rows = rows.filter((r) => String(r[col] ?? '').trim() === val)
      }
    }

    // Apply date range（使用当前活跃的时间列）
    if (dateRange.value.start && dateRange.value.end) {
      const dateCol = activeDateColumn.value || effectiveDS.headers.find((h: string) => effectiveDS.classifications[h]?.type === 'date' && !dataStore.excludedColumns.has(h))
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
    if (agg === 'unique_count') {
      const unique = new Set(filtered.map(r => {
        const v = r[column]
        return v === undefined || v === null || v === '' ? '' : String(v).trim()
      }).filter(s => s !== ''))
      return unique.size
    }
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
    const ds = dataStore.dataSet
    const rows = filteredRows.value.length > 0
      ? filteredRows.value
      : (ds ? (dataStore.hasRelations ? buildEffectiveDS(ds).rows : ds.rows) : [])

    // 公式 KPI（新引擎：A/B/C 别名 + 聚合函数内嵌）
    if (kpi.formula && kpi.formula.variables.length > 0) {
      // 解析保存参数引用（以 🔢 开头的列名 → 递归计算对应 KPI）
      const resolvedVars = kpi.formula.variables.map(v => {
        if (v.column.startsWith('🔢')) {
          const refLabel = v.column.slice(2) // 去掉 🔢 前缀
          const spec = buildSpec()
          const refKpi = spec?.kpis.find(rk => rk.label === refLabel)
          if (refKpi) {
            // 递归计算引用的 KPI 值（避免循环引用，最大深度 5）
            return { alias: v.alias, value: computeKpiValueSafe(refKpi, 0) }
          }
        }
        return { alias: v.alias, column: v.column }
      })

      // 如果有解析后的固定值，在行内计算前替换
      // 将固定值变量从 variables 中移除，在 expression 中替换为数字
      let expr = kpi.formula.expression
      const activeVars: { alias: string; column: string }[] = []
      for (const rv of resolvedVars) {
        if ('value' in rv) {
          // 固定值：在表达式中替换别名
          expr = expr.replace(new RegExp(`\\b${rv.alias}\\b`, 'g'), String(rv.value))
        } else {
          activeVars.push(rv)
        }
      }

      // 全部变量都解析为固定值（纯 🔢 引用）→ 直接计算表达式
      if (activeVars.length === 0) {
        try {
          const result = new Function(`"use strict"; return (${expr})`)()
          if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
            return result
          }
        } catch { /* 计算失败返回 0 */ }
        return 0
      }

      const result = computeFormula(
        {
          variables: activeVars,
          expression: expr,
          filter: kpi.formula.filter || kpi.filter,
        },
        rows,
      )
      if (result.error) {
        console.warn('[KPI Formula]', kpi.label, ':', result.error)
      }
      return result.value
    }

    // 单列 KPI
    return computeColumnValue(kpi.column, kpi.agg, rows, kpi.filter)
  }

  // 安全计算 KPI（防止循环引用栈溢出）
  function computeKpiValueSafe(kpi: KpiSpec, depth: number): number {
    if (depth > 5) return 0 // 防止循环引用
    return computeKpiValue(kpi)
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

  // 聚合数据（图表用）— 数据来自全量 rows[]，筛选时用 filteredRows
  function getAggData(dimCol: string, metricCol: string, agg: string = 'sum') {
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])
    return aggregate(rows, dimCol, metricCol, agg as any)
  }

  const rowCount = computed(() => filteredRows.value.length || (dataStore.dataSet?.rows.length ?? 0))

  /** 有效数据集（含跨表合并）的列头列表，供 ConfigView / DashboardView 统一使用 */
  const effectiveHeaders = computed<string[]>(() => {
    return dataStore.effectiveHeaders
  })

  return {
    filteredRows,
    filterValues,
    dateRange,
    activeDateColumn,
    searchText,
    conditionFilter,
    rowCount,
    effectiveHeaders,
    buildSpec,
    applyFilters,
    computeKpiValue,
    getFilterOptions,
    getAggData,
  }
})
