/**
 * 基础图表 ECharts Option 构建函数
 * 从 DashboardView.vue 抽取独立
 */
import type { ChartSpec } from '@/types/spec'
import { aggregate } from '@/core/aggregator'

// ====== 动态标题解析 ======
/** 将标题中的 {metric} / {metrics} 替换为实际选中的指标名 */
export function resolveTitle(title: string, metrics: string[]): string {
  if (!title) return ''
  if (metrics.length === 0) return title
  return title
    .replace('{metrics}', metrics.join('、'))
    .replace('{metric}', metrics[0])
}

// ====== Color palette ======
export const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
]

// ====== Aggregation helper ======
export function applyAgg(arr: number[], agg: string): number {
  if (!arr.length) return 0
  switch (agg) {
    case 'sum': return arr.reduce((a, b) => a + b, 0)
    case 'avg': return arr.reduce((a, b) => a + b, 0) / arr.length
    case 'min': return arr.reduce((a, b) => a < b ? a : b, Infinity)
    case 'max': return arr.reduce((a, b) => a > b ? a : b, -Infinity)
    case 'count': return arr.length
    default: return arr.reduce((a, b) => a + b, 0)
  }
}

// ====== Formatting utilities ======
export function fmt(n: number | null | undefined, dec?: number): string {
  if (n == null || isNaN(n)) return '0'
  const d = dec !== undefined ? dec : 2
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d })
}

/** 根据图表配置格式化数值（支持图表级 + 指标级格式 + 小数位数） */
export function fmtByChart(n: number | null | undefined, chart: { format?: string; unit?: string; metricFormats?: Record<string, { format?: string; unit?: string; prefix?: string; decimals?: number }> }, metricName?: string): string {
  if (n == null || isNaN(n)) return '0'
  // 优先用指标级格式
  const mfRaw = metricName ? chart.metricFormats?.[metricName] : undefined
  const mf = mfRaw && typeof mfRaw === 'object' ? mfRaw : undefined
  const fmtType = mf?.format || chart.format || ''
  const unitType = mf?.unit || chart.unit || 'yuan'
  const prefix = (mf?.prefix !== undefined && mf.prefix !== '') ? mf.prefix : ''
  const decimals = mf?.decimals !== undefined ? mf.decimals : (chart as any).decimals !== undefined ? (chart as any).decimals : 2
  if (!fmtType || fmtType === 'number' || fmtType === 'global') return fmt(n, decimals)
  if (fmtType === 'integer') return fmt(n, 0)
  if (fmtType === 'percent') {
    // 浮点容差：sum(A/SUM(A)) 理论上=1.0，实际可能是 1.0000000000000002
    const v = n <= 1.000001 && n >= -1.000001 ? n * 100 : n
    return v.toFixed(decimals) + '%'
  }
  if (fmtType === 'currency') {
    let v = n
    let suffix = ''
    if (unitType === 'wan') { v = n / 10000; suffix = '万' }
    else if (unitType === 'yi') { v = n / 100000000; suffix = '亿' }
    return prefix + fmt(v, v >= 100 ? 0 : decimals) + suffix
  }
  return fmt(n, decimals)
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

/**
 * 对给定的列规则列表和单元格值，返回第一个匹配规则的颜色。
 * 支持两种写法：
 *   - 数值比较：> 100, < 0, >= 50, <= 20, = 0, != 0
 *   - 字符串比较：= 张三, != 李四, ~ 王（模糊包含）
 * @param rules 规则数组 [{ condition, color }]
 * @param val 单元格值
 * @returns 匹配的颜色字符串，无匹配返回 null
 */
export function resolveColTextRuleColor(
  rules: { condition: string; color: string }[] | undefined,
  val: any
): string | null {
  if (!rules || rules.length === 0) return null
  const numVal = Number(val)
  const isNum = !isNaN(numVal) && val != null && val !== ''
  for (const rule of rules) {
    if (!rule.condition.trim() || !rule.color) continue
    try {
      const cond = rule.condition.trim()
      if (isNum) {
        const m = cond.match(/^(>=?|<=?|!=?|=)\s*(-?[\d.]+)$/)
        if (m) {
          const op = m[1]; const n = parseFloat(m[2])
          if ((op === '>' && numVal > n) || (op === '>=' && numVal >= n) ||
            (op === '<' && numVal < n) || (op === '<=' && numVal <= n) ||
            ((op === '=' || op === '==') && numVal === n) ||
            (op === '!=' && numVal !== n)) {
            return rule.color
          }
        }
      } else {
        const strVal = String(val ?? '')
        const mStr = cond.match(/^(=|!=|~)\s*(.+)$/)
        if (mStr) {
          const op = mStr[1]; const t = mStr[2]
          if ((op === '=' && strVal === t) ||
            (op === '!=' && strVal !== t) ||
            (op === '~' && strVal.includes(t))) {
            return rule.color
          }
        }
      }
    } catch { /* skip invalid rule */ }
  }
  return null
}

// ====== Shared toolbox (PNG download, data table, restore) ======
let _toolboxLocale = 'zh-CN'
export function setToolboxLocale(locale: string) { _toolboxLocale = locale }

/** 回退方案：通过创建临时 textarea + execCommand 复制文本 */
function legacyCopy(text: string, callback: () => void) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  ta.style.top = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    document.execCommand('copy')
    callback()
  } catch {
    // 静默失败
  }
  document.body.removeChild(ta)
}

