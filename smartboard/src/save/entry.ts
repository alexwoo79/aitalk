/**
 * 独立 HTML 渲染入口 — 复用 src/core/ 所有模块
 * 编译为 IIFE，注入到 result_template.html 中
 */
import { applyFilter, parseFilter } from '@/core/filter'
import { aggregate } from '@/core/aggregator'
import {
  buildBarOption, buildHorizontalBarOption, buildDoughnutOption,
  buildHistogramOption, buildLineOption, buildToolbox,
  fmt, fmtCompact, fmtByChart, getNumericVal, resolveTitle, applyAgg, COLORS,
} from '@/core/chart-options'
import { computeTimeseries, computeDeciles, computeClusters } from '@/core/analysis'
import type { TimeseriesData, DecileData, ClusterData } from '@/core/analysis'

// ====== Types ======
interface ChartSpec {
  type: 'bar' | 'horizontal_bar' | 'doughnut' | 'histogram' | 'line' | 'timeseries' | 'decile' | 'cluster'; title: string; dimension?: string; metric?: string;
  metrics?: string[]; dateColumn?: string; agg?: string;
  clusterMetrics?: string[]; k?: number; filter?: string;
  format?: string; unit?: 'yuan' | 'wan' | 'yi'; metricFormats?: Record<string, any>;
  metricAggs?: Record<string, string>;
}

interface KpiSpec { column: string; label: string; agg: string; format: string; prefix?: string; unit?: string; decimals?: number; }

interface FilterSpec { column: string }

interface DashboardData {
  title: string
  headers: string[]
  rows: Record<string, string | number>[]
  classifications: Record<string, { type: string; role: string }>
  filterSpecs: FilterSpec[]
  kpiSpecs: KpiSpec[]
  chartSpecs: ChartSpec[]
  metricDefaults: Record<string, any>
  tableColumns: string[]
  tableSortBy: string
  tableTopN: number
  dateRange?: { column: string; min: string; max: string } | null
  dateStart: string
  dateEnd: string
  locale: string
}

declare const echarts: any
declare const __I18N__: Record<string, any>

// ====== Simple i18n ======
let MSG: Record<string, any> = {}
function t(path: string, params?: Record<string, string | number>): string {
  const keys = path.split('.')
  let val: any = MSG
  for (const k of keys) { if (val == null) break; val = val[k] }
  let result = (typeof val === 'string' ? val : path) as string
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v))
    }
  }
  return result
}

// ====== Global state ======
let DATA: DashboardData
let filterValues: Record<string, string> = {}
let condFilter = '', searchText = ''
let sortCol = '', sortDir = false
let tblSearch = '', tblCond = '', tblTopN = 15
let tblCols: string[] = []
let chartInstances: any[] = []
let dateStart = '', dateEnd = ''

// ====== Filter logic (uses core/filter.ts) ======
function matchRow(row: Record<string, string | number>, p: ReturnType<typeof parseFilter>): boolean {
  if (!p) return true
  const cv = String(row[p.column] ?? '').trim()
  const cn = Number(cv.replace(/,/g, ''))
  const fn = Number(p.value.replace(/,/g, ''))
  const un = !isNaN(cn) && !isNaN(fn)
  switch (p.op) {
    case 'eq': return un ? cn === fn : cv === p.value
    case 'ne': return un ? cn !== fn : cv !== p.value
    case 'gt': return un ? cn > fn : cv > p.value
    case 'gte': return un ? cn >= fn : cv >= p.value
    case 'lt': return un ? cn < fn : cv < p.value
    case 'lte': return un ? cn <= fn : cv <= p.value
    case 'in': {
      const list = p.value.replace(/^\[|\]$/g, '').replace(/^\(|\)$/g, '')
        .replace(/["']/g, '').split(/[,，、;\s]+/).map(s => s.trim()).filter(Boolean)
      return list.some(item => {
        const itemNum = Number(item.replace(/,/g, ''))
        if (!isNaN(cn) && !isNaN(itemNum)) return cn === itemNum
        return cv === item
      })
    }
    case 'contains': return cv.toLowerCase().includes(p.value.toLowerCase())
    default: return true
  }
}

function applyConditionFilter(rows: Record<string, string | number>[], expr: string): Record<string, string | number>[] {
  if (!expr.trim()) return rows
  const groups = expr.split('&').map(g => g.trim()).filter(g => g)
  if (!groups.length) return rows
  // Build case-insensitive column map
  const colMap: Record<string, string> = {}
  if (rows.length) for (const k of Object.keys(rows[0])) colMap[k.toLowerCase()] = k
  for (const group of groups) {
    const orConds = group.split('|').map(c => c.trim()).filter(c => c)
      .map(parseFilter).filter((p): p is NonNullable<typeof p> => p !== null)
    // Normalize column names
    for (const c of orConds) { const a = colMap[c.column.toLowerCase()]; if (a) c.column = a }
    if (orConds.length) rows = rows.filter(r => orConds.some(p => matchRow(r, p)))
  }
  return rows
}

function getFilteredRows(): Record<string, string | number>[] {
  let rows = DATA.rows.slice()
  for (const col of Object.keys(filterValues)) {
    const v = filterValues[col]
    if (v && v !== '__all__') rows = rows.filter(r => String(r[col] ?? '').trim() === v)
  }
  // Date range filter
  if (DATA.dateRange?.column && dateStart && dateEnd) {
    const dc = DATA.dateRange.column
    rows = rows.filter(r => {
      const d = String(r[dc] ?? '').trim()
      return d >= dateStart && d <= dateEnd
    })
  }
  if (condFilter.trim()) rows = applyConditionFilter(rows, condFilter)
  if (searchText.trim()) {
    const q = searchText.trim().toLowerCase()
    rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))
  }
  return rows
}

