<template>
  <div class="dashboard-view">
    <div v-if="!spec" class="no-data">
      <p>请先配置 Dashboard</p>
      <button class="btn btn-primary" @click="$router.push('/config')">返回配置</button>
    </div>

    <template v-else>
      <!-- 工具栏 -->
      <div class="dashboard-toolbar">
        <button class="btn btn-ghost" @click="$router.push('/config')">← 返回配置</button>
        <h2 class="dashboard-title">{{ spec.title }}</h2>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div v-for="f in spec.filters" :key="f.column" class="filter-item">
          <label>{{ f.column }}</label>
          <select v-model="previewStore.filterValues[f.column]" @change="onFilterChange"
            class="input input-sm filter-select">
            <option value="__all__">全部</option>
            <option v-for="opt in previewStore.getFilterOptions(f.column)" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </div>
        <div class="filter-item">
          <label>搜索</label>
          <input type="text" v-model="previewStore.searchText" @input="onFilterChange"
            class="input input-sm search-input" placeholder="输入关键字..." />
        </div>
        <div class="filter-item">
          <label>条件</label>
          <input type="text" v-model="previewStore.conditionFilter" @input="onFilterChange"
            class="input input-sm condition-input" list="condition-cols" placeholder="如: 金额 > 100 | 金额 < 10" />
          <datalist id="condition-cols">
            <template v-for="col in allHeaders" :key="col">
              <option :value="col + ' = '" />
              <option :value="col + ' != '" />
              <option v-if="isNumericCol(col)" :value="col + ' > '" />
              <option v-if="isNumericCol(col)" :value="col + ' < '" />
              <option v-if="!isNumericCol(col)" :value="col + ' in '" />
              <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
            </template>
          </datalist>
        </div>
        <div class="filter-actions">
          <button class="btn btn-sm btn-reset" @click="resetFilters">重置筛选</button>
          <button class="btn btn-sm btn-clear" @click="clearDashboard">Clear</button>
          <button class="btn btn-sm btn-save" @click="saveDashboard">Save</button>
        </div>
        <span class="filter-count">当前筛选: {{ previewStore.rowCount }} 条记录</span>
      </div>

      <!-- 日期范围 -->
      <div v-if="spec.dateRange" class="date-range-bar">
        <span class="dr-label">时间切片: {{ spec.dateRange.column }}</span>
        <VueDatePicker v-model="dateStart" :min-date="spec.dateRange.min" :max-date="spec.dateRange.max"
          :time-picker="false" model-type="yyyy-MM-dd" :formats="{ input: 'yyyy/MM/dd' }" placeholder="开始日期"
          :locale="zhCN" :dark="theme === 'dark'" auto-apply :teleport="true" />
        <span class="dr-sep">至</span>
        <VueDatePicker v-model="dateEnd" :min-date="spec.dateRange.min" :max-date="spec.dateRange.max"
          :time-picker="false" model-type="yyyy-MM-dd" :formats="{ input: 'yyyy/MM/dd' }" placeholder="结束日期"
          :locale="zhCN" :dark="theme === 'dark'" auto-apply :teleport="true" />
        <span class="dr-info">{{ dateRangeCount }} / {{ totalRows }} 条</span>
        <div class="dr-presets">
          <button v-for="p in datePresets" :key="p.months" class="dr-preset"
            :class="{ active: isDatePresetActive(p.months) }" @click="applyDatePreset(p.months)">
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- 已清空提示 -->
      <div v-if="dashboardCleared" class="cleared-msg">
        Dashboard 已清空 — 拖拽上传 CSV / Excel 文件或点击"重置筛选"恢复数据
      </div>

      <template v-if="!dashboardCleared">
        <!-- KPI 卡片 -->
        <div v-if="spec.kpis.length > 0" class="kpi-grid">
          <div v-for="(kpi, i) in spec.kpis" :key="i" class="kpi-card"
            :style="{ background: KPI_BG[i % KPI_BG.length], color: KPI_TEXT[i % KPI_TEXT.length] }">
            <div class="kpi-icon">
              <span>{{ kpiIcon(kpi, i) }}</span>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ formatKpiValue(previewStore.computeKpiValue(kpi), kpi.format, kpi.prefix, kpi.unit, kpi.decimals)
              }}</span>
              <span class="kpi-label">{{ kpi.label }}</span>
            </div>
          </div>
        </div>

        <!-- 图表网格 -->
        <div class="charts-grid">
          <div v-for="(chart, i) in spec.charts" :key="i" class="chart-card resizable-card"
            :class="{ 'chart-card-full': isAnalysisChart(chart) }" v-show="!chart._skip">
            <div class="rs-handle rs-handle-e" @pointerdown.prevent="onResizeStart($event, 'e')"></div>
            <div class="rs-handle rs-handle-s" @pointerdown.prevent="onResizeStart($event, 's')"></div>
            <div class="rs-handle rs-handle-se" @pointerdown.prevent="onResizeStart($event, 'se')"></div>

            <!-- 时序分析 -->
            <template v-if="chart.type === 'timeseries'">
              <TimeseriesChart :rows="filteredChartRows(chart)" :date-column="chart.dateColumn || spec.dateRange?.column || ''"
                :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics && chart.metrics.length > 0 ? chart.metrics : allMetricCols"
                :title="chart.title"
                :metric-formats="chart.metricFormats || {}"
                :metric-ags="chart.metricAggs || {}" />
            </template>

            <!-- 十分位分析 -->
            <template v-else-if="chart.type === 'decile'">
              <DecileChart :rows="filteredChartRows(chart)" :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics && chart.metrics.length > 0 ? chart.metrics : allMetricCols"
                :title="chart.title"
                :metric-formats="chart.metricFormats || {}"
                :metric-ags="chart.metricAggs || {}" />
            </template>

            <!-- 聚类分析 -->
            <template v-else-if="chart.type === 'cluster'">
              <ClusterChart :rows="filteredChartRows(chart)"
                :metrics="chart.clusterMetrics || chart.metrics || (spec.primaryMetric ? [spec.primaryMetric] : [])"
                :k="chart.k"
                :title="chart.title"
                :metric-formats="chart.metricFormats || {}"
                :metric-ags="chart.metricAggs || {}" />
            </template>

            <!-- 基础图表 -->
            <template v-else-if="chart.type === 'bar'">
              <BarChartComponent :chart="chart" :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
            <template v-else-if="chart.type === 'horizontal_bar'">
              <HorizontalBarChart :chart="chart" :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
            <template v-else-if="chart.type === 'doughnut'">
              <DoughnutChart :chart="chart" :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
            <template v-else-if="chart.type === 'histogram'">
              <HistogramChart :chart="chart" :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
            <template v-else-if="chart.type === 'line'">
              <LineChartComponent :chart="chart" :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
          </div>
        </div>

        <!-- 数据表 -->
        <div v-if="spec.table" class="data-table-section resizable-card">
          <div class="rs-handle rs-handle-e" @pointerdown.prevent="onResizeStart($event, 'e')"></div>
          <div class="rs-handle rs-handle-s" @pointerdown.prevent="onResizeStart($event, 's')"></div>
          <div class="rs-handle rs-handle-se" @pointerdown.prevent="onResizeStart($event, 'se')"></div>
          <div class="table-toolbar">
            <h3>数据表 · {{ tableRows.length }}<span v-if="tableSearch.trim()"> (匹配)</span> / {{ activeTopN }} 行</h3>
            <div class="table-controls">
              <div class="control-group">
                <input type="text" v-model="tableSearch" class="input input-xs table-search" placeholder="搜索..." />
                <button v-if="tableSearch" class="search-clear" @click="tableSearch = ''">✕</button>
              </div>
              <div class="control-group">
                <label>条件</label>
                <input type="text" v-model="tableCondition" class="input input-xs table-cond" list="table-cond-cols"
                  placeholder="金额 > 100 | 金额 < 10" />
                <datalist id="table-cond-cols">
                  <template v-for="col in allHeaders" :key="col">
                    <option :value="col + ' = '" />
                    <option :value="col + ' != '" />
                    <option v-if="isNumericCol(col)" :value="col + ' > '" />
                    <option v-if="isNumericCol(col)" :value="col + ' < '" />
                    <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                    <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
                  </template>
                </datalist>
              </div>
              <div class="control-group">
                <label>行数</label>
                <input type="number" v-model.number="activeTopN" class="input input-xs table-input" min="5" max="500"
                  step="5" />
              </div>
              <div class="control-group col-picker" v-if="showColPicker">
                <div class="picker-panel">
                  <div class="picker-actions">
                    <button class="btn-link" @click="activeColumns = allColumns.slice()">全选</button>
                    <button class="btn-link" @click="activeColumns = []">清空</button>
                  </div>
                  <div class="picker-chips">
                    <label v-for="col in allColumns" :key="col" class="chip sm picker-chip"
                      :class="{ active: activeColumns.includes(col) }">
                      <input type="checkbox" :checked="activeColumns.includes(col)" @change="toggleActiveColumn(col)"
                        hidden />
                      {{ col }}
                    </label>
                  </div>
                </div>
              </div>
              <button class="btn btn-sm" @click="showColPicker = !showColPicker">
                列 ({{ activeColumns.length }}/{{ allColumns.length }})
              </button>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="row-num">#</th>
                  <th v-for="col in activeColumns" :key="col" @click="toggleSort(col)" class="sortable">
                    {{ col }}
                    <span v-if="sortCol === col" class="sort-indicator">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in tableRows" :key="i">
                  <td class="row-num">{{ i + 1 }}</td>
                  <td v-for="col in activeColumns" :key="col">
                    {{ formatCellValue(row[col], col) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent,
  MarkPointComponent, GraphicComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { zhCN } from 'date-fns/locale'
import TimeseriesChart from '@/components/dashboard/TimeseriesChart.vue'
import DecileChart from '@/components/dashboard/DecileChart.vue'
import ClusterChart from '@/components/dashboard/ClusterChart.vue'
import BarChartComponent from '@/components/dashboard/BarChart.vue'
import HorizontalBarChart from '@/components/dashboard/HorizontalBarChart.vue'
import DoughnutChart from '@/components/dashboard/DoughnutChart.vue'
import HistogramChart from '@/components/dashboard/HistogramChart.vue'
import LineChartComponent from '@/components/dashboard/LineChart.vue'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { usePreviewStore } from '@/stores/preview-store'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { ChartSpec, KpiSpec } from '@/types/spec'
import echartsCode from 'echarts/dist/echarts.min.js?raw'
import { useTheme } from '@/composables/use-theme'
import { applyFilter } from '@/core/filter'

use([
  CanvasRenderer, BarChart, PieChart, LineChart, ScatterChart,
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent,
  MarkPointComponent, GraphicComponent,
])

const router = useRouter()
const dataStore = useDataStore()
const { theme } = useTheme()

// ====== Resize handles ======
let resizeDir: 'e' | 's' | 'se' = 'se'
let resizeSX = 0, resizeSY = 0, resizeSW = 0, resizeSH = 0
let resizeTarget: HTMLElement | null = null

function onResizeStart(e: PointerEvent, dir: 'e' | 's' | 'se') {
  resizeDir = dir
  resizeSX = e.clientX
  resizeSY = e.clientY
  resizeTarget = (e.target as HTMLElement).closest('.resizable-card') as HTMLElement
  if (!resizeTarget) return
  resizeSW = resizeTarget.offsetWidth
  resizeSH = resizeTarget.offsetHeight
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  if (!resizeTarget) return
  const dx = e.clientX - resizeSX
  const dy = e.clientY - resizeSY
  if (resizeDir === 'e' || resizeDir === 'se') {
    resizeTarget.style.width = Math.max(280, resizeSW + dx) + 'px'
    resizeTarget.style.flex = 'none'
  }
  if (resizeDir === 's' || resizeDir === 'se') {
    resizeTarget.style.height = Math.max(200, resizeSH + dy) + 'px'
  }
}

function onResizeEnd() {
  resizeTarget = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
}
const configStore = useConfigStore()
const previewStore = usePreviewStore()

const spec = computed(() => previewStore.buildSpec())

const sortCol = ref('')
const sortDir = ref<'asc' | 'desc'>('desc')

// ====== Table controls (runtime, not stored in config) ======
const activeColumns = ref<string[]>([])
const activeTopN = ref(15)
const showColPicker = ref(false)
const tableSearch = ref('')
const tableCondition = ref('')

// Available columns from the dataset
const allColumns = computed(() => dataStore.dataSet?.headers ?? [])

/** 判断列是否为数值类型（数值列用 > <，非数值列用 in ~） */
function isNumericCol(col: string): boolean {
  return dataStore.dataSet?.classifications[col]?.type === 'numeric'
}

// Initialize table state from spec
function initTableState() {
  const s = spec.value
  if (s?.table) {
    activeColumns.value = s.table.columns.slice()
    activeTopN.value = s.table.topN
    sortCol.value = s.table.sortBy
  }
}

function toggleActiveColumn(col: string) {
  const idx = activeColumns.value.indexOf(col)
  if (idx !== -1) {
    activeColumns.value.splice(idx, 1)
  } else {
    activeColumns.value.push(col)
  }
}

import { COLORS, fmt, fmtCompact, getNumericVal, fmtByChart } from '@/core/chart-options'

// KPI card colors — theme-aware
const KPI_BG_LIGHT = ['#EBF5FF', '#ECFDF5', '#FFFBEB', '#FEF2F2', '#F5F3FF', '#ECFEFF']
const KPI_TEXT_LIGHT = ['#1e40af', '#065f46', '#92400e', '#991b1b', '#5b21b6', '#155e75']
const KPI_BG_DARK = ['#1a2740', '#1a3328', '#332818', '#331a1a', '#262040', '#1a2840']
const KPI_TEXT_DARK = ['#93c5fd', '#6ee7b7', '#fcd34d', '#fca5a5', '#c4b5fd', '#67e8f9']

const KPI_BG = computed(() => theme.value === 'dark' ? KPI_BG_DARK : KPI_BG_LIGHT)
const KPI_TEXT = computed(() => theme.value === 'dark' ? KPI_TEXT_DARK : KPI_TEXT_LIGHT)

// ====== Date picker bridge (local ref ↔ store) ======
const dateStart = ref(previewStore.dateRange.start)
const dateEnd = ref(previewStore.dateRange.end)

watch(dateStart, (v) => {
  if (v !== previewStore.dateRange.start) {
    previewStore.dateRange.start = v
    onFilterChange()
  }
})
watch(dateEnd, (v) => {
  if (v !== previewStore.dateRange.end) {
    previewStore.dateRange.end = v
    onFilterChange()
  }
})
watch(() => previewStore.dateRange.start, (v) => { if (v !== dateStart.value) dateStart.value = v })
watch(() => previewStore.dateRange.end, (v) => { if (v !== dateEnd.value) dateEnd.value = v })

// ====== Init ======
onMounted(() => {
  previewStore.applyFilters()
  initTableState()
})

function onFilterChange() {
  previewStore.applyFilters()
}

// ====== Filter bar actions ======
const dashboardCleared = ref(false)

function resetFilters() {
  for (const key of Object.keys(previewStore.filterValues)) {
    previewStore.filterValues[key] = '__all__'
  }
  previewStore.searchText = ''
  previewStore.conditionFilter = ''
  if (spec.value?.dateRange) {
    previewStore.dateRange.start = spec.value.dateRange.min
    previewStore.dateRange.end = spec.value.dateRange.max
  }
  dashboardCleared.value = false
  previewStore.applyFilters()
}

function clearDashboard() {
  dashboardCleared.value = true
  previewStore.filteredRows = []
}

async function saveDashboard() {
  const ds = dataStore.dataSet
  if (!ds) return
  const s = spec.value
  if (!s) return

  const rows = previewStore.filteredRows.length > 0
    ? previewStore.filteredRows : ds.rows
  const headers = ds.headers
  const cls = ds.classifications
  const title = s.title || 'Dashboard'

  const filterSpecs = s.filters.map(f => ({ column: f.column }))
  const kpiSpecs = s.kpis.map(k => ({
    column: k.column, label: k.label, agg: k.agg,
    format: k.format, prefix: k.prefix || '', unit: k.unit || 'yuan',
    decimals: k.decimals,
  }))
  // 全部指标列（当 chart.metrics 为空时回退使用，排除已排除的列）
  const allMetricCols = headers.filter((h) => cls[h]?.role === 'metric' && !dataStore.excludedColumns.has(h))

  const chartSpecs = s.charts
    .filter(c => !c._skip)
    .map(c => ({
      type: c.type, title: c.title,
      dimension: c.dimension || '', metric: c.metric || '',
      metrics: (c.metrics && c.metrics.length > 0) ? c.metrics : allMetricCols,
      dateColumn: c.dateColumn || '',
      agg: c.agg || 'sum',
      clusterMetrics: (c.clusterMetrics && c.clusterMetrics.length > 0) ? c.clusterMetrics : allMetricCols,
      k: c.k || 3,
      filter: c.filter || '',
      format: c.format || '',
      unit: c.unit || 'yuan',
      metricFormats: c.metricFormats || {},
      metricAggs: c.metricAggs || {},
    }))
  const tblCols = s.table.columns
  const tblSort = s.table.sortBy
  const tblTopN = s.table.topN
  const date = new Date().toISOString().slice(0, 10)

  // 编译期内联 ECharts，无需 CDN 或文件读取
  const echartsTag = '<script>' + echartsCode + '<\/script>'

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${echartsTag}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f8fc;color:#1a202c;padding:24px}
.container{max-width:1400px;margin:0 auto}
h1{font-size:24px;font-weight:700;margin-bottom:20px}
.filter-bar{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;align-items:center;
  background:white;border-radius:12px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.filter-bar label{font-size:13px;color:#4a5568;font-weight:500}
.filter-bar select{padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:white;cursor:pointer}
.btn{padding:8px 16px;border:1px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer;font-size:13px;transition:all .2s}
.btn:hover{background:#f7fafc}
.btn-clear{color:#e53e3e;border-color:#fed7d7}.btn-clear:hover{background:#fff5f5}
.filter-count{font-size:12px;color:#718096;margin-left:auto}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-bottom:24px}
.kpi-card{display:flex;align-items:center;gap:14px;padding:18px;border-radius:12px;border:1px solid #e2e8f0}
.kpi-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.6);font-size:20px}
.kpi-content{display:flex;flex-direction:column}
.kpi-label{font-size:12px;opacity:.7;margin-top:2px}
.charts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px;margin-bottom:24px}
.chart-card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px}
.chart-card h3{font-size:14px;font-weight:600;margin-bottom:12px}
.chart-body{position:relative;height:320px}
.chart-body-ts{position:relative;height:360px}
.chart-body-cl{position:relative;height:380px}
.chart-card-full{grid-column:1/-1}
.chart-card.is-fullscreen{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#fff;padding:24px}
.chart-card.is-fullscreen .chart-body,.chart-card.is-fullscreen .chart-body-ts,.chart-card.is-fullscreen .chart-body-cl{flex:1;min-height:0;height:auto}
.kpi-value{font-size:22px;font-weight:700;line-height:1.2;word-break:break-all}
.table-card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;overflow-x:auto;margin-top:24px}
.table-card h3{font-size:15px;font-weight:600;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;font-weight:600;color:#4a5568;white-space:nowrap;cursor:pointer;user-select:none}
th:hover{color:#3B82F6}
td{padding:8px 12px;border-bottom:1px solid #edf2f7}
tbody tr:hover{background:#f7fafc}
.rn{color:#a0aec0;font-size:12px;width:40px;text-align:center}
.ts-detail-wrap{overflow-x:auto;max-height:320px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;margin-top:10px}
.detail-toggle{background:none;border:none;color:#3B82F6;font-size:12px;cursor:pointer;padding:0;margin-top:10px}
.detail-toggle:hover{text-decoration:underline}
.detail-table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}
.detail-table thead{position:sticky;top:0;background:#f7fafc;z-index:1}
.detail-table th{padding:8px 10px;border-bottom:2px solid #e2e8f0;border-left:1px dashed #e2e8f0;font-weight:600;color:#4a5568;text-align:right;white-space:nowrap}
.detail-table th:first-child{border-left:none;text-align:left}
.detail-table td{padding:6px 10px;border-bottom:1px solid #edf2f7;border-left:1px dashed #e2e8f0;text-align:right;font-variant-numeric:tabular-nums}
.detail-table td:first-child{border-left:none;text-align:left}
.detail-table tbody tr:hover{background:#f7fafc}
.ts-forecast{color:#10B981;font-style:italic}
.metric-btns{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.metric-btn{padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;background:white;color:#4a5568;font-size:12px;cursor:pointer}
.metric-btn.active{background:#3B82F6;color:white;border-color:#3B82F6}
.axis-selector{display:flex;gap:16px;margin-bottom:10px}
.axis-selector label{font-size:12px;color:#4a5568;font-weight:500}
.axis-selector select{padding:4px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:white}
.period-toggle{display:flex;gap:6px;margin-bottom:8px}
.period-btn{padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;background:white;color:#4a5568;font-size:12px;cursor:pointer}
.period-btn.active{background:#3B82F6;color:white;border-color:#3B82F6}
.ts-info{display:flex;gap:16px;align-items:center;margin-top:8px;padding:6px 0;border-top:1px solid #edf2f7;font-size:12px;color:#4a5568;flex-wrap:wrap}
.ts-info strong{font-weight:600}
.cluster-summary{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}
.summary-chip{padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;font-size:12px;color:#4a5568}
.summary-chip strong{color:#1a202c;margin-right:4px}
</style>
</head>
<body>
<div class="container">
  <h1>${title}</h1>
  <div class="filter-bar" id="filterBar"></div>
  <div class="kpi-row" id="kpiRow"></div>
  <div class="charts-grid" id="chartsGrid"></div>
  <div class="table-card" id="tableCard"></div>
</div>
<script>
var H=${JSON.stringify(headers)};
var R=${JSON.stringify(rows)};
var CLS=${JSON.stringify(cls)};
var FS=${JSON.stringify(filterSpecs)};
var KS=${JSON.stringify(kpiSpecs)};
var CS=${JSON.stringify(chartSpecs)};
var MD=${JSON.stringify(s.metricDefaults || {})};
var TC=${JSON.stringify(tblCols)};
var TS='${tblSort}';
var TN=${tblTopN};
var COL=['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#14B8A6','#6366F1','#D946EF'];
var fv={},ci=[],sc=TS,sd=false;
var condFilter='',searchText='',tblSearch='',tblCond='',tblCols=TC.slice(),tblTopN=TN;

// ---- dynamic title ----
function rTit(title,metrics){if(!title)return'';if(!metrics||!metrics.length)return title;return title.replace('{metrics}',metrics.join('、')).replace('{metric}',metrics[0])}

// ---- filter engine (支持 in / ~ contains) ----
function pF(f){if(!f||!f.trim())return null;var s=f.trim();
// in 运算符
var im=s.match(/^(.+?)\\s+(in)\\s+(.+)$/i);if(im)return{col:im[1].trim(),op:'in',val:im[3].trim()};
// contains 运算符
var cm=s.match(/^(.+?)\\s+(~|～|contains)\\s+(.+)$/i);if(cm)return{col:cm[1].trim(),op:'contains',val:cm[3].trim()};
// 标准比较运算符
var m=s.match(/^(.+?)\\s*(=|!=|>=|<=|>|<)\\s*(.+)$/);if(!m)return null;var om={'=':'eq','!=':'ne','>':'gt','>=':'gte','<':'lt','<=':'lte'};return{col:m[1].trim(),op:om[m[2]]||'eq',val:m[3].trim()}}
function mR(r,p){var cv=String(r[p.col]||'').trim();var cn=Number(cv.replace(/,/g,'')),fn=Number(p.val.replace(/,/g,''));var un=!isNaN(cn)&&!isNaN(fn);
switch(p.op){
case'eq':return un?cn===fn:cv===p.val;
case'ne':return un?cn!==fn:cv!==p.val;
case'gt':return un?cn>fn:cv>p.val;
case'gte':return un?cn>=fn:cv>=p.val;
case'lt':return un?cn<fn:cv<p.val;
case'lte':return un?cn<=fn:cv<=p.val;
case'in':{var list=p.val.replace(/^\\[|\\]$/g,'').replace(/^\\(|\\)$/g,'').replace(/["\\x27]/g,'').split(/[,，、;\\s]+/).map(function(s){return s.trim()}).filter(Boolean);return list.some(function(item){var itemNum=Number(item.replace(/,/g,''));if(!isNaN(cn)&&!isNaN(itemNum))return cn===itemNum;return cv===item})}
case'contains':return cv.toLowerCase().indexOf(p.val.toLowerCase())!==-1;
default:return true}}
function aF(rows,filter){if(!filter)return rows;var ags=filter.split('&').map(function(g){return g.trim()}).filter(function(g){return g});var res=rows.slice();
// 构建列名映射（大小写不敏感）
var cm2={};if(res.length){var ks=Object.keys(res[0]);for(var ki=0;ki<ks.length;ki++){cm2[ks[ki].toLowerCase()]=ks[ki]}}
ags.forEach(function(g){var ocs=g.split('|').map(function(c){return c.trim()}).filter(function(c){return c}).map(pF).filter(function(p){return p});
// 规范化列名
ocs.forEach(function(p){var a=cm2[p.col.toLowerCase()];if(a)p.col=a});
if(ocs.length)res=res.filter(function(r){return ocs.some(function(p){return mR(r,p)})})});return res}

function fmt(n,d){if(n==null||isNaN(n))return'0';return Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d!=null?d:2})}
function fmtC(n){if(n==null||isNaN(n))return'0';var a=Math.abs(n);if(a>=1e8)return(n/1e8).toFixed(1)+'亿';if(a>=1e4)return(n/1e4).toFixed(1)+'万';return fmt(n)}
function fmtCh(n,ch,mn){if(n==null||isNaN(n))return'0';var mf=mn&&ch.metricFormats&&ch.metricFormats[mn];var ft=mf&&mf.format&&mf.format!=='global'?mf.format:(ch.format||'');var ut=mf&&mf.unit?mf.unit:(ch.unit||'yuan');var pf=mf&&mf.prefix?mf.prefix:'';var dc=mf&&mf.decimals!=null?mf.decimals:2;if(!ft||ft==='number'||ft==='global')return fmt(n,dc);if(ft==='integer')return fmt(n,0);if(ft==='percent'){var pv=n<=1&&n>=-1?n*100:n;return pv.toFixed(dc)+'%'};if(ft==='currency'){var v2=n,s='';if(ut==='wan'){v2=n/10000;s='万'}else if(ut==='yi'){v2=n/1e8;s='亿'}return pf+fmt(v2,v2>=100?0:dc)+s}return fmt(n,dc)}
function gn(v){if(v==null||v==='')return NaN;if(typeof v==='number')return v;var s=String(v).trim();if(s.endsWith('%'))s=s.slice(0,-1);s=s.replace(/,/g,'');var n=parseFloat(s);return isNaN(n)?NaN:n}

// ---- filter ----
function gf(){var rows=R.slice();for(var e in fv){var v=fv[e];if(v&&v!=='__all__')rows=rows.filter(function(r){return String(r[e]||'').trim()===v})}
if(condFilter.trim())rows=aF(rows,condFilter);
if(searchText.trim()){var q=searchText.trim().toLowerCase();rows=rows.filter(function(r){return Object.values(r).some(function(v){return String(v).toLowerCase().includes(q)})})}
return rows}
function rf(){var bar=document.getElementById('filterBar');bar.innerHTML='';
FS.forEach(function(f){var c=f.column;var lb=document.createElement('label');lb.textContent=c+':';bar.appendChild(lb);
var sel=document.createElement('select');var uv={};R.forEach(function(r){var v=String(r[c]||'').trim();if(v)uv[v]=1});var vs=Object.keys(uv).sort();
var o0=document.createElement('option');o0.value='';o0.textContent='全部';sel.appendChild(o0);
vs.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});
sel.value=fv[c]||'';sel.onchange=function(){fv[c]=sel.value;ra()};bar.appendChild(sel)});
// condition filter
var cf=document.createElement('input');cf.type='text';cf.placeholder='条件筛选, 如: 金额 > 100 & 地区 = 北京';cf.style.cssText='padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;min-width:200px';cf.oninput=function(){condFilter=cf.value;ra()};bar.appendChild(cf);
// search
var si=document.createElement('input');si.type='text';si.placeholder='搜索...';si.style.cssText='padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:120px';si.oninput=function(){searchText=si.value;ra()};bar.appendChild(si);
var rb=document.createElement('button');rb.className='btn';rb.textContent='重置筛选';rb.onclick=function(){fv={};condFilter='';searchText='';cf.value='';si.value='';ra()};bar.appendChild(rb);
var sp=document.createElement('span');sp.className='filter-count';sp.id='fc';bar.appendChild(sp)}
function ra(){var rows=gf();rK(rows);rT(rows);try{rC(rows)}catch(e){console.error(e)}
var el=document.getElementById('fc');if(el)el.textContent='当前筛选: '+rows.length+' 条记录'}

// ---- KPI ----
function rK(rows){var el=document.getElementById('kpiRow');el.innerHTML='';
var bg=['#EBF5FF','#ECFDF5','#FFFBEB','#FEF2F2','#F5F3FF','#ECFEFF'];
var tx=['#1e40af','#065f46','#92400e','#991b1b','#5b21b6','#155e75'];
var ic=['📊','📈','📋','💰','💵','👥'];
KS.forEach(function(k,i){var vs=rows.map(function(r){var v=r[k.column];if(v==null||v==='')return 0;if(typeof v==='number')return v;var s=String(v).replace(/,/g,'').replace(/%/g,'').trim();var n=Number(s);return isNaN(n)?0:n});
var val=0;if(k.agg==='count')val=rows.length;else if(k.agg==='sum')val=vs.reduce(function(a,b){return a+b},0);else if(k.agg==='avg')val=vs.length?vs.reduce(function(a,b){return a+b},0)/vs.length:0;else if(k.agg==='min')val=Math.min.apply(null,vs);else if(k.agg==='max')val=Math.max.apply(null,vs);else val=vs.reduce(function(a,b){return a+b},0);
var dc=k.decimals!=null?k.decimals:2;var dv='';if(k.format==='percent'){var v2=(val<=1&&val>=-1)?val*100:val;dv=v2.toFixed(dc)+'%'}else if(k.format==='currency'){var cv=val,cs='';if(k.unit==='wan'){cv=val/10000;cs='万'}else if(k.unit==='yi'){cv=val/100000000;cs='亿'}dv=(k.prefix||'')+(k.prefix?'':'¥')+fmt(cv,cv>=100?0:dc)+cs}else if(k.format==='integer')dv=(k.prefix||'')+fmt(val,0);else dv=(k.prefix||'')+fmt(val,dc);
var card=document.createElement('div');card.className='kpi-card';card.style.cssText='background:'+bg[i%bg.length]+';color:'+tx[i%tx.length];
card.innerHTML='<div class="kpi-icon"><span>'+ic[i%ic.length]+'</span></div><div class="kpi-content"><span class="kpi-value">'+dv+'</span><span class="kpi-label">'+k.label+'</span></div>';el.appendChild(card)})}

// ---- aggregation helper ----
function agg(rows,dc,mc,ag){var g={};rows.forEach(function(r){var k=String(r[dc]||'未知');if(!g[k])g[k]=[];if(mc&&mc!=='count'){var v=gn(r[mc]);if(!isNaN(v))g[k].push(v)}else g[k].push(1)});
return Object.entries(g).map(function(e){var l=e[0],a=e[1];var v=0;if(!mc||mc==='count')v=a.length;else if(ag==='sum')v=a.reduce(function(x,y){return x+y},0);else if(ag==='avg')v=a.length?a.reduce(function(x,y){return x+y},0)/a.length:0;else if(ag==='min')v=Math.min.apply(null,a);else if(ag==='max')v=Math.max.apply(null,a);return{label:l,value:v}})}
// ---- apply agg to numeric array ----
function appAgg(arr,ag){if(!arr.length)return 0;switch(ag){case'sum':return arr.reduce(function(a,b){return a+b},0);case'avg':return arr.reduce(function(a,b){return a+b},0)/arr.length;case'min':return Math.min.apply(null,arr);case'max':return Math.max.apply(null,arr);case'count':return arr.length;default:return arr.reduce(function(a,b){return a+b},0)}}
function getAgg(ch,m){return(ch.metricAggs&&ch.metricAggs[m])||ch.agg||'sum'}

// ---- timeseries computation ----
function compTS(rows,dc,mc,pd){pd=pd||'month';var g={};rows.forEach(function(r){var d=String(r[dc]||'').trim();var m=d.match(/^(\\d{4})[-/.](\\d{1,2})/);if(!m)return;
  var y=m[1],mo=parseInt(m[2]);
  var key;if(pd==='year')key=y;else if(pd==='quarter')key=y+'-Q'+Math.ceil(mo/3);else key=y+'-'+String(mo).padStart(2,'0');
  if(!g[key])g[key]=[];var v=gn(r[mc]);if(!isNaN(v))g[key].push(v)});
var lb=Object.keys(g).sort();if(lb.length<2)return null;
var vals=lb.map(function(k){return g[k].reduce(function(a,b){return a+b},0)});
var ma=vals.map(function(_,i){if(i<2)return null;return(vals[i]+vals[i-1]+vals[i-2])/3});
var mom=vals.map(function(v,i){if(!i||!vals[i-1])return null;return((v-vals[i-1])/vals[i-1])*100});
var yoy=vals.map(function(v,i){if(pd==='month'&&i>=12&&vals[i-12])return((v-vals[i-12])/vals[i-12])*100;return null});
var n=vals.length,sx=0,sy=0,sxy=0,sx2=0;for(var i=0;i<n;i++){sx+=i;sy+=vals[i];sxy+=i*vals[i];sx2+=i*i}
var slope=(n*sxy-sx*sy)/(n*sx2-sx*sx||1),intercept=(sy-slope*sx)/n;
var trend=vals.map(function(_,i){return intercept+slope*i});
function nxtKey(last){if(pd==='year')return String(parseInt(last)+1);if(pd==='quarter'){var p=last.split('-Q');var q=parseInt(p[1])+1;var yr=parseInt(p[0]);if(q>4){q=1;yr++}return yr+'-Q'+q}else{var p2=last.split('-');var m2=parseInt(p2[1])+1;var yr2=parseInt(p2[0]);if(m2>12){m2=1;yr2++}return yr2+'-'+String(m2).padStart(2,'0')}}
var fl=[],fll=[],lk=lb[lb.length-1];for(var j=0;j<3;j++){lk=nxtKey(lk);fll.push(lk);fl.push(intercept+slope*(n+j))}
return{labels:lb,values:vals,ma:ma,mom:mom,yoy:yoy,trend:trend,fc:{labels:fll,values:fl}}}

// ---- decile computation ----
function compDec(rows,mc){var vals=rows.map(function(r){return gn(r[mc])}).filter(function(v){return!isNaN(v)}).sort(function(a,b){return a-b});
if(vals.length<10)return null;var n=vals.length,gs=Math.ceil(n/10),ds=[];
for(var i=0;i<10;i++){var st=i*gs,en=Math.min(st+gs,n);if(st>=n)break;var sl=vals.slice(st,en);
ds.push({label:'D'+(i+1),count:sl.length,sum:sl.reduce(function(a,b){return a+b},0),avg:sl.reduce(function(a,b){return a+b},0)/sl.length,range:fmtC(sl[0])+'–'+fmtC(sl[sl.length-1])})}return ds}

// ---- cluster computation ----
function compClust(rows,ms,k){if(ms.length<2)return null;var cA=ms[0],cB=ms[1];
var pts=[];rows.forEach(function(r){var a=gn(r[cA]),b=gn(r[cB]);if(!isNaN(a)&&!isNaN(b))pts.push({x:a,y:b,label:String(r[H[0]]||'')})});
if(pts.length<k)return null;var cents=[];var seen={};for(var i=0;i<k;i++){var idx;do{idx=Math.floor(Math.random()*pts.length)}while(seen[idx]&&Object.keys(seen).length<pts.length);seen[idx]=true;cents.push({x:pts[idx].x,y:pts[idx].y})}
for(var it=0;it<20;it++){pts.forEach(function(p){var md=1e18,mc=0;cents.forEach(function(c,ci){var d=(p.x-c.x)*(p.x-c.x)+(p.y-c.y)*(p.y-c.y);if(d<md){md=d;mc=ci}});p.cluster=mc});
cents=cents.map(function(_,ci){var cp=pts.filter(function(p){return p.cluster===ci});if(!cp.length)return cents[ci];return{x:cp.reduce(function(s,p){return s+p.x},0)/cp.length,y:cp.reduce(function(s,p){return s+p.y},0)/cp.length}})}
return{points:pts,centroids:cents,colX:cA,colY:cB}}

// ==================== ECHARTS RENDERING ====================
function disposeCharts(){for(var i=0;i<ci.length;i++){try{ci[i].dispose()}catch(e){}}ci=[];}
function hasEcharts(){return typeof echarts!=='undefined'&&echarts&&echarts.init}
function initChart(dom,h){if(!hasEcharts())return null;if(!h)h='320px';dom.style.height=h;var c=echarts.init(dom);ci.push(c);window.addEventListener('resize',function(){c.resize()});return c}
// Helper: replace chart in a wrapper — removes ALL old chart divs first
function replaceChart(wrap,opt,h){if(!h)h='320px';var divs=wrap.querySelectorAll('div');for(var i=0;i<divs.length;i++){var d=divs[i];var dc=ci.find(function(c2){return c2&&c2.getDom()&&c2.getDom()===d});if(dc)dc.dispose();d.remove()}if(!opt)return null;var nd=document.createElement('div');nd.style.cssText='position:absolute;inset:0';wrap.appendChild(nd);var c=echarts.init(nd);ci.push(c);c.setOption(opt);return c}

// ---- Bar (grouped, multi-metric) ----
function buildBarOpt(ch,rows){
  var dimCol=ch.dimension;var ms=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);
  if(!dimCol||ms.length===0)return null;
  var groups={};rows.forEach(function(r){var k=String(r[dimCol]||'未知');if(!groups[k])groups[k]={};ms.forEach(function(m){if(!groups[k][m])groups[k][m]=[];var v=gn(r[m]);if(!isNaN(v))groups[k][m].push(v)})});
  var labels=Object.keys(groups).sort();
  var series=ms.map(function(m,mi){var af=getAgg(ch,m);return{name:m,type:'bar',data:labels.map(function(k){var arr=groups[k]&&groups[k][m]||[];return appAgg(arr,af)}),itemStyle:{borderRadius:[4,4,0,0],color:COL[mi%COL.length]}}});
  return{tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.seriesName+': '+fmtCh(x.value,ch,x.seriesName)}).join('<br/>')}},legend:ms.length>1?{bottom:0,textStyle:{fontSize:11}}:undefined,grid:{left:60,right:20,top:20,bottom:ms.length>1?40:50},xAxis:{type:'category',data:labels,axisLabel:{rotate:labels.length>8?30:0,fontSize:11}},yAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},series:series};
}

// ---- Horizontal Bar ----
function buildHBarOpt(ch,rows){
  var dimCol=ch.dimension;var mc=ch.metric||(ch.metrics&&ch.metrics[0]);
  var ad=agg(rows,dimCol,mc,getAgg(ch,mc));ad.sort(function(a,b){return a.value-b.value});
  var maxW=0;ad.forEach(function(d){var w=0;for(var i=0;i<d.label.length;i++)w+=d.label.charCodeAt(i)>127?12:7;maxW=Math.max(maxW,w)});
  var gl=Math.max(40,maxW+20);
  return{tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.name+': '+fmtCh(x.value,ch,x.name)}).join('<br/>')}},grid:{left:gl,right:30,top:10,bottom:20},xAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},yAxis:{type:'category',data:ad.map(function(d){return d.label}),axisLabel:{fontSize:11}},series:[{type:'bar',data:ad.map(function(d){return d.value}),itemStyle:{borderRadius:[0,4,4,0],color:COL[0]}}]};
}

// ---- Doughnut ----
function buildDoughnutOpt(ch,rows){
  return buildDoughnutOpt2(ch,rows,ch.metric)
}
function buildDoughnutOpt2(ch,rows,mc){
  var dimCol=ch.dimension;if(!dimCol)return null;
  var ad;if(mc&&mc!=='count')ad=agg(rows,dimCol,mc,ch.agg||'sum');else{var freq={};rows.forEach(function(r){var k=String(r[dimCol]||'未知');freq[k]=(freq[k]||0)+1});ad=Object.entries(freq).map(function(e){return{label:e[0],value:e[1]}})}
  ad.sort(function(a,b){return b.value-a.value});
  var total=ad.reduce(function(s,d){return s+d.value},0);
  var MS=8,pd=ad;if(ad.length>MS){var top=ad.slice(0,MS-1),rest=ad.slice(MS-1);pd=top.concat([{label:'其他('+rest.length+'项)',value:rest.reduce(function(s,d){return s+d.value},0)}])}
  return{color:COL.slice(0,pd.length),tooltip:{trigger:'item',formatter:function(p){return p.name+': '+fmtCh(p.value,ch,mc)+' ('+p.percent+'%)'}},legend:{bottom:0,textStyle:{fontSize:11}},graphic:{type:'text',left:'center',top:'42%',style:{text:fmtCh(total,ch,mc),textAlign:'center',fill:'auto',fontSize:18,fontWeight:'bold'}},series:[{type:'pie',radius:['45%','70%'],center:['50%','45%'],avoidLabelOverlap:true,data:pd.map(function(d){return{name:d.label,value:d.value}}),label:{fontSize:11,formatter:'{b}\\n{d}%'},itemStyle:{borderColor:'#fff',borderWidth:2}}]};
}

// ---- Histogram ----
function buildHistOpt(ch,rows){return buildHistOpt2(ch,rows,ch.metric)}
function buildHistOpt2(ch,rows,col){
  if(!col)return null;
  var vals=rows.map(function(r){return gn(r[col])}).filter(function(n){return!isNaN(n)});
  if(!vals.length)return null;
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
  if(mn===mx)return{tooltip:{trigger:'axis'},grid:{left:50,right:20,top:10,bottom:30},xAxis:{type:'category',data:[fmtC(mn)]},yAxis:{type:'value',min:0},series:[{type:'bar',data:[vals.length],itemStyle:{color:COL[2]}}]};
  var nb=Math.min(10,Math.max(5,Math.ceil(Math.sqrt(vals.length))));var st=(mx-mn)/nb;var bins=new Array(nb).fill(0);var lbs=[];
  for(var i=0;i<nb;i++)lbs.push(fmtC(mn+st*i)+'–'+fmtC(mn+st*(i+1)));
  vals.forEach(function(v){var idx=Math.floor((v-mn)/st);if(idx>=nb)idx=nb-1;bins[idx]++});
  var maxL=0;lbs.forEach(function(l){var w=0;for(var j=0;j<l.length;j++)w+=l.charCodeAt(j)>127?11:6.5;maxL=Math.max(maxL,w)});
  var gb=Math.max(40,Math.ceil(maxL*Math.sin(35*Math.PI/180))+16);
  return{tooltip:{trigger:'axis'},grid:{left:50,right:20,top:10,bottom:gb},xAxis:{type:'category',data:lbs,axisLabel:{fontSize:10,rotate:35}},yAxis:{type:'value',min:0},series:[{type:'bar',data:bins,itemStyle:{borderRadius:[2,2,0,0],color:COL[2]}}]};
}

// ---- Line (multi-metric, date or dimension) ----
function buildLineOpt(ch,rows){
  var ms=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);if(ms.length===0)return null;
  var sd={},labels=[];
  if(ch.dateColumn){rows.forEach(function(r){var d=String(r[ch.dateColumn]||'').trim();var m=d.match(/^(\\d{4})[-/.](\\d{1,2})/);if(!m)return;var ym=m[1]+'-'+m[2].padStart(2,'0');if(!sd[ym])sd[ym]={};ms.forEach(function(mc){if(!sd[ym][mc])sd[ym][mc]=[];var v=gn(r[mc]);if(!isNaN(v))sd[ym][mc].push(v)})});labels=Object.keys(sd).sort()}
  else if(ch.dimension){rows.forEach(function(r){var k=String(r[ch.dimension]||'未知');if(!sd[k])sd[k]={};ms.forEach(function(mc){if(!sd[k][mc])sd[k][mc]=[];var v=gn(r[mc]);if(!isNaN(v))sd[k][mc].push(v)})});labels=Object.keys(sd).sort()}
  else return null;
  if(!labels.length)return null;
  var series=ms.map(function(mc,mi){return{name:mc,type:'line',data:labels.map(function(l){var arr=sd[l]&&sd[l][mc]||[];return arr.length?arr.reduce(function(a,b){return a+b},0):0}),smooth:true,lineStyle:{color:COL[mi%COL.length],width:2},itemStyle:{color:COL[mi%COL.length]},areaStyle:{color:COL[mi%COL.length]+'22'}}});
  return{tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.seriesName+': '+fmtCh(x.value,ch,x.seriesName)}).join('<br/>')}},legend:ms.length>1?{top:0,textStyle:{fontSize:11}}:undefined,grid:{left:60,right:20,top:ms.length>1?30:10,bottom:60},xAxis:{type:'category',data:labels,axisLabel:{rotate:labels.length>8?30:0,fontSize:11}},yAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},dataZoom:[{type:'inside'}],series:series};
}

// ==================== FULLSCREEN ====================
var fsCard=null;
function toggleFullscreen(card){
  if(fsCard&&fsCard!==card){fsCard.classList.remove('is-fullscreen')}
  card.classList.toggle('is-fullscreen');
  fsCard=card.classList.contains('is-fullscreen')?card:null
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&fsCard){fsCard.classList.remove('is-fullscreen');fsCard=null}})

// ==================== RENDER CHARTS GRID ====================
function rC(rows){var grid=document.getElementById('chartsGrid');
disposeCharts();grid.innerHTML='';
CS.forEach(function(ch,i){
  try{
  // per-chart filter
  var cRows=ch.filter?aF(rows,ch.filter):rows;

  var isAn=ch.type==='timeseries'||ch.type==='decile'||ch.type==='cluster';
  var card=document.createElement('div');card.className=isAn?'chart-card chart-card-full':'chart-card';
  card.setAttribute('data-chart-idx',i);
  card.ondblclick=function(e){e.stopPropagation();toggleFullscreen(card)};
  // dynamic title
  var ms0=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);
  var h3=document.createElement('h3');h3.textContent=rTit(ch.title,ms0);card.appendChild(h3);

  if(ch.type==='timeseries'){
    var ms=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);
    var activeM=ch.metric||ms[0];
    if(ms.length>1){var mb=document.createElement('div');mb.className='metric-btns';ms.forEach(function(m){var b=document.createElement('button');b.className='metric-btn'+(m===activeM?' active':'');b.textContent=m;b.onclick=function(){
      mb.querySelectorAll('.metric-btn').forEach(function(bb){bb.classList.remove('active')});b.classList.add('active');
      h3.textContent=rTit(ch.title,[m]);
      renderTimeseriesChart(card,ch,cRows,m);
    };mb.appendChild(b)});card.appendChild(mb)}
    var pt=document.createElement('div');pt.className='period-toggle';
    [{k:'month',l:'月'},{k:'quarter',l:'季'},{k:'year',l:'年'}].forEach(function(pd){
      var b=document.createElement('button');b.className='period-btn'+(pd.k==='month'?' active':'');b.textContent=pd.l;b.setAttribute('data-pd',pd.k);
      b.onclick=function(){pt.querySelectorAll('.period-btn').forEach(function(bb){bb.classList.remove('active')});b.classList.add('active');renderTimeseriesChart(card,ch,cRows,card.querySelector('.metric-btn.active')?card.querySelector('.metric-btn.active').textContent:activeM,pd.k)};pt.appendChild(b)});
    card.appendChild(pt);
    var tsWrap=document.createElement('div');tsWrap.className='chart-body-ts';tsWrap.id='chart-ts-'+i;card.appendChild(tsWrap);
    grid.appendChild(card);
    renderTimeseriesChart(card,ch,cRows,activeM,'month');
  }else if(ch.type==='decile'){
    var dm=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);var dActive=ch.metric||dm[0];
    // always show metric selector
    var dmb=document.createElement('div');dmb.className='metric-btns';dm.forEach(function(m){var b=document.createElement('button');b.className='metric-btn'+(m===dActive?' active':'');b.textContent=m;b.onclick=function(){
      dmb.querySelectorAll('.metric-btn').forEach(function(bb){bb.classList.remove('active')});b.classList.add('active');
      h3.textContent=rTit(ch.title,[m]);
      renderDecileChart(card,ch,cRows,m);
    };dmb.appendChild(b)});card.appendChild(dmb)
    var dw=document.createElement('div');dw.className='chart-body-ts';dw.id='chart-dec-'+i;card.appendChild(dw);
    grid.appendChild(card);
    renderDecileChart(card,ch,cRows,dActive);
  }else if(ch.type==='cluster'){
    var cm=ch.clusterMetrics&&ch.clusterMetrics.length>0?ch.clusterMetrics:(ch.metrics||[]);
    if(cm.length>2){var as=document.createElement('div');as.className='axis-selector';
      var xg=document.createElement('div');xg.innerHTML='<label>X 轴</label>';var xs=document.createElement('select');cm.forEach(function(m){var o=document.createElement('option');o.value=m;o.textContent=m;xs.appendChild(o)});xs.value=cm[0];xg.appendChild(xs);as.appendChild(xg);
      var yg=document.createElement('div');yg.innerHTML='<label>Y 轴</label>';var ys=document.createElement('select');cm.forEach(function(m){var o=document.createElement('option');o.value=m;o.textContent=m;ys.appendChild(o)});ys.value=cm[1]||cm[0];yg.appendChild(ys);as.appendChild(yg);
      xs.onchange=function(){h3.textContent=rTit(ch.title,[xs.value,ys.value]);renderClusterChart(card,ch,cRows,xs.value,ys.value)};
      ys.onchange=function(){h3.textContent=rTit(ch.title,[xs.value,ys.value]);renderClusterChart(card,ch,cRows,xs.value,ys.value)};
      card.appendChild(as);
      var cw=document.createElement('div');cw.className='chart-body-cl';cw.id='chart-cl-'+i;card.appendChild(cw);
      grid.appendChild(card);
      renderClusterChart(card,ch,cRows,cm[0],cm[1]||cm[0]);
    }else{
      var cw2=document.createElement('div');cw2.className='chart-body-cl';cw2.id='chart-cl-'+i;card.appendChild(cw2);
      grid.appendChild(card);
      renderClusterChart(card,ch,cRows,cm[0],cm[1]||cm[0]);
    }
  }else{
    // basic: metric toggle, sort, labels
    var bm=ch.metrics&&ch.metrics.length>0?ch.metrics:(ch.metric?[ch.metric]:[]);
    var activeBms=bm.slice();
    if(bm.length>1){
      var bmb=document.createElement('div');bmb.className='metric-btns';
      if(ch.type==='doughnut'||ch.type==='histogram'){
        // single-metric: dropdown
        var ms=document.createElement('select');ms.style.cssText='padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px';
        bm.forEach(function(m){var o=document.createElement('option');o.value=m;o.textContent=m;ms.appendChild(o)});
        ms.onchange=function(){var mc=ms.value;h3.textContent=rTit(ch.title,[mc]);var opt=null;if(ch.type==='doughnut')opt=buildDoughnutOpt2(ch,cRows,mc);else opt=buildHistOpt2(ch,cRows,mc);var wrap=card.querySelector('.chart-body');replaceChart(wrap,opt)};bmb.appendChild(ms);
      }else{
        // multi-metric: toggle buttons
        bm.forEach(function(m){var b=document.createElement('button');b.className='metric-btn active';b.textContent=m;b.onclick=function(){
          if(activeBms.length>1||!b.classList.contains('active')){b.classList.toggle('active');
          activeBms=[];bmb.querySelectorAll('.metric-btn.active').forEach(function(ab){activeBms.push(ab.textContent)});
          h3.textContent=rTit(ch.title,activeBms);
          var opt=null;if(ch.type==='bar')opt=buildBarOpt2(ch,cRows,activeBms,showLabel,sortOrder);else if(ch.type==='horizontal_bar')opt=buildHBarOpt2(ch,cRows,activeBms[0],showLabel,sortOrder);else opt=buildLineOpt(ch,cRows);
          var wrap=card.querySelector('.chart-body');replaceChart(wrap,opt)}};bmb.appendChild(b)});
      }
      card.appendChild(bmb)
    }
    // Sort + label toggle
    var showLabel=true,sortOrder='none';
    if(ch.type==='bar'||ch.type==='horizontal_bar'){
      var stb=document.createElement('div');stb.style.cssText='display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap';
      var sl=document.createElement('select');sl.style.cssText='padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px';
      [{v:'none',l:'自然'},{v:'asc',l:'升序'},{v:'desc',l:'降序'}].forEach(function(o){var op=document.createElement('option');op.value=o.v;op.textContent=o.l;sl.appendChild(op)});
      sl.onchange=function(){sortOrder=sl.value;var opt=null;if(ch.type==='bar')opt=buildBarOpt2(ch,cRows,activeBms.length?activeBms:bm,showLabel,sortOrder);else opt=buildHBarOpt2(ch,cRows,(activeBms.length?activeBms[0]:bm[0]),showLabel,sortOrder);var wrap=card.querySelector('.chart-body');replaceChart(wrap,opt)};stb.appendChild(sl);
      var lb=document.createElement('button');lb.textContent='标签';lb.style.cssText='padding:4px 12px;border-radius:16px;border:1px solid #e2e8f0;background:#3B82F6;color:#fff;font-size:12px;cursor:pointer';
      lb.onclick=function(){showLabel=!showLabel;lb.style.background=showLabel?'#3B82F6':'#fff';lb.style.color=showLabel?'#fff':'#4a5568';var opt=null;if(ch.type==='bar')opt=buildBarOpt2(ch,cRows,activeBms.length?activeBms:bm,showLabel,sortOrder);else opt=buildHBarOpt2(ch,cRows,(activeBms.length?activeBms[0]:bm[0]),showLabel,sortOrder);var wrap=card.querySelector('.chart-body');replaceChart(wrap,opt)};stb.appendChild(lb);
      card.appendChild(stb)
    }
    var wrap=document.createElement('div');wrap.className='chart-body';wrap.id='chart-basic-'+i;card.appendChild(wrap);grid.appendChild(card);
    var opt=null;
    if(ch.type==='bar')opt=buildBarOpt2(ch,cRows,bm,true,'none');
    else if(ch.type==='horizontal_bar')opt=buildHBarOpt2(ch,cRows,bm[0],true,'none');
    else if(ch.type==='doughnut')opt=buildDoughnutOpt2(ch,cRows,bm[0]);
    else if(ch.type==='histogram')opt=buildHistOpt2(ch,cRows,bm[0]);
    else if(ch.type==='line')opt=buildLineOpt(ch,cRows);
    if(opt){var c=initChart(wrap,'320px');if(c)c.setOption(opt)}
  }
  }catch(e){console.error(e)}
})}

// ---- buildBarOpt variant that supports sort + labels ----
function buildBarOpt2(ch,rows,ms,showLabel,sortOrder){
  var dimCol=ch.dimension;if(!dimCol||ms.length===0)return null;
  var groups={};rows.forEach(function(r){var k=String(r[dimCol]||'未知');if(!groups[k])groups[k]={};ms.forEach(function(m){if(!groups[k][m])groups[k][m]=[];var v=gn(r[m]);if(!isNaN(v))groups[k][m].push(v)})});
  var labels=Object.keys(groups).sort();
  if(sortOrder&&sortOrder!=='none'){var af=getAgg(ch,ms[0]);var ts=labels.map(function(k){var arr=groups[k]&&groups[k][ms[0]]||[];return appAgg(arr,af)});var ix=labels.map(function(l,i){return{l:l,v:ts[i]}});ix.sort(function(a,b){return sortOrder==='asc'?a.v-b.v:b.v-a.v});labels=ix.map(function(x){return x.l})}
  var series=ms.map(function(m,mi){var aff=getAgg(ch,m);return{name:m,type:'bar',data:labels.map(function(k){var arr=groups[k]&&groups[k][m]||[];return appAgg(arr,aff)}),label:showLabel?{show:true,position:'top',fontSize:11,formatter:function(p){return fmtCh(p.value,ch,p.seriesName)}}:undefined,itemStyle:{borderRadius:[4,4,0,0],color:COL[mi%COL.length]}}});
  return{tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.seriesName+': '+fmtCh(x.value,ch,x.seriesName)}).join('<br/>')}},legend:ms.length>1?{bottom:0,textStyle:{fontSize:11}}:undefined,grid:{left:60,right:20,top:20,bottom:ms.length>1?40:50},xAxis:{type:'category',data:labels,axisLabel:{rotate:labels.length>8?30:0,fontSize:11}},yAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},series:series};
}
function buildHBarOpt2(ch,rows,mc,showLabel,sortOrder){
  var dimCol=ch.dimension;var ad=agg(rows,dimCol,mc,getAgg(ch,mc));if(sortOrder&&sortOrder!=='none')ad.sort(function(a,b){return sortOrder==='desc'?b.value-a.value:a.value-b.value});else ad.sort(function(a,b){return a.value-b.value});
  var maxW=0;ad.forEach(function(d){var w=0;for(var i=0;i<d.label.length;i++)w+=d.label.charCodeAt(i)>127?12:7;maxW=Math.max(maxW,w)});
  var gl=Math.max(40,maxW+20);
  return{tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.name+': '+fmtCh(x.value,ch,x.name)}).join('<br/>')}},grid:{left:gl,right:30,top:10,bottom:20},xAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},yAxis:{type:'category',data:ad.map(function(d){return d.label}),axisLabel:{fontSize:11}},series:[{type:'bar',data:ad.map(function(d){return d.value}),label:showLabel?{show:true,position:'right',fontSize:11,formatter:function(p){return fmtCh(p.value,ch,p.seriesName)}}:undefined,itemStyle:{borderRadius:[0,4,4,0],color:COL[0]}}]};
}

