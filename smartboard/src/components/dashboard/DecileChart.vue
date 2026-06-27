<template>
  <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
    <h3 class="chart-title">{{ displayTitle }}</h3>
    <!-- 指标选择 -->
    <div class="metric-selector">

      <select v-model="selectedMetric" class="metric-select">
        <option v-for="m in activeMetrics" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
    <div class="chart-container" v-if="option" ref="containerRef">
      <v-chart ref="chartRef" :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize
        style="flex:1;min-height:200px" />
    </div>
    <div v-else class="no-data-msg">{{ t('chart.insufficientData', { name: t('chart.decile') }) }}</div>
    <!-- 展开明细 -->
    <div v-if="decData" class="dec-actions">
      <button class="table-toggle" @click="showTable = !showTable">
        {{ showTable ? t('common.collapse') : t('common.expand') }}
      </button>
      <button v-if="tableRows.length" class="csv-download" :class="{ done: csvDone }" :disabled="csvDone"
        @click="downloadCsv">{{ csvDone ? t('common.downloaded') : t('common.downloadCSV') }}</button>
    </div>
    <div v-if="showTable && decData" class="dec-table-wrap">
      <table class="dec-table">
        <thead>
          <tr>
            <th class="dec-th sortable" @click="toggleSort('label')">
              {{ t('chart.detailTable.group') }} {{ sortCol === 'label' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('count')">
              {{ t('chart.detailTable.count') }} {{ sortCol === 'count' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('sum')">
              {{ t('chart.detailTable.sum') }} {{ sortCol === 'sum' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('avg')">
              {{ t('chart.detailTable.avg') }} {{ sortCol === 'avg' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th">{{ t('chart.detailTable.range') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.label">
            <td class="dec-td">{{ row.label }}</td>
            <td class="dec-td dec-num">{{ row.count }}</td>
            <td class="dec-td dec-num">{{ fmtValue(row.sum) }}</td>
            <td class="dec-td dec-num">{{ fmtValue(row.avg) }}</td>
            <td class="dec-td">{{ row.range }}</td>
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
import { BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, ToolboxComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { resolveTitle, buildToolbox, fmtByChart } from '@/core/chart-options'
import { useChartDownload } from '@/composables/use-chart-download'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { useTheme } from '@/composables/use-theme'
import { fetchDeciles } from '@/core/analysis'
import type { DecileData } from '@/core/analysis'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
use([CanvasRenderer, BarChart, LineChart, TooltipComponent, LegendComponent, GridComponent, ToolboxComponent])

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
  metric: string
  metrics?: string[]
  title?: string
  metricFormats?: Record<string, { format?: string; unit?: string; prefix?: string }>
  metricAggs?: Record<string, string>
}>()

const selectedMetric = ref(props.metric)
const displayTitle = computed(() => resolveTitle(props.title || t('chart.decile'), selectedMetric.value ? [selectedMetric.value] : []))
watch(() => props.metric, (v) => { selectedMetric.value = v })

const activeMetrics = computed(() =>
  props.metrics && props.metrics.length > 0 ? props.metrics : [props.metric],
)

// Async data fetching — Rust when Tauri, JS fallback otherwise
const decData = ref<DecileData | null>(null)
const decError = ref('')

async function refreshDecData() {
  decError.value = ''
  try {
    decData.value = await fetchDeciles(props.rows, selectedMetric.value)
  } catch (e: any) {
    decError.value = e?.message || String(e)
    decData.value = null
  }
}

watch(
  () => [props.rows, selectedMetric.value] as const,
  () => { refreshDecData() },
  { immediate: true },
)

const chartMeta = computed(() => ({
  format: '', unit: 'yuan',
  metricFormats: props.metricFormats || {},
}))

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function fmtValue(n: number): string {
  return fmtByChart(n, chartMeta.value, selectedMetric.value)
}

const option = computed(() => {
  const dd = decData.value
  if (!dd || dd.labels.length === 0) return null

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
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => {
          const v = p.seriesName === t('chart.series.count') ? p.value.toLocaleString('zh-CN') : fmtValue(p.value)
          return `${p.seriesName}: ${v}`
        }).join('<br/>')
      },
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 60, top: 50, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dd.labels,
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        position: 'left',
        name: t('chart.series.sum'),
        axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) },
      },
      {
        type: 'value',
        position: 'right',
        name: t('chart.series.count'),
        splitLine: { show: false },
        axisLabel: { fontSize: 10 },
      },
    ],
    series: [
      {
        name: t('chart.series.sum'),
        type: 'bar',
        yAxisIndex: 0,
        data: dd.sums,
        itemStyle: { color: '#3B82F6', borderRadius: [3, 3, 0, 0] },
        z: 2,
      },
      {
        name: t('chart.series.count'),
        type: 'line',
        yAxisIndex: 1,
        data: dd.counts,
        lineStyle: { color: '#EF4444', width: 2 },
        itemStyle: { color: '#EF4444' },
        smooth: true,
        symbolSize: 8,
        z: 1,
      },
    ],
  }
})
// ====== Data table ======
const showTable = ref(false)
const sortCol = ref<'label' | 'count' | 'sum' | 'avg'>('label')
const sortDir = ref<'asc' | 'desc'>('asc')

function toggleSort(col: 'label' | 'count' | 'sum' | 'avg') {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortCol.value = col
    sortDir.value = col === 'label' ? 'asc' : 'desc'
  }
}

interface DecRow { label: string; count: number; sum: number; avg: number; range: string }

const tableRows = computed<DecRow[]>(() => {
  const dd = decData.value
  if (!dd) return []

  const rows: DecRow[] = dd.labels.map((lbl, i) => ({
    label: lbl,
    count: dd.counts[i],
    sum: dd.sums[i],
    avg: dd.avgs[i],
    range: dd.ranges[i],
  }))

  const col = sortCol.value
  const dir = sortDir.value === 'desc' ? -1 : 1
  rows.sort((a, b) => {
    if (col === 'label') return a.label.localeCompare(b.label) * dir
    return (a[col] - b[col]) * dir
  })

  return rows
})

async function downloadCsv() {
  const BOM = '\uFEFF'
  const header = t('chart.csvHeaders.decile')
  const lines = tableRows.value.map(r =>
    [r.label, r.count, r.sum, r.avg, r.range].join(',')
  )
  const csv = BOM + header + '\n' + lines.join('\n')
  const filePath = await save({
    defaultPath: `decile_${new Date().toISOString().slice(0, 10)}.csv`,
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
.metric-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.metric-selector label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.metric-select {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-primary);
  min-width: 120px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.dec-actions {
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

.dec-table-wrap {
  margin-top: 10px;
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.dec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.dec-th {
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

.dec-th:first-child {
  border-left: none;
}

.dec-th:nth-child(n+2) {
  text-align: right;
}

.dec-th.sortable {
  cursor: pointer;
}

.dec-th.sortable:hover {
  color: var(--primary);
}

.dec-td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  border-left: 1px dashed var(--border-light);
}

.dec-td:first-child {
  border-left: none;
}

.dec-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dec-table tbody tr:hover {
  background: var(--bg-hover);
}

.no-data-msg {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