/** Base64 编码 TSV（安全嵌入 HTML data-* 属性） */
function encodeTsv(tsv: string): string {
  return btoa(unescape(encodeURIComponent(tsv)))
}

export function buildToolbox(): Record<string, any> {
  const zh = _toolboxLocale === 'zh-CN'
  const L = {
    saveImage: zh ? '下载' : 'Save Image',
    dataView: zh ? '数据' : 'Data',
    dataTable: zh ? '数据表' : 'Data Table',
    close: zh ? '关闭' : 'Close',
    refresh: zh ? '刷新' : 'Refresh',
    restore: zh ? '还原' : 'Restore',
    copyTable: zh ? '📋 复制表格' : '📋 Copy Table',
    copied: zh ? '✅ 已复制' : '✅ Copied',
    category: zh ? '类别' : 'Category',
    value: zh ? '数值' : 'Value',
    proportion: zh ? '占比' : 'Ratio',
    dimension: zh ? '维度' : 'Dimension',
    cluster: zh ? '聚类' : 'Cluster',
    index: zh ? '序号' : '#',
  }
  // 全局存储最新 locale 标签（供事件委托回调使用）
  if (typeof window !== 'undefined') {
    (window as any).__toolboxLabels = L
  }
  // 注册全局事件委托处理「复制表格」按钮（避免内联 onclick 被 CSP / ECharts 渲染拦截）
  if (typeof window !== 'undefined' && !(window as any).__copyTableSetup) {
    (window as any).__copyTableSetup = true
    document.addEventListener('click', function (e) {
      const btn = (e.target as HTMLElement).closest('.copy-table-btn') as HTMLElement | null
      if (!btn) return
      const tsvB64 = btn.getAttribute('data-tsv') || ''
      if (!tsvB64) return
      try {
        const tsv = decodeURIComponent(escape(atob(tsvB64)))
        const labels = (window as any).__toolboxLabels || { copied: '✅ Copied', copyTable: '📋 Copy Table' }
        const done = () => {
          btn.textContent = labels.copied
          btn.style.background = '#dcfce7'
          btn.style.borderColor = '#16a34a'
          setTimeout(() => {
            btn.textContent = labels.copyTable
            btn.style.background = '#f5f5f5'
            btn.style.borderColor = '#ccc'
          }, 1500)
        }
        // 优先 Clipboard API，回退 execCommand
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(tsv).then(done).catch(() => legacyCopy(tsv, done))
        } else {
          legacyCopy(tsv, done)
        }
      } catch (err) {
        console.error('Copy failed:', err)
      }
    })
  }
  const features: Record<string, any> = {
    saveAsImage: { title: L.saveImage, pixelRatio: 2 },
    dataView: {
      title: L.dataView,
      readOnly: true,
      lang: [L.dataTable, L.close, L.refresh],
      optionToContent: function (opt: any) {
        const series = opt.series || []
        // Read resolved CSS variable values from <html> — these auto-update with theme
        const root = document.documentElement
        const cs = getComputedStyle(root)
        const bg = cs.getPropertyValue('--bg-surface').trim() || '#fff'
        const bd = cs.getPropertyValue('--border').trim() || '#e2e8f0'
        const txt = cs.getPropertyValue('--text-primary').trim() || '#1e293b'
        const bgHover = cs.getPropertyValue('--bg-hover').trim() || '#f1f5f9'
        const thStyle = 'padding:6px 10px;border-bottom:2px solid ' + bd + ';color:' + txt
        const tdStyle = 'padding:4px 10px;border-bottom:1px solid ' + bd + ';color:' + txt
        const btnStyle = 'margin-top:8px;padding:4px 12px;border:1px solid ' + bd + ';border-radius:4px;background:' + bgHover + ';cursor:pointer;font-size:12px;color:' + txt
        // Helper: format number to 2 decimals if fractional
        const mfStore = { metricFormats: (opt as any)._mf || {} }
        function tf(v: any, metricName?: string): string {
          const n = Number(v)
          if (isNaN(n)) return String(v ?? '')
          return fmtByChart(n, mfStore, metricName)
        }
        // Pie chart (doughnut): use series[0].data [{name, value}]
        const isPie = series[0]?.type === 'pie'
        if (isPie) {
          const data = series[0]?.data || []
          const total = data.reduce((s: number, d: any) => s + (d.value || 0), 0)
          let tsv = L.category + '\t' + L.value + '\t' + L.proportion + '\n'
          let html = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ';background:' + bg + '"><table style="width:100%;border-collapse:collapse">'
          html += '<thead><tr><th style="' + thStyle + ';text-align:left">' + L.category + '</th><th style="' + thStyle + ';text-align:right">' + L.value + '</th><th style="' + thStyle + ';text-align:right">' + L.proportion + '</th></tr></thead><tbody>'
          data.forEach((d: any) => {
            const pct = total ? ((d.value / total) * 100).toFixed(1) + '%' : '0%'
            const fv = tf(d.value)
            html += '<tr><td style="' + tdStyle + '">' + (d.name || '') + '</td><td style="' + tdStyle + ';text-align:right">' + fv + '</td><td style="' + tdStyle + ';text-align:right">' + pct + '</td></tr>'
            tsv += (d.name || '') + '\t' + fv + '\t' + pct + '\n'
          })
          html += '</tbody></table>'
          html += '<button class="copy-table-btn" data-tsv="' + encodeTsv(tsv) + '" style="' + btnStyle + '">' + L.copyTable + '</button>'
          html += '</div>'
          return html
        }
        // Scatter chart (cluster): series[].data are [x, y] pairs
        const isScatter = series[0]?.type === 'scatter'
        if (isScatter) {
          const xName = opt.xAxis?.[0]?.name || 'X'
          const yName = opt.yAxis?.[0]?.name || 'Y'
          let tsv = L.index + '\t' + xName + '\t' + yName + '\t' + L.cluster + '\n'
          let html = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ';background:' + bg + '"><table style="width:100%;border-collapse:collapse">'
          html += '<thead><tr><th style="' + thStyle + ';text-align:left">#</th>'
          html += '<th style="' + thStyle + ';text-align:right">' + xName + '</th>'
          html += '<th style="' + thStyle + ';text-align:right">' + yName + '</th>'
          html += '<th style="' + thStyle + ';text-align:left">' + L.cluster + '</th></tr></thead><tbody>'
          let idx = 0
          for (const s of series) {
            const sName = s.name || ''
            for (const pt of (s.data || [])) {
              if (!Array.isArray(pt) || pt.length < 2) continue
              idx++
              const label = sName + ' #' + idx
              html += '<tr><td style="' + tdStyle + '">' + label + '</td>'
              html += '<td style="' + tdStyle + ';text-align:right">' + tf(pt[0]) + '</td>'
              html += '<td style="' + tdStyle + ';text-align:right">' + tf(pt[1]) + '</td>'
              html += '<td style="' + tdStyle + '">' + sName + '</td></tr>'
              tsv += label + '\t' + tf(pt[0]) + '\t' + tf(pt[1]) + '\t' + sName + '\n'
            }
          }
          html += '</tbody></table>'
          html += '<button class="copy-table-btn" data-tsv="' + encodeTsv(tsv) + '" style="' + btnStyle + '">' + L.copyTable + '</button>'
          html += '</div>'
          return html
        }
        // Cartesian chart: check xAxis first, then yAxis (horizontal bar)
        const xAxisData = opt.xAxis?.[0]?.data || []
        const yAxisData = opt.yAxis?.[0]?.data || []
        const isHorizontal = xAxisData.length === 0 && yAxisData.length > 0
        const catData = isHorizontal ? yAxisData : xAxisData
        let tsv = L.dimension + '\t' + series.map((s: any) => s.name || '').join('\t') + '\n'
        let html = '<div style="max-height:400px;overflow:auto;font-size:12px;color:' + txt + ';background:' + bg + '"><table style="width:100%;border-collapse:collapse">'
        html += '<thead><tr><th style="' + thStyle + ';text-align:left">' + L.dimension + '</th>'
        series.forEach((s: any) => {
          html += '<th style="' + thStyle + ';text-align:right">' + (s.name || '') + '</th>'
        })
        html += '</tr></thead><tbody>'
        for (let i = 0; i < catData.length; i++) {
          html += '<tr>'
          html += '<td style="' + tdStyle + '">' + (catData[i] || '') + '</td>'
          const row: string[] = [String(catData[i] || '')]
          series.forEach((s: any) => {
            const val = tf(s.data?.[i] ?? '')
            row.push(val)
            html += '<td style="' + tdStyle + ';text-align:right">' + val + '</td>'
          })
          tsv += row.join('\t') + '\n'
          html += '</tr>'
        }
        html += '</tbody></table>'
        html += '<button class="copy-table-btn" data-tsv="' + encodeTsv(tsv) + '" style="' + btnStyle + '">' + L.copyTable + '</button>'
        html += '</div>'
        return html
      },
    },
    restore: { title: L.restore },
  }
  return {
    show: true,
    right: 6,
    top: -2,
    itemSize: 12,
    itemGap: 6,
    iconStyle: { borderColor: '#999', borderWidth: 1 },
    feature: features,
  }
}