// ---- timeseries chart render ----
function renderTimeseriesChart(card,ch,rows,mc,pd){
  pd=pd||'month';
  // remove old chart dom
  var old=card.querySelector('.chart-body-ts');if(old){var cid=old.id;var oldC=ci.find(function(c){return c&&c.getDom()&&c.getDom().id===cid});if(oldC)oldC.dispose();old.remove()}
  var wrap=document.createElement('div');wrap.className='chart-body-ts';wrap.id='chart-ts-'+card.getAttribute('data-chart-idx');card.appendChild(wrap);
  // remove old info & table
  var oi=card.querySelector('.ts-info');if(oi)oi.remove();
  var ot=card.querySelector('.ts-detail-wrap');if(ot)ot.remove();
  var ob=card.querySelector('.detail-toggle');if(ob)ob.remove();

  var td=compTS(rows,ch.dateColumn,mc,pd);if(!td){wrap.textContent='数据不足，无法生成时序分析';return}
  var allL=td.labels.concat(td.fc.labels);
  var aD=td.values.concat(new Array(td.fc.labels.length).fill(null));
  var mD=td.ma.concat(new Array(td.fc.labels.length).fill(null));
  var tD=td.trend.concat(new Array(td.fc.labels.length).fill(null));
  var fD=new Array(td.labels.length-1).fill(null);fD.push(td.values[td.values.length-1]);td.fc.values.forEach(function(v){fD.push(v)});

  var opt={tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.filter(function(x){return x.value!=null}).map(function(x){return x.seriesName+': '+fmtCh(x.value,ch,x.seriesName)}).join('<br/>')}},
    legend:{top:0,left:'center',textStyle:{fontSize:11}},
    grid:{left:60,right:20,top:40,bottom:60},
    xAxis:{type:'category',data:allL,axisLabel:{rotate:30,fontSize:10}},
    yAxis:{type:'value',axisLabel:{fontSize:11,formatter:fmtC}},
    dataZoom:[{type:'inside'}],
    series:[
      {name:'实际值',type:'line',data:aD,lineStyle:{color:COL[0],width:2},itemStyle:{color:COL[0]},areaStyle:{color:COL[0]+'22'},smooth:true},
      {name:'MA3',type:'line',data:mD,lineStyle:{color:COL[2],width:2,type:'dashed'},itemStyle:{color:COL[2]},smooth:true,symbol:'none'},
      {name:'趋势',type:'line',data:tD,lineStyle:{color:'#6B7280',width:1.5,type:'dotted'},itemStyle:{color:'#6B7280'},smooth:false,symbol:'none'},
      {name:'预测',type:'line',data:fD,lineStyle:{color:'#10B981',width:2,type:'dashed'},itemStyle:{color:'#10B981'},smooth:true,symbolSize:6}
    ]};
  var c=initChart(wrap,'360px');if(c)c.setOption(opt);

  // info panel
  var info=document.createElement('div');info.className='ts-info';
  var lastM=td.mom[td.mom.length-1],lastY=td.yoy[td.yoy.length-1];
  info.innerHTML='<span>最新: <strong>'+td.labels[td.labels.length-1]+'</strong></span><span>值: <strong>'+fmt(td.values[td.values.length-1])+'</strong></span>'+
    (lastM!=null?'<span>环比: <strong style="color:'+(lastM>=0?'#10B981':'#EF4444')+'">'+(lastM>=0?'+':'')+lastM.toFixed(1)+'%</strong></span>':'')+
    (lastY!=null?'<span>同比: <strong style="color:'+(lastY>=0?'#10B981':'#EF4444')+'">'+(lastY>=0?'+':'')+lastY.toFixed(1)+'%</strong></span>':'')+
    (td.fc.values.length>0?'<span>下期预测: <strong>'+fmt(td.fc.values[0])+'</strong></span>':'');
  card.appendChild(info);

  // detail table
  var dtWrap=document.createElement('div');dtWrap.className='ts-detail-wrap';dtWrap.style.display='none';
  var th='<table class="detail-table"><thead><tr><th>周期</th><th>实际值</th><th>MA3</th><th>环比%</th><th>同比%</th><th>趋势</th><th>预测</th></tr></thead><tbody>';
  td.labels.forEach(function(l,j){var mv=td.mom[j],yv=td.yoy[j];var mc=mv!=null?(mv>=0?'#10B981':'#EF4444'):'',yc=yv!=null?(yv>=0?'#10B981':'#EF4444'):'';th+='<tr><td>'+l+'</td><td>'+fmt(td.values[j])+'</td><td>'+(td.ma[j]!=null?fmt(td.ma[j]):'—')+'</td><td style="color:'+mc+'">'+(mv!=null?(mv>=0?'+':'')+mv.toFixed(1)+'%':'—')+'</td><td style="color:'+yc+'">'+(yv!=null?(yv>=0?'+':'')+yv.toFixed(1)+'%':'—')+'</td><td>'+fmt(td.trend[j])+'</td><td>—</td></tr>'});
  if(td.fc.labels&&td.fc.labels.length>0){td.fc.labels.forEach(function(fl,fi){th+='<tr><td>'+fl+' (预测)</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td class="ts-forecast">'+fmt(td.fc.values[fi])+'</td></tr>'})}
  th+='</tbody></table>';dtWrap.innerHTML=th;card.appendChild(dtWrap);
  var tg=document.createElement('button');tg.className='detail-toggle';tg.textContent='展开明细表 ↓';tg.onclick=function(){var s=dtWrap.style.display!=='none';dtWrap.style.display=s?'none':'';tg.textContent=s?'展开明细表 ↓':'收起明细 ↑'};card.appendChild(tg);
}

