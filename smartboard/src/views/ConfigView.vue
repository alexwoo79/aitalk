<template>
  <div class="config-view">
    <div v-if="!dataStore.dataSet" class="no-data">
      <p>请先上传数据文件</p>
      <button class="btn btn-primary" @click="$router.push('/')">返回上传</button>
    </div>

    <template v-else>
      <div class="config-header">
        <div class="config-header-top">
          <button class="btn btn-ghost" @click="$router.push('/')">← 返回上传</button>
          <h2>配置 Dashboard</h2>
        </div>
        <p class="subtitle">基于自动推荐配置，你可以自由调整每一项</p>
      </div>

      <div class="config-layout">
        <!-- 左侧：配置面板 -->
        <div class="config-panel">
          <!-- 标题 -->
          <section class="config-section">
            <h3>看板标题</h3>
            <input v-model="configStore.config.title" class="input" placeholder="输入看板标题" />
          </section>

          <!-- 筛选项 -->
          <section class="config-section">
            <h3>筛选项 ({{ configStore.config.filters.length }})</h3>
            <div class="filter-chips">
              <label v-for="col in dimensionCols" :key="col" class="chip"
                :class="{ active: configStore.config.filters.includes(col) }">
                <input type="checkbox" :checked="configStore.config.filters.includes(col)"
                  @change="configStore.toggleFilter(col)" hidden />
                {{ col }}
              </label>
            </div>
          </section>

          <!-- KPI 卡片 -->
          <section class="config-section">
            <h3>KPI 卡片 ({{ configStore.config.kpis.length }}) <span class="drag-hint">⋮⋮ 拖拽排序</span></h3>
            <div class="kpi-list" data-drag-list="kpi">
              <div v-for="(kpi, i) in configStore.config.kpis" :key="i" class="kpi-item" :data-drag-idx="i"
                :class="{ 'drag-placeholder': dragPlaceholder === i && dragList === 'kpi' }">
                <span class="drag-handle" title="拖拽排序" @pointerdown.prevent="onPointerDown($event, i, 'kpi')">⋮⋮</span>
                <div class="kpi-item-main">
                  <div class="kpi-item-row">
                    <input v-model="kpi.label" class="kpi-label-input" placeholder="标签"
                      @change="configStore.updateKpi(i, { label: kpi.label })" />
                    <span class="kpi-col-tag">{{ kpi.column }}</span>
                    <button class="btn-icon" @click="configStore.removeKpi(i)" title="移除">✕</button>
                  </div>
                  <div class="kpi-item-row kpi-item-params">
                    <select :value="kpi.agg"
                      @change="configStore.updateKpi(i, { agg: ($event.target as HTMLSelectElement).value as any })"
                      class="input select-xs">
                      <option v-for="opt in AGG_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                    <select :value="kpi.format"
                      @change="configStore.updateKpi(i, { format: ($event.target as HTMLSelectElement).value })"
                      class="input select-xs">
                      <option v-for="opt in KPI_FORMAT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}
                      </option>
                    </select>
                    <input v-if="kpi.format === 'currency'" :value="kpi.prefix"
                      @change="configStore.updateKpi(i, { prefix: ($event.target as HTMLInputElement).value })"
                      class="input input-xs prefix-input" placeholder="前缀 ¥" />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="availableMetrics.length > 0" class="add-row">
              <select v-model="newKpiCol" class="input select-sm">
                <option value="">选择指标列...</option>
                <option v-for="col in availableMetrics" :key="col" :value="col">{{ col }}</option>
              </select>
              <button class="btn btn-sm" @click="addKpiFromSelect" :disabled="!newKpiCol">添加</button>
            </div>
          </section>

          <!-- 图表块 -->
          <section class="config-section">
            <h3>图表 ({{ configStore.config.charts.length }}) <span class="drag-hint">⋮⋮ 拖拽排序</span></h3>
            <div class="chart-list" data-drag-list="chart">
              <div v-for="(chart, ci) in configStore.config.charts" :key="chart.id" class="chart-item"
                :data-drag-idx="ci" :class="{ 'drag-placeholder': dragPlaceholder === ci && dragList === 'chart' }">
                <span class="drag-handle" title="拖拽排序"
                  @pointerdown.prevent="onPointerDown($event, ci, 'chart')">⋮⋮</span>
                <div class="chart-item-body">
                  <div class="chart-item-header">
                    <span class="chart-type-badge">{{ chartTypeLabel(chart.type) }}</span>
                    <span class="chart-title">{{ chart.title }}</span>
                    <button class="btn-icon" @click="openEditChart(chart)" title="编辑">✎</button>
                    <button class="btn-icon" @click="configStore.removeChart(chart.id)" title="移除">✕</button>
                  </div>
                  <div class="chart-item-detail">
                    <span v-if="chart.dimension">维度: {{ chart.dimension }}</span>
                    <span v-if="chart.metrics?.length">指标: {{ chart.metrics.join(', ') }}</span>
                    <span v-if="chart.metric && !chart.metrics?.length">指标: {{ chart.metric }}</span>
                    <span v-if="chart.dateColumn">日期: {{ chart.dateColumn }}</span>
                    <span v-if="chart.k">K: {{ chart.k }}</span>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-sm btn-add" @click="openAddChart">+ 添加图表</button>
          </section>

          <!-- 表格配置 -->
          <section class="config-section">
            <h3>数据表</h3>
            <div class="table-config-row">
              <label>排序列</label>
              <select v-model="configStore.config.table.sortBy" class="input select-sm">
                <option v-for="col in numericCols" :key="col" :value="col">{{ col }}</option>
              </select>
              <label>行数</label>
              <input type="number" v-model.number="configStore.config.table.topN" class="input input-sm" min="5"
                max="500" />
            </div>
            <div class="table-col-header">
              <span>显示列 ({{ configStore.config.table.columns.length }}/{{ allHeaders.length }})</span>
              <button class="btn-link" @click="configStore.config.table.columns = allHeaders.slice()">全选</button>
              <button class="btn-link" @click="configStore.config.table.columns = []">清空</button>
            </div>
            <div class="filter-chips">
              <label v-for="col in allHeaders" :key="col" class="chip"
                :class="{ active: configStore.config.table.columns.includes(col) }">
                <input type="checkbox" :checked="configStore.config.table.columns.includes(col)"
                  @change="configStore.toggleTableColumn(col)" hidden />
                {{ col }}
              </label>
            </div>
          </section>
        </div>

        <!-- 右侧：预览 -->
        <div class="config-preview">
          <div class="preview-card">
            <h3>预览</h3>
            <div class="preview-stats">
              <div class="stat-item">
                <span class="stat-label">KPI 卡片</span>
                <span class="stat-value">{{ configStore.config.kpis.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">筛选项</span>
                <span class="stat-value">{{ configStore.config.filters.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">图表</span>
                <span class="stat-value">{{ configStore.config.charts.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">数据行</span>
                <span class="stat-value">{{ dataStore.dataSet.rows.length }}</span>
              </div>
            </div>
            <button class="btn btn-primary btn-lg" @click="goToDashboard">
              生成 Dashboard →
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 图表编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showChartEditor" class="modal-overlay" @click.self="cancelChartEdit">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingChartId ? '编辑图表' : '新增图表' }}</h3>
            <button class="btn-icon" @click="cancelChartEdit">✕</button>
          </div>
          <div class="modal-body">
            <div class="editor-grid">
              <label>类型</label>
              <select v-model="chartForm.type" class="input select-sm">
                <option v-for="opt in CHART_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <label>标题</label>
              <input v-model="chartForm.title" class="input" placeholder="图表标题" />

              <template v-if="isBasicChart(chartForm.type)">
                <label>维度</label>
                <select v-model="chartForm.dimension" class="input select-sm">
                  <option value="">(无)</option>
                  <option v-for="col in dimensionCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
                <label>聚合</label>
                <select v-model="chartForm.agg" class="input select-sm">
                  <option v-for="opt in AGG_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>

              <template v-if="chartForm.type === 'timeseries'">
                <label>日期列</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">选择日期列...</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
              </template>

              <template v-if="chartForm.type === 'decile'">
                <label>指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.metrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.metrics.includes(col)" @change="toggleChartMetric(col)"
                      hidden />
                    {{ col }}
                  </label>
                </div>
              </template>

              <template v-if="chartForm.type === 'cluster'">
                <label>K 值</label>
                <input v-model.number="chartForm.k" type="number" class="input input-sm" min="2" max="10" />
                <label>聚类指标</label>
                <div class="metric-chips">
                  <label v-for="col in allMetricCols" :key="col" class="chip sm"
                    :class="{ active: chartForm.clusterMetrics.includes(col) }">
                    <input type="checkbox" :checked="chartForm.clusterMetrics.includes(col)"
                      @change="toggleClusterMetric(col)" hidden />
                    {{ col }}
                  </label>
                </div>
              </template>

              <template v-if="chartForm.type === 'histogram'">
                <label>指标</label>
                <select v-model="chartForm.metric" class="input select-sm">
                  <option value="">选择指标...</option>
                  <option v-for="col in allMetricCols" :key="col" :value="col">{{ col }}</option>
                </select>
              </template>

              <template v-if="chartForm.type === 'line'">
                <label>日期列</label>
                <select v-model="chartForm.dateColumn" class="input select-sm">
                  <option value="">选择日期列...</option>
                  <option v-for="col in dateCols" :key="col" :value="col">{{ col }}</option>
                </select>
                <label>指标</label>
                <select v-model="chartForm.metric" class="input select-sm">
                  <option value="">选择指标...</option>
                  <option v-for="col in allMetricCols" :key="col" :value="col">{{ col }}</option>
                </select>
              </template>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveChart" :disabled="!canSaveChart">保存</button>
            <button class="btn" @click="cancelChartEdit">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { CHART_TYPES, AGG_OPTIONS, KPI_FORMAT_OPTIONS } from '@/types/config'
import type { ChartFormItem } from '@/types/config'

const router = useRouter()
const dataStore = useDataStore()
const configStore = useConfigStore()

const newKpiCol = ref('')
const dragList = ref<'kpi' | 'chart' | null>(null)
const dragIdx = ref(-1)
const dragPlaceholder = ref(-1)
let dragGhost: HTMLElement | null = null
let dragStartY = 0
let dragOffY = 0

function onPointerDown(e: PointerEvent, idx: number, list: 'kpi' | 'chart') {
  const handle = e.currentTarget as HTMLElement
  const item = handle.closest('[data-drag-idx]') as HTMLElement
  if (!item) return
  handle.setPointerCapture(e.pointerId)

  dragList.value = list
  dragIdx.value = idx
  dragStartY = e.clientY
  dragOffY = e.clientY - item.getBoundingClientRect().top

  // create ghost
  dragGhost = item.cloneNode(true) as HTMLElement
  dragGhost.classList.add('drag-ghost')
  dragGhost.style.width = item.offsetWidth + 'px'
  dragGhost.style.left = item.getBoundingClientRect().left + 'px'
  dragGhost.style.top = item.getBoundingClientRect().top + 'px'
  document.body.appendChild(dragGhost)

  item.style.opacity = '0.3'

  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', onPointerUp)
  handle.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragGhost) return
  dragGhost.style.top = (e.clientY - dragOffY) + 'px'

  // find which item we're hovering over
  const els = document.elementsFromPoint(e.clientX, e.clientY)
  for (const el of els) {
    const item = (el as HTMLElement).closest?.('[data-drag-idx]')
    if (item) {
      const listEl = (el as HTMLElement).closest?.('[data-drag-list]')
      const list = listEl?.getAttribute('data-drag-list')
      if (list === dragList.value) {
        const targetIdx = parseInt(item.getAttribute('data-drag-idx')!)
        if (targetIdx !== dragPlaceholder.value) {
          dragPlaceholder.value = targetIdx
        }
        return
      }
    }
  }
  dragPlaceholder.value = -1
}

function onPointerUp(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  handle.removeEventListener('pointermove', onPointerMove)
  handle.removeEventListener('pointerup', onPointerUp)
  handle.removeEventListener('pointercancel', onPointerUp)
  handle.releasePointerCapture(e.pointerId)

  // save values before reset
  const from = dragIdx.value
  const to = dragPlaceholder.value
  const list = dragList.value as 'kpi' | 'chart' | null

  // restore source item opacity
  const listEl = document.querySelector(`[data-drag-list="${list}"]`)
  if (listEl) {
    const srcItem = listEl.querySelector(`[data-drag-idx="${from}"]`) as HTMLElement
    if (srcItem) srcItem.style.opacity = ''
  }

  // remove ghost
  if (dragGhost) { dragGhost.remove(); dragGhost = null }

  // reset
  dragList.value = null
  dragIdx.value = -1
  dragPlaceholder.value = -1

  // perform reorder
  if (from >= 0 && to >= 0 && from !== to && list) {
    if (list === 'kpi') {
      configStore.reorderKpis(from, to)
    } else if (list === 'chart') {
      configStore.reorderCharts(from, to)
    }
  }
}

const availableMetrics = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  const used = new Set(configStore.config.kpis.map((k) => k.column))
  return ds.headers.filter((h) => ds.classifications[h]?.role === 'metric' && !used.has(h))
})

const numericCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'numeric' && ds.classifications[h]?.role === 'metric')
})

const dimensionCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter(
    (h) => ds.classifications[h]?.role === 'dimension' && ds.classifications[h]?.type === 'categorical',
  )
})

const allHeaders = computed(() => {
  return dataStore.dataSet?.headers ?? []
})

function chartTypeLabel(type: string): string {
  return CHART_TYPES.find((t) => t.value === type)?.label ?? type
}

function addKpiFromSelect() {
  if (!newKpiCol.value) return
  const ds = dataStore.dataSet!
  const cls = ds.classifications[newKpiCol.value]
  configStore.addKpi({
    column: newKpiCol.value,
    label: newKpiCol.value,
    agg: 'sum',
    format: cls?.format ?? 'number',
    prefix: cls?.prefix ?? '',
  })
  newKpiCol.value = ''
}

function goToDashboard() {
  router.push('/dashboard')
}

// ====== Chart editor ======
const showChartEditor = ref(false)
const editingChartId = ref<string | null>(null)

const chartForm = reactive({
  type: 'bar' as string,
  title: '',
  dimension: '',
  metric: '',
  metrics: [] as string[],
  dateColumn: '',
  agg: 'sum',
  k: 3,
  clusterMetrics: [] as string[],
})

const allMetricCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.role === 'metric')
})

const dateCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  return ds.headers.filter((h) => ds.classifications[h]?.type === 'date')
})

