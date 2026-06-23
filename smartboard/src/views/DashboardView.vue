<template>
  <div class="dashboard-view">
    <div v-if="saveMsg" class="save-toast" :class="saveMsgType === 'error' ? 'save-toast-err' : 'save-toast-ok'">
      {{ saveMsg }}
      <button class="save-toast-close" @click="saveMsg = ''">✕</button>
    </div>
    <div v-if="!spec" class="no-data">
      <p>{{ t('dashboard.noData') }}</p>
      <button class="btn btn-sm btn-primary" @click="$router.push('/config')">{{ t('dashboard.backToConfigText')
      }}</button>
    </div>

    <template v-else>
      <!-- 工具栏 -->
      <div class="dashboard-toolbar">
        <button class="btn btn-sm btn-ghost" @click="$router.push('/config')">← {{ t('dashboard.backToConfigText')
        }}</button>
        <h2 class="dashboard-title">{{ spec.title }}</h2>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div v-for="f in spec.filters" :key="f.column" class="filter-item">
          <label>{{ f.column }}</label>
          <select v-model="previewStore.filterValues[f.column]" @change="onFilterChange"
            class="input input-sm filter-select">
            <option value="__all__">{{ t('common.all') }}</option>
            <option v-for="opt in previewStore.getFilterOptions(f.column)" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </div>
        <div class="filter-item">
          <label>{{ t('common.search') }}</label>
          <input type="text" v-model="previewStore.searchText" @input="onFilterChange"
            class="input input-sm search-input" :placeholder="t('dashboard.searchPlaceholder')" />
        </div>
        <div class="filter-item">
          <label>{{ t('common.condition') }}</label>
          <input type="text" v-model="previewStore.conditionFilter" @input="onFilterChange"
            class="input input-sm condition-input" list="condition-cols"
            :placeholder="t('dashboard.conditionPlaceholder')" />
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
          <button class="btn btn-sm btn-reset" @click="resetFilters">{{ t('dashboard.resetFilter') }}</button>
          <button class="btn btn-sm btn-clear" @click="clearDashboard">Clear</button>
          <button class="btn btn-sm btn-save" @click="saveDashboard">Save</button>
        </div>
        <span class="filter-count">{{ t('common.currentFilter') }}: {{ previewStore.rowCount }} {{ t('common.records')
        }}</span>
      </div>

      <!-- 日期范围 -->
      <div v-if="spec.dateRange" class="date-range-bar">
        <span class="dr-label">{{ t('dashboard.timeSlice') }}: {{ spec.dateRange.column }}</span>
        <input type="date" v-model="dateStart" :min="spec.dateRange.min" :max="spec.dateRange.max"
          class="dr-date-input" />
        <span class="dr-sep">{{ t('dashboard.to') }}</span>
        <input type="date" v-model="dateEnd" :min="spec.dateRange.min" :max="spec.dateRange.max"
          class="dr-date-input" />
        <span class="dr-info">{{ t('dashboard.recordsCount', { filtered: dateRangeCount, total: totalRows }) }}</span>
        <div class="dr-presets">
          <button v-for="p in datePresets" :key="p.months" class="dr-preset"
            :class="{ active: isDatePresetActive(p.months) }" @click="applyDatePreset(p.months)">
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- 已清空提示 -->
      <div v-if="dashboardCleared" class="cleared-msg">
        Dashboard 已清空 — 拖拽上传 CSV / Excel 文件或点击"{{ t('dashboard.resetFilter') }}"恢复数据
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
              <span class="kpi-value">{{ formatKpiValue(previewStore.computeKpiValue(kpi), kpi.format, kpi.prefix,
                kpi.unit, kpi.decimals)
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
              <TimeseriesChart :rows="filteredChartRows(chart)"
                :date-column="chart.dateColumn || spec.dateRange?.column || ''"
                :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics && chart.metrics.length > 0 ? chart.metrics : allMetricCols"
                :title="chart.title" :metric-formats="chart.metricFormats || {}" :metric-ags="chart.metricAggs || {}" />
            </template>

            <!-- 十分位分析 -->
            <template v-else-if="chart.type === 'decile'">
              <DecileChart :rows="filteredChartRows(chart)" :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics && chart.metrics.length > 0 ? chart.metrics : allMetricCols"
                :title="chart.title" :metric-formats="chart.metricFormats || {}" :metric-ags="chart.metricAggs || {}" />
            </template>

            <!-- 聚类分析 -->
            <template v-else-if="chart.type === 'cluster'">
              <ClusterChart :rows="filteredChartRows(chart)"
                :metrics="chart.clusterMetrics || chart.metrics || (spec.primaryMetric ? [spec.primaryMetric] : [])"
                :k="chart.k" :title="chart.title" :metric-formats="chart.metricFormats || {}"
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
            <h3>{{ t('dashboard.dataTable') }} · {{ tableRows.length }}<span v-if="tableSearch.trim()"> {{
              t('common.matched')
                }}</span> / {{
                  activeTopN >= 999999 ? t('config.rowLimitAll') : activeTopN }} {{ t('common.rows') }}</h3>
            <div class="table-controls">
              <div class="control-group">
                <input type="text" v-model="tableSearch" class="input input-xs table-search"
                  :placeholder="t('dashboard.tableSearchPlaceholder')" />
                <button v-if="tableSearch" class="search-clear" @click="tableSearch = ''">✕</button>
              </div>
              <div class="control-group">
                <label>{{ t('common.condition') }}</label>
                <input type="text" v-model="tableCondition" class="input input-xs table-cond" list="table-cond-cols"
                  :placeholder="t('dashboard.conditionPlaceholderShort')" />
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
                <label>{{ t('dashboard.topNRows') }}</label>
                <input type="number" v-model.number="activeTopN" class="input input-xs table-input" min="5" max="500"
                  step="5" />
              </div>
              <div class="control-group col-picker" v-if="showColPicker">
                <div class="picker-panel">
                  <div class="picker-actions">
                    <button class="btn-link" @click="activeColumns = allColumns.slice()">{{ t('common.selectAll')
                      }}</button>
                    <button class="btn-link" @click="activeColumns = []">{{ t('common.clearAll') }}</button>
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
                {{ t('dashboard.columnsLabel') }} ({{ activeColumns.length }}/{{ allColumns.length }})
              </button>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="row-num">#</th>
                  <th v-for="col in activeColumns" :key="col" @click="toggleSort(col)" class="sortable"
                    :style="getColumnHeaderStyle(col)">
                    {{ col }}
                    <span v-if="sortCol === col" class="sort-indicator">{{ sortDir === 'desc' ? '↓' : '↑' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in tableRows" :key="i" :style="getRowColorStyle(row)">
                  <td class="row-num">{{ i + 1 }}</td>
                  <td v-for="col in activeColumns" :key="col" :style="getColumnCellStyle(col)">
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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCN from '@/i18n/zh-CN'
import enUS from '@/i18n/en-US'
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
import { save, message } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { ChartSpec, KpiSpec } from '@/types/spec'
import echartsCode from 'echarts/dist/echarts.min.js?raw'
import resultTemplate from '@/../templates/result_template.html?raw'
import rendererJS from '@/../dist-standalone/renderer.js?raw'
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
const { t, locale } = useI18n()
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
    activeTopN.value = s.table.rowLimit === 'all' ? 999999 : (s.table.rowLimit || 15)
    sortCol.value = s.table.sortBy || ''
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
const saveMsg = ref('')
const saveMsgType = ref<'success' | 'error'>('success')

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
      metrics: allMetricCols,
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
  const tblSort = s.table.sortBy || ''
  const tblRowLimit = s.table.rowLimit
  const tblColColors = s.table.columnColors || {}
  const tblRowCondColors = s.table.rowConditionColors || []
  const date = new Date().toISOString().slice(0, 10)

  // 使用模板文件生成 HTML
  const echartsTag = '<script>' + echartsCode + '<\/script>'

  const html = resultTemplate
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{ECHARTS_TAG\}\}/g, echartsTag)
    .replace(/\{\{RENDERER_JS\}\}/g, '<script>' + rendererJS + '<\/script>')
    .replace(/\{\{HEADERS_JSON\}\}/g, JSON.stringify(headers))
    .replace(/\{\{ROWS_JSON\}\}/g, JSON.stringify(rows))
    .replace(/\{\{CLASSIFICATIONS_JSON\}\}/g, JSON.stringify(cls))
    .replace(/\{\{FILTER_SPECS_JSON\}\}/g, JSON.stringify(filterSpecs))
    .replace(/\{\{KPI_SPECS_JSON\}\}/g, JSON.stringify(kpiSpecs))
    .replace(/\{\{CHART_SPECS_JSON\}\}/g, JSON.stringify(chartSpecs))
    .replace(/\{\{METRIC_DEFAULTS_JSON\}\}/g, JSON.stringify(s.metricDefaults || {}))
    .replace(/\{\{TABLE_COLUMNS_JSON\}\}/g, JSON.stringify(tblCols))
    .replace(/\{\{TABLE_SORT_BY\}\}/g, tblSort)
    .replace(/\{\{TABLE_ROW_LIMIT\}\}/g, JSON.stringify(tblRowLimit))
    .replace(/\{\{TABLE_COL_COLORS_JSON\}\}/g, JSON.stringify(tblColColors))
    .replace(/\{\{TABLE_ROW_COND_COLORS_JSON\}\}/g, JSON.stringify(tblRowCondColors))
    .replace(/\{\{DATE_RANGE_JSON\}\}/g, JSON.stringify(s.dateRange || null))
    .replace(/\{\{DATE_START\}\}/g, previewStore.dateRange.start || '')
    .replace(/\{\{DATE_END\}\}/g, previewStore.dateRange.end || '')
    .replace(/\{\{LOCALE\}\}/g, locale.value)
    .replace(/\{\{I18N_JSON\}\}/g, JSON.stringify(locale.value === 'zh-CN' ? zhCN : enUS))

  const filePath = await save({
    defaultPath: `${title}_${date}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (filePath) {
    try {
      await writeTextFile(filePath, html)
      await message(t('dashboard.saveSuccess', { path: filePath }), { title: t('dashboard.saveSuccessTitle'), kind: 'info' })
    } catch (e: any) {
      await message(t('dashboard.saveFailed', { error: e?.message || e }), { title: t('dashboard.saveFailedTitle'), kind: 'error' })
    }
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
  if (totalMonths >= 3) presets.push({ label: t('dashboard.datePresets.last3Months'), months: 3 })
  if (totalMonths >= 6) presets.push({ label: t('dashboard.datePresets.last6Months'), months: 6 })

  // Yearly presets — generate based on actual data span
  const totalYears = Math.floor(totalMonths / 12)
  for (let y = 1; y <= totalYears; y++) {
    if (y === 1) presets.push({ label: t('dashboard.datePresets.last1Year'), months: 12 })
    else presets.push({ label: t('dashboard.datePresets.lastNYears', { n: y }), months: y * 12 })
  }

  presets.push({ label: t('dashboard.datePresets.all'), months: 0 })
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
    if (unit === 'wan') { v = value / 10000; suffix = t('common.unitShort.wan') }
    else if (unit === 'yi') { v = value / 100000000; suffix = t('common.unitShort.yi') }
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

// ====== Column & Row color helpers ======
function getColumnHeaderStyle(col: string): Record<string, string> {
  const cc = configStore.config.table.columnColors?.[col]
  if (cc) return { backgroundColor: cc }
  return {}
}

function getColumnCellStyle(col: string): Record<string, string> {
  const cc = configStore.config.table.columnColors?.[col]
  if (cc) return { backgroundColor: cc + '20' }
  return {}
}

function getRowColorStyle(row: Record<string, any>): Record<string, string> {
  const rules = configStore.config.table.rowConditionColors
  if (!rules || rules.length === 0) return {}
  for (const rule of rules) {
    if (!rule.condition.trim() || !rule.color) continue
    try {
      const filtered = applyFilter([row], undefined, rule.condition)
      if (filtered.length > 0) {
        return { backgroundColor: rule.color + '30' }
      }
    } catch { /* skip invalid conditions */ }
  }
  return {}
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

  const limit = activeTopN.value
  return limit >= 999999 ? sorted : sorted.slice(0, limit)
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

.save-toast {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .15);
  animation: saveToastIn .3s ease;
}

.save-toast-ok {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.save-toast-err {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.save-toast-close {
  background: none;
  border: none;
  cursor: pointer;
  opacity: .5;
  font-size: 14px;
  padding: 2px 4px;
}

.save-toast-close:hover {
  opacity: 1;
}

@keyframes saveToastIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
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
  height: 32px;
}

.search-input {
  width: 180px;
  height: 32px;
}

.condition-input {
  width: 220px;
  height: 32px;
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
/* Native date inputs in date-range bar */
.dr-date-input {
  height: 32px;
  padding: 0 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-primary);
  outline: none;
  width: 130px;
}

.dr-date-input:focus {
  border-color: var(--primary);
}
</style>