// ---- decile chart render ----
function renderDecileChart(card,ch,rows,mc){
  var old=card.querySelector('.chart-body-ts');if(old){var cid2=old.id;var oldC=ci.find(function(c){return c&&c.getDom()&&c.getDom().id===cid2});if(oldC)oldC.dispose();old.remove()}
  var wrap=document.createElement('div');wrap.className='chart-body-ts';wrap.id='chart-dec-'+card.getAttribute('data-chart-idx');card.appendChild(wrap);
  var ot=card.querySelector('.ts-detail-wrap');if(ot)ot.remove();
  var ob=card.querySelector('.detail-toggle');if(ob)ob.remove();

  var dd=compDec(rows,mc);if(!dd){wrap.textContent='数据不足，无法生成十分位分析';return}
  var opt={tooltip:{trigger:'axis',formatter:function(p){if(!Array.isArray(p))return'';return p.map(function(x){return x.seriesName+': '+fmtCh(x.value,ch,x.seriesName)}).join('<br/>')}},
    legend:{top:0,left:'center',textStyle:{fontSize:11}},
    grid:{left:60,right:60,top:40,bottom:30},
    xAxis:{type:'category',data:dd.map(function(d){return d.label}),axisLabel:{fontSize:11}},
    yAxis:[
      {type:'value',position:'left',name:'合计',axisLabel:{fontSize:10,formatter:fmtC}},
      {type:'value',position:'right',name:'数量',splitLine:{show:false},axisLabel:{fontSize:10}}
    ],
    series:[
      {name:'合计',type:'bar',yAxisIndex:0,data:dd.map(function(d){return d.sum}),itemStyle:{color:COL[0],borderRadius:[3,3,0,0]},z:2},
      {name:'数量',type:'line',yAxisIndex:1,data:dd.map(function(d){return d.count}),lineStyle:{color:COL[3],width:2},itemStyle:{color:COL[3]},smooth:true,symbolSize:8,z:1}
    ]};
  var c=initChart(wrap,'360px');if(c)c.setOption(opt);

  var dtWrap=document.createElement('div');dtWrap.className='ts-detail-wrap';dtWrap.style.display='none';
  var dh='<table class="detail-table"><thead><tr><th>分组</th><th>数量</th><th>合计</th><th>平均</th><th>范围</th></tr></thead><tbody>';
  dd.forEach(function(d){dh+='<tr><td>'+d.label+'</td><td>'+d.count+'</td><td>'+fmt(d.sum)+'</td><td>'+fmt(d.avg)+'</td><td>'+d.range+'</td></tr>'});
  dh+='</tbody></table>';dtWrap.innerHTML=dh;card.appendChild(dtWrap);
  var dg=document.createElement('button');dg.className='detail-toggle';dg.textContent='展开明细表 ↓';dg.onclick=function(){var s=dtWrap.style.display!=='none';dtWrap.style.display=s?'none':'';dg.textContent=s?'展开明细表 ↓':'收起明细 ↑'};card.appendChild(dg);
}

