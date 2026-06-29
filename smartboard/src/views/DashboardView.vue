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
        <span class="layout-size">{{ layoutW }} × {{ layoutH }}</span>
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
        <div class="filter-item filter-search-group">
          <label>{{ t('common.search') }}</label>
          <span class="input-wrap">
            <input type="text" v-model="filterSearchInput" class="input input-sm search-input"
              :placeholder="t('dashboard.searchPlaceholder')" @keyup.enter="commitFilterInputs" />
            <button v-if="filterSearchInput" class="input-clear" @click="filterSearchInput = ''"
              tabindex="-1">✕</button>
          </span>
          <label>{{ t('common.condition') }}</label>
          <span class="input-wrap">
            <input type="text" v-model="filterConditionInput" class="input input-sm condition-input"
              list="condition-cols" :placeholder="t('dashboard.conditionPlaceholder')"
              @keyup.enter="commitFilterInputs" />
            <button v-if="filterConditionInput" class="input-clear" @click="filterConditionInput = ''"
              tabindex="-1">✕</button>
          </span>
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
          <button v-if="!reactiveFilterMode" class="btn btn-sm btn-apply" @click="commitFilterInputs">{{
            t('dashboard.applyFilter') }}</button>
          <button class="btn btn-sm btn-mode-toggle" :class="{ active: reactiveFilterMode }"
            @click="reactiveFilterMode = !reactiveFilterMode" :title="t('dashboard.filterModeHint')">
            {{ reactiveFilterMode ? '⚡' : '🖱️' }}
          </button>
        </div>
        <button class="btn btn-sm btn-reset" @click="resetFilters">{{ t('dashboard.resetFilter') }}</button>
        <button class="btn btn-sm btn-clear" @click="clearDashboard">Clear</button>
        <button class="btn btn-sm btn-save" @click="saveDashboard">Save</button>
      </div>
      <span class="filter-count">{{ t('common.currentFilter') }}: {{ previewStore.rowCount }} {{ t('common.records')
      }}</span>

      <!-- 日期范围 -->
      <div v-if="dateColWarn" class="date-col-warn">
        <span>⚠️ {{ dateColWarn }}</span>
        <button class="dcw-close" @click="dateColWarn = ''">✕</button>
      </div>
      <div v-if="spec.dateRange" class="date-range-bar">
        <span class="dr-label">{{ t('dashboard.timeSlice') }}:</span>
        <select v-if="spec.dateColumns && spec.dateColumns.length > 1" v-model="previewStore.activeDateColumn"
          @change="onDateColumnChange" class="input input-xs dr-date-col">
          <option v-for="col in spec.dateColumns" :key="col" :value="col">{{ col }}</option>
        </select>
        <span v-else class="dr-label dr-col-name">{{ spec.dateRange.column }}</span>
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
        <div v-if="spec.kpis?.length" class="kpi-row">
          <div v-for="(kpi, i) in spec.kpis" :key="'kpi-' + i" class="kpi-card"
            :style="{ background: KPI_BG[i % KPI_BG.length], color: KPI_TEXT[i % KPI_TEXT.length] }">
            <div class="kpi-icon"><span>{{ kpiIcon(kpi, i) }}</span></div>
            <div class="kpi-content">
              <span class="kpi-value">{{ formatKpiValue(previewStore.computeKpiValue(kpi), kpi.format, kpi.prefix,
                kpi.unit, kpi.decimals) }}</span>
              <span class="kpi-label">{{ kpi.label }}</span>
            </div>
          </div>
        </div>

        <!-- 图表（流式懒加载：仅渲染视口内可见的图表） -->
        <div v-if="spec.charts?.length" class="charts-wrap">
          <div v-for="(chart, i) in spec.charts" :key="'chart-' + i" :ref="(el) => setCardRef(i, el as HTMLElement)"
            :data-chart-index="i" :class="['chart-card', { 'chart-card-full': isAnalysisChart(chart) }]"
            :data-chart-key="'chart-' + i">
            <div class="rs-handle rs-handle-e" @pointerdown.prevent="onResizeStart($event, 'e')"></div>
            <div class="rs-handle rs-handle-s" @pointerdown.prevent="onResizeStart($event, 's')"></div>
            <div class="rs-handle rs-handle-se" @pointerdown.prevent="onResizeStart($event, 'se')"></div>
            <SkeletonChart v-if="!isChartVisible(i)" />
            <template v-else>
              <TimeseriesChart v-if="chart.type === 'timeseries'" :rows="filteredChartRows(chart)"
                :date-column="chart.dateColumn || spec.dateRange?.column || ''"
                :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics?.length ? chart.metrics : allMetricCols" :title="chart.title"
                :metric-formats="chart.metricFormats || {}" :metric-ags="chart.metricAggs || {}" />
              <DecileChart v-else-if="chart.type === 'decile'" :rows="filteredChartRows(chart)"
                :metric="chart.metric || spec.primaryMetric || ''"
                :metrics="chart.metrics?.length ? chart.metrics : allMetricCols" :title="chart.title"
                :metric-formats="chart.metricFormats || {}" :metric-ags="chart.metricAggs || {}" />
              <ClusterChart v-else-if="chart.type === 'cluster'" :rows="filteredChartRows(chart)"
                :metrics="chart.clusterMetrics || chart.metrics || (spec.primaryMetric ? [spec.primaryMetric] : [])"
                :k="chart.k" :title="chart.title" :metric-formats="chart.metricFormats || {}"
                :metric-ags="chart.metricAggs || {}" />
              <BarChartComponent v-else-if="chart.type === 'bar'" :chart="chart as any" :rows="filteredChartRows(chart)"
                :available-metrics="allMetricCols" />
              <HorizontalBarChart v-else-if="chart.type === 'horizontal_bar'" :chart="chart as any"
                :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
              <DoughnutChart v-else-if="chart.type === 'doughnut'" :chart="chart as any"
                :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
              <HistogramChart v-else-if="chart.type === 'histogram'" :chart="chart as any"
                :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
              <LineChartComponent v-else-if="chart.type === 'line'" :chart="chart as any"
                :rows="filteredChartRows(chart)" :available-metrics="allMetricCols" />
            </template>
          </div>
        </div>

        <!-- 数据表 -->
        <div v-if="spec.table" class="data-table-section resizable-card" :class="{ 'is-fullscreen': tableFullscreen }"
          @dblclick="toggleTableFullscreen">
          <div class="rs-handle rs-handle-e" @pointerdown.prevent="onResizeStart($event, 'e')"></div>
          <div class="rs-handle rs-handle-s" @pointerdown.prevent="onResizeStart($event, 's')"></div>
          <div class="rs-handle rs-handle-se" @pointerdown.prevent="onResizeStart($event, 'se')"></div>
          <div class="table-toolbar">
            <h3>{{ t('dashboard.dataTable') }} · {{ tableRows.length }}<span v-if="tableSearch.trim()"> {{
              t('common.matched')
                }}</span> / {{ totalRows }} {{ t('common.rows') }}</h3>
            <div class="table-controls">
              <div class="control-group table-search-group">
                <label>{{ t('common.search') }}</label>
                <span class="input-wrap">
                  <input type="text" v-model="tableSearchInput" class="input input-xs table-search"
                    :placeholder="t('dashboard.tableSearchPlaceholder')" @keyup.enter="commitTableInputs" />
                  <button v-if="tableSearchInput" class="input-clear sm" @click="tableSearchInput = ''"
                    tabindex="-1">✕</button>
                </span>
                <label>{{ t('common.condition') }}</label>
                <span class="input-wrap">
                  <input type="text" v-model="tableConditionInput" class="input input-xs table-cond"
                    list="table-cond-cols" :placeholder="t('dashboard.conditionPlaceholderShort')"
                    @keyup.enter="commitTableInputs" />
                  <button v-if="tableConditionInput" class="input-clear sm" @click="tableConditionInput = ''"
                    tabindex="-1">✕</button>
                </span>
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
                <button v-if="!reactiveFilterMode" class="btn btn-sm btn-apply" @click="commitTableInputs">{{
                  t('dashboard.applyFilter') }}</button>
                <button class="btn btn-sm btn-mode-toggle" :class="{ active: reactiveFilterMode }"
                  @click="reactiveFilterMode = !reactiveFilterMode" :title="t('dashboard.filterModeHint')">
                  {{ reactiveFilterMode ? '⚡' : '🖱️' }}
                </button>
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
              <button class="csv-download" :class="{ done: csvDone }" :disabled="csvDone" @click="downloadTableCsv">
                {{ csvDone ? t('common.downloaded') : '⬇ CSV' }}
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
                <tr v-for="(row, i) in visibleRows" :key="i" :style="getRowColorStyle(row)">
                  <td class="row-num">{{ i + 1 }}</td>
                  <td v-for="col in activeColumns" :key="col" :style="getColumnCellStyle(col, row[col])">
                    {{ cachedFormatCellValue(row[col], col) }}
                  </td>
                </tr>
                <!-- 哨兵行：触发自动加载更多 -->
                <tr v-if="visibleRows.length < tableRows.length" ref="tableSentinel" class="sentinel-row">
                  <td :colspan="activeColumns.length + 1" class="sentinel-cell">
                    <span class="sentinel-text">{{ t('dashboard.showingRows', {
                      shown: visibleRows.length, total:
                        tableRows.length
                    }) }}</span>
                    <button class="btn btn-sm btn-primary sentinel-btn" @click="loadAllRows">{{ t('dashboard.showAll')
                      }} ({{
                        tableRows.length }})</button>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="hasSummaryRow" class="summary-foot">
                <tr class="summary-row">
                  <td class="row-num summary-label">{{ t('config.summaryRow') }}</td>
                  <td v-for="col in activeColumns" :key="col" class="summary-cell">
                    <span class="sc-val">{{ formatSummaryValue(col) }}</span>
                    <span v-if="summaryAggLabel(col)" class="sc-agg">{{ summaryAggLabel(col) }}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
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
import type { ChartSpec, KpiSpec } from '@/types/spec'
import { useTheme } from '@/composables/use-theme'
import { useLazyRender } from '@/composables/use-lazy-render'
import { applyFilter, parseFilter, matchRow } from '@/core/filter'
import SkeletonChart from '@/components/common/SkeletonChart.vue'

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
const chartSizes = ref<Record<string, { width: number; height: number }>>({})

