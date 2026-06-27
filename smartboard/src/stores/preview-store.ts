import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardSpec, KpiSpec, ChartSpec, FilterSpec, TableSpec } from '@/types/spec'
import { useDataStore } from './data-store'
import { useConfigStore } from './config-store'
import { applyFilter } from '@/core/filter'
import { computeFormula } from '@/core/formula-engine'
import { computeDashboard, isTauri, type ComputeResponse } from '@/composables/use-rust-bridge'

export const usePreviewStore = defineStore('preview', () => {
  const filteredRows = ref<Record<string, string | number>[]>([])
  const filterValues = ref<Record<string, string>>({})
  const dateRange = ref<{ start: string; end: string }>({ start: '', end: '' })
  const activeDateColumn = ref('')
  const searchText = ref('')
  const conditionFilter = ref('')
  const dashboardResult = ref<ComputeResponse | null>(null)
  const dataStore = useDataStore()
  const configStore = useConfigStore()

  function safeFormula(f: any): any {
    if (!f || !f.variables) return f
    if (f.variables.length > 0 && f.variables[0].alias !== undefined) return f
    const ALIAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return {
      variables: f.variables.map((v: any, i: number) => ({ alias: ALIAS[i] || 'V' + i, column: v.column || '' })),
      expression: (f.rowExpression || f.expression || '').replace(/\[(\d+)\]/g, (_: string, idx: string) => ALIAS[Number(idx)] || 'V' + idx),
      filter: f.filter,
    }
  }

  function buildEffectiveDS(ds: import('@/types/data').DataSet): import('@/types/data').DataSet {
    const rels = dataStore.relations; if (rels.length === 0) return ds
    let mergedRows = [...ds.rows]; const mergedHeaders = [...ds.headers]; const mergedClass: Record<string, any> = { ...ds.classifications }
    for (const rel of rels) {
      const rightDs = dataStore.tables[rel.rightTableId]; if (!rightDs) continue
      const rightIndex = new Map<string, Record<string, string | number>>()
      for (const row of rightDs.rows) { const key = String(row[rel.rightColumn] ?? ''); if (key) rightIndex.set(key, row) }
      const newRows: Record<string, string | number>[] = []
      for (const leftRow of mergedRows) {
        const key = String(leftRow[rel.leftColumn] ?? ''); const rightRow = rightIndex.get(key)
        if (rightRow) {
          const merged = { ...leftRow }
          for (const rh of rightDs.headers) {
            if (rh === rel.rightColumn && mergedHeaders.includes(rh)) continue
            const pk = mergedHeaders.includes(rh) ? (rightDs.fileName || rightDs.sheetName || 'right') + '.' + rh : rh
            merged[pk] = rightRow[rh]
            if (!mergedHeaders.includes(pk)) { mergedHeaders.push(pk); if (rightDs.classifications[rh]) mergedClass[pk] = rightDs.classifications[rh] }
          }
          newRows.push(merged)
        } else if (rel.joinType !== 'inner') { newRows.push({ ...leftRow }) }
      }
      mergedRows = newRows
    }
    return { ...ds, headers: mergedHeaders, rows: mergedRows, rawRows: mergedRows.map(r => mergedHeaders.map(h => r[h] ?? '')), classifications: mergedClass }
  }

  function buildSpec(): DashboardSpec | null {
    const ds = dataStore.dataSet; const cfg = configStore.config; if (!ds || !cfg) return null
    const e = dataStore.hasRelations ? buildEffectiveDS(ds) : ds; const ex = dataStore.excludedColumns; const defs = cfg.metricDefaults || {}
    const kpis: KpiSpec[] = cfg.kpis.filter(k => k.selected !== false).map(k => {
      const d = defs[k.column]; const ug = d && (!d.sections || d.sections.includes('kpi'))
      if (ug && (k.format === 'global' || k.format === 'number' || !k.format)) return { column: k.column, label: k.label, agg: k.agg, format: d.format || '', prefix: d.prefix || '', unit: d.unit, decimals: d.decimals, filter: k.filter, formula: safeFormula(k.formula) }
      return { column: k.column, label: k.label, agg: k.agg, format: k.format, prefix: k.prefix, unit: k.unit, decimals: k.decimals, filter: k.filter, formula: safeFormula(k.formula) }
    })
    const charts: ChartSpec[] = cfg.charts.filter(c => c.selected !== false).map(c => {
      const am = new Set<string>(); if (c.metrics) c.metrics.forEach(m => am.add(m)); if (c.metric) am.add(c.metric); if (c.clusterMetrics) c.clusterMetrics.forEach(m => am.add(m))
      for (const k of Object.keys(defs)) { const d = defs[k]; if (d && (!d.sections || d.sections.includes('chart')) && d.format && d.format !== 'global') am.add(k) }
      const mf: Record<string, any> = {}; for (const m of am) { const d = defs[m]; if (!d || (d.sections && !d.sections.includes('chart'))) continue; mf[m] = { format: d.format || '', unit: d.unit, prefix: d.prefix || '', decimals: d.decimals } }
      return { type: c.type, title: c.title, dimension: c.dimension, metric: c.metric, metrics: c.metrics, dateColumn: c.dateColumn, agg: c.agg, k: c.k, clusterMetrics: c.clusterMetrics, filter: c.filter, format: undefined, unit: undefined, metricFormats: Object.keys(mf).length > 0 ? mf : undefined, metricAggs: c.metricAggs }
    })
    const tbl: TableSpec = { columns: cfg.table.columns.length > 0 ? cfg.table.columns : e.headers.filter(h => !ex.has(h)), sortBy: cfg.table.sortBy || '', summaryAggs: cfg.table.summaryAggs, columnColors: cfg.table.columnColors, columnTextColors: cfg.table.columnTextColors, columnTextRules: cfg.table.columnTextRules, rowConditionColors: cfg.table.rowConditionColors }
    let drs: DashboardSpec['dateRange']; const adc = e.headers.filter(h => e.classifications[h]?.type === 'date' && !ex.has(h))
    const cd = cfg.dateColumns?.length ? cfg.dateColumns : adc; const dc = cd.length > 0 ? cd[0] : undefined
    if (dc) { const dts = e.rows.map(r => String(r[dc] ?? '')).filter(v => v !== '').sort(); if (dts.length > 0) drs = { column: dc, min: dts[0], max: dts[dts.length - 1] } }
    return { title: cfg.title || 'Dashboard', primaryMetric: e.primaryMetric && !ex.has(e.primaryMetric) ? e.primaryMetric : null, chartDimensions: e.chartDimensions.filter(d => !ex.has(d)), columns: e.classifications, kpis, charts, filters: cfg.filters.map(f => ({ column: f })), table: tbl, analyses: {}, dateRange: drs, dateColumns: cd, layout: cfg.layout, metricDefaults: defs }
  }

  function applyFilters() {
    const ds = dataStore.dataSet; if (!ds) { filteredRows.value = []; return }
    const e = dataStore.hasRelations ? buildEffectiveDS(ds) : ds; let rows = [...e.rows]
    for (const [c, v] of Object.entries(filterValues.value)) if (v && v !== '__all__') rows = rows.filter(r => String(r[c] ?? '').trim() === v)
    if (dateRange.value.start && dateRange.value.end) {
      const dc = activeDateColumn.value || e.headers.find((h: string) => e.classifications[h]?.type === 'date' && !dataStore.excludedColumns.has(h))
      if (dc) { const s = dateRange.value.start; const ed = dateRange.value.end; rows = rows.filter(r => { const d = String(r[dc] ?? ''); return d >= s && d <= ed }) }
    }
    if (searchText.value.trim()) { const q = searchText.value.trim().toLowerCase(); rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) }
    if (conditionFilter.value.trim()) rows = applyFilter(rows, undefined, conditionFilter.value)
    filteredRows.value = rows; refreshDashboard()
  }

  async function refreshDashboard() {
    const spec = buildSpec(); if (!spec) return
    const df: Record<string, string> = {}
    for (const [c, v] of Object.entries(filterValues.value)) if (v && v !== '__all__') df[c] = v
    const kpis = spec.kpis.filter(k => !k.formula || !k.formula.variables?.length).map(k => ({ label: k.label, column: k.column, agg: k.agg, filter: k.filter || '' }))
    const ci: { key: string; dimCol: string; metricCol: string; agg: string }[] = []; const seen = new Set<string>()
    for (const ch of spec.charts) {
      if (ch._skip) continue; const d = ch.dimension || ch.dateColumn || ''; const ms = ch.metrics?.length ? ch.metrics : ch.metric ? [ch.metric] : []; const a = ch.agg || 'sum'
      for (const m of ms) { if (!d || !m) continue; const af = ch.metricAggs?.[m] || a; const k = `${d}:${m}:${af}`; if (!seen.has(k)) { seen.add(k); ci.push({ key: k, dimCol: d, metricCol: m, agg: af }) } }
    }
    const sm = spec.table?.summaryAggs || {}
    if (isTauri() && dataStore.dataSet) {
      try {
        const dc = activeDateColumn.value || spec.dateRange?.column || ''
        const res = await computeDashboard({ dimensionFilters: df, dateColumn: dc, dateStart: dateRange.value.start, dateEnd: dateRange.value.end, searchText: searchText.value, condition: conditionFilter.value, kpis, charts: ci, summary: sm })
        if (res.ok && res.data) { dashboardResult.value = res.data; return }
      } catch (e) { console.warn('[Dashboard] Rust:', e) }
    }
    dashboardResult.value = null
  }

  function computeKpiValue(kpi: KpiSpec): number {
    if (dashboardResult.value?.kpi_values?.[kpi.label] !== undefined) return dashboardResult.value.kpi_values[kpi.label]
    if (kpi.formula?.variables?.length) return computeFormulaKpi(kpi)
    return computeSimpleKpi(kpi)
  }

  function computeFormulaKpi(kpi: KpiSpec): number {
    const ds = dataStore.dataSet; const rows = filteredRows.value.length > 0 ? filteredRows.value : (ds ? (dataStore.hasRelations ? buildEffectiveDS(ds).rows : ds.rows) : [])
    if (!kpi.formula) return 0
    const resolved = kpi.formula.variables.map((v: any) => { if (v.column.startsWith('🔢')) { const rk = buildSpec()?.kpis.find(r => r.label === v.column.slice(2)); if (rk) return { alias: v.alias, value: computeKpiValue(rk) } } return { alias: v.alias, column: v.column } })
    let expr = kpi.formula.expression; const active: { alias: string; column: string }[] = []
    for (const r of resolved) { if ('value' in r) expr = expr.replace(new RegExp('\\b' + r.alias + '\\b', 'g'), String(r.value)); else active.push(r) }
    if (active.length === 0) { try { const r = new Function('"use strict"; return (' + expr + ')')(); if (typeof r === 'number' && isFinite(r) && !isNaN(r)) return r } catch {} return 0 }
    const result = computeFormula({ variables: active, expression: expr, filter: kpi.formula.filter || kpi.filter }, rows)
    if (result.error) console.warn('[Formula]', kpi.label, ':', result.error); return result.value
  }

  function computeSimpleKpi(kpi: KpiSpec): number {
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])
    const f = applyFilter(rows, kpi.filter)
    if (kpi.agg === 'count') return f.length
    if ((kpi.agg as string) === 'unique_count') return new Set(f.map(r => String(r[kpi.column] ?? '').trim()).filter(s => s !== '')).size
    const vals = f.map(r => { const v = r[kpi.column]; if (v === undefined || v === null || v === '') return NaN; if (typeof v === 'number') return v; return Number(String(v).replace(/,/g, '').replace(/%/g, '').trim()) }).filter(v => !isNaN(v))
    if (!vals.length) return 0
    switch (kpi.agg) { case 'sum': return vals.reduce((a, b) => a + b, 0); case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length; case 'min': return Math.min(...vals); case 'max': return Math.max(...vals); default: return vals.reduce((a, b) => a + b, 0) }
  }

  function getFilterOptions(column: string): string[] { const ds = dataStore.dataSet; if (!ds) return []; return [...new Set(ds.rows.map(r => String(r[column] ?? '').trim()).filter(v => v))].sort() }

  function getAggData(dimCol: string, metricCol: string, agg: string = 'sum') {
    const key = `${dimCol}:${metricCol}:${agg}`
    if (dashboardResult.value?.chart_data?.[key]) return dashboardResult.value.chart_data[key].map(d => ({ label: d.label, value: d.value }))
    const rows = filteredRows.value.length > 0 ? filteredRows.value : (dataStore.dataSet?.rows ?? [])
    const groups = new Map<string, number[]>(); for (const row of rows) { const k = String(row[dimCol] || '未知'); if (!groups.has(k)) groups.set(k, []); const v = Number(row[metricCol]); if (!isNaN(v)) groups.get(k)!.push(v) }
    return [...groups.entries()].map(([l, vs]) => { let v: number; switch (agg) { case 'sum': v = vs.reduce((a, b) => a + b, 0); break; case 'avg': v = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0; break; case 'count': v = vs.length; break; case 'min': v = Math.min(...vs); break; case 'max': v = Math.max(...vs); break; default: v = vs.reduce((a, b) => a + b, 0) } return { label: l, value: v } }).sort((a, b) => b.value - a.value)
  }

  const rowCount = computed(() => dashboardResult.value?.row_count ?? (filteredRows.value.length || (dataStore.dataSet?.rows.length ?? 0)))
  const effectiveHeaders = computed<string[]>(() => dataStore.effectiveHeaders)

  return { filteredRows, filterValues, dateRange, activeDateColumn, searchText, conditionFilter, rowCount, effectiveHeaders, dashboardResult, buildSpec, applyFilters, computeKpiValue, getFilterOptions, getAggData }
})
