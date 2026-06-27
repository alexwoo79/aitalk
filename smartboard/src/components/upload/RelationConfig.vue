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
      <div v-if="suggestions.length > 0" class="suggestions-bar" :class="{ collapsed: !showSuggestions }">
        <div class="suggest-label-row">
          <button class="suggest-toggle" @click="showSuggestions = !showSuggestions"
            :title="showSuggestions ? '收起推荐' : '展开推荐'">
            <span class="suggest-bulb">💡</span>
            <span>{{ t('upload.suggestedJoins') }}</span>
            <span class="suggest-count">({{ suggestions.length }})</span>
          </button>
        </div>
        <div v-show="showSuggestions" class="suggest-chips">
          <button v-for="(s, i) in suggestions.slice(0, 5)" :key="i" class="suggest-chip" @click="applySuggestion(s)">
            {{ s.leftTableName }}.{{ s.leftColumn }} ↔ {{ s.rightTableName }}.{{ s.rightColumn }}
          </button>
        </div>
      </div>

      <!-- 关联拓扑图 -->
      <div v-if="graphNodes.length > 0" class="relation-graph" :class="{ collapsed: !graphExpanded }">
        <div class="graph-top-bar">
          <button class="graph-collapse-btn" @click="graphExpanded = !graphExpanded"
            :title="graphExpanded ? '折叠' : '展开'">
            <span class="gc-arrow">{{ graphExpanded ? '▼' : '▶' }}</span>
            <h4 class="graph-title">🗺️ {{ t('upload.relationGraph') }}</h4>
            <span class="gc-summary">{{ dataStore.tableCount }}表 · {{ dataStore.relations.length }}关联</span>
          </button>
          <div v-if="graphExpanded" class="graph-zoom-controls">
            <button class="zoom-btn" @click="zoomOut" :disabled="graphZoom <= 0.4" title="缩小">−</button>
            <span class="zoom-label">{{ Math.round(graphZoom * 100) }}%</span>
            <button class="zoom-btn" @click="zoomIn" :disabled="graphZoom >= 2.0" title="放大">+</button>
            <button class="zoom-btn zoom-reset" @click="graphZoom = 1" :disabled="graphZoom === 1" title="重置">↺</button>
            <button class="zoom-btn zoom-popout" @click="showGraphPopup = true" title="弹出窗口">⛶</button>
          </div>
        </div>
        <div v-show="graphExpanded" class="graph-flow-wrap" ref="graphWrapRef">
          <div class="graph-flow"
            :style="{ transform: `scale(${graphZoom})`, transformOrigin: 'top left', width: canvasW + 'px', height: canvasH + 'px' }">
            <!-- SVG 连线层 -->
            <svg class="graph-svg-lines" v-if="graphNodes.length > 1" :viewBox="`0 0 ${canvasW} ${canvasH}`">
              <defs>
                <marker id="gc-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                  <polygon points="0 0, 7 2.5, 0 5" fill="#3b82f6" />
                </marker>
              </defs>
              <g v-for="(line, li) in graphLines" :key="li">
                <path :d="line.d" fill="none" :stroke="line.color" stroke-width="2"
                  :stroke-dasharray="line.dashed ? '6,3' : 'none'" marker-end="url(#gc-arrow)" />
                <rect :x="line.lx - line.lw / 2 - 6" :y="line.ly - 9" :width="line.lw + 12" height="18" rx="4"
                  :fill="line.lbg" :stroke="line.color" stroke-width="1" />
                <text :x="line.lx" :y="line.ly + 3" text-anchor="middle" font-size="10" font-family="monospace"
                  :fill="line.lfg">{{ line.label }}</text>
              </g>
            </svg>

            <!-- 表卡片（绝对定位） -->
            <div v-for="node in graphNodes" :key="node.key" class="graph-card"
              :class="{ 'is-main': node.id === dataStore.mainTableId, dragging: dragNodeId === node.id }"
              :style="{ left: node.x + 'px', top: node.y + 'px' }" @pointerdown="onNodePointerDown($event, node.id)">
              <div class="gc-header">
                <span class="gc-drag-handle" title="拖拽移动">⋮⋮</span>
                <span v-if="node.id === dataStore.mainTableId" class="gc-star">⭐</span>
                <span class="gc-name">{{ node.name }}</span>
                <span class="gc-count">{{ node.rowCount }}行</span>
              </div>
              <div class="gc-cols">
                <div v-for="col in node.cols.slice(0, 8)" :key="col.name" class="gc-col"
                  :class="{ 'is-key': col.isKey }">
                  <span class="gc-dot" :class="'role-' + col.role"></span>
                  {{ col.name }}
                  <span v-if="col.isKey" class="gc-key-tag">KEY</span>
                </div>
                <div v-if="node.cols.length > 8" class="gc-col gc-more">
                  ...共 {{ node.cols.length }} 列
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 已有关联列表 -->
  <div class="relation-list">
    <div v-for="rel in dataStore.relations" :key="rel.id" class="relation-card"
      :class="{ editing: editingId === rel.id }">
      <div class="rel-info">
        <span class="rel-table">{{ getTableName(rel.leftTableId) }}</span>
        <span class="rel-col">.{{ rel.leftColumn }}</span>
        <span class="rel-arrow">→</span>
        <span class="rel-type" :class="rel.joinType">{{ rel.joinType }}</span>
        <span class="rel-arrow">→</span>
        <span class="rel-table">{{ getTableName(rel.rightTableId) }}</span>
        <span class="rel-col">.{{ rel.rightColumn }}</span>
      </div>
      <div class="rel-actions">
        <button class="btn-icon btn-edit" @click="startEdit(rel)" :title="t('config.edit')">✎</button>
        <button class="btn-icon btn-delete" @click="dataStore.removeRelation(rel.id)">✕</button>
      </div>
    </div>
    <div v-if="dataStore.relations.length === 0" class="relation-empty">
      <p>{{ t('upload.noRelations') }}</p>
    </div>
  </div>

  <!-- 新建/编辑关联表单 -->
  <div class="relation-form">
    <h4>{{ showForm ? (editingId ? t('upload.editRelation') : t('upload.newRelation')) : '' }}</h4>
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
            <option v-for="t in dataStore.tableList" :key="t.id" :value="t.id" :disabled="t.id === form.leftTableId">{{
              t.name }}</option>
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
          {{ editingId ? t('upload.updateRelation') : t('upload.confirmRelation') }}
        </button>
      </div>

      <!-- 预览结果 -->
      <div v-if="previewLoading" class="preview-loading">
        <div class="spinner-sm"></div>
        {{ t('upload.previewing') }}
      </div>
      <div v-if="previewData" class="preview-table-wrap">
        <p class="preview-info">{{ t('upload.previewResult') }} ({{ previewData.rows.length }} / {{
          previewData.total_rows }})</p>
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

  <!-- 拓扑图弹出窗口 -->
  <Teleport to="body">
    <div v-if="showGraphPopup" class="graph-popup-overlay" @click.self="showGraphPopup = false">
      <div class="graph-popup" :style="popupStyle">
        <div class="gp-header">
          <span class="gp-title">🗺️ {{ t('upload.relationGraph') }}</span>
          <span class="gp-summary">{{ dataStore.tableCount }}表 · {{ dataStore.relations.length }}关联</span>
          <div class="gp-zoom">
            <button class="zoom-btn" @click="graphZoom = Math.max(0.4, graphZoom - 0.15)"
              :disabled="graphZoom <= 0.4">−</button>
            <span class="zoom-label">{{ Math.round(graphZoom * 100) }}%</span>
            <button class="zoom-btn" @click="graphZoom = Math.min(2.0, graphZoom + 0.15)"
              :disabled="graphZoom >= 2.0">+</button>
            <button class="zoom-btn zoom-reset" @click="graphZoom = 1" :disabled="graphZoom === 1">↺</button>
          </div>
          <button class="gp-close" @click="showGraphPopup = false">✕</button>
        </div>
        <div class="gp-body">
          <div class="graph-flow"
            :style="{ transform: `scale(${graphZoom})`, transformOrigin: 'top left', width: canvasW + 'px', height: canvasH + 'px' }">
            <svg class="graph-svg-lines" v-if="graphNodes.length > 1" :viewBox="`0 0 ${canvasW} ${canvasH}`">
              <defs>
                <marker id="gc-arrow2" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                  <polygon points="0 0, 7 2.5, 0 5" fill="#3b82f6" />
                </marker>
              </defs>
              <g v-for="(line, li) in graphLines" :key="li">
                <path :d="line.d" fill="none" :stroke="line.color" stroke-width="2"
                  :stroke-dasharray="line.dashed ? '6,3' : 'none'" marker-end="url(#gc-arrow2)" />
                <rect :x="line.lx - line.lw / 2 - 6" :y="line.ly - 9" :width="line.lw + 12" height="18" rx="4"
                  :fill="line.lbg" :stroke="line.color" stroke-width="1" />
                <text :x="line.lx" :y="line.ly + 3" text-anchor="middle" font-size="10" font-family="monospace"
                  :fill="line.lfg">{{ line.label }}</text>
              </g>
            </svg>
            <div v-for="node in graphNodes" :key="node.key" class="graph-card"
              :class="{ 'is-main': node.id === dataStore.mainTableId, dragging: dragNodeId === node.id }"
              :style="{ left: node.x + 'px', top: node.y + 'px' }" @pointerdown="onNodePointerDown($event, node.id)">
              <div class="gc-header">
                <span class="gc-drag-handle" title="拖拽移动">⋮⋮</span>
                <span v-if="node.id === dataStore.mainTableId" class="gc-star">⭐</span>
                <span class="gc-name">{{ node.name }}</span>
                <span class="gc-count">{{ node.rowCount }}行</span>
              </div>
              <div class="gc-cols">
                <div v-for="col in node.cols.slice(0, 8)" :key="col.name" class="gc-col"
                  :class="{ 'is-key': col.isKey }">
                  <span class="gc-dot" :class="'role-' + col.role"></span>
                  {{ col.name }}
                  <span v-if="col.isKey" class="gc-key-tag">KEY</span>
                </div>
                <div v-if="node.cols.length > 8" class="gc-col gc-more">
                  ...共 {{ node.cols.length }} 列
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 拖拽调节尺寸手柄 -->
        <div class="gp-resize-handle" @mousedown="onResizeStart"></div>
      </div>
    </div>
  </Teleport>
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
const editingId = ref<string | null>(null)

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
const showSuggestions = ref(true)
const suggestions = computed<JoinSuggestion[]>(() => {
  if (dataStore.tableCount < 2) return []
  const tables: Record<string, { name: string; headers: string[] }> = {}
  for (const [id, ds] of Object.entries(dataStore.tables)) {
    tables[id] = { name: dataStore.getTableDisplayName(ds), headers: ds.headers }
  }
  return suggestJoins(tables)
})

