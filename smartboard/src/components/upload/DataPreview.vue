<template>
  <div class="data-preview">
    <!-- 文件信息 -->
    <div class="preview-header">
      <div class="preview-header-left">
        <span class="preview-filename">{{ dataSet.customName || dataSet.fileName }}</span>
        <span class="file-meta">（{{ dataSet.rows.length }}{{ t('common.rows') }} × {{ dataSet.headers.length }}{{
          t('common.columns') }}）</span>
        <button v-if="dataStore.tableCount > 1" class="main-table-btn"
          @click.stop="dataStore.setMainTable(dataStore.mainTableId === dataSet.id ? null : dataSet.id)">⭐{{
            dataStore.mainTableId === dataSet.id ? t('upload.mainTable') : t('upload.setMainTable') }}</button>
      </div>
      <button class="btn-next" @click="$emit('next')">{{ t('upload.nextStep') }}</button>
    </div>

    <!-- 列分类结果 -->
    <div class="section">
      <div class="section-head">
        <h4>{{ t('upload.columnClassification') }}</h4>
        <span class="section-hint">{{ t('upload.clickToExclude') }}</span>
        <span v-if="excludedCount > 0" class="section-hint">
          {{ t('upload.excluded', { n: excludedCount }) }}
          <button class="btn-link" @click="resetExcluded">{{ t('common.reset') }}</button>
        </span>
      </div>

      <!-- 数据质量警告 -->
      <div v-if="dirtyColumns.length > 0" class="quality-warning">
        <span>{{ t('upload.dirtyDataWarning', { count: dirtyColumns.length }) }}</span>
        <button class="btn-link" @click="showQualityDetail = !showQualityDetail">
          {{ showQualityDetail ? t('common.collapse') : t('common.detail') }}
        </button>
        <div v-if="showQualityDetail" class="quality-detail">
          <div v-for="dc in dirtyColumns" :key="dc.column" class="quality-item">
            {{ t('upload.dirtyDataDetail', { col: dc.column, count: dc.dirtyCount }) }}
            <span class="dirty-samples">（示例：{{ dc.samples.join('、') }}）</span>
          </div>
        </div>
      </div>

      <div class="col-grid">
        <div v-for="col in dataSet.headers" :key="col" class="col-card" :class="[
          'role-' + dataSet.classifications[col]?.role,
          { excluded: dataStore.excludedColumns.has(col), dirty: isDirty(col) }
        ]" @click="onToggleExclude(col)" @mouseenter="onColEnter(col, $event)" @mouseleave="onColLeave">
          <span class="col-icon">{{ roleIcon(effectiveRole(col)) }}</span>
          <div class="col-text">
            <span class="col-name">
              {{ col }}
              <span v-if="isDirty(col)" class="dirty-badge" :title="dirtyTitle(col)">⚠️{{ getDirtyCount(col) }}</span>
            </span>
            <span class="col-meta" @click.stop="cycleRole(col)">
              {{ typeLabel(dataSet.classifications[col]?.type) }} · {{ roleLabel(effectiveRole(col)) }} 🖉
            </span>
          </div>
          <span v-if="dataStore.excludedColumns.has(col)" class="col-exclude-mark">✕</span>
        </div>
      </div>

      <!-- 列悬停数据报告 Tooltip -->
      <Teleport to="body">
        <div v-if="hoveredCol" class="col-tooltip" :style="{ top: tooltipY + 'px', left: tooltipX + 'px' }">
          <div class="ctt-header">{{ hoveredCol }}</div>
          <div class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.type') }}</span>{{ colTooltip.type }}</div>
          <div class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.nonNull') }}</span>{{ colTooltip.nonNull }}
            / {{ colTooltip.total }}<span v-if="colTooltip.nullCount > 0" class="ctt-null"> · 空值 {{ colTooltip.nullCount }}</span></div>
          <div class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.unique') }}</span>{{ colTooltip.unique }}
          </div>
          <div v-if="colTooltip.isNumeric" class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.min')
          }}</span>{{ colTooltip.min }}</div>
          <div v-if="colTooltip.isNumeric" class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.max')
          }}</span>{{ colTooltip.max }}</div>
          <div v-if="colTooltip.isNumeric" class="ctt-row"><span class="ctt-label">{{ t('upload.tooltip.avg')
          }}</span>{{ colTooltip.avg }}</div>
          <div v-if="colTooltip.dirtyCount" class="ctt-row ctt-dirty"><span class="ctt-label">⚠️ {{
            t('upload.tooltip.dirty') }}</span>{{ colTooltip.dirtyCount }}</div>
          <div v-if="colTooltip.samples.length" class="ctt-samples">
            <div class="ctt-label ctt-samples-label">{{ t('upload.tooltip.samples') }}</div>
            <div v-for="s in colTooltip.samples" :key="s" class="ctt-sample">{{ s }}</div>
          </div>
        </div>
      </Teleport>
    </div>

    <!-- 指标摘要 -->
    <div v-if="dataSet.primaryMetric" class="section">
      <h4>{{ t('upload.autoDetect') }}</h4>
      <p class="detect-text">
        {{ t('upload.primaryMetric') }}：<strong>{{ dataStore.excludedColumns.has(dataSet.primaryMetric) ?
          t('upload.excludedHint') : dataSet.primaryMetric }}</strong>
        &nbsp;|&nbsp;
        {{ t('upload.chartDimensions') }}：<strong>{{dataSet.chartDimensions.filter(d =>
          !dataStore.excludedColumns.has(d)).join(', ') || t('upload.noDimensions')}}</strong>
      </p>
    </div>

    <!-- 样本数据 -->
    <div class="section">
      <h4>{{ t('upload.sampleData', { cols: visibleHeaders.length }) }}</h4>
      <div class="sample-table-wrap">
        <table class="sample-table">
          <thead>
            <tr>
              <th v-for="col in visibleHeaders" :key="col"
                :class="{ 'col-excluded-th': dataStore.excludedColumns.has(col) }">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in dataSet.rows.slice(0, 5)" :key="i">
              <td v-for="col in visibleHeaders" :key="col">{{ truncate(row[col]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DataSet } from '@/types/data'
import { useDataStore } from '@/stores/data-store'

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{ dataSet: DataSet }>()
const emit = defineEmits<{ next: []; toggleExclude: [] }>()

const dataStore = useDataStore()
const showQualityDetail = ref(false)

// ====== 列悬停 Tooltip ======
const hoveredCol = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)
let _hoverTimer: ReturnType<typeof setTimeout> | null = null

interface ColStats { type: string; total: number; nonNull: number; nullCount: number; unique: number; min: string; max: string; avg: string; dirtyCount: number; samples: string[]; isNumeric: boolean }

const colTooltip = computed((): ColStats => {
  const col = hoveredCol.value
  const ds = dataStore.dataSet
  if (!col || !ds) return { type: '', total: 0, nonNull: 0, nullCount: 0, unique: 0, min: '', max: '', avg: '', dirtyCount: 0, samples: [], isNumeric: false }
  const cls = ds.classifications[col]
  const typeLabels: Record<string, string> = { numeric: '数值', categorical: '分类', date: '日期', text: '文本' }
  const type = typeLabels[cls?.type || ''] || cls?.type || '—'
  const isNum = cls?.type === 'numeric'
  const total = ds.rows.length
  const vals = ds.rows.map(r => r[col])
  const nonNull = vals.filter(v => v !== undefined && v !== null && v !== '').length
  const unique = new Set(vals.filter(v => v !== undefined && v !== null && v !== '').map(String)).size
  const dirtyCount = dirtyColumns.value.find(d => d.column === col)?.dirtyCount ?? 0
  // 去重后取前 5 个值作为示例，避免重复值填满列表
  const seen = new Set<string>()
  const sampleVals: string[] = []
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue
    const s = String(v).slice(0, 24)
    if (!seen.has(s)) { seen.add(s); sampleVals.push(s) }
    if (sampleVals.length >= 5) break
  }

  let min = '—', max = '—', avg = '—'
  if (isNum) {
    const nums = vals.map(v => typeof v === 'number' ? v : Number(v)).filter(v => !isNaN(v))
    if (nums.length > 0) {
      min = Math.min(...nums).toLocaleString()
      max = Math.max(...nums).toLocaleString()
      avg = (nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  }
  return { type, total, nonNull, nullCount: total - nonNull, unique, min, max, avg, dirtyCount, samples: sampleVals, isNumeric: isNum }
})

function onColEnter(col: string, e: MouseEvent) {
  if (_hoverTimer) clearTimeout(_hoverTimer)
  _hoverTimer = setTimeout(() => {
    hoveredCol.value = col
    tooltipX.value = e.clientX + 12
    tooltipY.value = e.clientY + 8
  }, 300)
}

function onColLeave() {
  if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null }
  hoveredCol.value = ''
}

const excludedCount = computed(() => dataStore.excludedColumns.size)

// 脏数据检测
const dirtyColumns = computed(() => {
  return dataStore.dataSet?.dataQuality?.dirtyColumns ?? []
})

function isDirty(col: string): boolean {
  return dirtyColumns.value.some((dc) => dc.column === col)
}

function getDirtyCount(col: string): number {
  return dirtyColumns.value.find((dc) => dc.column === col)?.dirtyCount ?? 0
}

function dirtyTitle(col: string): string {
  const dc = dirtyColumns.value.find((dc) => dc.column === col)
  if (!dc) return ''
  return t('upload.dirtyDataDetail', { col: dc.column, count: dc.dirtyCount })
}

const visibleHeaders = computed(() =>
  (dataStore.dataSet?.headers ?? []).filter((h) => !dataStore.excludedColumns.has(h)),
)

function onToggleExclude(col: string) {
  dataStore.toggleExcludeColumn(col)
  emit('toggleExclude')
}

function resetExcluded() {
  dataStore.clearExcluded()
  emit('toggleExclude')
}

const typeLabels: Record<string, string> = {
  numeric: t('classification.type.numeric'),
  categorical: t('classification.type.categorical'),
  date: t('classification.type.date'),
  text: t('classification.type.text'),
}

const roleLabels: Record<string, string> = {
  metric: t('classification.role.metric'),
  dimension: t('classification.role.dimension'),
  time_axis: t('classification.role.time_axis'),
  label: t('classification.role.label'),
  ignore: t('classification.role.ignore'),
}

function typeLabel(type?: string) {
  return type ? (typeLabels[type] ?? type) : ''
}

function roleLabel(role?: string) {
  return role ? (roleLabels[role] ?? role) : ''
}

function effectiveRole(col: string): string {
  return dataStore.roleOverrides[col] || dataStore.dataSet?.classifications[col]?.role || 'ignore'
}

const ROLE_CYCLE = ['metric', 'dimension', 'time_axis', 'label', 'ignore']

function cycleRole(col: string) {
  const current = effectiveRole(col)
  const idx = ROLE_CYCLE.indexOf(current)
  const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length]
  dataStore.setRoleOverride(col, next)
  emit('toggleExclude')
}