function onResizeStart(e: PointerEvent, dir: 'e' | 's' | 'se') {
  resizeDir = dir
  resizeSX = e.clientX
  resizeSY = e.clientY
  resizeTarget = (e.target as HTMLElement).closest('.chart-card, .resizable-card') as HTMLElement
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
  // Store chart card size if it was a chart card
  if (resizeTarget?.classList.contains('chart-card')) {
    const key = resizeTarget.getAttribute('data-chart-key') || ''
    if (key) {
      chartSizes.value = { ...chartSizes.value, [key]: { width: resizeTarget.offsetWidth, height: resizeTarget.offsetHeight } }
    }
  }
  resizeTarget = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
}
const configStore = useConfigStore()
const { t, locale } = useI18n()
const previewStore = usePreviewStore()

const spec = computed(() => previewStore.buildSpec())

// 流式懒加载：仅渲染视口内可见的图表
const { isVisible: isChartVisible, setCardRef } = useLazyRender(spec.value?.charts?.length ?? 0)

// Layout size tracker (for display and save)
const layoutW = ref(0)
const layoutH = ref(0)
function updateLayoutSize() {
  const el = document.querySelector('.dashboard-view') as HTMLElement | null
  if (el) { layoutW.value = el.offsetWidth; layoutH.value = el.offsetHeight }
}
onMounted(() => { updateLayoutSize(); window.addEventListener('resize', updateLayoutSize) })