// ====== Filter Bar ======
function renderFilterBar() {
  const bar = document.getElementById('filterBar')!
  bar.innerHTML = ''
  DATA.filterSpecs.forEach(f => {
    const lb = document.createElement('label'); lb.textContent = f.column + ':'; bar.appendChild(lb)
    const sel = document.createElement('select')
    const uv: Record<string, boolean> = {}
    DATA.rows.forEach(r => { const v = String(r[f.column] ?? '').trim(); if (v) uv[v] = true })
    const vs = Object.keys(uv).sort()
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = t('common.all'); sel.appendChild(o0)
    vs.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o) })
    sel.value = filterValues[f.column] || ''
    sel.onchange = () => { filterValues[f.column] = sel.value; refreshAll() }
    bar.appendChild(sel)
  })
  // Condition filter
  const cf = document.createElement('input'); cf.type = 'text'
  cf.placeholder = t('dashboard.conditionPlaceholder') || 'e.g. Amount > 100 & Region = Beijing'
  cf.style.cssText = 'padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;min-width:200px'
  cf.oninput = () => { condFilter = cf.value; refreshAll() }; bar.appendChild(cf)
  // Search
  const si = document.createElement('input'); si.type = 'text'; si.placeholder = '搜索...'
  si.style.cssText = 'padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:120px'
  si.oninput = () => { searchText = si.value; refreshAll() }; bar.appendChild(si)
  // Reset
  const rb = document.createElement('button'); rb.className = 'btn'; rb.textContent = t('dashboard.resetFilter')
  rb.onclick = () => { filterValues = {}; condFilter = ''; searchText = ''; cf.value = ''; si.value = ''; refreshAll() }
  bar.appendChild(rb)
  // Count
  const sp = document.createElement('span'); sp.className = 'filter-count'; sp.id = 'fc'; bar.appendChild(sp)
}

// ====== Date Range Bar (interactive) ======
function renderDateRangeBar() {
  const dr = DATA.dateRange
  const bar = document.getElementById('dateRangeBar')!
  if (!dr || !dr.column) { bar.style.display = 'none'; return }
  bar.style.display = 'flex'
  bar.innerHTML = ''

  // Label
  const lb = document.createElement('span'); lb.className = 'dr-label'
  lb.textContent = t('dashboard.timeSlice') + ': ' + dr.column; bar.appendChild(lb)

  // Start date input
  const si = document.createElement('input'); si.type = 'date'; si.className = 'dr-date-inp'
  si.min = dr.min; si.max = dr.max; si.value = dateStart
  si.onchange = () => { dateStart = si.value; refreshAll() }
  bar.appendChild(si)

  const sp = document.createElement('span'); sp.className = 'dr-sep'; sp.textContent = t('dashboard.to'); bar.appendChild(sp)

  // End date input
  const ei = document.createElement('input'); ei.type = 'date'; ei.className = 'dr-date-inp'
  ei.min = dr.min; ei.max = dr.max; ei.value = dateEnd
  ei.onchange = () => { dateEnd = ei.value; refreshAll() }
  bar.appendChild(ei)

  // Info
  const info = document.createElement('span'); info.className = 'dr-info'; info.id = 'drInfo'
  bar.appendChild(info)

  // Presets
  const presets = buildDatePresets(dr)
  const pw = document.createElement('div'); pw.className = 'dr-presets'; pw.id = 'drPresets'
  presets.forEach(p => {
    const btn = document.createElement('button'); btn.className = 'dr-preset'
    btn.textContent = p.label
    btn.onclick = () => {
      dateStart = p.start; dateEnd = p.end
      si.value = dateStart; ei.value = dateEnd
      // Update active states
      pw.querySelectorAll('.dr-preset').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      refreshAll()
    }
    // Mark active if matches current
    if (dateStart === p.start && dateEnd === p.end) btn.classList.add('active')
    pw.appendChild(btn)
  })
  bar.appendChild(pw)

  updateDrInfo()
}

function buildDatePresets(dr: { column: string; min: string; max: string }): { label: string; start: string; end: string }[] {
  const min = new Date(dr.min), max = new Date(dr.max)
  const totalMonths = (max.getFullYear() - min.getFullYear()) * 12 + (max.getMonth() - min.getMonth())
  const presets: { label: string; start: string; end: string }[] = []
  if (totalMonths >= 3) {
    const s = new Date(max); s.setMonth(s.getMonth() - 3)
    presets.push({ label: t('dashboard.datePresets.last3Months'), start: s.toISOString().slice(0, 10), end: dr.max })
  }
  if (totalMonths >= 6) {
    const s = new Date(max); s.setMonth(s.getMonth() - 6)
    presets.push({ label: t('dashboard.datePresets.last6Months'), start: s.toISOString().slice(0, 10), end: dr.max })
  }
  const totalYears = Math.floor(totalMonths / 12)
  for (let y = 1; y <= totalYears; y++) {
    const s = new Date(max); s.setFullYear(s.getFullYear() - y)
    presets.push({ label: y === 1 ? t('dashboard.datePresets.last1Year') : t('dashboard.datePresets.lastNYears', { n: String(y) }), start: s.toISOString().slice(0, 10), end: dr.max })
  }
  presets.push({ label: t('dashboard.datePresets.all'), start: dr.min, end: dr.max })
  return presets
}