// ── 列下拉选项 ──
const leftColumns = computed(() => {
  if (!form.value.leftTableId) return []
  const ds = dataStore.tables[form.value.leftTableId]
  return ds?.headers ?? []
})
const rightColumns = computed(() => {
  if (!form.value.rightTableId) return []
  const ds = dataStore.tables[form.value.rightTableId]
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
  editingId.value = null
  form.value = { leftTableId: '', leftColumn: '', rightTableId: '', rightColumn: '', joinType: 'left' }
  previewData.value = null
  cardinalityWarning.value = ''
}

function startEdit(rel: { id: string; leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string; joinType: string }) {
  editingId.value = rel.id
  form.value = {
    leftTableId: rel.leftTableId,
    leftColumn: rel.leftColumn,
    rightTableId: rel.rightTableId,
    rightColumn: rel.rightColumn,
    joinType: rel.joinType as 'left' | 'inner' | 'right' | 'outer',
  }
  showForm.value = true
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
  const leftDs = dataStore.tables[form.value.leftTableId]
  const rightDs = dataStore.tables[form.value.rightTableId]
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
      const leftDs = dataStore.tables[form.value.leftTableId]
      const rightDs = dataStore.tables[form.value.rightTableId]
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
  const relData = {
    leftTableId: form.value.leftTableId,
    leftColumn: form.value.leftColumn,
    rightTableId: form.value.rightTableId,
    rightColumn: form.value.rightColumn,
    joinType: form.value.joinType,
  }
  if (editingId.value) {
    dataStore.updateRelation(editingId.value, relData)
  } else {
    dataStore.addRelation(relData)
  }
  resetForm()
}

// 工具函数
function getTableName(id: string): string {
  const ds = dataStore.tables[id]
  return ds ? dataStore.getTableDisplayName(ds) : '未命名'
}

// ── 关联拓扑图 ──
const graphExpanded = ref(true)
const graphZoom = ref(1)
const showGraphPopup = ref(false)
const graphWrapRef = ref<HTMLElement | null>(null)

// Popup dimensions & resize
const popupW = ref(900)
const popupH = ref(500)
const popupStyle = computed(() => ({
  width: popupW.value + 'px',
  height: popupH.value + 'px',
}))

let resizeRaf = 0
function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  const startY = e.clientY
  const startW = popupW.value
  const startH = popupH.value
  function onMove(ev: MouseEvent) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      popupW.value = Math.max(400, startW + ev.clientX - startX)
      popupH.value = Math.max(250, startH + ev.clientY - startY)
    })
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function zoomIn() { graphZoom.value = Math.min(2.0, graphZoom.value + 0.15) }
function zoomOut() { graphZoom.value = Math.max(0.4, graphZoom.value - 0.15) }