// ---- cluster chart render ----
function renderClusterChart(card,ch,rows,xCol,yCol){
  var old=card.querySelector('.chart-body-cl');if(old){var cid3=old.id;var oldC=ci.find(function(c){return c&&c.getDom()&&c.getDom().id===cid3});if(oldC)oldC.dispose();old.remove()}
  var wrap=document.createElement('div');wrap.className='chart-body-cl';wrap.id='chart-cl-'+card.getAttribute('data-chart-idx');card.appendChild(wrap);
  var ot=card.querySelector('.ts-detail-wrap');if(ot)ot.remove();
  var ob=card.querySelector('.detail-toggle');if(ob)ob.remove();
  var os=card.querySelector('.cluster-summary');if(os)os.remove();

  var k=ch.k||3;var cd=compClust(rows,[xCol,yCol],k);if(!cd){wrap.textContent='数据不足，无法执行聚类分析';return}
  var cm={};cd.points.forEach(function(p){if(!cm[p.cluster])cm[p.cluster]=[];cm[p.cluster].push([p.x,p.y])});
  var cIds=Object.keys(cm).map(Number).sort(function(a,b){return a-b});
  var series=cIds.map(function(ci2){return{name:'聚类 '+(ci2+1),type:'scatter',data:cm[ci2],symbolSize:8,itemStyle:{color:COL[ci2%COL.length]+'99',borderColor:COL[ci2%COL.length],borderWidth:1}}});
  if(cd.centroids.length)series.push({name:'聚类中心',type:'scatter',data:cd.centroids.map(function(c){return[c.x,c.y]}),symbolSize:18,symbol:'diamond',itemStyle:{color:'#1a202c',borderColor:'#fff',borderWidth:2},z:10});
  var opt={tooltip:{formatter:function(p){var xy=p.value;return p.seriesName+'<br/>X: '+fmtC(xy[0])+'<br/>Y: '+fmtC(xy[1])}},
    legend:{top:0,left:'center',textStyle:{fontSize:11}},
    grid:{left:80,right:20,top:40,bottom:50},
    xAxis:{type:'value',name:cd.colX,nameLocation:'center',nameGap:34,nameTextStyle:{fontSize:13,fontWeight:'bold'},axisLabel:{fontSize:10,formatter:fmtC}},
    yAxis:{type:'value',name:cd.colY,nameLocation:'center',nameGap:56,nameTextStyle:{fontSize:13,fontWeight:'bold'},axisLabel:{fontSize:10,formatter:fmtC}},
    series:series};
  var c=initChart(wrap,'380px');if(c)c.setOption(opt);

  // cluster summary
  var sum={};cd.points.forEach(function(p){if(!sum[p.cluster])sum[p.cluster]={count:0,sx:0,sy:0};sum[p.cluster].count++;sum[p.cluster].sx+=p.x;sum[p.cluster].sy+=p.y});
  var csDiv=document.createElement('div');csDiv.className='cluster-summary';
  cIds.forEach(function(ci2){var s=sum[ci2];csDiv.innerHTML+='<span class="summary-chip" style="border-color:'+COL[ci2%COL.length]+'"><strong>聚类 '+(ci2+1)+'</strong> '+s.count+' 个 · 中心 ('+fmtC(s.sx/s.count)+', '+fmtC(s.sy/s.count)+')</span>'});
  card.appendChild(csDiv);

  // detail table
  var dtWrap=document.createElement('div');dtWrap.className='ts-detail-wrap';dtWrap.style.display='none';
  var ch2='<table class="detail-table"><thead><tr><th>标签</th><th>'+cd.colX+'</th><th>'+cd.colY+'</th><th>聚类</th></tr></thead><tbody>';
  cd.points.forEach(function(p){ch2+='<tr><td>'+p.label+'</td><td>'+fmtC(p.x)+'</td><td>'+fmtC(p.y)+'</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;color:white;background:'+COL[p.cluster%COL.length]+'">聚类'+(p.cluster+1)+'</span></td></tr>'});
  ch2+='</tbody></table>';dtWrap.innerHTML=ch2;card.appendChild(dtWrap);
  var cg=document.createElement('button');cg.className='detail-toggle';cg.textContent='展开明细表 ↓';cg.onclick=function(){var s=dtWrap.style.display!=='none';dtWrap.style.display=s?'none':'';cg.textContent=s?'展开明细表 ↓':'收起明细 ↑'};card.appendChild(cg);
}

