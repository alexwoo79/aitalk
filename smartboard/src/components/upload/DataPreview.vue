<template>
  <div class="data-preview">
    <!-- 文件信息 -->
    <div class="preview-header">
      <div class="file-info">
        <h3>{{ dataSet.fileName }}</h3>
        <span class="badge">{{ dataSet.rows.length }} 行</span>
        <span class="badge">{{ dataSet.headers.length }} 列</span>
      </div>
      <button class="btn-next" @click="$emit('next')">下一步：配置 Dashboard →</button>
    </div>

    <!-- 列分类结果 -->
    <div class="section">
      <div class="section-header">
        <h4>列分类结果</h4>
        <div class="exclude-controls">
          <span class="exclude-hint click-hint">💡 点击卡片选择排除</span>
          <span v-if="excludedCount > 0" class="exclude-hint">
            已排除 {{ excludedCount }} 列
            <button class="btn-link" @click="resetExcluded">重置</button>
          </span>
        </div>
      </div>
      <div class="col-grid">
        <div
          v-for="col in dataSet.headers"
          :key="col"
          class="col-card"
          :class="[
            'role-' + dataSet.classifications[col]?.role,
            { excluded: dataStore.excludedColumns.has(col) }
          ]"
          @click="onToggleExclude(col)"
        >
          <div class="col-icon">
            <span>{{ roleIcon(dataSet.classifications[col]?.role) }}</span>
          </div>
          <div class="col-body">
            <div class="col-name">{{ col }}</div>
            <div class="col-meta">
              {{ typeLabel(dataSet.classifications[col]?.type) }} · {{ roleLabel(dataSet.classifications[col]?.role) }}
            </div>
          </div>
          <div class="col-exclude-mark" v-if="dataStore.excludedColumns.has(col)">✕</div>
        </div>
      </div>
    </div>

    <!-- 指标摘要 -->
    <div v-if="dataSet.primaryMetric" class="section">
      <h4>自动检测</h4>
      <div class="detection-info">
        <span>主指标：<strong>{{ dataStore.excludedColumns.has(dataSet.primaryMetric) ? '（已排除）' : dataSet.primaryMetric }}</strong></span>
        <span>图表维度：<strong>{{ dataSet.chartDimensions.filter(d => !dataStore.excludedColumns.has(d)).join(', ') || '无' }}</strong></span>
      </div>
    </div>

    <!-- 样本数据 -->
    <div class="section">
      <h4>样本数据（前 5 行，{{ visibleHeaders.length }}/{{ dataSet.headers.length }} 列）</h4>
      <div class="table-wrapper">
        <table class="sample-table">
          <thead>
            <tr>
              <th v-for="col in visibleHeaders" :key="col" :class="{ 'col-excluded-th': dataStore.excludedColumns.has(col) }">{{ col }}</th>
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
import { computed } from 'vue'
import type { DataSet } from '@/types/data'
import { useDataStore } from '@/stores/data-store'

defineProps<{ dataSet: DataSet }>()
const emit = defineEmits<{ next: []; toggleExclude: [] }>()

const dataStore = useDataStore()

const excludedCount = computed(() => dataStore.excludedColumns.size)

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
  numeric: '数值',
  categorical: '分类',
  date: '日期',
  text: '文本',
}

const roleLabels: Record<string, string> = {
  metric: '指标',
  dimension: '维度',
  time_axis: '时间轴',
  label: '标签',
  ignore: '忽略',
}

function typeLabel(type?: string) {
  return type ? (typeLabels[type] ?? type) : ''
}

function roleLabel(role?: string) {
  return role ? (roleLabels[role] ?? role) : ''
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

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-info h3 {
  font-size: 18px;
  font-weight: 600;
}

.badge {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--primary-light);
  color: var(--primary);
}

.btn-next {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-next:hover {
  opacity: 0.9;
}

.section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.section h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-header h4 {
  margin-bottom: 0;
}

.exclude-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exclude-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.exclude-hint.click-hint {
  font-style: italic;
  opacity: 0.7;
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

.btn-link:hover {
  color: var(--primary-hover);
}

/* Column grid */
.col-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.col-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.col-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.col-card.excluded {
  opacity: 0.45;
  filter: grayscale(0.6);
  border-style: dashed;
  border-color: var(--role-ignore-text, #999);
}

.col-card.excluded:hover {
  opacity: 0.65;
  filter: grayscale(0.3);
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(128, 128, 128, .12);
  font-size: 20px;
  flex-shrink: 0;
}

.col-body {
  flex: 1;
  min-width: 0;
}

.col-name {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 2px;
}

.col-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Exclude mark */
.col-exclude-mark {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Detection info */
.detection-info {
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.detection-info strong {
  color: var(--text-primary);
}

/* Sample table */
.table-wrapper {
  overflow-x: auto;
}

.sample-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.sample-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-secondary);
}

.sample-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sample-table tbody tr:hover {
  background: var(--bg-hover);
}
</style>