function isBasicChart(type: string): boolean {
  return ['bar', 'horizontal_bar', 'doughnut'].includes(type)
}

const canSaveChart = computed(() => {
  const f = chartForm
  if (!f.title.trim()) return false
  switch (f.type) {
    case 'bar': case 'horizontal_bar': case 'doughnut':
      return !!f.dimension && f.metrics.length > 0
    case 'histogram': case 'decile':
      return !!f.metric || f.metrics.length > 0
    case 'line': case 'timeseries':
      return !!f.dateColumn && (!!f.metric || f.metrics.length > 0)
    case 'cluster':
      return f.clusterMetrics.length >= 2
    default: return false
  }
})

function resetChartForm() {
  chartForm.type = 'bar'
  chartForm.title = ''
  chartForm.dimension = ''
  chartForm.metric = ''
  chartForm.metrics = []
  chartForm.dateColumn = ''
  chartForm.agg = 'sum'
  chartForm.k = 3
  chartForm.clusterMetrics = []
}

function openAddChart() {
  resetChartForm()
  editingChartId.value = null
  showChartEditor.value = true
}

function openEditChart(chart: ChartFormItem) {
  editingChartId.value = chart.id
  chartForm.type = chart.type
  chartForm.title = chart.title
  chartForm.dimension = chart.dimension || ''
  chartForm.metric = chart.metric || ''
  chartForm.metrics = chart.metrics ? [...chart.metrics] : []
  chartForm.dateColumn = chart.dateColumn || ''
  chartForm.agg = chart.agg || 'sum'
  chartForm.k = chart.k || 3
  chartForm.clusterMetrics = chart.clusterMetrics ? [...chart.clusterMetrics] : []
  showChartEditor.value = true
}