// ---- data table ----
function rT(rows){var el=document.getElementById('tableCard');el.innerHTML='';
// toolbar
var tb=document.createElement('div');tb.style.cssText='display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
var th3=document.createElement('h3');th3.style.cssText='margin:0;font-size:15px';tb.appendChild(th3);
// search
var tbs=document.createElement('input');tbs.type='text';tbs.placeholder='搜索...';tbs.style.cssText='padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:120px';tbs.oninput=function(){tblSearch=tbs.value;rT2(rows,el,tb)};tb.appendChild(tbs);
// condition
var tbc=document.createElement('input');tbc.type='text';tbc.placeholder='条件, 如: 金额 > 100';tbc.style.cssText='padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:160px';tbc.oninput=function(){tblCond=tbc.value;rT2(rows,el,tb)};tb.appendChild(tbc);
// topN
var tbn=document.createElement('input');tbn.type='number';tbn.value=tblTopN;tbn.min=5;tbn.max=500;tbn.style.cssText='padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:60px';tbn.onchange=function(){tblTopN=parseInt(tbn.value)||15;rT2(rows,el,tb)};tb.appendChild(tbn);
// col toggle
var ccp=document.createElement('details');ccp.style.cssText='font-size:12px';
var ccs=document.createElement('summary');ccs.textContent='列 ('+tblCols.length+'/'+TC.length+')';ccp.appendChild(ccs);
var ccd=document.createElement('div');ccd.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-top:4px';
TC.forEach(function(c){var l=document.createElement('label');l.style.cssText='padding:2px 8px;border-radius:4px;font-size:11px;border:1px solid #e2e8f0;cursor:pointer;user-select:none;'+(tblCols.includes(c)?'background:#3B82F6;color:white;border-color:#3B82F6':'');
l.textContent=c;l.onclick=function(){var idx=tblCols.indexOf(c);if(idx!==-1)tblCols.splice(idx,1);else tblCols.push(c);ccs.textContent='列 ('+tblCols.length+'/'+TC.length+')';rT2(rows,el,tb)};ccd.appendChild(l)});
ccp.appendChild(ccd);tb.appendChild(ccp);
el.appendChild(tb);
rT2(rows,el,tb)}