function updateDrInfo() {
  const info = document.getElementById('drInfo')
  if (!info) return
  const dr = DATA.dateRange
  if (!dr?.column) return
  let inRange = DATA.rows.length
  if (dateStart && dateEnd) {
    inRange = DATA.rows.filter(r => {
      const d = String(r[dr.column] ?? '').trim()
      return d >= dateStart && d <= dateEnd
    }).length
  }
  info.textContent = inRange + ' / ' + DATA.rows.length + ' ' + t('common.records')
}

// ====== KPI Cards ======
function renderKpiCards(rows: Record<string, string | number>[]) {
  const el = document.getElementById('kpiRow')!
  el.innerHTML = ''
  const bg = ['#EBF5FF', '#ECFDF5', '#FFFBEB', '#FEF2F2', '#F5F3FF', '#ECFEFF']
  const tx = ['#1e40af', '#065f46', '#92400e', '#991b1b', '#5b21b6', '#155e75']
  const ic = ['📊', '📈', '📋', '💰', '💵', '👥']

  DATA.kpiSpecs.forEach((k, i) => {
    const vs = rows.map(r => {
      const v = r[k.column]
      if (v == null || v === '') return 0
      if (typeof v === 'number') return v
      return getNumericVal(v) || 0
    })
    let val = 0
    switch (k.agg) {
      case 'count': val = rows.length; break
      case 'sum': val = vs.reduce((a, b) => a + b, 0); break
      case 'avg': val = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0; break
      case 'min': val = Math.min(...vs); break
      case 'max': val = Math.max(...vs); break
      default: val = vs.reduce((a, b) => a + b, 0)
    }
    const dc = k.decimals != null ? k.decimals : 2
    let dv = ''
    if (k.format === 'percent') { const v2 = val <= 1 && val >= -1 ? val * 100 : val; dv = v2.toFixed(dc) + '%' }
    else if (k.format === 'currency') {
      let cv = val, cs = ''
      if (k.unit === 'wan') { cv = val / 10000; cs = '万' }
      else if (k.unit === 'yi') { cv = val / 100000000; cs = '亿' }
      dv = (k.prefix || '') + (k.prefix ? '' : '¥') + fmt(cv, cv >= 100 ? 0 : dc) + cs
    } else if (k.format === 'integer') dv = (k.prefix || '') + fmt(val, 0)
    else dv = (k.prefix || '') + fmt(val, dc)

    const card = document.createElement('div')
    card.className = 'kpi-card'
    card.style.cssText = `background:${bg[i % bg.length]};color:${tx[i % tx.length]}`
    card.innerHTML = `<div class="kpi-icon"><span>${ic[i % ic.length]}</span></div><div class="kpi-content"><span class="kpi-value">${dv}</span><span class="kpi-label">${k.label}</span></div>`
    el.appendChild(card)
  })
}

// ====== Charts ======
function disposeCharts() { chartInstances.forEach(c => { try { c.dispose() } catch (e) { /* */ } }); chartInstances = [] }

function initChart(dom: HTMLElement, h?: string) {
  if (typeof echarts === 'undefined' || !echarts.init) return null
  dom.style.height = h || '320px'
  const c = echarts.init(dom); chartInstances.push(c)
  window.addEventListener('resize', () => c.resize()); return c
}

function replaceChart(wrap: HTMLElement, opt: any, h?: string) {
  // Remove old chart divs
  const divs = wrap.querySelectorAll('div')
  divs.forEach(d => { const dc = chartInstances.find(c2 => c2?.getDom?.() === d); if (dc) { dc.dispose() }; d.remove() })
  if (!opt) return null
  const nd = document.createElement('div'); nd.style.cssText = 'position:absolute;inset:0'
  wrap.appendChild(nd)
  const c = echarts.init(nd); chartInstances.push(c); c.setOption(opt); return c
}

function buildTsOption(td: TimeseriesData, chart: ChartSpec): any {
  const allL = td.labels.concat(td.forecast.labels)
  const aD: (number | null)[] = [...td.values, ...new Array(td.forecast.labels.length).fill(null)]
  const mD: (number | null)[] = [...td.ma, ...new Array(td.forecast.labels.length).fill(null)]
  const tD: (number | null)[] = [...td.trend, ...new Array(td.forecast.labels.length).fill(null)]
  const fD: (number | null)[] = [...new Array(td.labels.length - 1).fill(null), td.values[td.values.length - 1], ...td.forecast.values]
  return {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(60,60,75,0.85)', borderColor: '#555', textStyle: { color: '#eee' },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.filter((x: any) => x.value != null).map((x: any) => `${x.seriesName}: ${fmtByChart(x.value, chart, x.seriesName)}`).join('<br/>')
      }
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: allL, axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) } },
    dataZoom: [{ type: 'inside' }],
    toolbox: buildToolbox(),
    series: [
      { name: t('chart.series.actual'), type: 'line', data: aD, lineStyle: { color: COLORS[0], width: 2 }, itemStyle: { color: COLORS[0] }, areaStyle: { color: COLORS[0] + '22' }, smooth: true },
      { name: 'MA3', type: 'line', data: mD, lineStyle: { color: COLORS[2], width: 2, type: 'dashed' }, itemStyle: { color: COLORS[2] }, smooth: true, symbol: 'none' },
      { name: t('chart.series.trend'), type: 'line', data: tD, lineStyle: { color: '#6B7280', width: 1.5, type: 'dotted' }, itemStyle: { color: '#6B7280' }, smooth: false, symbol: 'none' },
      { name: t('chart.series.forecast'), type: 'line', data: fD, lineStyle: { color: '#10B981', width: 2, type: 'dashed' }, itemStyle: { color: '#10B981' }, smooth: true, symbolSize: 6 },
    ],
  }
}