const sortCol = ref('')
const sortDir = ref<'asc' | 'desc'>('desc')

// ====== Table controls (runtime, not stored in config) ======
const activeColumns = ref<string[]>([])
const showColPicker = ref(false)
const tableSearch = ref('')
const tableCondition = ref('')
// 输入框绑定本地 ref，点击"应用"后才更新到 tableSearch/tableCondition
const tableSearchInput = ref('')
const tableConditionInput = ref('')
// 筛选栏也使用本地缓冲（用于即时/手动切换模式）
const filterSearchInput = ref('')
const filterConditionInput = ref('')
// 交互模式：true=即时防抖 / false=按钮确认
const reactiveFilterMode = ref(true)
// 防抖定时器
let _filterDebounce: ReturnType<typeof setTimeout> | null = null
let _tableDebounce: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 350

function commitFilterInputs() {
  if (_filterDebounce) { clearTimeout(_filterDebounce); _filterDebounce = null }
  // 同步本地缓冲到 store，然后执行筛选
  previewStore.searchText = filterSearchInput.value
  previewStore.conditionFilter = filterConditionInput.value
  onFilterChange()
}

function commitTableInputs() {
  if (_tableDebounce) { clearTimeout(_tableDebounce); _tableDebounce = null }
  tableSearch.value = tableSearchInput.value
  tableCondition.value = tableConditionInput.value
}

// 即时模式：防抖监听筛选栏输入
watch([filterSearchInput, filterConditionInput], () => {
  if (!reactiveFilterMode.value) return
  if (_filterDebounce) clearTimeout(_filterDebounce)
  _filterDebounce = setTimeout(() => commitFilterInputs(), DEBOUNCE_MS)
})

// 即时模式：防抖监听表格搜索输入
watch([tableSearchInput, tableConditionInput], () => {
  if (!reactiveFilterMode.value) return
  if (_tableDebounce) clearTimeout(_tableDebounce)
  _tableDebounce = setTimeout(() => commitTableInputs(), DEBOUNCE_MS)
})

// 渐进式行渲染：初始只渲染 200 行
const displayRowCount = ref(200)
const tableSentinel = ref<HTMLElement | null>(null)
let _tableObserver: IntersectionObserver | null = null

// 格式化缓存：避免每单元格重复调用 formatCellValue
let _formatCacheGen = 0
const _cellStrCache: Record<string, string> = {}
function cachedFormatCellValue(val: string | number | undefined, col: string): string {
  const key = `${col}\x00${val}`
  return (_cellStrCache[key] ??= formatCellValue(val, col))
}

// Available columns from the dataset (includes merged cross-table columns when relations exist)
const allColumns = computed(() => {
  if (dataStore.hasRelations) return previewStore.effectiveHeaders
  return dataStore.dataSet?.headers ?? []
})

/** 判断列是否为数值类型（数值列用 > <，非数值列用 in ~） */
function isNumericCol(col: string): boolean {
  if (spec.value?.table?.computedColumns?.some(c => c.name === col && c.selected !== false)) return true
  return (dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col])?.type === 'numeric'
}

// Initialize table state from spec
function initTableState() {
  const s = spec.value
  if (s?.table) {
    let cols = s.table.columns.slice()
    // 追加计算列名称
    const cc = s.table.computedColumns?.filter(c => c.selected !== false)
    if (cc?.length) {
      for (const c of cc) {
        if (!cols.includes(c.name)) cols.push(c.name)
      }
    }
    // 按配置页的 columnOrder 排序
    const order = s.table.columnOrder
    if (order && order.length > 0) {
      const rank = new Map(order.map((c, i) => [c, i]))
      cols.sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity))
    }
    activeColumns.value = cols
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
const dateColWarn = ref('')

// Initialize activeDateColumn from spec
watch(() => spec.value?.dateRange?.column, (col) => {
  if (col && !previewStore.activeDateColumn) previewStore.activeDateColumn = col
}, { immediate: true })