// ====== BAR — multi-metric grouped ======
export function buildBarOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
  sortOrder: 'none' | 'asc' | 'desc' = 'none',
  showLabel: boolean = true,
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
  let labels = Object.keys(groups)

  // Sort by first metric's aggregated value
  if (sortOrder !== 'none') {
    const aggFn = chart.metricAggs?.[metricCols[0]] || chart.agg || 'sum'
    const totals = labels.map(k => {
      const arr = groups[k]?.[metricCols[0]] || []
      return applyAgg(arr, aggFn)
    })
    const idx = labels.map((l, i) => ({ l, v: totals[i] }))
    idx.sort((a, b) => sortOrder === 'asc' ? a.v - b.v : b.v - a.v)
    labels = idx.map(x => x.l)
  } else {
    labels.sort()
  }

  const series = metricCols.map((m, mi) => {
    const aggFn = chart.metricAggs?.[m] || chart.agg || 'sum'
    return {
      name: m,
      type: 'bar' as const,
      data: labels.map((k) => {
        const arr = groups[k]?.[m] || []
        return applyAgg(arr, aggFn)
      }),
      label: showLabel ? { show: true, position: 'top' as const, fontSize: 11, formatter: (p: any) => fmtByChart(p.value, chart, p.seriesName) } : undefined,
      markPoint: showLabel ? {
        data: [
          { type: 'max', name: '最大', symbolSize: 24, symbolOffset: [0, -14], itemStyle: { color: '#EF4444' }, label: { show: false } },
          { type: 'min', name: '最小', symbolSize: 24, symbolOffset: [0, -14], itemStyle: { color: '#3B82F6' }, label: { show: false } },
        ],
      } : undefined,
      itemStyle: { borderRadius: [4, 4, 0, 0] as [number, number, number, number], color: COLORS[mi % COLORS.length] },
    }
  })

  return {
    _mf: chart.metricFormats || {}, toolbox: buildToolbox(),
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(60,60,75,0.85)',
      borderColor: '#555',
      textStyle: { color: '#eee', fontSize: 12 },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join('<br/>')
      },
    },
    legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
    grid: { left: 60, right: 20, top: metricCols.length > 1 ? 40 : 32, bottom: 30 },
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
  sortOrder: 'none' | 'asc' | 'desc' = 'asc',
  showLabel: boolean = true,
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
  let labelsH = Object.keys(groups).sort()

  // Sort by first metric's aggregated value
  if (sortOrder !== 'none') {
    const aggFn = chart.metricAggs?.[metricCols[0]] || chart.agg || 'sum'
    const totals = labelsH.map(k => {
      const arr = groups[k]?.[metricCols[0]] || []
      return applyAgg(arr, aggFn)
    })
    const idx = labelsH.map((l, i) => ({ l, v: totals[i] }))
    idx.sort((a, b) => sortOrder === 'desc' ? b.v - a.v : a.v - b.v)
    labelsH = idx.map(x => x.l)
  }

  const seriesH = metricCols.map((m, mi) => {
    const aggFn = chart.metricAggs?.[m] || chart.agg || 'sum'
    return {
      name: m,
      type: 'bar' as const,
      data: labelsH.map((k) => {
        const arr = groups[k]?.[m] || []
        return applyAgg(arr, aggFn)
      }),
      label: showLabel ? { show: true, position: 'right' as const, fontSize: 11, formatter: (p: any) => fmtByChart(p.value, chart, p.seriesName) } : undefined,
      itemStyle: {
        borderRadius: mi === metricCols.length - 1
          ? [0, 4, 4, 0] as [number, number, number, number]
          : [0, 0, 0, 0] as [number, number, number, number],
        color: COLORS[mi % COLORS.length],
      },
    }
  })

  const estLabelWidth = labelsH.reduce((m, l) => {
    let w = 0
    for (const ch of l) w += ch.charCodeAt(0) > 127 ? 12 : 7
    return Math.max(m, w)
  }, 0)
  const gridLeft = Math.max(40, estLabelWidth + 20)

  return {
    _mf: chart.metricFormats || {},
    toolbox: buildToolbox(),
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(60,60,75,0.85)',
      borderColor: '#555',
      textStyle: { color: '#eee', fontSize: 12 },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join('<br/>')
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
      data: labelsH,
      axisLabel: { fontSize: 11 },
    },
    series: seriesH,
  }
}