function buildDecileOption(dd: DecileData, chart: ChartSpec): any {
  return {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(60,60,75,0.85)', borderColor: '#555', textStyle: { color: '#eee' },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((x: any) => `${x.seriesName}: ${fmtByChart(x.value, chart, x.seriesName)}`).join('<br/>')
      }
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 60, top: 50, bottom: 30 },
    xAxis: { type: 'category', data: dd.labels, axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value', position: 'left', name: t('chart.series.sum'), axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) } },
      { type: 'value', position: 'right', name: t('chart.series.count'), splitLine: { show: false }, axisLabel: { fontSize: 10 } },
    ],
    toolbox: buildToolbox(),
    series: [
      { name: t('chart.series.sum'), type: 'bar', yAxisIndex: 0, data: dd.sums, itemStyle: { color: COLORS[0], borderRadius: [3, 3, 0, 0] }, z: 2 },
      { name: t('chart.series.count'), type: 'line', yAxisIndex: 1, data: dd.counts, lineStyle: { color: COLORS[3], width: 2 }, itemStyle: { color: COLORS[3] }, smooth: true, symbolSize: 8, z: 1 },
    ],
  }
}

function buildClusterOption(cd: ClusterData, chart: ChartSpec): any {
  const clusters: Record<number, [number, number][]> = {}
  cd.points.forEach(p => { if (!clusters[p.cluster]) clusters[p.cluster] = []; clusters[p.cluster].push([p.x, p.y]) })
  const cIds = Object.keys(clusters).map(Number).sort((a, b) => a - b)
  const series = cIds.map(ci => ({
    name: t('chart.series.clusterN', { n: String(ci + 1) }), type: 'scatter',
    data: clusters[ci], symbolSize: 8,
    itemStyle: { color: COLORS[ci % COLORS.length] + '99', borderColor: COLORS[ci % COLORS.length], borderWidth: 1 },
  }))
  series.push({
    name: t('chart.series.clusterCenter'), type: 'scatter',
    data: cd.centroids.map(c => [c.x, c.y]),
    symbolSize: 18, symbol: 'diamond',
    itemStyle: { color: '#1a202c', borderColor: '#fff', borderWidth: 2 }, z: 10,
  } as any)
  return {
    tooltip: { formatter: (p: any) => { const xy = p.value; return `${p.seriesName}<br/>X: ${fmtCompact(xy[0])}<br/>Y: ${fmtCompact(xy[1])}` } },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 80, right: 20, top: 40, bottom: 50 },
    xAxis: { type: 'value', name: cd.colX, nameLocation: 'center', nameGap: 34, nameTextStyle: { fontSize: 13, fontWeight: 'bold' }, axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) } },
    yAxis: { type: 'value', name: cd.colY, nameLocation: 'center', nameGap: 56, nameTextStyle: { fontSize: 13, fontWeight: 'bold' }, axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) } },
    toolbox: buildToolbox(),
    series,
  }
}