function onDateColumnChange() {
  const ds = dataStore.dataSet
  if (!ds || !previewStore.activeDateColumn) return

  // 检测图表日期列与当前时间切片不一致
  const mismatched = (spec.value?.charts || []).filter(c =>
    (c.type === 'timeseries' || c.type === 'line') &&
    c.dateColumn && c.dateColumn !== previewStore.activeDateColumn
  )
  if (mismatched.length > 0) {
    dateColWarn.value = `时序分析基于「${mismatched[0].dateColumn}」计算，当前切片使用「${previewStore.activeDateColumn}」，图表数据可能不一致`
  } else {
    dateColWarn.value = ''
  }

  const dates = ds.rows.reduce((acc: { min: string, max: string }, r) => {
    const d = String(r[previewStore.activeDateColumn] ?? '')
    if (!d) return acc
    return { min: !acc.min || d < acc.min ? d : acc.min, max: !acc.max || d > acc.max ? d : acc.max }
  }, { min: '', max: '' })
  if (dates.min) {
    previewStore.dateRange.start = dates.min
    previewStore.dateRange.end = dates.max
    dateStart.value = dates.min
    dateEnd.value = dates.max
    previewStore.applyFilters()
  }
}

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
  // 默认选中"全部"
  if (spec.value?.filters) {
    for (const f of spec.value.filters) {
      if (!previewStore.filterValues[f.column]) previewStore.filterValues[f.column] = '__all__'
    }
  }
  previewStore.applyFilters()
  initTableState()
  // 等待 DOM 渲染后设置表格哨兵观察器
  nextTick(() => setupTableObserver())
})

onUnmounted(() => {
  _tableObserver?.disconnect()
  _tableObserver = null
})

// 表格重新出现时重新设置观察器
watch(() => spec.value?.table, (tbl) => {
  if (tbl) {
    displayRowCount.value = 200
    nextTick(() => setupTableObserver())
  }
})

function onFilterChange() {
  // 取消挂起的防抖，避免重复触发
  if (_filterDebounce) { clearTimeout(_filterDebounce); _filterDebounce = null }
  // 直接使用 store 中已确认的值执行筛选（不触碰本地缓冲）
  previewStore.applyFilters()
}

// ====== Filter bar actions ======
const dashboardCleared = ref(false)
const saveMsg = ref('')
const saveMsgType = ref<'success' | 'error'>('success')
const tableFullscreen = ref(false)

function toggleTableFullscreen() {
  tableFullscreen.value = !tableFullscreen.value
  if (tableFullscreen.value) {
    document.addEventListener('keydown', onTableFullscreenEsc)
  }
}
function onTableFullscreenEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') { tableFullscreen.value = false; document.removeEventListener('keydown', onTableFullscreenEsc) }
}