const roleIcons: Record<string, string> = {
  metric: '📊',
  dimension: '📋',
  time_axis: '📅',
  label: '🏷️',
  ignore: '—',
}

function roleIcon(role?: string) {
  return role ? (roleIcons[role] ?? '') : ''
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(1)
}

function truncate(val: string | number | undefined): string {
  if (val === undefined || val === null || val === '') return '—'
  const s = String(val)
  return s.length > 30 ? s.slice(0, 27) + '...' : s
}
</script>

<style scoped>
.data-preview {
  margin-top: 24px;
}

/* ── 文件信息栏 ── */
.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  min-width: 0;
}

.preview-header-left {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.preview-filename {
  font-size: 14px;
  font-weight: 600;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

.file-meta {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
}

.main-table-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 4px;
  color: var(--text-secondary);
  opacity: 0.5;
  transition: opacity 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.main-table-btn:hover {
  opacity: 1;
}

.btn-next {
  padding: 0 24px;
  height: 38px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  margin-left: auto;
}

.btn-next:hover {
  opacity: 0.9;
}

/* ── 分区卡片 ── */
.section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
}

.section h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--text-primary);
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-head h4 {
  margin: 0;
}

.section-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
}

/* ── 数据质量警告 ── */
.quality-warning {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  background: #fff8e1;
  border: 1px solid #ffc107;
  font-size: 12px;
  color: #795548;
}