// Canvas
const canvasW = ref(1000)
const canvasH = ref(500)
const CARD_W = 200
const CARD_H_EST = 250

// Keep GraphCol interface
interface GraphCol {
  name: string
  role: string
  isKey: boolean
}

// Card positions
interface NodePos {
  id: string
  key: string
  name: string
  rowCount: number
  cols: GraphCol[]
  x: number
  y: number
}
const graphPositions = ref<Record<string, { x: number; y: number }>>({})
const graphNodes = computed<NodePos[]>(() => {
  const relations = dataStore.relations
  if (relations.length === 0) return []

  const nodes: NodePos[] = []
  for (const [id, ds] of Object.entries(dataStore.tables)) {
    const keyCols = new Set<string>()
    for (const rel of relations) {
      if (rel.leftTableId === id) keyCols.add(rel.leftColumn)
      if (rel.rightTableId === id) keyCols.add(rel.rightColumn)
    }
    const cols: GraphCol[] = ds.headers.map(h => ({
      name: h,
      role: ds.classifications[h]?.role || 'ignore',
      isKey: keyCols.has(h),
    }))
    const pos = graphPositions.value[id] || autoLayout(id)
    nodes.push({
      id,
      key: `node-${id}`,
      name: dataStore.getTableDisplayName(ds),
      rowCount: ds.totalRows ?? ds.rows.length,
      cols,
      x: pos.x,
      y: pos.y,
    })
  }
  return nodes
})