function resetFilters() {
  for (const key of Object.keys(previewStore.filterValues)) {
    previewStore.filterValues[key] = '__all__'
  }
  previewStore.searchText = ''
  previewStore.conditionFilter = ''
  filterSearchInput.value = ''
  filterConditionInput.value = ''
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

  // 1. 等待 Vue 动态 DOM 和图表完全渲染稳定
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 300))

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
    formula: k.formula || undefined,
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
  const tblCols = s.table?.columns ?? []
  const tblSort = s.table?.sortBy || ''
  const tblRowLimit = s.table?.rowLimit
  const tblSummaryAggs = s.table?.summaryAggs || {}
  const tblColColors = s.table?.columnColors || {}
  const tblRowCondColors = s.table?.rowConditionColors || []
  const date = new Date().toISOString().slice(0, 10)
  const i18nData = locale.value === 'zh-CN' ? zhCN : enUS

  // ====== 收集元数据（取自 dataStore 加载时采集的文件信息） ======
  let appVersion = '0.0.0'
  try {
    const pkg = await import('@/../package.json')
    appVersion = (pkg as any).default?.version || (pkg as any).version || appVersion
  } catch { /* ignore */ }
  const fileMeta = {
    fileName: ds.fileName || undefined,
    fileSize: ds.fileSize,
    fileModified: ds.fileModified,
    fileHash: ds.fileHash,
    appVersion,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    colCount: headers.length,
  }

  // 图表卡片尺寸 CSS — 仅对用户手动拖拽过的图表固定尺寸，其余保持自适应
  const chartSizeCss = s.charts.map((_c, i) => {
    const explicit = chartSizes.value['chart-' + i]
    if (explicit) return `.chart-card-${i} { width: ${explicit.width}px; height: ${explicit.height}px; flex: none; }`
    return ''
  }).filter(Boolean).join('\n')

  // 捕获当前布局容器宽度，避免浏览器窗口更宽时图表排列变化
  const containerEl = document.querySelector('.dashboard-view') as HTMLElement | null
  const layoutWidth = containerEl ? containerEl.offsetWidth : 0
  const layoutCss = layoutWidth > 0 ? `.container { max-width: ${layoutWidth}px !important; }` : ''

  // ====== 2. 使用 DOMParser + DOM API 构建 HTML，避免字符串拼接错误 ======
  const [echartsMod, templateMod, rendererMod] = await Promise.all([
    import('echarts/dist/echarts.min.js?raw'),
    import('@/../templates/result_template.html?raw'),
    import('@/../dist-standalone/renderer.js?raw'),
  ])
  const echartsCode = (echartsMod as any).default
  const resultTemplate = (templateMod as any).default
  const rendererJS = (rendererMod as any).default

  // 解析模板为 DOM，后续所有操作都在 DOM 上进行
  const parser = new DOMParser()
  const doc = parser.parseFromString(resultTemplate, 'text/html')

  // --- 替换 head 中的 <!--ECHARTS_TAG--> ---
  if (doc.head) {
    // 移除 HTML 注释占位符 <!--ECHARTS_TAG-->
    for (const child of Array.from(doc.head.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE && child.textContent?.trim() === 'ECHARTS_TAG') {
        child.remove()
      } else if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').includes('ECHARTS_TAG')) {
        child.remove()
      }
    }
    const echartsScript = doc.createElement('script')
    echartsScript.textContent = echartsCode
    doc.head.appendChild(echartsScript)
  }

  // --- 替换标题 ---
  doc.title = title
  const h1 = doc.querySelector('h1')
  if (h1) h1.textContent = title

  // --- 注入 __DATA__ 和 __I18N__ 脚本 ---
  const allScripts = Array.from(doc.querySelectorAll('script'))
  const dataScript = allScripts.find(s => (s.textContent || '').includes('__DATA__'))
  if (dataScript) {
    // 用 DOM 构建整个 JSON 数据块，避免字符串拼接
    const dummy = doc.createElement('div')
    const dataObj: Record<string, any> = {
      title,
      headers,
      rows,
      classifications: cls,
      filterSpecs,
      kpiSpecs,
      chartSpecs,
      metricDefaults: s.metricDefaults || {},
      tableColumns: tblCols,
      tableSortBy: tblSort,
      tableRowLimit: tblRowLimit,
      tableSummaryAggs: tblSummaryAggs,
      tableColColors: tblColColors,
      tableRowCondColors: tblRowCondColors,
      dateRange: s.dateRange || null,
      dateStart: previewStore.dateRange.start || '',
      dateEnd: previewStore.dateRange.end || '',
      locale: locale.value,
      _fileMeta: fileMeta,
    }
    dataScript.textContent =
      `var __DATA__ = ${JSON.stringify(dataObj)};\n` +
      `var __I18N__ = ${JSON.stringify(i18nData)};`
  }

  // --- 替换 /* RENDERER_JS */ ---
  const rendererScript = allScripts.find(s => {
    const t = (s.textContent || '').trim()
    return t === '/* RENDERER_JS */' || t.includes('RENDERER_JS')
  })
  if (rendererScript) {
    rendererScript.textContent = rendererJS
    rendererScript.removeAttribute('src')
  }

  // --- 替换 /* FULLSCREEN_JS */（使用 DOM API 避免转义错误）---
  const fsScript = allScripts.find(s => {
    const t = (s.textContent || '').trim()
    return t === '/* FULLSCREEN_JS */' || t.includes('FULLSCREEN_JS')
  })
  if (fsScript) {
    // Fullscreen 由 entry.ts 的 toggleFullscreen + Escape 键处理，此处仅补充 CSS
    fsScript.textContent = [
      '// Fullscreen handled by renderer (entry.ts) via toggleFullscreen + Escape key',
      '// CSS: .chart-card.is-fullscreen has display:flex;flex-direction:column for chart body expansion',
    ].join('\n')
  }

  // --- 注入布局宽度 + 图表卡片尺寸 CSS ---
  const injectCss = [layoutCss, chartSizeCss].filter(Boolean).join('\n')
  if (injectCss) {
    const styleEl = doc.querySelector('style')
    if (styleEl) {
      styleEl.textContent += '\n/* layout & chart sizes */\n' + injectCss
    }
  }

  // --- 从 DOM 序列化最终 HTML ---
  let html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML

  // ====== 3. 替换捕获 HTML 中的外部资源为内联 ======
  html = await inlineExternalResources(html)

  // ====== 4. DOMParser 校验 ======
  const validateParser = new DOMParser()
  const validateDoc = validateParser.parseFromString(html, 'text/html')
  const parseErrorEl = validateDoc.querySelector('parsererror')
  if (parseErrorEl) {
    throw new Error(`拼接错误：${parseErrorEl.textContent}`)
  }

  // ====== 5. 校验通过后执行文件下载 ======
  const { save, message } = await import('@tauri-apps/plugin-dialog')
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
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

/**
 * 将 HTML 中的外部资源（link[rel=stylesheet]、script[src]）替换为内联版本。
 * 从当前页面的 DOM 中捕获外部资源内容，直接嵌入。
 */
async function inlineExternalResources(html: string): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 1) 内联外部 CSS：link[rel=stylesheet][href]
  const externalLinks = doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')
  for (const link of externalLinks) {
    const href = link.getAttribute('href')
    if (!href || href.startsWith('data:')) continue
    try {
      // 尝试从当前页面的对应样式表中提取内容
      const liveStyle = findLiveStyleSheet(href)
      if (liveStyle) {
        const styleEl = doc.createElement('style')
        styleEl.textContent = liveStyle
        link.replaceWith(styleEl)
      }
    } catch {
      // 无法内联则保留原样
    }
  }

  // 2) 内联外部 JS：script[src]
  const externalScripts = doc.querySelectorAll<HTMLScriptElement>('script[src]')
  for (const script of externalScripts) {
    const src = script.getAttribute('src')
    if (!src || src.startsWith('data:')) continue
    try {
      // 尝试从当前页面找到对应脚本内容
      const liveContent = findLiveScriptContent(src)
      if (liveContent) {
        const newScript = doc.createElement('script')
        newScript.textContent = liveContent
        // 保留原有属性（type, defer 等）
        for (const attr of Array.from(script.attributes)) {
          if (attr.name !== 'src') {
            newScript.setAttribute(attr.name, attr.value)
          }
        }
        script.replaceWith(newScript)
      }
    } catch {
      // 无法内联则保留原样
    }
  }

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}

/** 从当前页面查找匹配 href 的样式表内容 */
function findLiveStyleSheet(href: string): string | null {
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href && (sheet.href.endsWith(href) || sheet.href === href)) {
      try {
        let css = ''
        for (const rule of Array.from(sheet.cssRules || [])) {
          css += rule.cssText + '\n'
        }
        return css
      } catch {
        return null
      }
    }
  }
  // 回退：通过 fetch 获取（适用于同源资源）
  return null
}