// ====== DOUGHNUT — legend bottom, color palette ======
export function buildDoughnutOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
  showLabel: boolean = true,
) {
  const dimCol = chart.dimension
  // 回退：如果 metric 为空，从 metrics[0] 取值
  const metricCol = chart.metric || chart.metrics?.[0] || ''
  if (!dimCol) return {}

  let aggData: { label: string; value: number }[]
  if (metricCol && metricCol !== 'count') {
    aggData = aggregate(rows, dimCol, metricCol, (chart.agg as any) || 'sum')
  } else {
    const freq: Record<string, number> = {}
    for (const row of rows) {
      const key = String(row[dimCol] || '未知')
      freq[key] = (freq[key] || 0) + 1
    }
    aggData = Object.entries(freq)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }

  // Merge overflow into "其他"
  const MAX_SLICES = 8
  let pieData = aggData
  if (aggData.length > MAX_SLICES) {
    const top = aggData.slice(0, MAX_SLICES - 1)
    const rest = aggData.slice(MAX_SLICES - 1)
    const otherSum = rest.reduce((s, d) => s + d.value, 0)
    pieData = [...top, { label: `其他(${rest.length}项)`, value: otherSum }]
  }

  const total = aggData.reduce((s, d) => s + d.value, 0)

  return {
    _mf: chart.metricFormats || {},
    toolbox: buildToolbox(),
    color: COLORS.slice(0, pieData.length),
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: 'rgba(60,60,75,0.85)',
      borderColor: '#555',
      textStyle: { color: '#eee' },
      formatter: (p: any) => `${p.name}: ${fmtByChart(p.value, chart, metricCol)} (${p.percent}%)`,
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11 },
    },
    graphic: {
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: fmtByChart(total, chart, metricCol),
        textAlign: 'center',
        fill: (() => {
          if (typeof document !== 'undefined') {
            return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#1e293b'
          }
          return '#1e293b'
        })(),
        fontSize: 18,
        fontWeight: 'bold',
      },
    },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      data: pieData.map((d) => ({ name: d.label, value: d.value })),
      label: showLabel ? { show: true, fontSize: 10, formatter: '{b}\n{d}%' } : { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
    }],
  }
}