function toggleChartMetric(col: string) {
  const idx = chartForm.metrics.indexOf(col)
  if (idx !== -1) chartForm.metrics.splice(idx, 1)
  else chartForm.metrics.push(col)
  if (chartForm.metrics.length > 0 && !chartForm.metric) {
    chartForm.metric = chartForm.metrics[0]
  }
}

function toggleClusterMetric(col: string) {
  const idx = chartForm.clusterMetrics.indexOf(col)
  if (idx !== -1) chartForm.clusterMetrics.splice(idx, 1)
  else chartForm.clusterMetrics.push(col)
}

function saveChart() {
  if (!canSaveChart.value) return
  const ds = dataStore.dataSet!
  const base: ChartFormItem = {
    id: editingChartId.value || crypto.randomUUID(),
    type: chartForm.type as ChartFormItem['type'],
    title: chartForm.title.trim(),
  }

  if (isBasicChart(chartForm.type)) {
    base.dimension = chartForm.dimension
    base.metrics = chartForm.metrics
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.agg = chartForm.agg
  } else if (chartForm.type === 'histogram') {
    base.metric = chartForm.metric || chartForm.metrics[0]
  } else if (chartForm.type === 'line') {
    base.dateColumn = chartForm.dateColumn
    base.metric = chartForm.metric || chartForm.metrics[0]
  } else if (chartForm.type === 'timeseries') {
    base.dateColumn = chartForm.dateColumn
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.metrics = chartForm.metrics
  } else if (chartForm.type === 'decile') {
    base.metric = chartForm.metrics[0] || chartForm.metric
    base.metrics = chartForm.metrics
  } else if (chartForm.type === 'cluster') {
    base.metrics = chartForm.clusterMetrics
    base.clusterMetrics = chartForm.clusterMetrics
    base.k = chartForm.k
  }

  if (editingChartId.value) {
    configStore.updateChart(editingChartId.value, base)
  } else {
    configStore.addChart(base)
  }
  showChartEditor.value = false
}