/** 从当前页面查找匹配 src 的脚本内容 */
function findLiveScriptContent(src: string): string | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]')
  for (const script of scripts) {
    const s = script.getAttribute('src') || ''
    if (s.endsWith(src) || s === src) {
      // 通过重新 fetch 获取脚本内容
      return null // 浏览器安全限制，无法直接获取已执行脚本的源码
    }
  }
  return null
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
  return rows.reduce((n, r) => {
    const d = String(r[dateCol] ?? '').trim()
    return d >= start && d <= end ? n + 1 : n
  }, 0)
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
  const cls = dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col]
  const isCompCol = spec.value?.table?.computedColumns?.some(c => c.name === col && c.selected !== false)
  if ((cls?.type === 'numeric' && cls.role === 'metric') || isCompCol) {
    const n = getNumericVal(val)
    if (!isNaN(n)) {
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
  const s: Record<string, string> = {}
  const bg = configStore.config.table.columnColors?.[col]
  const fg = configStore.config.table.columnTextColors?.[col]
  if (bg) s.backgroundColor = bg
  if (fg) s.color = fg
  return s
}

function getColumnCellStyle(col: string, val: any): Record<string, string> {
  const s: Record<string, string> = {}
  const bg = configStore.config.table.columnColors?.[col]
  const fg = configStore.config.table.columnTextColors?.[col]
  if (bg) s.backgroundColor = bg + '20'
  // 列条件字体色优先于静态字体色
  const ruleColor = matchColTextRule(col, val)
  const textColor = ruleColor || (fg ? fg + 'a0' : '')
  if (textColor) s.color = textColor
  return s
}

/** 对单个单元格值，匹配列条件字体色规则 */
function matchColTextRule(col: string, val: any): string | null {
  const rules = configStore.config.table.columnTextRules?.[col]
  if (!rules || rules.length === 0) return null
  const numVal = Number(val)
  const isNum = !isNaN(numVal) && val != null && val !== ''
  for (const rule of rules) {
    if (!rule.condition.trim() || !rule.color) continue
    try {
      const cond = rule.condition.trim()
      if (isNum) {
        // 数值条件：> 100, < 0, >= 50, <= 20, = 0, != 0
        const m = cond.match(/^(>=?|<=?|!=?|=)\s*(-?[\d.]+)$/)
        if (m) {
          const op = m[1]; const n = parseFloat(m[2])
          if ((op === '>' && numVal > n) || (op === '>=' && numVal >= n) ||
            (op === '<' && numVal < n) || (op === '<=' && numVal <= n) ||
            (op === '=' || op === '==') && numVal === n ||
            (op === '!=' && numVal !== n)) {
            return rule.color
          }
        }
      } else {
        // 字符串条件：= 张三, != 张三, ~ 张三（模糊匹配）
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
    } catch { /* skip */ }
  }
  return null
}

const rowColorCache = computed(() => {
  const rules = configStore.config.table.rowConditionColors
  if (!rules?.length) return null
  const cache = new WeakMap<Record<string, any>, Record<string, string>>()

  // 预编译所有规则的条件为解析后的谓词（只解析一次）
  const compiledRules = rules.map(rule => {
    if (!rule.condition.trim() || !rule.color) return null
    const fullExpr = rule.condition.trim()
    const andGroups = fullExpr.split('&').map(g => g.trim()).filter(g => g)
    const parsedAndGroups = andGroups.map(group => {
      const orConds = group.split('|').map(c => c.trim()).filter(c => c)
      return orConds.map(parseFilter).filter((p): p is NonNullable<ReturnType<typeof parseFilter>> => p !== null)
    }).filter(g => g.length > 0)
    if (parsedAndGroups.length === 0) return null
    return { parsedAndGroups, color: rule.color, textColor: rule.textColor }
  }).filter(Boolean) as { parsedAndGroups: { column: string; op: string; value: string }[][]; color: string; textColor?: string }[]

  if (compiledRules.length === 0) return null

  for (const row of tableRows.value) {
    for (const rule of compiledRules) {
      // 评估预编译的条件：AND 组全部满足，每组内 OR 条件至少一个满足
      const matches = rule.parsedAndGroups.every(orGroup =>
        orGroup.some(parsed => matchRow(row, parsed))
      )
      if (matches) {
        const s: Record<string, string> = { backgroundColor: rule.color + '30' }
        if (rule.textColor) s.color = rule.textColor + 'c0'
        cache.set(row, s)
        break
      }
    }
  }
  return cache
})

function getRowColorStyle(row: Record<string, any>): Record<string, string> {
  return rowColorCache.value?.get(row) ?? {}
}

// ====== Table rows with search + sorting ======
// 共享的表格筛选结果（tableRows 和 summaryValues 共用，避免重复过滤）
const tableFilteredRows = computed(() => {
  const rows = previewStore.filtersApplied
    ? previewStore.filteredRows
    : (dataStore.dataSet?.rows ?? [])

  // 追加计算列，使表格筛选可引用计算列
  let filtered = augmentWithComputedCols(rows)

  const q = tableSearch.value.trim().toLowerCase()
  if (q) {
    const cols = activeColumns.value.length > 0 ? activeColumns.value : allColumns.value
    filtered = filtered.filter((row) =>
      cols.some((col) => {
        const v = row[col]
        if (v == null || v === '') return false
        return String(v).toLowerCase().includes(q)
      }),
    )
  }
  if (tableCondition.value.trim()) {
    filtered = applyFilter(filtered, undefined, tableCondition.value)
  }
  return filtered
})

/** 为行追加计算列值（纯函数，不依赖 computed） */
function augmentWithComputedCols(rows: Record<string, any>[]): Record<string, any>[] {
  const cc = spec.value?.table?.computedColumns?.filter(c => c.selected !== false && c.name && c.expression)
  if (!cc?.length) return rows
  return rows.map(row => {
    const aug = { ...row }
    for (const c of cc) {
      try {
        if (c.filter && applyFilter([row], undefined, c.filter).length === 0) {
          aug[c.name] = ''; continue
        }
        let expr = c.expression
        for (const v of c.variables || []) {
          let val: number
          if (v.filter && applyFilter([row], undefined, v.filter).length === 0) {
            val = 0
          } else {
            val = Number(aug[v.column] ?? row[v.column])
          }
          expr = expr.replace(new RegExp('\\b' + v.alias + '\\b', 'g'), isNaN(val) ? '0' : String(val))
        }
        const result = new Function('"use strict"; return (' + expr + ')')()
        aug[c.name] = typeof result === 'number' && isFinite(result) ? result : ''
      } catch { aug[c.name] = '' }
    }
    return aug
  })
}

/** 为每行追加计算列的值（排序/汇总用） */
const augmentedRows = computed(() => {
  return augmentWithComputedCols(tableFilteredRows.value)
})

const tableRows = computed(() => {
  let sorted = [...augmentedRows.value]
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
  return sorted
})

// 数据变更时清空格式化缓存
watch(() => tableRows.value.length, () => {
  for (const k of Object.keys(_cellStrCache)) delete _cellStrCache[k]
})

// 渐进式渲染：只取前 displayRowCount 行
const visibleRows = computed(() => tableRows.value.slice(0, displayRowCount.value))

function loadAllRows() {
  displayRowCount.value = tableRows.value.length
  _tableObserver?.disconnect()
  _tableObserver = null
}

// 哨兵可见时自动加载更多
function setupTableObserver() {
  _tableObserver?.disconnect()
  if (!tableSentinel.value) return
  _tableObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && displayRowCount.value < tableRows.value.length) {
      displayRowCount.value = Math.min(displayRowCount.value + 200, tableRows.value.length)
    }
  }, { rootMargin: '400px 0px' })
  _tableObserver.observe(tableSentinel.value)
}

