<template>
  <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
    <h3 class="chart-title">{{ displayTitle }}</h3>
    <!-- 轴选择器（3+ 指标时显示） -->
    <div v-if="availableAxes.length > 2" class="axis-selector">
      <div class="axis-group">
        <label>{{ t('chart.xAxis') }}</label>
        <select v-model="xCol" class="axis-select">
          <option v-for="col in availableAxes" :key="col" :value="col">{{ col }}</option>
        </select>
      </div>
      <div class="axis-group">
        <label>{{ t('chart.yAxis') }}</label>
        <select v-model="yCol" class="axis-select">
          <option v-for="col in availableAxes" :key="col" :value="col">{{ col }}</option>
        </select>
      </div>
    </div>
    <!-- 图表 -->
    <div class="chart-container" v-if="option" ref="containerRef">
      <v-chart ref="chartRef" :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize
        style="flex:1;min-height:200px" />
    </div>
    <div v-else class="no-data-msg">{{ t('chart.insufficientData', { name: t('chart.cluster') }) }}</div>
    <!-- 展开明细 -->
    <div v-if="clusterData" class="cluster-actions">
      <button class="table-toggle" @click="showTable = !showTable">
        {{ showTable ? t('common.collapse') : t('common.expand') }}
      </button>
      <button v-if="tableRows.length" class="csv-download" :class="{ done: csvDone }" :disabled="csvDone"
        @click="downloadCsv">{{ csvDone ? t('common.downloaded') : t('common.downloadCSV') }}</button>
    </div>
    <div v-if="showTable && clusterData" class="cluster-table-wrap">
      <!-- 聚类汇总 -->
      <div class="cluster-summary">
        <span v-for="(s, i) in clusterSummary" :key="i" class="summary-chip" :style="{ borderColor: clusterColor(i) }">
          <strong>{{ t('chart.detailTable.clusterCol') }} {{ i + 1 }}</strong>
          {{ s.count }} {{ t('chart.detailTable.points') }} · {{ t('chart.detailTable.clusterCenter') }} ({{
            fmtValue(s.cx, clusterData.colX) }}, {{ fmtValue(s.cy, clusterData.colY) }})
        </span>
      </div>
      <!-- 明细表 -->
      <table class="cluster-table">
        <thead>
          <tr>
            <th class="cl-th">{{ t('chart.detailTable.label') }}</th>
            <th class="cl-th sortable" @click="toggleSort('x')">
              {{ clusterData.colX }} {{ sortCol === 'x' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="cl-th sortable" @click="toggleSort('y')">
              {{ clusterData.colY }} {{ sortCol === 'y' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="cl-th sortable" @click="toggleSort('cluster')">
              {{ t('chart.detailTable.clusterCol') }} {{ sortCol === 'cluster' ? (sortDir === 'desc' ? '↓' : '↑') : ''
              }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in tableRows" :key="i">
            <td class="cl-td">{{ row.label }}</td>
            <td class="cl-td cl-num">{{ fmtValue(row.x, clusterData?.colX || '') }}</td>
            <td class="cl-td cl-num">{{ fmtValue(row.y, clusterData?.colY || '') }}</td>
            <td class="cl-td cl-num">
              <span class="cluster-badge"
                :style="{ background: clusterColor(row.cluster) + '22', color: clusterColor(row.cluster), borderColor: clusterColor(row.cluster) }">
                {{ row.cluster + 1 }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, ToolboxComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { resolveTitle, buildToolbox, fmtByChart } from '@/core/chart-options'
import { useChartDownload } from '@/composables/use-chart-download'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { useTheme } from '@/composables/use-theme'
import { computeClusters } from '@/core/analysis'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
use([CanvasRenderer, ScatterChart, TooltipComponent, LegendComponent, GridComponent, ToolboxComponent])

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
]

const { theme } = useTheme()
const { downloadPNG, downloadCSV } = useChartDownload()

// Fullscreen
const wrapRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const isFullscreen = ref(false)
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) { document.addEventListener('keydown', onFullscreenEsc) }
  else { document.removeEventListener('keydown', onFullscreenEsc) }
}
function onFullscreenEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') { isFullscreen.value = false; document.removeEventListener('keydown', onFullscreenEsc) }
}

const props = defineProps<{
  rows: Record<string, string | number>[]
  metrics: string[]
  k?: number
  title?: string
  metricFormats?: Record<string, { format?: string; unit?: string; prefix?: string }>
  metricAggs?: Record<string, string>
}>()

const availableAxes = computed(() => props.metrics || [])
const xCol = ref(availableAxes.value[0] || '')
const yCol = ref(availableAxes.value[1] || availableAxes.value[0] || '')

const displayTitle = computed(() => resolveTitle(props.title || t('chart.cluster'), [xCol.value, yCol.value].filter(Boolean)))

// 当 metrics 改变时更新轴
watch(availableAxes, (axes) => {
  if (!axes.includes(xCol.value)) xCol.value = axes[0] || ''
  if (!axes.includes(yCol.value)) yCol.value = axes[1] || axes[0] || ''
}, { immediate: true })

const clusterData = computed(() =>
  computeClusters(props.rows, props.metrics, props.k || 3, xCol.value, yCol.value),
)

const chartMeta = computed(() => ({
  format: '', unit: 'yuan',
  metricFormats: props.metricFormats || {},
}))

function fmtValue(n: number, metricName?: string): string {
  return fmtByChart(n, chartMeta.value, metricName || '')
}

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

const option = computed(() => {
  const cd = clusterData.value
  if (!cd || cd.points.length === 0) return null

  // 按聚类分组
  const clusterMap: Record<number, { x: number; y: number; label: string }[]> = {}
  for (const p of cd.points) {
    if (!clusterMap[p.cluster]) clusterMap[p.cluster] = []
    clusterMap[p.cluster].push({ x: p.x, y: p.y, label: p.label })
  }

  const series: any[] = []
  const clusterIds = Object.keys(clusterMap).map(Number).sort((a, b) => a - b)

  for (let ci = 0; ci < clusterIds.length; ci++) {
    const cid = clusterIds[ci]
    const pts = clusterMap[cid]
    series.push({
      name: t('chart.series.clusterN', { n: String(cid + 1) }),
      type: 'scatter',
      data: pts.map((p) => [p.x, p.y]),
      symbolSize: 8,
      itemStyle: {
        color: COLORS[ci % COLORS.length] + '99',
        borderColor: COLORS[ci % COLORS.length],
        borderWidth: 1,
      },
    })
  }

  // 聚类中心
  if (cd.centroids.length > 0) {
    series.push({
      name: t('chart.series.clusterCenter'),
      type: 'scatter',
      data: cd.centroids.map((c) => [c.x, c.y]),
      symbolSize: 18,
      symbol: 'diamond',
      itemStyle: { color: '#1a202c', borderColor: '#fff', borderWidth: 2 },
      z: 10,
    })
  }

  const tb = buildToolbox()
  Object.assign(tb.feature, {
    mySaveAsImage: { title: '💾 PNG', show: true, icon: 'path://M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h2v2H8v-2zm0-4h2v2H8v-2zm4 4h2v2h-2v-2zm0-4h2v2h-2v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadPNG(ci) } },
    mySaveCSV: { title: '📄 CSV', show: true, icon: 'path://M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm0 2h7v5h5v11H6V4zm2 4h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadCSV(ci, ci.getOption()) } },
  })
  delete tb.feature.saveAsImage
  return {
    _mf: props.metricFormats || {},
    toolbox: tb,
    tooltip: {
      formatter: (params: any) => {
        const [x, y] = params.value
        return `${params.seriesName}<br/>${cd.colX}: ${fmtValue(x, cd.colX)}<br/>${cd.colY}: ${fmtValue(y, cd.colY)}`
      },
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 80, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: 'value',
      name: cd.colX,
      nameLocation: 'center',
      nameGap: 34,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold' },
      axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) },
    },
    yAxis: {
      type: 'value',
      name: cd.colY,
      nameLocation: 'center',
      nameGap: 56,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold' },
      axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) },
    },
    series,
  }
})
// ====== Data table ======
const showTable = ref(false)
const sortCol = ref<'x' | 'y' | 'cluster'>('cluster')
const sortDir = ref<'asc' | 'desc'>('asc')