function cancelChartEdit() {
  showChartEditor.value = false
}
</script>

<style scoped>
.config-view {
  max-width: 1400px;
  margin: 0 auto;
}

.no-data {
  text-align: center;
  padding: 64px;
  color: var(--text-secondary);
}

.config-header {
  margin-bottom: 24px;
  text-align: center;
}

.config-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 4px;
  position: relative;
}

.config-header-top .btn-ghost {
  position: absolute;
  left: 0;
}

.config-header h2 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-ghost:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}

.config-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.config-section h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--primary);
}

.select-sm {
  flex: 1;
}

.input-sm {
  width: 80px;
}

/* KPI list */
.kpi-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.kpi-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: default;
}

.kpi-item.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.85;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  transform: rotate(1deg);
  cursor: grabbing;
}

.drag-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 0 2px;
  user-select: none;
  line-height: 1;
  margin-top: 2px;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
  margin-left: 8px;
  opacity: 0.6;
}

.kpi-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kpi-item-params {
  flex-wrap: wrap;
}

.kpi-label-input {
  flex: 1;
  background: transparent;
  border: 1px solid transparent;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  border-radius: 4px;
  outline: none;
  min-width: 80px;
}

.kpi-label-input:hover {
  border-color: var(--border);
}

.kpi-label-input:focus {
  border-color: var(--primary);
  background: var(--bg-surface);
}

.kpi-col-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.select-xs {
  width: 72px;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 4px;
}

.input-xs {
  width: 52px;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 4px;
}

.prefix-input {
  width: 56px;
}

.kpi-label {
  font-weight: 500;
  flex: 1;
}

.kpi-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Filter chips */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.chip.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Chart list */
.chart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.chart-item.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

.chart-item-body {
  flex: 1;
}

.chart-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.chart-type-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-light);
  color: var(--primary);
}

.chart-title {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
}

.chart-item-detail {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.btn-add {
  margin-top: 10px;
}

/* Modal overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, .35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

/* Chart editor */
.chart-editor {
  margin-top: 14px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.chart-editor h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.editor-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px 14px;
  align-items: center;
}

.editor-grid label {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.metric-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip.sm {
  padding: 4px 10px;
  font-size: 12px;
}

/* Table config */
.table-config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.table-config-row label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.table-col-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.btn-link:hover {
  text-decoration: underline;
}

/* Preview panel */
.config-preview {
  position: sticky;
  top: 24px;
}

.preview-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.preview-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

.preview-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-lg {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
}

.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-error);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