// 排序/搜索变更时重置渲染行数
watch([sortCol, sortDir, tableSearch, tableCondition], () => {
  displayRowCount.value = 200
}, { flush: 'sync' })

// ====== Summary row (底部汇总行) ======
const hasSummaryRow = computed(() => {
  const aggs = spec.value?.table?.summaryAggs
  return aggs && Object.keys(aggs).length > 0
})

const summaryValues = computed(() => {
  const noTableFilter = !tableSearch.value.trim() && !tableCondition.value.trim()
  if (noTableFilter && previewStore.dashboardResult?.summary_values) {
    return previewStore.dashboardResult.summary_values
  }

  const rows = augmentedRows.value
  const aggs = spec.value?.table?.summaryAggs || {}
  if (Object.keys(aggs).length === 0) return {}

  const result: Record<string, number> = {}
  for (const col of Object.keys(aggs)) {
    const agg = aggs[col]
    if (agg === 'unique_count') {
      const raw = rows.map(r => String(r[col] ?? '')).filter(v => v !== '')
      result[col] = new Set(raw).size
      continue
    }
    const vals = rows.map(r => getNumericVal(r[col])).filter(v => !isNaN(v))
    if (vals.length === 0) { result[col] = 0; continue }
    switch (agg) {
      case 'sum': result[col] = vals.reduce((a, b) => a + b, 0); break
      case 'avg': result[col] = vals.reduce((a, b) => a + b, 0) / vals.length; break
      case 'count': result[col] = vals.length; break
      case 'min': result[col] = vals.reduce((a, b) => a < b ? a : b, Infinity); break
      case 'max': result[col] = vals.reduce((a, b) => a > b ? a : b, -Infinity); break
    }
  }
  return result
})

function formatSummaryValue(col: string): string {
  const val = summaryValues.value[col]
  if (val === undefined) return '—'
  const agg = spec.value?.table?.summaryAggs?.[col]
  if (agg === 'count' || agg === 'unique_count') return String(val)
  const cls = dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col]
  const isCompCol = spec.value?.table?.computedColumns?.some(c => c.name === col && c.selected !== false)
  if (cls?.type === 'numeric' || isCompCol) {
    const def = spec.value?.metricDefaults?.[col]
    if (def && (!def.sections || def.sections.includes('table')) && def.format) {
      return fmtByChart(val, { format: def.format, unit: def.unit, metricFormats: { [col]: { format: def.format, unit: def.unit, decimals: def.decimals } } }, col)
    }
    return fmt(val, 2)
  }
  return String(val)
}

function summaryAggLabel(col: string): string {
  const agg = spec.value?.table?.summaryAggs?.[col]
  if (!agg) return ''
  const map: Record<string, string> = {
    sum: t('config.aggSum'),
    avg: t('config.aggAvg'),
    count: t('config.aggCount'),
    unique_count: t('config.aggUniqueCount'),
    min: t('config.aggMin'),
    max: t('config.aggMax'),
  }
  return map[agg] || ''
}