function rT2(rows,el,tb){
// remove old table
var ot=el.querySelector('div:not(:first-child)');if(ot)ot.remove();
var filtered=rows.slice();
if(tblSearch.trim()){var q=tblSearch.trim().toLowerCase();filtered=filtered.filter(function(r){return tblCols.some(function(c){var v=r[c];return v!=null&&String(v).toLowerCase().includes(q)})})}
if(tblCond.trim())filtered=aF(filtered,tblCond);
var sorted=filtered.slice();if(sc)sorted.sort(function(a,b){var va=gn(a[sc]),vb=gn(b[sc]);if(!isNaN(va)&&!isNaN(vb))return(va-vb)*(sd?-1:1);return String(a[sc]||'').localeCompare(String(b[sc]||''))*(sd?-1:1)});
var sl=sorted.slice(0,tblTopN);var tw=document.createElement('div');tw.style.overflowX='auto';
var h3=tb.querySelector('h3');h3.textContent='数据表 · '+Math.min(sl.length,tblTopN)+' / '+filtered.length+' 行';
var html='<table><thead><tr><th class="rn">#</th>';
tblCols.forEach(function(c){var ind=sc===c?(sd?' ↓':' ↑'):'';html+='<th onclick=\"st2(\\x27'+c+'\\x27)\">'+c+ind+'</th>'});
html+='</tr></thead><tbody>';sl.forEach(function(r,i){html+='<tr><td class="rn">'+(i+1)+'</td>';tblCols.forEach(function(c){var v=r[c];if(v==null||v==='')v='—';else{var cl=CLS[c];if(cl&&cl.type==='numeric'&&cl.role==='metric'){var n=gn(v);if(!isNaN(n)){var md=MD[c];if(md&&md.format&&md.format!=='global')v=fmtCh(n,{metricFormats:MD},c);else v=fmt(n)}}}html+='<td>'+v+'</td>'});html+='</tr>'});
html+='</tbody></table>';tw.innerHTML=html;el.appendChild(tw)}
function st2(c){if(sc===c)sd=!sd;else{sc=c;sd=false}rT(gf())}