function autoLayout(id: string): { x: number; y: number } {
  const ids = Object.keys(dataStore.tables)
  const idx = ids.indexOf(id)
  const cols = Math.min(ids.length, 3)
  const row = Math.floor(idx / cols)
  const col = idx % cols
  return {
    x: 40 + col * (CARD_W + 120),
    y: 20 + row * (CARD_H_EST + 40),
  }
}

// SVG lines
interface GraphLine {
  d: string
  color: string
  dashed: boolean
  label: string
  lx: number; ly: number; lw: number
  lbg: string; lfg: string
}

const graphLines = computed<GraphLine[]>(() => {
  const relations = dataStore.relations
  const nodes = graphNodes.value
  if (nodes.length < 2 || relations.length === 0) return []

  const posMap = new Map(nodes.map(n => [n.id, n]))
  const lines: GraphLine[] = []

  for (const rel of relations) {
    const left = posMap.get(rel.leftTableId)
    const right = posMap.get(rel.rightTableId)
    if (!left || !right) continue

    const lKeyIdx = left.cols.slice(0, 8).findIndex(c => c.name === rel.leftColumn && c.isKey)
    const rKeyIdx = right.cols.slice(0, 8).findIndex(c => c.name === rel.rightColumn && c.isKey)
    const ly = left.y + 36 + (lKeyIdx >= 0 ? lKeyIdx : 0) * 19 + 9
    const ry = right.y + 36 + (rKeyIdx >= 0 ? rKeyIdx : 0) * 19 + 9

    const x1 = left.x + CARD_W
    const x2 = right.x
    const midX = (x1 + x2) / 2

    const d = `M ${x1} ${ly} C ${x1 + Math.abs(x2 - x1) * 0.4} ${ly}, ${x2 - Math.abs(x2 - x1) * 0.4} ${ry}, ${x2} ${ry}`

    const jc = jcolors[rel.joinType] || jcolors.left
    const label = `${rel.leftColumn} → ${rel.rightColumn}`
    lines.push({
      d, color: jc.stroke, dashed: rel.joinType === 'right',
      label, lx: midX, ly: (ly + ry) / 2, lw: label.length * 6.5,
      lbg: jc.bg, lfg: jc.fg,
    })
  }

  // Update canvas size
  let maxX = 400, maxY = 300
  for (const n of nodes) {
    if (n.x + CARD_W + 40 > maxX) maxX = n.x + CARD_W + 40
    if (n.y + CARD_H_EST + 40 > maxY) maxY = n.y + CARD_H_EST + 40
  }
  canvasW.value = maxX
  canvasH.value = maxY

  return lines
})