function toggleSort(col: 'x' | 'y' | 'cluster') {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortCol.value = col
    sortDir.value = col === 'cluster' ? 'asc' : 'desc'
  }
}

function clusterColor(i: number): string {
  return COLORS[i % COLORS.length]
}

const clusterSummary = computed(() => {
  const cd = clusterData.value
  if (!cd) return []
  const map: Record<number, { count: number; sx: number; sy: number }> = {}
  for (const p of cd.points) {
    if (!map[p.cluster]) map[p.cluster] = { count: 0, sx: 0, sy: 0 }
    map[p.cluster].count++
    map[p.cluster].sx += p.x
    map[p.cluster].sy += p.y
  }
  return Object.keys(map).map(Number).sort((a, b) => a - b).map((cid) => {
    const s = map[cid]
    return { count: s.count, cx: s.sx / s.count, cy: s.sy / s.count }
  })
})

interface ClusterRow { label: string; x: number; y: number; cluster: number }

const tableRows = computed<ClusterRow[]>(() => {
  const cd = clusterData.value
  if (!cd) return []

  const rows: ClusterRow[] = cd.points.map((p) => ({
    label: p.label,
    x: p.x,
    y: p.y,
    cluster: p.cluster,
  }))

  const col = sortCol.value
  const dir = sortDir.value === 'desc' ? -1 : 1
  rows.sort((a, b) => (a[col] - b[col]) * dir)

  return rows
})