// ---- init ----
rf();ra();
<\/script>
</body>
</html>`

  const filePath = await save({
    defaultPath: `${title}_${date}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (filePath) {
    await writeTextFile(filePath, html)
  }
}

// ====== Date range presets (dynamic based on data span) ======
const datePresets = computed(() => {
  const dr = spec.value?.dateRange
  if (!dr) return []

  const min = new Date(dr.min)
  const max = new Date(dr.max)
  const totalMonths = (max.getFullYear() - min.getFullYear()) * 12 + (max.getMonth() - min.getMonth())

  const presets: { label: string; months: number }[] = []

  // Monthly presets
  if (totalMonths >= 3) presets.push({ label: '近3月', months: 3 })
  if (totalMonths >= 6) presets.push({ label: '近半年', months: 6 })

  // Yearly presets — generate based on actual data span
  const totalYears = Math.floor(totalMonths / 12)
  for (let y = 1; y <= totalYears; y++) {
    if (y === 1) presets.push({ label: '近1年', months: 12 })
    else presets.push({ label: `近${y}年`, months: y * 12 })
  }

  presets.push({ label: '全部', months: 0 })
  return presets
})

function applyDatePreset(months: number) {
  const dr = spec.value?.dateRange
  if (!dr) return
  if (months === 0) {
    previewStore.dateRange.start = dr.min
    previewStore.dateRange.end = dr.max
  } else {
    const end = new Date(dr.max)
    const start = new Date(end)
    start.setMonth(start.getMonth() - months)
    previewStore.dateRange.start = start.toISOString().slice(0, 10)
    previewStore.dateRange.end = dr.max
  }
  previewStore.applyFilters()
}