const jcolors: Record<string, { stroke: string; bg: string; fg: string }> = {
  left: { stroke: '#3b82f6', bg: '#eff6ff', fg: '#1d4ed8' },
  inner: { stroke: '#16a34a', bg: '#f0fdf4', fg: '#065f46' },
  right: { stroke: '#f59e0b', bg: '#fffbeb', fg: '#92400e' },
  outer: { stroke: '#7c3aed', bg: '#f5f3ff', fg: '#5b21b6' },
}

// ── Pointer-based drag ──
const dragNodeId = ref<string | null>(null)
let dragOffX = 0, dragOffY = 0

function onNodePointerDown(e: PointerEvent, id: string) {
  // Only drag from handle or card body
  const target = e.target as HTMLElement
  const card = target.closest('.graph-card') as HTMLElement
  if (!card) return

  dragNodeId.value = id
  const pos = graphPositions.value[id] || autoLayout(id)
  dragOffX = e.clientX - pos.x * graphZoom.value
  dragOffY = e.clientY - pos.y * graphZoom.value

  card.setPointerCapture(e.pointerId)
  card.addEventListener('pointermove', onPointerMove)
  card.addEventListener('pointerup', onPointerUp)
  card.addEventListener('pointercancel', onPointerUp)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!dragNodeId.value) return
  const id = dragNodeId.value
  graphPositions.value = {
    ...graphPositions.value,
    [id]: {
      x: Math.max(0, (e.clientX - dragOffX) / graphZoom.value),
      y: Math.max(0, (e.clientY - dragOffY) / graphZoom.value),
    },
  }
}

function onPointerUp(e: PointerEvent) {
  const card = (e.target as HTMLElement).closest('.graph-card') as HTMLElement
  if (card) {
    card.removeEventListener('pointermove', onPointerMove)
    card.removeEventListener('pointerup', onPointerUp)
    card.removeEventListener('pointercancel', onPointerUp)
    card.releasePointerCapture(e.pointerId)
  }
  dragNodeId.value = null
}
</script>

<style scoped>
.relation-config {
  width: 100%;
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
  background: var(--bg-hover);
  border-radius: 12px;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 14px;
}

.relation-hint span {
  font-size: 24px;
}

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
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: 13px;
}

.main-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.main-name {
  color: #f59e0b;
  font-weight: 500;
}

.main-none {
  color: var(--text-tertiary);
  font-style: italic;
}

/* ── 智能推荐 ── */
.suggestions-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 12px;
  transition: all 0.2s;
}

.suggestions-bar.collapsed {
  gap: 0;
  padding: 6px 12px;
}

.suggest-label-row {
  display: flex;
  align-items: center;
}

.suggest-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: #92400e;
  text-align: left;
}

.suggest-toggle:hover {
  opacity: 0.8;
}

.suggest-bulb {
  font-size: 14px;
  transition: transform 0.2s;
}

.suggest-count {
  font-size: 11px;
  opacity: 0.6;
}

.suggest-label {
  font-weight: 500;
  color: #92400e;
}

.suggest-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

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

.suggest-chip:hover {
  background: #fde68a;
}

/* Dark theme for suggestions */
:root[data-theme="dark"] .suggestions-bar {
  background: #292524;
  border-color: #78350f;
}

:root[data-theme="dark"] .suggest-toggle {
  color: #fde68a;
}

:root[data-theme="dark"] .suggest-label {
  color: #fde68a;
}

:root[data-theme="dark"] .suggest-chip {
  background: #3b2f1f;
  border-color: #78350f;
  color: #fde68a;
}

:root[data-theme="dark"] .suggest-chip:hover {
  background: #543f28;
}

/* ── 关联拓扑图 ── */
.relation-graph {
  margin: 8px 0;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.relation-graph.collapsed {
  padding-bottom: 12px;
}

.graph-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}

.relation-graph:not(.collapsed) .graph-top-bar {
  margin-bottom: 12px;
}

/* Collapse toggle button */
.graph-collapse-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  flex: 1;
  text-align: left;
}

.graph-collapse-btn:hover .graph-title {
  color: var(--primary);
}

.gc-arrow {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: transform 0.15s;
}

.gc-summary {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.graph-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.graph-zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-hover);
  border-radius: 8px;
  padding: 2px 4px;
  flex-shrink: 0;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  line-height: 1;
}