// ====== CSV download ======
const csvDone = ref(false)
async function downloadTableCsv() {
  const rows = tableRows.value
  const cols = activeColumns.value
  if (!rows.length || !cols.length) return
  const BOM = '\uFEFF'
  let csv = BOM + cols.join(',') + '\n'
  for (const row of rows) {
    csv += cols.map(c => {
      const v = row[c]
      if (v == null || v === '') return ''
      const s = String(v)
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(',') + '\n'
  }
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  const filePath = await save({
    defaultPath: `${spec.value?.title || 'data'}_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
  })
  if (filePath) {
    await writeTextFile(filePath, csv)
    csvDone.value = true
    setTimeout(() => { csvDone.value = false }, 1500)
  }
}

// ====== Active rows (filtered or all) ======
function getRows(): Record<string, string | number>[] {
  return previewStore.filtersApplied
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
  let headers: string[] = []
  if (dataStore.hasRelations) {
    headers = previewStore.effectiveHeaders.filter((h) => !dataStore.excludedColumns.has(h))
  } else {
    const ds = dataStore.dataSet
    if (ds) headers = ds.headers.filter((h) => !dataStore.excludedColumns.has(h))
  }
  // 追加已选中的计算列
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !headers.includes(c.name)) {
        headers.push(c.name)
      }
    }
  }
  return headers
})

const allMetricCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const headers = dataStore.hasRelations ? allHeaders.value : ds.headers
  return headers.filter((h) => {
    const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
    return cls?.role === 'metric' && !dataStore.excludedColumns.has(h)
  })
})

function isAnalysisChart(chart: ChartSpec): boolean {
  return chart.type === 'timeseries' || chart.type === 'decile' || chart.type === 'cluster'
}


</script>

<style scoped>
.dashboard-view {
  max-width: 1200px;
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

.layout-size {
  position: absolute;
  right: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
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

.filter-search-group {
  flex-shrink: 0;
  border: 1.5px solid #10B981;
  border-radius: 6px;
  padding: 3px 10px;
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
  width: 240px;
  height: 32px;
  line-height: 1.4;
}

.filter-actions {
  display: flex;
  gap: 8px;
  margin-left: 4px;
}

.btn-apply {
  color: #fff;
  background: #10B981;
  border-color: #10B981;
}

.btn-apply:hover {
  background: #059669;
  border-color: #059669;
}

.btn-mode-toggle {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-mode-toggle.active {
  background: #DBEAFE;
  border-color: #3B82F6;
  color: #1D4ED8;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.btn-mode-toggle:hover {
  border-color: var(--primary);
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
  color: #fff;
  background: #F59E0B;
  border-color: #F59E0B;
}

.btn-save:hover {
  background: #D97706;
  border-color: #D97706;
}

.filter-count {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
}

/* Date range bar */
.date-col-warn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  font-size: 12px;
  color: #92400e;
  margin-bottom: 8px;
}

.dcw-close {
  border: none;
  background: none;
  color: #92400e;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  opacity: 0.6;
}

.dcw-close:hover {
  opacity: 1;
}

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

.dr-col-name {
  font-weight: 400;
  color: var(--text-primary);
}

.dr-date-col {
  width: 130px;
  font-size: 12px;
  height: 28px;
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

/* KPI row */
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 20px;
}

.kpi-row .kpi-card {
  flex: 1;
  min-width: 180px;
  max-width: 280px;
}

/* Charts flex layout with resize handles — contain & overflow prevent ECharts infinite stretch on Windows */
.charts-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.chart-card {
  flex: 1 1 400px;
  max-width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 280px;
  min-width: 320px;
  max-height: 80vh;
  position: relative;
  overflow: hidden;
  contain: layout style;
}

.chart-card-full {
  flex: 1 1 100%;
  max-width: 100%;
  min-height: 420px;
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

.chart-card:hover .rs-handle,
.resizable-card:hover .rs-handle {
  opacity: 1;
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
  display: flex;
  flex-direction: column;
}

.data-table-section.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  max-height: 100vh;
  border-radius: 0;
  padding: 24px;
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

.table-search-group {
  border: 1.5px solid #10B981;
  border-radius: 6px;
  padding: 2px 8px;
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

/* 输入框包裹 + 内嵌清除按钮 */
.input-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.input-wrap .input {
  padding-right: 26px;
}

.input-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 3px;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.input-clear:hover {
  opacity: 1;
  color: var(--text-primary);
  background: var(--bg-hover);
}

.input-clear.sm {
  font-size: 10px;
  right: 2px;
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
  flex: 1;
  overflow: auto;
  min-height: 0;
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.sentinel-cell {
  text-align: center;
  padding: 12px;
  color: var(--text-secondary);
}

.sentinel-text {
  margin-right: 12px;
  font-size: 12px;
}

.sentinel-btn {
  font-size: 12px;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  user-select: none;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-surface);
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

/* Summary row (底部汇总行) */
.summary-foot {
  position: sticky;
  bottom: 0;
  z-index: 3;
}

.summary-row {
  background: var(--bg-hover);
  border-top: 2px solid var(--primary);
  font-weight: 600;
}

.summary-row td {
  padding: 8px 12px;
  border-bottom: none;
}

.summary-label {
  color: var(--primary);
  font-size: 12px;
}

.summary-cell {
  color: var(--text-primary);
  font-size: 13px;
}

.sc-val {
  display: block;
  font-weight: 600;
}

.sc-agg {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-secondary);
  opacity: 0.7;
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