function renderCharts(rows: Record<string, string | number>[]) {
  const grid = document.getElementById('chartsGrid')!
  disposeCharts(); grid.innerHTML = ''

  DATA.chartSpecs.forEach((ch, i) => {
    try {
      const cRows = ch.filter ? applyFilter(rows, undefined, ch.filter) : rows
      const isAn = ch.type === 'timeseries' || ch.type === 'decile' || ch.type === 'cluster'
      const card = document.createElement('div')
      card.className = isAn ? 'chart-card chart-card-full' : 'chart-card'
      card.setAttribute('data-chart-idx', String(i))
      card.ondblclick = (e) => { e.stopPropagation(); toggleFullscreen(card) }

      const ms0 = ch.metrics && ch.metrics.length > 0 ? ch.metrics : (ch.metric ? [ch.metric] : [])
      const h3 = document.createElement('h3'); h3.textContent = resolveTitle(ch.title, ms0); card.appendChild(h3)

      if (ch.type === 'timeseries') {
        const ms = ms0; const activeM = ch.metric || ms[0]
        if (ms.length > 1) {
          const mb = document.createElement('div'); mb.className = 'metric-btns'
          ms.forEach(m => {
            const b = document.createElement('button')
            b.className = 'metric-btn' + (m === activeM ? ' active' : ''); b.textContent = m
            b.onclick = () => {
              mb.querySelectorAll('.metric-btn').forEach((bb: any) => bb.classList.remove('active'))
              b.classList.add('active'); h3.textContent = resolveTitle(ch.title, [m])
              renderTsChart(card, ch, cRows, m, 'month')
            }; mb.appendChild(b)
          }); card.appendChild(mb)
        }
        const pt = document.createElement('div'); pt.className = 'period-toggle';
        [{ k: 'month', l: '月' }, { k: 'quarter', l: '季' }, { k: 'year', l: '年' }].forEach(pd => {
          const b = document.createElement('button')
          b.className = 'period-btn' + (pd.k === 'month' ? ' active' : ''); b.textContent = pd.l
          b.setAttribute('data-pd', pd.k)
          b.onclick = () => {
            pt.querySelectorAll('.period-btn').forEach((bb: any) => bb.classList.remove('active'))
            b.classList.add('active')
            const curM = card.querySelector('.metric-btn.active')
            renderTsChart(card, ch, cRows, curM ? curM.textContent! : activeM, pd.k as any)
          }; pt.appendChild(b)
        }); card.appendChild(pt)
        const tsWrap = document.createElement('div'); tsWrap.className = 'chart-body-ts'; tsWrap.id = 'chart-ts-' + i; card.appendChild(tsWrap)
        grid.appendChild(card); renderTsChart(card, ch, cRows, activeM, 'month')
      } else if (ch.type === 'decile') {
        const dm = ms0; const dActive = ch.metric || dm[0]
        const dmb = document.createElement('div'); dmb.className = 'metric-btns'
        dm.forEach(m => {
          const b = document.createElement('button')
          b.className = 'metric-btn' + (m === dActive ? ' active' : ''); b.textContent = m
          b.onclick = () => {
            dmb.querySelectorAll('.metric-btn').forEach((bb: any) => bb.classList.remove('active'))
            b.classList.add('active'); h3.textContent = resolveTitle(ch.title, [m])
            renderDecileChartContent(card, ch, cRows, m)
          }; dmb.appendChild(b)
        }); card.appendChild(dmb)
        const dw = document.createElement('div'); dw.className = 'chart-body-ts'; dw.id = 'chart-dec-' + i; card.appendChild(dw)
        grid.appendChild(card); renderDecileChartContent(card, ch, cRows, dActive)
      } else if (ch.type === 'cluster') {
        const cm = ch.clusterMetrics && ch.clusterMetrics.length > 0 ? ch.clusterMetrics : (ch.metrics || [])
        if (cm.length > 2) {
          const as = document.createElement('div'); as.className = 'axis-selector'
          const xg = document.createElement('div'); xg.innerHTML = '<label>X 轴</label>'
          const xs = document.createElement('select'); cm.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; xs.appendChild(o) }); xs.value = cm[0]; xg.appendChild(xs); as.appendChild(xg)
          const yg = document.createElement('div'); yg.innerHTML = '<label>Y 轴</label>'
          const ys = document.createElement('select'); cm.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; ys.appendChild(o) }); ys.value = cm[1] || cm[0]; yg.appendChild(ys); as.appendChild(yg)
          xs.onchange = () => { h3.textContent = resolveTitle(ch.title, [xs.value, ys.value]); renderClusterChartContent(card, ch, cRows, xs.value, ys.value) }
          ys.onchange = () => { h3.textContent = resolveTitle(ch.title, [xs.value, ys.value]); renderClusterChartContent(card, ch, cRows, xs.value, ys.value) }
          card.appendChild(as)
          const cw = document.createElement('div'); cw.className = 'chart-body-cl'; cw.id = 'chart-cl-' + i; card.appendChild(cw)
          grid.appendChild(card); renderClusterChartContent(card, ch, cRows, cm[0], cm[1] || cm[0])
        } else {
          const cw = document.createElement('div'); cw.className = 'chart-body-cl'; cw.id = 'chart-cl-' + i; card.appendChild(cw)
          grid.appendChild(card); renderClusterChartContent(card, ch, cRows, cm[0], cm[1] || cm[0])
        }
      } else {
        // Basic charts: bar, horizontal_bar, doughnut, histogram, line
        const bm = ms0; const activeBms = bm.slice()
        if (bm.length > 1) {
          const bmb = document.createElement('div'); bmb.className = 'metric-btns'
          if (ch.type === 'doughnut' || ch.type === 'histogram') {
            const ms = document.createElement('select'); ms.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px'
            bm.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; ms.appendChild(o) })
            ms.onchange = () => {
              const mc = ms.value; h3.textContent = resolveTitle(ch.title, [mc])
              let opt: any = null
              if (ch.type === 'doughnut') opt = buildDoughnutOption({ ...ch, metric: mc }, cRows)
              else opt = buildHistogramOption({ ...ch, metric: mc }, cRows)
              const wrap = card.querySelector('.chart-body') as HTMLElement; replaceChart(wrap, opt)
            }; bmb.appendChild(ms)
          } else {
            bm.forEach(m => {
              const b = document.createElement('button'); b.className = 'metric-btn active'; b.textContent = m
              b.onclick = () => {
                if (activeBms.length > 1 || !b.classList.contains('active')) { b.classList.toggle('active') }
                activeBms.length = 0
                bmb.querySelectorAll('.metric-btn.active').forEach((ab: any) => activeBms.push(ab.textContent!))
                h3.textContent = resolveTitle(ch.title, activeBms)
                let opt: any = null
                if (ch.type === 'bar') opt = buildBarOption({ ...ch, metrics: activeBms.slice() }, cRows, sortOrder, showLabel)
                else if (ch.type === 'horizontal_bar') opt = buildHorizontalBarOption({ ...ch, metrics: activeBms.slice() }, cRows, sortOrder, showLabel)
                else opt = buildLineOption({ ...ch, metrics: activeBms.slice() }, cRows)
                const wrap = card.querySelector('.chart-body') as HTMLElement; replaceChart(wrap, opt)
              }; bmb.appendChild(b)
            })
          }; card.appendChild(bmb)
        }

        let showLabel = true, sortOrder: 'none' | 'asc' | 'desc' = 'none'
        if (ch.type === 'bar' || ch.type === 'horizontal_bar') {
          const stb = document.createElement('div'); stb.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap'
          const sl = document.createElement('select'); sl.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px';
          [{ v: 'none', l: '自然' }, { v: 'asc', l: '升序' }, { v: 'desc', l: '降序' }].forEach(o => { const op = document.createElement('option'); op.value = o.v; op.textContent = o.l; sl.appendChild(op) })
          sl.onchange = () => {
            sortOrder = sl.value as any
            const curMetrics = activeBms.length ? activeBms : bm
            let opt: any = null
            if (ch.type === 'bar') opt = buildBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel)
            else opt = buildHorizontalBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel)
            const wrap = card.querySelector('.chart-body') as HTMLElement; replaceChart(wrap, opt)
          }; stb.appendChild(sl)
          const lb = document.createElement('button'); lb.textContent = '标签'
          lb.style.cssText = 'padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;background:#3B82F6;color:#fff;font-size:12px;cursor:pointer'
          lb.onclick = () => {
            showLabel = !showLabel
            lb.style.background = showLabel ? '#3B82F6' : '#fff'; lb.style.color = showLabel ? '#fff' : '#4a5568'
            const curMetrics = activeBms.length ? activeBms : bm
            let opt: any = null
            if (ch.type === 'bar') opt = buildBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel)
            else opt = buildHorizontalBarOption({ ...ch, metrics: curMetrics.slice() }, cRows, sortOrder, showLabel)
            const wrap = card.querySelector('.chart-body') as HTMLElement; replaceChart(wrap, opt)
          }; stb.appendChild(lb); card.appendChild(stb)
        }

        const wrap = document.createElement('div'); wrap.className = 'chart-body'; wrap.id = 'chart-basic-' + i; card.appendChild(wrap)
        grid.appendChild(card)

        let opt: any = null
        if (ch.type === 'bar') opt = buildBarOption({ ...ch, metrics: bm }, cRows, 'none', true)
        else if (ch.type === 'horizontal_bar') opt = buildHorizontalBarOption({ ...ch, metrics: bm }, cRows, 'none', true)
        else if (ch.type === 'doughnut') opt = buildDoughnutOption(ch, cRows)
        else if (ch.type === 'histogram') opt = buildHistogramOption(ch, cRows)
        else if (ch.type === 'line') opt = buildLineOption(ch, cRows)
        if (opt) { const c = initChart(wrap, '320px'); if (c) c.setOption(opt) }
      }
    } catch (e) { console.error(e) }
  })
}

