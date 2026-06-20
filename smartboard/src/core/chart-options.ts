/**
 * 基础图表 ECharts Option 构建函数
 * 从 DashboardView.vue 抽取独立
 */
import type { ChartSpec } from '@/types/spec'
import { aggregate } from '@/core/aggregator'

// ====== Color palette ======
export const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
]

// ====== Formatting utilities ======
export function fmt(n: number | null | undefined, dec?: number): string {
  if (n == null || isNaN(n)) return '0'
  const d = dec !== undefined ? dec : 2
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d })
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0'
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return fmt(n)
}

export function getNumericVal(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim()
  if (s.endsWith('%')) s = s.slice(0, -1)
  s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? NaN : n
}

// ====== BAR — multi-metric grouped ======
export function buildBarOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  const dimCol = chart.dimension
  const metricCols = chart.metrics || (chart.metric ? [chart.metric] : [])
  if (!dimCol || metricCols.length === 0) return {}

  // Group by dimension, compute sum for each metric
  const groups: Record<string, Record<string, number[]>> = {}
  for (const row of rows) {
    const key = String(row[dimCol] || '未知')
    if (!groups[key]) groups[key] = {}
    for (const m of metricCols) {
      if (!groups[key][m]) groups[key][m] = []
      const v = getNumericVal(row[m] as any)
      if (!isNaN(v)) groups[key][m].push(v)
    }
  }
  const labels = Object.keys(groups).sort()

  const series = metricCols.map((m, mi) => ({
    name: m,
    type: 'bar' as const,
    data: labels.map((k) => {
      const arr = groups[k]?.[m] || []
      return arr.length ? arr.reduce((a, b) => a + b, 0) : 0
    }),
    itemStyle: { borderRadius: [4, 4, 0, 0] as [number, number, number, number], color: COLORS[mi % COLORS.length] },
  }))

  return {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmt(p.value)}`).join('<br/>')
      },
    },
    legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
    grid: { left: 60, right: 20, top: metricCols.length > 1 ? 30 : 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: labels,
      axisLabel: { rotate: labels.length > 8 ? 30 : 0, fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) },
    },
    series,
  }
}

// ====== HORIZONTAL BAR — multi-metric, sorted ascending ======
export function buildHorizontalBarOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  const dimCol = chart.dimension
  const metricCols = chart.metrics?.length
    ? chart.metrics
    : chart.metric
      ? [chart.metric]
      : []
  if (!dimCol || metricCols.length === 0) return {}

  // Group by dimension, compute sum for each metric
  const groups: Record<string, Record<string, number[]>> = {}
  for (const row of rows) {
    const key = String(row[dimCol] || '未知')
    if (!groups[key]) groups[key] = {}
    for (const m of metricCols) {
      if (!groups[key][m]) groups[key][m] = []
      const v = getNumericVal(row[m] as any)
      if (!isNaN(v)) groups[key][m].push(v)
    }
  }
  const labels = Object.keys(groups).sort()

  // Sort categories by total value ascending
  const totals = labels.map((k) =>
    metricCols.reduce((sum, m) => sum + (groups[k]?.[m] || []).reduce((a, b) => a + b, 0), 0)
  )
  const sorted = labels.map((l, i) => ({ label: l, total: totals[i] })).sort((a, b) => a.total - b.total)
  const sortedLabels = sorted.map((s) => s.label)

  // Per-metric series
  const series = metricCols.map((m, mi) => ({
    name: m,
    type: 'bar' as const,
    data: sortedLabels.map((k) => {
      const arr = groups[k]?.[m] || []
      return arr.length ? arr.reduce((a, b) => a + b, 0) : 0
    }),
    itemStyle: {
      borderRadius: mi === metricCols.length - 1
        ? [0, 4, 4, 0] as [number, number, number, number]
        : [0, 0, 0, 0] as [number, number, number, number],
      color: COLORS[mi % COLORS.length],
    },
  }))

  // Dynamic left margin
  const estLabelWidth = sortedLabels.reduce((m, l) => {
    let w = 0
    for (const ch of l) w += ch.charCodeAt(0) > 127 ? 12 : 7
    return Math.max(m, w)
  }, 0)
  const gridLeft = Math.max(40, estLabelWidth + 20)

  return {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmt(p.value)}`).join('<br/>')
      },
    },
    legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
    grid: { left: gridLeft, right: 30, top: metricCols.length > 1 ? 30 : 10, bottom: 20 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) },
    },
    yAxis: {
      type: 'category' as const,
      data: sortedLabels,
      axisLabel: { fontSize: 11 },
    },
    series,
  }
}