.quality-detail {
  width: 100%;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #e0c88e;
}

.quality-item {
  font-size: 11px;
  padding: 2px 0;
  color: #8d6e63;
}

.dirty-samples {
  color: #bcaaa4;
  font-style: italic;
}

.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #fff3cd;
  color: #856404;
  font-size: 10px;
  font-weight: 600;
  cursor: help;
}

/* ── 列卡片网格 ── */
.col-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.col-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.15s;
}

.col-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.col-card.excluded {
  opacity: 0.4;
  filter: grayscale(0.6);
  border-style: dashed;
}

.col-card.role-metric {
  background: var(--role-metric-bg);
  color: var(--role-metric-text);
}

.col-card.role-dimension {
  background: var(--role-dimension-bg);
  color: var(--role-dimension-text);
}

.col-card.role-time_axis {
  background: var(--role-time-bg);
  color: var(--role-time-text);
}

.col-card.role-label {
  background: var(--role-label-bg);
  color: var(--role-label-text);
}

.col-card.role-ignore {
  background: var(--role-ignore-bg);
  color: var(--role-ignore-text);
  opacity: 0.7;
}

.col-icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.col-text {
  flex: 1;
  min-width: 0;
}

.col-name {
  font-weight: 600;
  font-size: 12px;
  display: block;
}

.col-meta {
  font-size: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  display: block;
  margin-top: 1px;
}

.col-exclude-mark {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--error);
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ── 自动检测 ── */
.detect-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.detect-text strong {
  color: var(--text-primary);
}

/* ── 样本表格 ── */
.sample-table-wrap {
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

.sample-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  font-size: 12px;
}

.sample-table th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 11px;
}

.sample-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-light);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sample-table tbody tr:hover {
  background: var(--bg-hover);
}

/* ── 列悬停 Tooltip ── */
.col-tooltip {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  max-width: 260px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .14);
  padding: 10px 12px;
  font-size: 12px;
  pointer-events: none;
}

.ctt-header {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 4px;
}

.ctt-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
  color: var(--text-primary);
}

.ctt-null {
  color: var(--text-secondary);
  font-size: 11px;
}

.ctt-label {
  color: var(--text-secondary);
  font-size: 11px;
}

.ctt-dirty {
  color: #e65100;
  font-weight: 500;
}

.ctt-samples {
  margin-top: 6px;
  border-top: 1px solid var(--border-light);
  padding-top: 4px;
}

.ctt-samples-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.ctt-sample {
  font-size: 11px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