// Fullscreen
let fsCard: HTMLElement | null = null
function toggleFullscreen(card: HTMLElement) {
  if (fsCard && fsCard !== card) fsCard.classList.remove('is-fullscreen')
  card.classList.toggle('is-fullscreen')
  fsCard = card.classList.contains('is-fullscreen') ? card : null
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fsCard) { fsCard.classList.remove('is-fullscreen'); fsCard = null } })

// ====== Special chart render helpers ======
function renderTsChart(card: HTMLElement, ch: ChartSpec, rows: Record<string, string | number>[], mc: string, pd: 'month' | 'quarter' | 'year') {
  removeOldChart(card, '.chart-body-ts')
  const wrap = document.createElement('div'); wrap.className = 'chart-body-ts'; wrap.id = 'chart-ts-' + card.getAttribute('data-chart-idx'); card.appendChild(wrap)
  removeOldElements(card)

  const td = computeTimeseries(rows, ch.dateColumn || '', mc, pd)
  if (!td) { wrap.textContent = t('chart.insufficientData', { name: t('chart.timeseries') }); return }
  const opt = buildTsOption(td, ch)
  const c = initChart(wrap, '360px'); if (c) c.setOption(opt)

  const info = document.createElement('div'); info.className = 'ts-info'
  const lastM = td.mom[td.mom.length - 1], lastY = td.yoy[td.yoy.length - 1]
  info.innerHTML = `<span>最新: <strong>${td.labels[td.labels.length - 1]}</strong></span><span>值: <strong>${fmt(td.values[td.values.length - 1])}</strong></span>` +
    (lastM != null ? `<span>环比: <strong style="color:${lastM >= 0 ? '#10B981' : '#EF4444'}">${lastM >= 0 ? '+' : ''}${lastM.toFixed(1)}%</strong></span>` : '') +
    (lastY != null ? `<span>同比: <strong style="color:${lastY >= 0 ? '#10B981' : '#EF4444'}">${lastY >= 0 ? '+' : ''}${lastY.toFixed(1)}%</strong></span>` : '') +
    (td.forecast.values.length > 0 ? `<span>下期预测: <strong>${fmt(td.forecast.values[0])}</strong></span>` : '')
  card.appendChild(info)

  renderTsDetailTable(card, td)
}

function renderTsDetailTable(card: HTMLElement, td: TimeseriesData) {
  const dtWrap = document.createElement('div'); dtWrap.className = 'ts-detail-wrap'; dtWrap.style.display = 'none'
  let html = '<table class="detail-table"><thead><tr><th>周期</th><th>实际值</th><th title="3期移动平均：当前值与之前2期的平均值">MA3</th><th>环比%</th><th>同比%</th><th>趋势</th><th>预测</th></tr></thead><tbody>'
  td.labels.forEach((l, j) => {
    const mv = td.mom[j], yv = td.yoy[j]
    const mc = mv != null ? (mv >= 0 ? '#10B981' : '#EF4444') : '', yc = yv != null ? (yv >= 0 ? '#10B981' : '#EF4444') : ''
    html += `<tr><td>${l}</td><td>${fmt(td.values[j])}</td><td>${td.ma[j] != null ? fmt(td.ma[j]!) : '—'}</td><td style="color:${mc}">${mv != null ? (mv >= 0 ? '+' : '') + mv.toFixed(1) + '%' : '—'}</td><td style="color:${yc}">${yv != null ? (yv >= 0 ? '+' : '') + yv.toFixed(1) + '%' : '—'}</td><td>${fmt(td.trend[j])}</td><td>—</td></tr>`
  })
  if (td.forecast.labels.length > 0) {
    td.forecast.labels.forEach((fl, fi) => { html += `<tr><td>${fl} (预测)</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="ts-forecast">${fmt(td.forecast.values[fi])}</td></tr>` })
  }
  html += '</tbody></table>'; dtWrap.innerHTML = html; card.appendChild(dtWrap)
  const tg = document.createElement('button'); tg.className = 'detail-toggle'; tg.textContent = t('common.expand')
  tg.onclick = () => { const s = dtWrap.style.display !== 'none'; dtWrap.style.display = s ? 'none' : ''; tg.textContent = s ? t('common.expand') : t('common.collapse') }
  card.appendChild(tg)
}