// ====== DOUGHNUT — legend bottom, color palette ======
export function buildDoughnutOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  const dimCol = chart.dimension
  const metricCol = chart.metric
  if (!dimCol) return {}

  let aggData: { label: string; value: number }[]
  if (metricCol && metricCol !== 'count') {
    aggData = aggregate(rows, dimCol, metricCol, (chart.agg as any) || 'sum')
  } else {
    // Count mode
    const freq: Record<string, number> = {}
    for (const row of rows) {
      const key = String(row[dimCol] || '未知')
      freq[key] = (freq[key] || 0) + 1
    }
    aggData = Object.entries(freq)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    color: COLORS.slice(0, aggData.length),
    tooltip: {
      trigger: 'item' as const,
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      data: aggData.map((d) => ({ name: d.label, value: d.value })),
      label: { fontSize: 11 },
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
    }],
  }
}

// ====== HISTOGRAM — sqrt(N) bins clamped 5-10 ======
export function buildHistogramOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  const col = chart.metric
  if (!col) return {}

  const values = rows
    .map((r) => getNumericVal(r[col] as any))
    .filter((n) => !isNaN(n))

  if (values.length === 0) return {}

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (min === max) {
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category' as const, data: [fmtCompact(min)] },
      yAxis: { type: 'value' as const, min: 0 },
      series: [{ type: 'bar', data: [values.length], itemStyle: { color: COLORS[2] } }],
    }
  }

  const numBins = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))))
  const step = (max - min) / numBins
  const bins: number[] = new Array(numBins).fill(0)
  const labels: string[] = []

  for (let i = 0; i < numBins; i++) {
    const lo = min + step * i
    const hi = min + step * (i + 1)
    labels.push(fmtCompact(lo) + '–' + fmtCompact(hi))
  }
  for (const v of values) {
    let idx = Math.floor((v - min) / step)
    if (idx >= numBins) idx = numBins - 1
    bins[idx]++
  }

  // Dynamic bottom based on longest label at rotation
  const maxLabelPx = labels.reduce((m, l) => {
    let w = 0
    for (const ch of l) w += ch.charCodeAt(0) > 127 ? 11 : 6.5
    return Math.max(m, w)
  }, 0)
  const rotateAngle = 35
  const projectedHeight = Math.ceil(maxLabelPx * Math.sin(rotateAngle * Math.PI / 180))
  const gridBottom = Math.max(40, projectedHeight + 16)

  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 50, right: 20, top: 10, bottom: gridBottom },
    xAxis: {
      type: 'category' as const,
      data: labels,
      axisLabel: { fontSize: 10, rotate: rotateAngle },
    },
    yAxis: { type: 'value' as const, min: 0 },
    series: [{
      type: 'bar',
      data: bins,
      itemStyle: { borderRadius: [2, 2, 0, 0] as [number, number, number, number], color: COLORS[2] },
    }],
  }
}

// ====== LINE — monthly aggregation with fill area ======
export function buildLineOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  const dateCol = chart.dateColumn
  const metricCol = chart.metric
  if (!dateCol || !metricCol) return {}

  // Group by YYYY-MM
  const monthly: Record<string, number[]> = {}
  for (const row of rows) {
    const dv = String(row[dateCol] || '').trim()
    const m = dv.match(/^(\d{4})[-/.](\d{1,2})/)
    if (!m) continue
    const ym = m[1] + '-' + m[2].padStart(2, '0')
    if (!monthly[ym]) monthly[ym] = []
    const v = getNumericVal(row[metricCol] as any)
    if (!isNaN(v)) monthly[ym].push(v)
  }

  const sortedMonths = Object.keys(monthly).sort()
  if (sortedMonths.length === 0) return {}

  const sums = sortedMonths.map((m) => monthly[m].reduce((a, b) => a + b, 0))

  return {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmt(p.value)}`).join('<br/>')
      },
    },
    grid: { left: 60, right: 20, top: 10, bottom: 60 },
    xAxis: {
      type: 'category' as const,
      data: sortedMonths,
      axisLabel: { rotate: 30, fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) },
    },
    dataZoom: [{ type: 'inside' as const }],
    series: [{
      type: 'line',
      name: metricCol,
      data: sums,
      smooth: true,
      lineStyle: { color: COLORS[0], width: 2 },
      itemStyle: { color: COLORS[0] },
      areaStyle: { color: COLORS[0] + '22' },
    }],
  }
}

/** 图表类型 -> 构建函数分发 */
export function getChartOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
) {
  switch (chart.type) {
    case 'bar': return buildBarOption(chart, rows)
    case 'horizontal_bar': return buildHorizontalBarOption(chart, rows)
    case 'doughnut': return buildDoughnutOption(chart, rows)
    case 'histogram': return buildHistogramOption(chart, rows)
    case 'line': return buildLineOption(chart, rows)
    default: return {}
  }
}
