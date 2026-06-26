<!-- src/components/upload/RelationConfig.vue -->
<template>
  <div class="relation-config">
    <div class="relation-header">
      <h3>{{ t('upload.relationTitle') }}</h3>
      <p class="relation-desc">{{ t('upload.relationDesc') }}</p>
    </div>

    <!-- 需要至少 2 张表 -->
    <div v-if="dataStore.tableCount < 2" class="relation-hint">
      <span>📋</span>
      <p>{{ t('upload.needMoreTables') }}</p>
    </div>

    <div v-else class="relation-body">
      <!-- 主表提示 -->
      <div class="main-table-bar">
        <span class="main-label">{{ t('upload.mainTableLabel') }}:</span>
        <span v-if="dataStore.mainTableId" class="main-name">
          ⭐ {{ getTableName(dataStore.mainTableId) }}
        </span>
        <span v-else class="main-none">{{ t('upload.noMainTable') }}</span>
      </div>

      <!-- 智能推荐 -->
      <div v-if="suggestions.length > 0" class="suggestions-bar">
        <span class="suggest-label">💡 {{ t('upload.suggestedJoins') }}:</span>
        <button
          v-for="(s, i) in suggestions.slice(0, 3)"
          :key="i"
          class="suggest-chip"
          @click="applySuggestion(s)"
        >
          {{ s.leftTableName }}.{{ s.leftColumn }} ↔ {{ s.rightTableName }}.{{ s.rightColumn }}
        </button>
      </div>

      <!-- 已有关联列表 -->
      <div class="relation-list">
        <div
          v-for="rel in dataStore.relations"
          :key="rel.id"
          class="relation-card"
        >
          <div class="rel-info">
            <span class="rel-table">{{ getTableName(rel.leftTableId) }}</span>
            <span class="rel-col">.{{ rel.leftColumn }}</span>
            <span class="rel-arrow">→</span>
            <span class="rel-type" :class="rel.joinType">{{ rel.joinType }}</span>
            <span class="rel-arrow">→</span>
            <span class="rel-table">{{ getTableName(rel.rightTableId) }}</span>
            <span class="rel-col">.{{ rel.rightColumn }}</span>
          </div>
          <button class="btn-icon btn-delete" @click="dataStore.removeRelation(rel.id)">✕</button>
        </div>
        <div v-if="dataStore.relations.length === 0" class="relation-empty">
          <p>{{ t('upload.noRelations') }}</p>
        </div>
      </div>

      <!-- 新建关联表单 -->
      <div class="relation-form">
        <h4>{{ showForm ? t('upload.newRelation') : '' }}</h4>
        <button v-if="!showForm" class="btn btn-primary" @click="showForm = true">
          + {{ t('upload.addRelation') }}
        </button>

        <div v-if="showForm" class="form-body">
          <div class="form-row">
            <div class="form-group">
              <label>{{ t('upload.leftTable') }}</label>
              <select v-model="form.leftTableId" @change="onLeftTableChange">
                <option value="">{{ t('upload.selectTable') }}</option>
                <option v-for="t in dataStore.tableList" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('upload.leftColumn') }}</label>
              <select v-model="form.leftColumn" :disabled="!form.leftTableId">
                <option value="">{{ t('upload.selectColumn') }}</option>
                <option v-for="col in leftColumns" :key="col" :value="col">{{ col }}</option>
              </select>
            </div>
          </div>

          <div class="form-row form-join-type">
            <div class="form-group">
              <label>{{ t('upload.joinType') }}</label>
              <div class="join-type-group">
                <label v-for="jt in joinTypes" :key="jt.value" class="join-type-option"
                  :class="{ active: form.joinType === jt.value }">
                  <input type="radio" v-model="form.joinType" :value="jt.value" />
                  <span class="jt-label">{{ jt.label }}</span>
                  <span class="jt-desc">{{ jt.desc }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>{{ t('upload.rightTable') }}</label>
              <select v-model="form.rightTableId" @change="onRightTableChange">
                <option value="">{{ t('upload.selectTable') }}</option>
                <option v-for="t in dataStore.tableList" :key="t.id" :value="t.id"
                  :disabled="t.id === form.leftTableId">{{ t.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('upload.rightColumn') }}</label>
              <select v-model="form.rightColumn" :disabled="!form.rightTableId">
                <option value="">{{ t('upload.selectColumn') }}</option>
                <option v-for="col in rightColumns" :key="col" :value="col">{{ col }}</option>
              </select>
            </div>
          </div>

          <!-- 基数检测警告 -->
          <div v-if="cardinalityWarning" class="cardinality-warning">
            ⚠️ {{ cardinalityWarning }}
          </div>

          <div class="form-actions">
            <button class="btn btn-secondary" @click="resetForm">{{ t('common.cancel') }}</button>
            <button class="btn btn-outline" @click="previewJoin" :disabled="!canSubmit">
              {{ t('upload.previewJoin') }}
            </button>
            <button class="btn btn-primary" @click="submitRelation" :disabled="!canSubmit">
              {{ t('upload.confirmRelation') }}
            </button>
          </div>

          <!-- 预览结果 -->
          <div v-if="previewLoading" class="preview-loading">
            <div class="spinner-sm"></div>
            {{ t('upload.previewing') }}
          </div>
          <div v-if="previewData" class="preview-table-wrap">
            <p class="preview-info">{{ t('upload.previewResult') }} ({{ previewData.rows.length }} / {{ previewData.total_rows }})</p>
            <table class="preview-table">
              <thead>
                <tr>
                  <th v-for="col in previewData.columns.slice(0, 8)" :key="col.name">{{ col.name }}</th>
                  <th v-if="previewData.columns.length > 8">...</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in previewData.rows.slice(0, 10)" :key="i">
                  <td v-for="col in previewData.columns.slice(0, 8)" :key="col.name">
                    {{ row[col.name] ?? '' }}
                  </td>
                  <td v-if="previewData.columns.length > 8">...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { suggestJoins, type JoinSuggestion } from '@/core/classifier'
import { joinDatasets, isTauri } from '@/composables/use-rust-bridge'
import type { ChartPayload } from '@/types/data'

const { t } = useI18n()
const dataStore = useDataStore()

// ── 表单状态 ──
const showForm = ref(false)

interface RelationForm {
  leftTableId: string
  leftColumn: string
  rightTableId: string
  rightColumn: string
  joinType: 'left' | 'inner' | 'right' | 'outer'
}
const form = ref<RelationForm>({
  leftTableId: '',
  leftColumn: '',
  rightTableId: '',
  rightColumn: '',
  joinType: 'left',
})

const joinTypes = [
  { value: 'left' as const, label: 'LEFT JOIN', desc: '保留左表所有行' },
  { value: 'inner' as const, label: 'INNER JOIN', desc: '仅保留匹配行' },
  { value: 'right' as const, label: 'RIGHT JOIN', desc: '保留右表所有行' },
  { value: 'outer' as const, label: 'FULL JOIN', desc: '保留两表所有行' },
]

// ── 预览状态 ──
const previewLoading = ref(false)
const previewData = ref<ChartPayload | null>(null)
const cardinalityWarning = ref('')

// ── 智能推荐 ──
const suggestions = computed<JoinSuggestion[]>(() => {
  if (dataStore.tableCount < 2) return []
  const tables = new Map<string, { name: string; headers: string[] }>()
  for (const [id, ds] of dataStore.tables) {
    tables.set(id, { name: ds.fileName || ds.sheetName || '未命名', headers: ds.headers })
  }
  return suggestJoins(tables)
})

// ── 列下拉选项 ──
const leftColumns = computed(() => {
  if (!form.value.leftTableId) return []
  const ds = dataStore.tables.get(form.value.leftTableId)
  return ds?.headers ?? []
})
const rightColumns = computed(() => {
  if (!form.value.rightTableId) return []
  const ds = dataStore.tables.get(form.value.rightTableId)
  return ds?.headers ?? []
})

const canSubmit = computed(() =>
  form.value.leftTableId && form.value.leftColumn &&
  form.value.rightTableId && form.value.rightColumn &&
  form.value.leftTableId !== form.value.rightTableId,
)

// ── 表单交互 ──
function onLeftTableChange() {
  form.value.leftColumn = ''
  previewData.value = null
  cardinalityWarning.value = ''
}
function onRightTableChange() {
  form.value.rightColumn = ''
  previewData.value = null
  cardinalityWarning.value = ''
}

function resetForm() {
  showForm.value = false
  form.value = { leftTableId: '', leftColumn: '', rightTableId: '', rightColumn: '', joinType: 'left' }
  previewData.value = null
  cardinalityWarning.value = ''
}

function applySuggestion(s: JoinSuggestion) {
  form.value.leftTableId = s.leftTableId
  form.value.leftColumn = s.leftColumn
  form.value.rightTableId = s.rightTableId
  form.value.rightColumn = s.rightColumn
  showForm.value = true
}

// ── 基数检测 ──
function detectCardinality(): string {
  const leftDs = dataStore.tables.get(form.value.leftTableId)
  const rightDs = dataStore.tables.get(form.value.rightTableId)
  if (!leftDs || !rightDs) return ''

  const leftVals = new Set(leftDs.rows.map(r => String(r[form.value.leftColumn] ?? '')))
  const rightVals = new Set(rightDs.rows.map(r => String(r[form.value.rightColumn] ?? '')))
  const leftTotal = leftDs.rows.length
  const rightTotal = rightDs.rows.length
  const leftUnique = leftVals.size
  const rightUnique = rightVals.size

  // N:N detection
  if (leftUnique < leftTotal && rightUnique < rightTotal) {
    return `检测到多对多关系：左表 ${leftUnique}/${leftTotal} 唯一值，右表 ${rightUnique}/${rightTotal} 唯一值。关联可能产生笛卡尔积。`
  }
  return ''
}

// ── 预览关联 ──
async function previewJoin() {
  if (!canSubmit.value) return

  cardinalityWarning.value = detectCardinality()
  previewLoading.value = true
  try {
    // 先激活左表
    dataStore.switchTable(form.value.leftTableId)

    if (isTauri()) {
      const result = await joinDatasets(
        form.value.rightTableId,
        [form.value.leftColumn],
        [form.value.rightColumn],
        form.value.joinType,
      )
      if (result.ok && result.data) {
        previewData.value = result.data
      }
    } else {
      // 浏览器环境：简单模拟（只显示两表字段列表）
      const leftDs = dataStore.tables.get(form.value.leftTableId)
      const rightDs = dataStore.tables.get(form.value.rightTableId)
      if (leftDs && rightDs) {
        previewData.value = {
          columns: [
            ...leftDs.headers.map(h => ({ name: h, dtype: 'str', nullable: true })),
            ...rightDs.headers.map(h => ({ name: h + '_right', dtype: 'str', nullable: true })),
          ],
          rows: [],
          total_rows: 0,
          notices: ['浏览器模式下预览不可用，请在 Tauri 桌面应用中查看'],
        }
      }
    }
  } catch (e: any) {
    previewData.value = null
  } finally {
    previewLoading.value = false
  }
}

// ── 提交关联 ──
function submitRelation() {
  if (!canSubmit.value) return
  dataStore.addRelation({
    leftTableId: form.value.leftTableId,
    leftColumn: form.value.leftColumn,
    rightTableId: form.value.rightTableId,
    rightColumn: form.value.rightColumn,
    joinType: form.value.joinType,
  })
  resetForm()
}

// 工具函数
function getTableName(id: string): string {
  const ds = dataStore.tables.get(id)
  return ds?.fileName || ds?.sheetName || '未命名'
}
</script>

<style scoped>
.relation-config {
  max-width: 800px;
}

.relation-header {
  margin-bottom: 20px;
}
.relation-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}
.relation-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.relation-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 12px;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
.relation-hint span { font-size: 24px; }