async function downloadCsv() {
  const BOM = '\uFEFF'
  const cd = clusterData.value
  const header = t('chart.csvHeaders.cluster', { cols: (cd?.colX || 'X') + ',' + (cd?.colY || 'Y') })
  const lines = tableRows.value.map(r =>
    [r.label, r.x, r.y, t('chart.series.clusterN', { n: String(r.cluster + 1) })].join(',')
  )
  const csv = BOM + header + '\n' + lines.join('\n')
  const filePath = await save({
    defaultPath: `cluster_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
  })
  if (filePath) {
    await writeTextFile(filePath, csv)
    csvDone.value = true
    setTimeout(() => { csvDone.value = false }, 1500)
  }
}
const csvDone = ref(false)
</script>

<style scoped>
.axis-selector {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.axis-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.axis-group label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.axis-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-primary);
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.no-data-msg {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.cluster-actions {
  margin-top: 10px;
}

.table-toggle {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.table-toggle:hover {
  text-decoration: underline;
}

.cluster-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}

.summary-chip {
  padding: 4px 12px;
  border-radius: 16px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-chip strong {
  color: var(--text-primary);
  margin-right: 4px;
}

.cluster-table-wrap {
  overflow-x: auto;
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.cluster-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.cl-th {
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--border);
  border-left: 1px dashed var(--border-light);
  font-weight: 600;
  color: var(--text-secondary);
  z-index: 1;
}

.cl-th:first-child {
  border-left: none;
}

.cl-th:nth-child(n+2) {
  text-align: right;
}

.cl-th.sortable {
  cursor: pointer;
}

.cl-th.sortable:hover {
  color: var(--primary);
}

.cl-td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  border-left: 1px dashed var(--border-light);
}

.cl-td:first-child {
  border-left: none;
}

.cl-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cluster-table tbody tr:hover {
  background: var(--bg-hover);
}

.cluster-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
}
</style>