.zoom-btn:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.zoom-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.zoom-label {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.zoom-reset {
  font-size: 13px;
  margin-left: 2px;
  border-left: 1px solid var(--border-light);
  border-radius: 0 6px 6px 0;
  padding-left: 8px;
}

/* Scroll wrapper */
.graph-flow-wrap {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  width: 100%;
  min-height: 200px;
}

.graph-flow {
  position: relative;
  transition: transform 0.2s ease;
}

/* SVG lines overlay */
.graph-svg-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}

/* ── 表卡片 ── */
.graph-card {
  position: absolute;
  width: 200px;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  z-index: 2;
  cursor: default;
  touch-action: none;
}

.graph-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.graph-card.is-main {
  border-color: #f59e0b;
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.12);
}

.graph-card.dragging {
  opacity: 0.85;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  z-index: 10;
}

.gc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
}

/* Drag handle */
.gc-drag-handle {
  cursor: grab;
  color: var(--text-tertiary);
  font-size: 12px;
  letter-spacing: -2px;
  user-select: none;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
  touch-action: none;
}

.gc-drag-handle:active {
  cursor: grabbing;
}

.gc-star {
  font-size: 12px;
  flex-shrink: 0;
}

.gc-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc-count {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.gc-cols {
  padding: 4px 0;
}

.gc-col {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 14px;
  font-size: 11px;
  color: var(--text-secondary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc-col.is-key {
  color: var(--text-primary);
  font-weight: 600;
  background: rgba(59, 130, 246, 0.05);
}

.gc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-tertiary);
}

.gc-dot.role-metric {
  background: #3b82f6;
}

.gc-dot.role-dimension {
  background: #8b5cf6;
}

.gc-dot.role-time_axis {
  background: #f59e0b;
}

.gc-dot.role-label {
  background: #10b981;
}

.gc-key-tag {
  margin-left: auto;
  padding: 0 5px;
  border-radius: 3px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 9px;
  font-weight: 600;
  font-family: inherit;
  text-transform: uppercase;
}

.gc-col.gc-more {
  color: var(--text-tertiary);
  font-style: italic;
  font-family: inherit;
  font-size: 10px;
}

/* ── 拓扑图弹出窗口 ── */
.graph-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.graph-popup {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  min-width: 400px;
  min-height: 250px;
  overflow: hidden;
  position: relative;
}

.gp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-hover);
}

.gp-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.gp-summary {
  font-size: 11px;
  color: var(--text-tertiary);
  flex: 1;
}

.gp-zoom {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 2px 4px;
}

.gp-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.gp-close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.gp-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
  contain: paint;
}

/* Resize handle (bottom-right corner) */
.gp-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--border) 50%, transparent 55%, var(--border) 55%, transparent 60%, var(--border) 60%);
  opacity: 0.6;
  transition: opacity 0.15s;
}

.gp-resize-handle:hover {
  opacity: 1;
  background: linear-gradient(135deg, transparent 50%, var(--primary) 50%, transparent 55%, var(--primary) 55%, transparent 60%, var(--primary) 60%);
}

/* Popout button */
.zoom-popout {
  font-size: 13px;
  margin-left: 2px;
  border-left: 1px solid var(--border-light);
  border-radius: 0 6px 6px 0;
  padding-left: 8px;
}

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

.relation-card.editing {
  border-color: var(--primary);
  background: #f0f7ff;
}

.rel-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-family: monospace;
}

.rel-table {
  color: var(--primary);
  font-weight: 500;
}

.rel-col {
  color: var(--text-secondary);
}

.rel-arrow {
  color: var(--text-tertiary);
  font-size: 11px;
}

.rel-type {
  margin: 0 4px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 500;
}

.rel-type.left {
  background: #dbeafe;
  color: #1d4ed8;
}

.rel-type.inner {
  background: #d1fae5;
  color: #065f46;
}

.rel-type.right {
  background: #fef3c7;
  color: #92400e;
}

.rel-type.outer {
  background: #ede9fe;
  color: #5b21b6;
}

.rel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-edit {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.btn-edit:hover {
  color: var(--primary);
  background: #eff6ff;
}

.btn-delete {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.btn-delete:hover {
  color: #ef4444;
  background: #fef2f2;
}

/* ── 表单 ── */
.relation-form {
  margin-top: 4px;
}

.relation-form h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-hover);
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

.join-type-option:hover {
  border-color: var(--primary);
}

.join-type-option.active {
  border-color: var(--primary);
  background: var(--primary-light, #eff6ff);
}

.join-type-option input {
  display: none;
}

.jt-label {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
}

.jt-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

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
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

.preview-table th,
.preview-table td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-table th {
  background: var(--bg-hover);
  font-weight: 500;
}
</style>