.relation-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 主表栏 ── */
.main-table-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  font-size: 13px;
}
.main-label { font-weight: 500; color: var(--text-secondary); }
.main-name { color: #f59e0b; font-weight: 500; }
.main-none { color: var(--text-tertiary); font-style: italic; }

/* ── 智能推荐 ── */
.suggestions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 12px;
}
.suggest-label { font-weight: 500; color: #92400e; white-space: nowrap; }
.suggest-chip {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  color: #92400e;
  cursor: pointer;
  font-family: monospace;
  transition: all 0.15s;
}
.suggest-chip:hover { background: #fde68a; }

/* ── 关联列表 ── */
.relation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.relation-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.relation-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.rel-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-family: monospace;
}
.rel-table { color: var(--primary); font-weight: 500; }
.rel-col { color: var(--text-secondary); }
.rel-arrow { color: var(--text-tertiary); font-size: 11px; }
.rel-type {
  margin: 0 4px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 500;
}
.rel-type.left { background: #dbeafe; color: #1d4ed8; }
.rel-type.inner { background: #d1fae5; color: #065f46; }
.rel-type.right { background: #fef3c7; color: #92400e; }
.rel-type.outer { background: #ede9fe; color: #5b21b6; }
.btn-delete {
  background: none; border: none; cursor: pointer;
  color: var(--text-tertiary); padding: 2px 6px;
  border-radius: 4px; font-size: 12px;
}
.btn-delete:hover { color: #ef4444; background: #fef2f2; }

/* ── 表单 ── */
.relation-form { margin-top: 4px; }
.relation-form h4 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 10px;
  border: 1px solid var(--border);
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}
.form-group select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.form-group select:disabled {
  opacity: 0.5;
}

/* ── Join 类型选择 ── */
.join-type-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.join-type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 80px;
}
.join-type-option:hover { border-color: var(--primary); }
.join-type-option.active {
  border-color: var(--primary);
  background: var(--primary-light, #eff6ff);
}
.join-type-option input { display: none; }
.jt-label { font-size: 12px; font-weight: 600; font-family: monospace; }
.jt-desc { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }

/* ── 警告 ── */
.cardinality-warning {
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
  font-size: 12px;
}

/* ── 操作按钮 ── */
.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ── 预览 ── */
.preview-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px 0;
}
.spinner-sm {
  width: 16px; height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.preview-table-wrap {
  overflow-x: auto;
}
.preview-info {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 6px;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.preview-table th, .preview-table td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-table th {
  background: var(--bg-secondary, #f9fafb);
  font-weight: 500;
}
</style>