function renderDecileChartContent(card: HTMLElement, ch: ChartSpec, rows: Record<string, string | number>[], mc: string) {
  removeOldChart(card, '.chart-body-ts')
  const wrap = document.createElement('div'); wrap.className = 'chart-body-ts'; wrap.id = 'chart-dec-' + card.getAttribute('data-chart-idx'); card.appendChild(wrap)
  removeOldElements(card)

  const dd = computeDeciles(rows, mc)
  if (!dd) { wrap.textContent = t('chart.insufficientData', { name: t('chart.decile') }); return }
  const opt = buildDecileOption(dd, ch)
  const c = initChart(wrap, '360px'); if (c) c.setOption(opt)

  const dtWrap = document.createElement('div'); dtWrap.className = 'ts-detail-wrap'; dtWrap.style.display = 'none'
  let html = '<table class="detail-table"><thead><tr><th>分组</th><th>数量</th><th>合计</th><th>平均</th><th>范围</th></tr></thead><tbody>'
  dd.labels.forEach((l, i) => { html += `<tr><td>${l}</td><td>${dd.counts[i]}</td><td>${fmt(dd.sums[i])}</td><td>${fmt(dd.avgs[i])}</td><td>${dd.ranges[i]}</td></tr>` })
  html += '</tbody></table>'; dtWrap.innerHTML = html; card.appendChild(dtWrap)
  const dg = document.createElement('button'); dg.className = 'detail-toggle'; dg.textContent = '展开明细表 ↓'
  dg.onclick = () => { const s = dtWrap.style.display !== 'none'; dtWrap.style.display = s ? 'none' : ''; dg.textContent = s ? '展开明细表 ↓' : '收起明细 ↑' }
  card.appendChild(dg)
}

function renderClusterChartContent(card: HTMLElement, ch: ChartSpec, rows: Record<string, string | number>[], xCol: string, yCol: string) {
  removeOldChart(card, '.chart-body-cl')
  const wrap = document.createElement('div'); wrap.className = 'chart-body-cl'; wrap.id = 'chart-cl-' + card.getAttribute('data-chart-idx'); card.appendChild(wrap)
  removeOldElements(card)

  const k = ch.k || 3
  const cd = computeClusters(rows, [xCol, yCol], k)
  if (!cd) { wrap.textContent = t('chart.insufficientData', { name: t('chart.cluster') }); return }
  const opt = buildClusterOption(cd, ch)
  const c = initChart(wrap, '380px'); if (c) c.setOption(opt)

  // Summary
  const sum: Record<number, { count: number; sx: number; sy: number }> = {}
  cd.points.forEach(p => { if (!sum[p.cluster]) sum[p.cluster] = { count: 0, sx: 0, sy: 0 }; sum[p.cluster].count++; sum[p.cluster].sx += p.x; sum[p.cluster].sy += p.y })
  const csDiv = document.createElement('div'); csDiv.className = 'cluster-summary'
  const cIds = Object.keys(sum).map(Number).sort((a, b) => a - b)
  cIds.forEach(ci => { const s = sum[ci]; csDiv.innerHTML += `<span class="summary-chip" style="border-color:${COLORS[ci % COLORS.length]}"><strong>聚类 ${ci + 1}</strong> ${s.count} 个 · 中心 (${fmtCompact(s.sx / s.count)}, ${fmtCompact(s.sy / s.count)})</span>` })
  card.appendChild(csDiv)

  // Detail table
  const dtWrap = document.createElement('div'); dtWrap.className = 'ts-detail-wrap'; dtWrap.style.display = 'none'
  let html = `<table class="detail-table"><thead><tr><th>标签</th><th>${cd.colX}</th><th>${cd.colY}</th><th>聚类</th></tr></thead><tbody>`
  cd.points.forEach(p => { html += `<tr><td>${p.label}</td><td>${fmtCompact(p.x)}</td><td>${fmtCompact(p.y)}</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;color:white;background:${COLORS[p.cluster % COLORS.length]}">聚类${p.cluster + 1}</span></td></tr>` })
  html += '</tbody></table>'; dtWrap.innerHTML = html; card.appendChild(dtWrap)
  const cg = document.createElement('button'); cg.className = 'detail-toggle'; cg.textContent = '展开明细表 ↓'
  cg.onclick = () => { const s = dtWrap.style.display !== 'none'; dtWrap.style.display = s ? 'none' : ''; cg.textContent = s ? '展开明细表 ↓' : '收起明细 ↑' }
  card.appendChild(cg)
}

function removeOldChart(card: HTMLElement, selector: string) {
  const old = card.querySelector(selector) as HTMLElement | null
  if (old) { const cid = old.id; const oldC = chartInstances.find(c => c?.getDom?.()?.id === cid); if (oldC) oldC.dispose(); old.remove() }
}
function removeOldElements(card: HTMLElement) {
  const els = card.querySelectorAll('.ts-info,.ts-detail-wrap,.detail-toggle,.cluster-summary')
  els.forEach(e => e.remove())
}