// ====== HISTOGRAM — configurable bins + stats ======
export function buildHistogramOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
  binCount?: number,
) {
  // 回退：如果 metric 为空，从 metrics[0] 取值
  const col = chart.metric || chart.metrics?.[0] || ''
  if (!col) return {}

  const values = rows
    .map((r) => getNumericVal(r[col] as any))
    .filter((n) => !isNaN(n))

  if (values.length === 0) return {}

  const min = values.reduce((a, b) => a < b ? a : b, Infinity)
  const max = values.reduce((a, b) => a > b ? a : b, -Infinity)

  if (min === max) {
    return {
      toolbox: buildToolbox(),
      _mf: chart.metricFormats || {},
      tooltip: { trigger: 'axis' as const },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category' as const, data: [fmtCompact(min)] },
      yAxis: { type: 'value' as const, min: 0 },
      series: [{ type: 'bar', data: [values.length], itemStyle: { color: COLORS[2] } }],
    }
  }

  const numBins = binCount || Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))))
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
    _mf: chart.metricFormats || {},
    toolbox: buildToolbox(),
    tooltip: { trigger: 'axis' as const, backgroundColor: 'rgba(60,60,75,0.85)', borderColor: '#555', textStyle: { color: '#eee' } },
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

// ====== LINE — multi-metric with area fill, supports date or dimension ======
export function buildLineOption(
  chart: ChartSpec,
  rows: Record<string, string | number>[],
  areaFill: boolean = true,
  smooth: boolean = true,
) {
  const metricCols = chart.metrics || (chart.metric ? [chart.metric] : [])
  if (metricCols.length === 0) return {}

  const dimCol = chart.dateColumn || chart.dimension || ''
  if (!dimCol) return {}

  let labels: string[] = []
  let seriesData: Record<string, Record<string, number[]>> = {}

  if (chart.dateColumn) {
    // Date mode: group by YYYY-MM
    const monthsSet = new Set<string>()
    for (const row of rows) {
      const dv = String(row[chart.dateColumn] || '').trim()
      const m = dv.match(/^(\d{4})[-/.](\d{1,2})/)
      if (!m) continue
      const ym = m[1] + '-' + m[2].padStart(2, '0')
      monthsSet.add(ym)
      if (!seriesData[ym]) seriesData[ym] = {}
      for (const mc of metricCols) {
        if (!seriesData[ym][mc]) seriesData[ym][mc] = []
        const v = getNumericVal(row[mc] as any)
        if (!isNaN(v)) seriesData[ym][mc].push(v)
      }
    }
    labels = Array.from(monthsSet).sort()
  } else if (chart.dimension) {
    // Dimension mode: group by categorical dimension
    for (const row of rows) {
      const key = String(row[chart.dimension] || '未知')
      if (!seriesData[key]) seriesData[key] = {}
      for (const mc of metricCols) {
        if (!seriesData[key][mc]) seriesData[key][mc] = []
        const v = getNumericVal(row[mc] as any)
        if (!isNaN(v)) seriesData[key][mc].push(v)
      }
    }
    labels = Object.keys(seriesData).sort()
  } else {
    return {}
  }

  if (labels.length === 0) return {}

  const series = metricCols.map((mc, mi) => ({
    name: mc,
    type: 'line' as const,
    data: labels.map((l) => {
      const arr = seriesData[l]?.[mc] || []
      const aggFn = chart.metricAggs?.[mc] || chart.agg || 'sum'
      return applyAgg(arr, aggFn)
    }),
    smooth,
    lineStyle: { color: COLORS[mi % COLORS.length], width: 2 },
    itemStyle: { color: COLORS[mi % COLORS.length] },
    markPoint: {
      data: [
        { type: 'max', name: '最大', symbolSize: 36, itemStyle: { color: '#EF4444' }, label: { show: false } },
        { type: 'min', name: '最小', symbolSize: 30, itemStyle: { color: '#3B82F6' }, label: { show: false } },
      ],
    },
    areaStyle: areaFill ? { color: COLORS[mi % COLORS.length] + '22' } : undefined,
  }))

  return {
    _mf: chart.metricFormats || {},
    toolbox: buildToolbox(),
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(60,60,75,0.85)',
      borderColor: '#555',
      textStyle: { color: '#eee', fontSize: 12 },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmtByChart(p.value, chart, p.seriesName)}`).join('<br/>')
      },
    },
    legend: metricCols.length > 1 ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
    grid: { left: 60, right: 20, top: metricCols.length > 1 ? 30 : 10, bottom: 60 },
    xAxis: {
      type: 'category' as const,
      data: labels,
      axisLabel: { rotate: labels.length > 8 ? 30 : 0, fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) },
    },
    dataZoom: [{ type: 'inside' as const }],
    series,
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