function isDatePresetActive(months: number): boolean {
  const dr = spec.value?.dateRange
  if (!dr) return false
  if (months === 0) {
    return previewStore.dateRange.start === dr.min && previewStore.dateRange.end === dr.max
  }
  const end = new Date(dr.max)
  const start = new Date(end)
  start.setMonth(start.getMonth() - months)
  const startStr = start.toISOString().slice(0, 10)
  return previewStore.dateRange.start === startStr && previewStore.dateRange.end === dr.max
}

const totalRows = computed(() => dataStore.dataSet?.rows.length ?? 0)

const dateRangeCount = computed(() => {
  if (!spec.value?.dateRange) return 0
  const dateCol = spec.value.dateRange.column
  const start = previewStore.dateRange.start
  const end = previewStore.dateRange.end
  if (!start || !end) return 0
  const rows = dataStore.dataSet?.rows ?? []
  return rows.filter((r) => {
    const d = String(r[dateCol] ?? '').trim()
    return d >= start && d <= end
  }).length
})

// ====== KPI icon logic (matches dashboard_gen.py) ======
function kpiIcon(kpi: KpiSpec, _index: number): string {
  const label = (kpi.label || '').toLowerCase()
  if (kpi.format === 'percent') return '📈'
  if (kpi.agg === 'count') return '📋'
  if (label.includes('客户') || label.includes('customer')) return '👥'
  if (label.includes('订单') && kpi.agg === 'sum') return '💰'
  if (label.includes('回款') || label.includes('receipt')) return '💵'
  return '📊'
}

// ====== KPI value formatting (matches dashboard_gen.py) ======
function formatKpiValue(value: number, format: string, prefix: string, unit?: string, decimals?: number): string {
  const p = prefix || ''
  const d = decimals !== undefined ? decimals : 2
  if (format === 'percent') {
    const v = value <= 1 && value >= -1 ? value * 100 : value
    return v.toFixed(d) + '%'
  }
  if (format === 'currency') {
    let v = value
    let suffix = ''
    if (unit === 'wan') { v = value / 10000; suffix = '万' }
    else if (unit === 'yi') { v = value / 100000000; suffix = '亿' }
    return p + (prefix ? '' : '¥') + fmt(v, v >= 100 ? 0 : d) + suffix
  }
  if (format === 'integer') return p + fmt(value, 0)
  return p + fmt(value, value % 1 === 0 ? 0 : d)
}

// ====== Table cell formatting ======
function formatCellValue(val: string | number | undefined, col: string): string {
  if (val === undefined || val === null || val === '') return '—'
  const cls = dataStore.dataSet?.classifications[col]
  if (cls?.type === 'numeric' && cls.role === 'metric') {
    const n = getNumericVal(val)
    if (!isNaN(n)) {
      // Use global metric default if 'table' section is enabled
      const def = spec.value?.metricDefaults?.[col]
      if (def && (!def.sections || def.sections.includes('table')) && def.format) {
        return fmtByChart(n, { format: def.format, unit: def.unit, metricFormats: { [col]: { format: def.format, unit: def.unit, decimals: def.decimals } } }, col)
      }
      return fmt(n, 2)
    }
  }
  return String(val)
}

function toggleSort(col: string) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortCol.value = col
    sortDir.value = 'desc'
  }
}

// ====== Table rows with search + sorting ======
const tableRows = computed(() => {
  const rows = previewStore.filteredRows.length > 0
    ? previewStore.filteredRows
    : (dataStore.dataSet?.rows ?? [])

  // 搜索过滤
  let filtered = rows
  const q = tableSearch.value.trim().toLowerCase()
  if (q) {
    const cols = activeColumns.value.length > 0 ? activeColumns.value : allColumns.value
    filtered = rows.filter((row) =>
      cols.some((col) => {
        const v = row[col]
        if (v == null || v === '') return false
        return String(v).toLowerCase().includes(q)
      }),
    )
  }

  // 表条件筛选（不影响图表）
  if (tableCondition.value.trim()) {
    filtered = applyFilter(filtered, undefined, tableCondition.value)
  }

  // 排序
  let sorted = [...filtered]
  if (sortCol.value) {
    const col = sortCol.value
    const dir = sortDir.value === 'desc' ? -1 : 1
    sorted.sort((a, b) => {
      const va = getNumericVal(a[col] as any)
      const vb = getNumericVal(b[col] as any)
      if (!isNaN(va) && !isNaN(vb)) return (va - vb) * dir
      return String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * dir
    })
  }

  return sorted.slice(0, activeTopN.value)
})

// ====== Active rows (filtered or all) ======
function getRows(): Record<string, string | number>[] {
  return previewStore.filteredRows.length > 0
    ? previewStore.filteredRows
    : (dataStore.dataSet?.rows ?? [])
}

const chartRows = computed(() => getRows())

/** 对图表应用其专属的行级筛选 */
function filteredChartRows(chart: { filter?: string }): Record<string, string | number>[] {
  const rows = chartRows.value
  if (!chart.filter) return rows
  return applyFilter(rows, undefined, chart.filter)
}

const allHeaders = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => !dataStore.excludedColumns.has(h))
})

const allMetricCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.role === 'metric' && !dataStore.excludedColumns.has(h))
})

function isAnalysisChart(chart: ChartSpec): boolean {
  return chart.type === 'timeseries' || chart.type === 'decile' || chart.type === 'cluster'
}


</script>

<style scoped>
.dashboard-view {
  max-width: 1400px;
  margin: 0 auto;
}

.no-data {
  text-align: center;
  padding: 64px;
  color: var(--text-secondary);
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 20px;
}

.dashboard-toolbar .btn-ghost {
  position: absolute;
  left: 0;
}

.dashboard-title {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
}

.row-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Filter bar */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
  align-items: center;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.filter-select {
  min-width: 120px;
}

.search-input {
  width: 180px;
}

.condition-input {
  width: 220px;
}

.filter-actions {
  display: flex;
  gap: 8px;
  margin-left: 4px;
}

.btn-reset {
  color: var(--text-secondary);
}

.btn-reset:hover {
  background: var(--bg-hover);
}

.btn-clear {
  color: var(--error);
  border-color: var(--error);
  opacity: 0.8;
}

.btn-clear:hover {
  opacity: 1;
  background: var(--bg-hover);
}

.btn-save {
  color: var(--primary);
  border-color: var(--primary);
  opacity: 0.8;
}

.btn-save:hover {
  opacity: 1;
  background: var(--primary-light);
}

.filter-count {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
}

/* Date range bar */
.date-range-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 18px;
}

.dr-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.dr-sep {
  color: #A0AEC0;
  font-size: 13px;
}

.dr-info {
  font-size: 12px;
  color: #718096;
  margin-left: 4px;
}

.dr-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: 4px;
}

.dr-preset {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-secondary);
  transition: all 0.15s;
}

.dr-preset:hover {
  background: var(--bg-hover);
  border-color: #CBD5E0;
}

.dr-preset.active {
  background: #3B82F6;
  color: white;
  border-color: #3B82F6;
}

/* Cleared message */
.cleared-msg {
  text-align: center;
  padding: 80px 20px;
  color: #A0AEC0;
  font-size: 15px;
}

/* KPI grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
}

.kpi-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  font-size: 20px;
}

.kpi-content {
  display: flex;
  flex-direction: column;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-all;
}

.kpi-label {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 2px;
}

/* Charts grid */
.charts-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;
}

.chart-card {
  flex: 1 1 400px;
  max-width: 100%;
}

.chart-card-full {
  flex: 1 1 100%;
}

.chart-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 280px;
  min-width: 320px;
  position: relative;
}

.resizable-card {
  overflow: hidden;
}

/* Resize handles */
.rs-handle {
  position: absolute;
  z-index: 5;
  transition: background 0.15s;
}

.rs-handle-e {
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}

.rs-handle-s {
  bottom: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
}

.rs-handle-se {
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

.rs-handle:hover {
  background: rgba(59, 130, 246, 0.15);
}

.chart-card h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.chart-card-full {
  grid-column: 1 / -1;
  min-height: 360px;
}

/* Data table */
.data-table-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  min-height: 200px;
  min-width: 320px;
  max-height: 80vh;
  overflow: hidden;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.table-toolbar h3 {
  font-size: 15px;
  font-weight: 600;
}

.table-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-group label {
  font-size: 12px;
  color: var(--text-secondary);
}

.table-input {
  width: 70px;
}

.table-search {
  width: 170px;
}

.table-cond {
  width: 200px;
}

.search-clear {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
  margin-left: -4px;
}

.search-clear:hover {
  color: var(--text-primary);
}

.col-picker {
  position: relative;
}

.picker-panel {
  position: absolute;
  top: 32px;
  right: 0;
  z-index: 10;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  min-width: 280px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.picker-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}

.picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.picker-chip.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  user-select: none;
}

.data-table th.sortable {
  cursor: pointer;
}

.data-table th.sortable:hover {
  color: var(--primary);
}

.sort-indicator {
  font-size: 12px;
  margin-left: 4px;
}

.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
}

.data-table tbody tr:hover {
  background: var(--bg-hover);
}

.row-num {
  color: var(--text-secondary);
  font-size: 12px;
  width: 40px;
  text-align: center;
}
</style>

<style>
/* VueDatePicker global overrides — must be non-scoped to penetrate component */
.date-range-bar .dp__input_wrap {
  width: 128px;
  font-size: 13px;
}

.date-range-bar .dp__input_wrap input {
  height: 32px !important;
  padding: 0 10px !important;
  font-size: 13px !important;
  line-height: 30px !important;
  border: 1px solid var(--border) !important;
  border-radius: 6px !important;
}

.date-range-bar .dp__input {
  height: 32px !important;
  padding: 0 10px !important;
  font-size: 13px !important;
  line-height: 30px !important;
  border: 1px solid var(--border) !important;
  border-radius: 6px !important;
}
</style>