// ====== Data Table ======
function renderTable(rows: Record<string, string | number>[]) {
  const el = document.getElementById('tableCard')!
  el.innerHTML = ''
  // Toolbar
  const tb = document.createElement('div'); tb.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap'
  const th3 = document.createElement('h3'); th3.style.cssText = 'margin:0;font-size:15px'; tb.appendChild(th3); el.appendChild(tb)
  // Search
  const tbs = document.createElement('input'); tbs.type = 'text'; tbs.placeholder = t('common.searchEllipsis')
  tbs.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:120px'
  tbs.oninput = () => { tblSearch = tbs.value; renderTableContent(rows, el, tb) }; tb.appendChild(tbs)
  // Condition
  const tbc = document.createElement('input'); tbc.type = 'text'; tbc.placeholder = t('dashboard.conditionPlaceholderShort') || 'Amount > 100'
  tbc.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:160px'
  tbc.oninput = () => { tblCond = tbc.value; renderTableContent(rows, el, tb) }; tb.appendChild(tbc)
  // TopN
  const tbn = document.createElement('input'); tbn.type = 'number'; tbn.value = String(tblTopN); tbn.min = '5'; tbn.max = '500'
  tbn.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:60px'
  tbn.onchange = () => { tblTopN = parseInt(tbn.value) || 15; renderTableContent(rows, el, tb) }; tb.appendChild(tbn)
  // Column picker
  const ccp = document.createElement('details'); ccp.style.cssText = 'font-size:12px'
  const ccs = document.createElement('summary'); ccs.textContent = `${t('dashboard.columnsLabel')} (${tblCols.length}/${DATA.tableColumns.length})`; ccp.appendChild(ccs)
  const ccd = document.createElement('div'); ccd.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px'
  DATA.tableColumns.forEach(c => {
    const l = document.createElement('label')
    l.style.cssText = 'padding:2px 8px;border-radius:4px;font-size:11px;border:1px solid #e2e8f0;cursor:pointer;user-select:none;' + (tblCols.includes(c) ? 'background:#3B82F6;color:white;border-color:#3B82F6' : '')
    l.textContent = c
    l.onclick = () => {
      const idx = tblCols.indexOf(c)
      if (idx !== -1) tblCols.splice(idx, 1); else tblCols.push(c)
      ccs.textContent = `${t('dashboard.columnsLabel')} (${tblCols.length}/${DATA.tableColumns.length})`
      renderTableContent(rows, el, tb)
    }; ccd.appendChild(l)
  }); ccp.appendChild(ccd); tb.appendChild(ccp)
  renderTableContent(rows, el, tb)
}

function renderTableContent(rows: Record<string, string | number>[], el: HTMLElement, tb: HTMLElement) {
  const ot = el.querySelector('div:not(:first-child)'); if (ot) ot.remove()
  let filtered = rows.slice()
  if (tblSearch.trim()) {
    const q = tblSearch.trim().toLowerCase()
    filtered = filtered.filter(r => tblCols.some(c => { const v = r[c]; return v != null && String(v).toLowerCase().includes(q) }))
  }
  if (tblCond.trim()) filtered = applyConditionFilter(filtered, tblCond)
  // Sort
  const sorted = filtered.slice()
  if (sortCol) {
    sorted.sort((a, b) => {
      const va = getNumericVal(a[sortCol] as any), vb = getNumericVal(b[sortCol] as any)
      if (!isNaN(va) && !isNaN(vb)) return (va - vb) * (sortDir ? -1 : 1)
      return String(a[sortCol] ?? '').localeCompare(String(b[sortCol] ?? '')) * (sortDir ? -1 : 1)
    })
  }
  const sl = sorted.slice(0, tblTopN)
  const h3 = tb.querySelector('h3')!; h3.textContent = `${t('dashboard.dataTable')} · ${Math.min(sl.length, tblTopN)} / ${filtered.length} ${t('common.rows')}`

  const tw = document.createElement('div'); tw.style.overflowX = 'auto'
  let html = '<table><thead><tr><th class="rn">#</th>'
  tblCols.forEach(c => {
    const ind = sortCol === c ? (sortDir ? ' ↓' : ' ↑') : ''
    html += `<th onclick="window._sortTable('${c}')">${c}${ind}</th>`
  })
  html += '</tr></thead><tbody>'
  sl.forEach((r, i) => {
    html += `<tr><td class="rn">${i + 1}</td>`
    tblCols.forEach(c => {
      let v = r[c]
      if (v == null || v === '') v = '—'
      else {
        const cl = DATA.classifications[c]
        if (cl?.type === 'numeric' && cl?.role === 'metric') {
          const n = getNumericVal(v as any)
          if (!isNaN(n)) {
            const md = DATA.metricDefaults[c]
            if (md && md.format && md.format !== 'global') v = fmtByChart(n, { metricFormats: DATA.metricDefaults }, c)
            else v = fmt(n)
          }
        }
      }
      html += `<td>${v}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table>'; tw.innerHTML = html; el.appendChild(tw)
}

// Sort callback for table (exposed to window for inline onclick)
;(window as any)._sortTable = (c: string) => {
  if (sortCol === c) sortDir = !sortDir; else { sortCol = c; sortDir = false }
  refreshAll()
}

// ====== Main ======
function refreshAll() {
  const rows = getFilteredRows()
  renderKpiCards(rows)
  renderCharts(rows)
  renderTable(rows)
  const fc = document.getElementById('fc'); if (fc) fc.textContent = `${t('common.currentFilter')}: ${rows.length} ${t('common.records')}`
  updateDrInfo()
}

export function initDashboard(data: DashboardData) {
  DATA = data
  MSG = typeof __I18N__ !== 'undefined' ? __I18N__ : {}
  sortCol = data.tableSortBy; sortDir = false
  tblTopN = data.tableTopN
  tblCols = data.tableColumns.slice()
  dateStart = data.dateStart
  dateEnd = data.dateEnd
  renderFilterBar()
  renderDateRangeBar()
  refreshAll()
}

// Expose for HTML to call
;(window as any).initDashboard = initDashboard
