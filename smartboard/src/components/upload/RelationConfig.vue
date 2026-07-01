<!-- src/components/upload/RelationConfig.vue -->
<template>
  <div class="relation-config">
    <div class="relation-header">
      <div class="relation-header-left">
        <h3>{{ t('upload.relationTitle') }}</h3>
        <p class="relation-desc">{{ t('upload.relationDesc') }}</p>
      </div>
      <button class="btn-next" @click="goToConfig">{{ t('upload.nextStep') }}</button>
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
      <div v-if="suggestions.length > 0" class="suggestions-panel" :class="{ collapsed: !showSuggestions }">
        <div class="suggestions-header">
          <div class="suggest-title-row">
            <span class="suggest-icon">🔍</span>
            <h4>{{ t('upload.suggestedJoins') }} <span class="suggest-count-badge">{{ suggestions.length }}</span></h4>
            <span class="suggest-desc">{{ t('upload.suggestionDesc') }}</span>
          </div>
          <div class="suggest-actions">
            <label class="suggest-toggle-switch">
              <span>{{ t('upload.smartRecommend') }}</span>
              <input type="checkbox" v-model="showSuggestions" />
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon btn-help" :title="t('upload.suggestionHelp')">?</button>
            <button class="btn-icon btn-collapse" @click="showSuggestions = !showSuggestions">
              {{ showSuggestions ? '∧' : '∨' }}
            </button>
          </div>
        </div>
        <div v-show="showSuggestions" class="suggestion-cards">
          <div v-for="(s, i) in suggestions.slice(0, showAllSuggestions ? suggestions.length : 4)" :key="i"
            class="suggestion-card" :class="{ selected: isSuggestionApplied(s) }" @click="applySuggestion(s)">
            <div class="sc-header">
              <span class="sc-tables">{{ s.leftTableName }} → {{ s.rightTableName }}</span>
              <span v-if="isSuggestionApplied(s)" class="sc-checkmark">✓</span>
            </div>
            <div class="sc-fields">{{ s.leftColumn }} = {{ s.rightColumn }}</div>
            <div class="sc-footer">
              <span class="sc-confidence" :class="getConfidenceClass(s.score)">{{ getConfidenceLabel(s.score) }}</span>
              <button class="sc-preview-btn" @click.stop="previewSuggestion(s)">{{ t('upload.viewPreview') }}</button>
            </div>
          </div>
        </div>
        <div v-if="suggestions.length > 4 && !showAllSuggestions" class="show-more-wrap">
          <button class="btn-show-more" @click="showAllSuggestions = true">
            {{ t('upload.showMoreSuggestions') }} ∨
          </button>
        </div>
      </div>

      <!-- 关联预览 -->
      <div v-if="graphNodes.length > 0" class="relation-graph" :class="{ collapsed: !graphExpanded }">
        <div class="graph-top-bar">
          <button class="graph-collapse-btn" @click="graphExpanded = !graphExpanded"
            :title="graphExpanded ? '折叠' : '展开'">
            <span class="gc-arrow">{{ graphExpanded ? '▼' : '▶' }}</span>
            <h4 class="graph-title">{{ t('upload.relationPreview') }}</h4>
            <span class="gc-summary">{{ t('upload.tablesCount', { n: dataStore.tableCount }) }} · {{ t('upload.relationsCount', { n: dataStore.relations.length }) }}</span>
          </button>
          <div v-if="graphExpanded" class="graph-controls">
            <label class="show-fields-toggle">
              <input type="checkbox" v-model="showFieldDetails" />
              <span>{{ t('upload.showFieldDetails') }}</span>
            </label>
            <div class="graph-zoom-controls">
              <button class="zoom-btn" @click="zoomOut" :disabled="graphZoom <= 0.4" title="缩小">−</button>
              <span class="zoom-label">{{ Math.round(graphZoom * 100) }}%</span>
              <button class="zoom-btn" @click="zoomIn" :disabled="graphZoom >= 2.0" title="放大">+</button>
              <button class="zoom-btn zoom-reset" @click="graphZoom = 1" :disabled="graphZoom === 1" title="重置"></button>
              <button class="zoom-btn zoom-popout" @click="showGraphPopup = true" title="弹出窗口">⛶</button>
            </div>
          </div>
        </div>
        <div v-show="graphExpanded" class="graph-flow-wrap" ref="graphWrapRef">
          <div class="graph-flow"
            :style="{ transform: `scale(${graphZoom})`, transformOrigin: 'top left', width: canvasW + 'px', height: canvasH + 'px' }">
            <!-- SVG 连线层 -->
            <svg class="graph-svg-lines" v-if="graphNodes.length > 1" :viewBox="`0 0 ${canvasW} ${canvasH}`">
              <defs>
                <marker id="gc-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
                  <polygon points="0 0, 7 2.5, 0 5" :fill="theme === 'dark' ? '#60a5fa' : '#3b82f6'" />
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
              :class="{ 'is-main': node.id === dataStore.mainTableId, dragging: dragNodeId === node.id, ['table-color-' + tableColorIndex[node.id]]: true }"
              :style="{ left: node.x + 'px', top: node.y + 'px' }" @pointerdown="onNodePointerDown($event, node.id)">
              <div class="gc-header">
                <span class="gc-drag-handle" title="拖拽移动">⋮⋮</span>
                <span v-if="node.id === dataStore.mainTableId" class="gc-star">⭐</span>
                <span class="gc-name">{{ node.name }}</span>
                <span class="gc-count">{{ node.rowCount }}行</span>
              </div>
              <div v-if="showFieldDetails" class="gc-cols">
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
    <div v-if="dataStore.relations.length > 0" class="relation-list-header">
      <h4>{{ t('upload.definedRelations') }}</h4>
      <span class="relation-count">{{ dataStore.relations.length }} 条</span>
    </div>
    <div v-for="rel in dataStore.relations" :key="rel.id" class="relation-card"
      :class="{ editing: editingId === rel.id }">
      <div class="rel-left-table">
        <span class="rel-tbl-name">{{ getTableName(rel.leftTableId) }}</span>
        <span class="rel-role-badge main">{{ t('upload.mainTableBadge') }}</span>
        <span class="rel-row-count">~ {{ getTableRowCount(rel.leftTableId).toLocaleString() }} 行</span>
      </div>
      <span class="rel-join-icon" :title="getJoinTypeLabel(rel.joinType)">∞</span>
      <div class="rel-right-table">
        <span class="rel-tbl-name">{{ getTableName(rel.rightTableId) }}</span>
        <span class="rel-role-badge dim">{{ t('upload.dimTableBadge') }}</span>
        <span class="rel-row-count">~ {{ getTableRowCount(rel.rightTableId).toLocaleString() }} 行</span>
      </div>
      <div class="rel-key-fields">
        <span class="rel-key-label">{{ t('upload.keyFields') }}</span>
        <span class="rel-key-value">{{ rel.leftColumn }} = {{ rel.rightColumn }}</span>
      </div>
      <div class="rel-actions">
        <button class="btn-icon btn-edit" @click="startEdit(rel)" :title="t('config.edit')">✎</button>
        <button class="btn-icon btn-delete" @click="confirmRemoveRelation(rel.id)" :title="t('common.delete')">✕</button>
      </div>
    </div>
    <div v-if="dataStore.relations.length === 0" class="relation-empty">
      <div class="empty-graphic">
        <span class="empty-icon">🔗</span>
        <p class="empty-title">{{ t('upload.noRelations') }}</p>
        <p class="empty-hint">{{ t('upload.noRelationsHint', '点击下方「新建关联」建立表间关系，关联后可跨表联合分析') }}</p>
        <span class="empty-arrow">↓</span>
      </div>
    </div>
    <button class="btn-add-relation" @click="showForm = true; editingId = null; resetFormFields()">
      + {{ t('upload.addRelation') }}
    </button>
  </div>

  <!-- 新建/编辑关联弹窗 -->
  <Teleport to="body">
    <div v-if="showForm" class="relation-form-overlay" @click.self="resetForm">
      <div class="relation-form-popup">
        <div class="rf-header">
          <h4>{{ editingId ? t('upload.editRelation') : t('upload.newRelation') }}</h4>
          <button class="rf-close" @click="resetForm" title="关闭">✕</button>
        </div>

        <div class="form-body">
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
              <span v-if="form.leftColumn && leftColInfo" class="col-info-hint">{{ leftColInfo }}</span>
            </div>
          </div>

          <div class="form-row form-join-type">
            <div class="form-group">
              <label>{{ t('upload.joinType') }}</label>
              <div class="join-type-group">
                <label v-for="jt in joinTypes" :key="jt.value" class="join-type-option"
                  :class="{ active: form.joinType === jt.value }" :title="jt.desc">
                  <input type="radio" v-model="form.joinType" :value="jt.value" />
                  <span class="jt-venn" v-html="jt.venn"></span>
                  <span class="jt-label">{{ jt.label }}</span>
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
              <span v-if="form.rightColumn && rightColInfo" class="col-info-hint">{{ rightColInfo }}</span>
            </div>
          </div>

          <!-- 基数检测警告 -->
          <div v-if="cardinalityWarning" class="cardinality-warning">
            ⚠️ {{ cardinalityWarning }}
          </div>

          <div class="form-actions">
            <button class="btn btn-secondary" @click="resetForm">{{ t('common.cancel') }}</button>
            <button class="btn btn-outline" @click="previewJoin" :disabled="!canSubmit"
              :title="!form.leftTableId ? '请先选择左表' : !form.rightTableId ? '请先选择右表' : !form.leftColumn ? '请先选择左表字段' : !form.rightColumn ? '请先选择右表字段' : '预览关联结果（前20行）'">
              {{ t('upload.previewJoin') }}
            </button>
            <button class="btn btn-primary" @click="submitRelation" :disabled="!canSubmit">
              {{ editingId ? t('upload.updateRelation') : t('upload.confirmRelation') }}
            </button>
          </div>

          <!-- 预览结果 (Tab 切换) -->
          <div v-if="previewData || previewLoading" class="preview-section">
            <div class="preview-tabs">
              <button class="preview-tab" :class="{ active: previewTab === 'data' }" @click="previewTab = 'data'">
                {{ t('upload.dataPreview') }}
              </button>
              <button class="preview-tab" :class="{ active: previewTab === 'quality' }" @click="previewTab = 'quality'">
                {{ t('upload.relationQuality') }}
              </button>
            </div>
            <div v-if="previewLoading" class="preview-loading">
              <div class="spinner-sm"></div>
              {{ t('upload.previewing') }}
            </div>
            <div v-else-if="previewTab === 'data' && previewData" class="preview-table-wrap">
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
            <div v-else-if="previewTab === 'quality' && previewData" class="preview-quality">
              <div class="quality-metrics">
                <div class="quality-item">
                  <span class="quality-label">{{ t('upload.matchRate') }}</span>
                  <span class="quality-value">{{ relationQuality.matchRate }}%</span>
                </div>
                <div class="quality-item">
                  <span class="quality-label">{{ t('upload.leftNullRate') }}</span>
                  <span class="quality-value">{{ relationQuality.leftNullRate }}%</span>
                </div>
                <div class="quality-item">
                  <span class="quality-label">{{ t('upload.rightNullRate') }}</span>
                  <span class="quality-value">{{ relationQuality.rightNullRate }}%</span>
                </div>
                <div class="quality-item">
                  <span class="quality-label">{{ t('upload.totalRows') }}</span>
                  <span class="quality-value">{{ previewData.total_rows.toLocaleString() }}</span>
                </div>
              </div>
              <div v-if="cardinalityWarning" class="quality-warning">
                ⚠️ {{ cardinalityWarning }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

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
                  <polygon points="0 0, 7 2.5, 0 5" :fill="theme === 'dark' ? '#60a5fa' : '#3b82f6'" />
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
              :class="{ 'is-main': node.id === dataStore.mainTableId, dragging: dragNodeId === node.id, ['table-color-' + tableColorIndex[node.id]]: true }"
              :style="{ left: node.x + 'px', top: node.y + 'px' }" @pointerdown="onNodePointerDown($event, node.id)">
              <div class="gc-header">
                <span class="gc-drag-handle" title="拖拽移动">⋮⋮</span>
                <span v-if="node.id === dataStore.mainTableId" class="gc-star">⭐</span>
                <span class="gc-name">{{ node.name }}</span>
                <span class="gc-count">{{ node.rowCount }}行</span>
              </div>
              <div v-if="showFieldDetails" class="gc-cols">
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

  <!-- 合并表列定义：关联建立后出现，显示合并后的全字段列表 -->
  <div v-if="dataStore.relations.length > 0" class="merged-col-section">
    <!-- ① 列数据定义 -->
    <div class="merged-card">
      <div class="section-head">
        <h4>{{ t('upload.mergedColumnDef') }} <span class="section-hint">💡 {{ t('upload.mergedColumnDefDesc') }}</span>
        </h4>
        <div class="section-actions">
          <button class="btn-save" :class="{ saved: configStore.isSectionSaved('table') }"
            @click="configStore.saveSection('table')">{{ configStore.isSectionSaved('table') ? '✅' : '💾' }}</button>
          <button class="btn-reset" @click="configStore.resetSectionToAuto('table')"
            :title="t('config.resetAll')">↺</button>
        </div>
      </div>
      <ColumnConfigPanel :use-merged-headers="true" />
    </div>

    <!-- ② 自动检测 -->
    <div class="merged-card">
      <h4>{{ t('upload.autoDetect') }}</h4>
      <p class="detect-text">
        {{ t('upload.primaryMetric') }}：<strong>{{ mergedMetricCols.join('、') || '—' }}</strong>
        &nbsp;|&nbsp;
        {{ t('upload.chartDimensions') }}：<strong>{{ mergedDimCols.join('、') || '—' }}</strong>
      </p>
    </div>

    <!-- ③ 样本数据 -->
    <div class="merged-card">
      <h4>样本数据（前{{ mergedSampleRows.length }}行，{{ mergedSampleCols.length }}列）</h4>
      <div class="sample-table-wrap">
        <table class="sample-table">
          <thead>
            <tr>
              <th v-for="col in mergedSampleCols" :key="col" :style="mergedColThStyle(col)">
                {{ col }}<span v-if="isJoinKey(col)" class="key-tag">🔑</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in mergedSampleRows" :key="i">
              <td v-for="col in mergedSampleCols" :key="col" :style="mergedColTdStyle(col)">{{ formatMergedCell(col,
                row[col]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/use-theme'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { usePreviewStore } from '@/stores/preview-store'
import { suggestJoins, type JoinSuggestion } from '@/core/classifier'
import { joinDatasets, isTauri } from '@/composables/use-rust-bridge'
import type { ChartPayload } from '@/types/data'
import ColumnConfigPanel from '@/components/config/ColumnConfigPanel.vue'
import { augmentComputedCols } from '@/core/formula-engine'
import { fmtByChart, getNumericVal } from '@/core/chart-options'

const router = useRouter()
const { t } = useI18n()
const { theme } = useTheme()
const dataStore = useDataStore()
const configStore = useConfigStore()
const previewStore = usePreviewStore()

function goToConfig() {
  router.push('/config')
}

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
  {
    value: 'left' as const, label: 'LEFT JOIN', desc: '保留左表所有行',
    venn: '<svg viewBox="0 0 24 14" width="36" height="20"><circle cx="9" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/><circle cx="15" cy="7" r="6" fill="#fff" stroke="#93c5fd" stroke-width="1.2"/><circle cx="9" cy="7" r="5.5" fill="#3b82f6" opacity="0.35"/></svg>'
  },
  {
    value: 'inner' as const, label: 'INNER JOIN', desc: '仅保留匹配行',
    venn: '<svg viewBox="0 0 24 14" width="36" height="20"><circle cx="9" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/><circle cx="15" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/><ellipse cx="12" cy="7" rx="2" ry="4.5" fill="#3b82f6" opacity="0.5"/></svg>'
  },
  {
    value: 'right' as const, label: 'RIGHT JOIN', desc: '保留右表所有行',
    venn: '<svg viewBox="0 0 24 14" width="36" height="20"><circle cx="9" cy="7" r="6" fill="#fff" stroke="#93c5fd" stroke-width="1.2"/><circle cx="15" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/><circle cx="15" cy="7" r="5.5" fill="#3b82f6" opacity="0.35"/></svg>'
  },
  {
    value: 'outer' as const, label: 'FULL JOIN', desc: '保留两表所有行',
    venn: '<svg viewBox="0 0 24 14" width="36" height="20"><circle cx="9" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/><circle cx="15" cy="7" r="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/></svg>'
  },
]

// ── 预览状态 ──
const previewLoading = ref(false)
const previewData = ref<ChartPayload | null>(null)
const cardinalityWarning = ref('')
const previewTab = ref<'data' | 'quality'>('data')

// ── 智能推荐 ──
const showSuggestions = ref(true)
const showAllSuggestions = ref(false)
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

/** 选中字段的简要上下文：类型 + 唯一值数 + 示例 */
function colInfo(tableId: string, col: string): string {
  const ds = dataStore.tables[tableId]
  if (!ds || !col) return ''
  const cls = ds.classifications[col]
  const typeMap: Record<string, string> = { numeric: '数值', categorical: '分类', date: '日期', text: '文本' }
  const type = typeMap[cls?.type || ''] || cls?.type || '?'
  const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== null && v !== '')
  const unique = new Set(vals.map(String)).size
  const samples = [...new Set(vals.slice(0, 10).map(v => String(v).slice(0, 16)))].slice(0, 3).join(', ')
  return `${type} · ${unique} 唯一值 · ${samples}`
}

const leftColInfo = computed(() => colInfo(form.value.leftTableId, form.value.leftColumn))
const rightColInfo = computed(() => colInfo(form.value.rightTableId, form.value.rightColumn))

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

function isSuggestionApplied(s: JoinSuggestion): boolean {
  return dataStore.relations.some(r =>
    r.leftTableId === s.leftTableId && r.leftColumn === s.leftColumn &&
    r.rightTableId === s.rightTableId && r.rightColumn === s.rightColumn
  )
}

function getConfidenceClass(score: number): string {
  if (score >= 0.8) return 'high'
  if (score >= 0.6) return 'medium'
  return 'low'
}

function getConfidenceLabel(score: number): string {
  if (score >= 0.8) return t('upload.highConfidence')
  if (score >= 0.6) return t('upload.mediumConfidence')
  return t('upload.lowConfidence')
}

function previewSuggestion(s: JoinSuggestion) {
  applySuggestion(s)
  // Auto-preview after applying
  setTimeout(() => {
    if (canSubmit.value) previewJoin()
  }, 100)
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

function getTableRowCount(id: string): number {
  const ds = dataStore.tables[id]
  return ds ? (ds.totalRows ?? ds.rows.length) : 0
}

function getJoinTypeLabel(type: string): string {
  const jt = joinTypes.find(j => j.value === type)
  return jt ? `${jt.label} - ${jt.desc}` : type
}

async function confirmRemoveRelation(id: string) {
  const ok = await confirm('确定要删除这个关联吗？', { title: '删除关联', kind: 'warning' })
  if (ok) {
    dataStore.removeRelation(id)
  }
}

function resetFormFields() {
  form.value = { leftTableId: '', leftColumn: '', rightTableId: '', rightColumn: '', joinType: 'left' }
  previewData.value = null
  cardinalityWarning.value = ''
}

/** 关联质量指标 */
const relationQuality = computed(() => {
  if (!previewData.value) return { matchRate: 0, leftNullRate: 0, rightNullRate: 0 }
  const rows = previewData.value.rows
  const cols = previewData.value.columns
  if (rows.length === 0) return { matchRate: 0, leftNullRate: 0, rightNullRate: 0 }

  // 估算匹配率：非空行 / 总行数
  const nonEmptyRows = rows.filter(r => {
    return cols.some(c => r[c.name] !== undefined && r[c.name] !== null && r[c.name] !== '')
  }).length
  const matchRate = Math.round((nonEmptyRows / rows.length) * 100)

  // 估算左右表空值率（简化：检查前几个字段）
  const leftCols = cols.filter((_, i) => i < cols.length / 2)
  const rightCols = cols.filter((_, i) => i >= cols.length / 2)
  const leftNullCount = rows.filter(r => leftCols.every(c => r[c.name] === undefined || r[c.name] === null || r[c.name] === '')).length
  const rightNullCount = rows.filter(r => rightCols.every(c => r[c.name] === undefined || r[c.name] === null || r[c.name] === '')).length

  return {
    matchRate,
    leftNullRate: Math.round((leftNullCount / rows.length) * 100),
    rightNullRate: Math.round((rightNullCount / rows.length) * 100),
  }
})

// ── 关联拓扑图 ──
const graphExpanded = ref(true)
const graphZoom = ref(1)
const showFieldDetails = ref(true)
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
  h: number
}
const graphPositions = ref<Record<string, { x: number; y: number }>>({})
const tableColorIndex = computed(() => {
  const map: Record<string, number> = {}
  Object.keys(dataStore.tables).forEach((id, idx) => {
    map[id] = idx % 4
  })
  return map
})

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
    // 根据实际列数估算卡片高度（头部~50px + 每列~22px，最多8列）
    const shownCols = showFieldDetails.value ? Math.min(cols.length, 8) : 0
    const nodeH = 50 + shownCols * 22
    const pos = graphPositions.value[id] || autoLayout(id, nodeH)
    nodes.push({
      id,
      key: `node-${id}`,
      name: dataStore.getTableDisplayName(ds),
      rowCount: ds.totalRows ?? ds.rows.length,
      cols,
      x: pos.x,
      y: pos.y,
      h: nodeH,
    })
  }
  return nodes
})

function autoLayout(id: string, nodeH: number = CARD_H_EST): { x: number; y: number } {
  const ids = Object.keys(dataStore.tables)
  const idx = ids.indexOf(id)
  const cols = Math.min(ids.length, 3)
  const row = Math.floor(idx / cols)
  const col = idx % cols
  return {
    x: 40 + col * (CARD_W + 120),
    y: 20 + row * (nodeH + 40),
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
    const dark = theme.value === 'dark'
    const label = `${rel.leftColumn} → ${rel.rightColumn}`
    lines.push({
      d, color: jc.stroke, dashed: rel.joinType === 'right',
      label, lx: midX, ly: (ly + ry) / 2, lw: label.length * 6.5,
      lbg: dark ? jc.darkBg : jc.bg, lfg: dark ? jc.darkFg : jc.fg,
    })
  }

  // Update canvas size
  let maxX = 200, maxY = 100
  for (const n of nodes) {
    if (n.x + CARD_W + 24 > maxX) maxX = n.x + CARD_W + 24
    if (n.y + n.h + 24 > maxY) maxY = n.y + n.h + 24
  }
  canvasW.value = maxX
  canvasH.value = maxY

  return lines
})

const jcolors: Record<string, { stroke: string; bg: string; fg: string; darkBg: string; darkFg: string }> = {
  left:  { stroke: '#3b82f6', bg: '#eff6ff',  fg: '#1d4ed8', darkBg: 'rgba(96,165,250,0.18)',  darkFg: '#93c5fd' },
  inner: { stroke: '#16a34a', bg: '#f0fdf4',  fg: '#065f46', darkBg: 'rgba(52,211,153,0.18)',  darkFg: '#6ee7b7' },
  right: { stroke: '#f59e0b', bg: '#fffbeb',  fg: '#92400e', darkBg: 'rgba(251,146,60,0.18)',   darkFg: '#fcd34d' },
  outer: { stroke: '#7c3aed', bg: '#f5f3ff',  fg: '#5b21b6', darkBg: 'rgba(167,139,250,0.18)', darkFg: '#c4b5fd' },
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

// ====== 合并表列定义：自动检测 & 样本数据 ======
const mergedHeaders = computed(() => {
  if (dataStore.relations.length === 0) return dataStore.dataSet?.headers ?? []
  return previewStore.effectiveHeaders
})

function effRole(col: string): string {
  return dataStore.roleOverrides[col] || dataStore.getEffectiveClassification(col)?.role || 'ignore'
}

const mergedMetricCols = computed(() =>
  mergedHeaders.value.filter(h => effRole(h) === 'metric' && !dataStore.excludedColumns.has(h))
)

const mergedDimCols = computed(() =>
  mergedHeaders.value.filter(h => effRole(h) === 'dimension' && !dataStore.excludedColumns.has(h))
)

/** 合并样本列：显示列 + 已选中计算列 */
const mergedSampleCols = computed(() => {
  const cols = configStore.config.table.columns.length > 0
    ? [...configStore.config.table.columns]
    : [...mergedHeaders.value]
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !cols.includes(c.name)) {
        cols.push(c.name)
      }
    }
  }
  return cols.filter(h => !dataStore.excludedColumns.has(h))
})

/** 合并样本数据（前5行，含计算列） */
const mergedSampleRows = computed(() => {
  const rows = previewStore.effectiveRows.slice(0, 5)
  const rustCC = previewStore.computedColumnData
  const cc = configStore.config.table.computedColumns?.filter(c => c.selected !== false && c.name) || []
  if (rustCC && Object.keys(rustCC).length > 0) {
    return rows.map((row, idx) => {
      const aug = { ...row }
      for (const [col, values] of Object.entries(rustCC)) {
        aug[col] = values[idx] ?? 0
      }
      return aug
    })
  }
  if (cc.length === 0) return rows
  // JS fallback: 使用公式引擎
  return augmentComputedCols(rows, cc)
})

function truncateVal(val: any): string {
  if (val === undefined || val === null || val === '') return '—'
  const s = String(val)
  return s.length > 30 ? s.slice(0, 27) + '...' : s
}

/** 合并表预览单元格格式化（应用 columnFormats） */
function formatMergedCell(col: string, val: any): string {
  if (val === undefined || val === null || val === '') return '—'
  const fmt = configStore.config.table.columnFormats?.[col]
  if (fmt?.format && typeof val === 'number') {
    const n = getNumericVal(val)
    if (!isNaN(n)) {
      return fmtByChart(n, { format: fmt.format, unit: fmt.unit as any, metricFormats: { [col]: { format: fmt.format, unit: fmt.unit as any, decimals: fmt.decimals } } }, col)
    }
  }
  return truncateVal(val)
}

/** 列来源着色（th 用全色，td 用浅色） */
const SOURCE_COLORS: Record<string, { bg: string; light: string }> = {
  computed: { bg: '#e8d5f5', light: '#f5edfa' },   // 计算列：淡紫
  assoc1: { bg: '#dce8fc', light: '#edf3fd' },   // 关联表1：淡蓝
  assoc2: { bg: '#fcdce8', light: '#fde8ef' },   // 关联表2：淡粉
  assoc3: { bg: '#dcecfc', light: '#edf5fd' },   // 关联表3：浅蓝
}

/** 关联 key 列名（JOIN 用到的列） */
const joinKeyNames = ref(new Set<string>())
function isJoinKey(col: string): boolean { return joinKeyNames.value.has(col) }

const mergedColSourceMap = computed(() => {
  const map = new Map<string, 'computed' | 'assoc1' | 'assoc2' | 'assoc3'>()
  if (!dataStore.hasRelations) return map
  const ds = dataStore.dataSet
  if (!ds) return map

  // 计算列
  const cc = configStore.config.table.computedColumns || []
  for (const c of cc) { if (c.selected !== false && c.name) map.set(c.name, 'computed') }

  // 主表列名集合
  const mainHeaders = new Set(ds.headers)
  // 收集每个关联表的列（含其在合并后的实际名称）
  let assocIdx = 0
  const usedPrefixes = new Map<string, number>()
  joinKeyNames.value.clear()

  for (const rel of dataStore.relations) {
    const otherId = rel.leftTableId === ds.id ? rel.rightTableId : rel.rightTableId === ds.id ? rel.leftTableId : null
    if (!otherId) continue
    const otherDs = dataStore.tables[otherId]
    if (!otherDs) continue
    const thisJoinCol = rel.leftTableId === ds.id ? rel.leftColumn : rel.rightColumn
    const otherJoinCol = rel.leftTableId === ds.id ? rel.rightColumn : rel.leftColumn
    const prefix = dataStore.getTableDisplayName(otherDs)
    if (!usedPrefixes.has(prefix)) usedPrefixes.set(prefix, assocIdx++)
    const idx = usedPrefixes.get(prefix)!
    const sourceKey = ('assoc' + (idx + 1)) as 'assoc1' | 'assoc2' | 'assoc3'
    // 标记关联 key
    joinKeyNames.value.add(thisJoinCol)
    joinKeyNames.value.add(mainHeaders.has(otherJoinCol) ? (prefix + '.' + otherJoinCol) : otherJoinCol)

    for (const h of otherDs.headers) {
      const effectiveName = mainHeaders.has(h) ? (prefix + '.' + h) : h
      map.set(effectiveName, sourceKey)
    }
  }
  return map
})

function _mergedColWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const c = color.trim()
  if (!c) return color
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map(s => s.trim())
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`
  }
  return color
}

function _mergedColLuminance(color: string): number {
  const c = color.trim()
  let r = 0, g = 0, b = 0
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (hex.length === 3) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16) }
    else if (hex.length >= 6) { r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16) }
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (m) { const p = m[1].split(',').map(s => Number(s.trim())); r = p[0]; g = p[1]; b = p[2] }
  }
  const toLinear = (v: number) => { const n = Math.max(0, Math.min(255, v)) / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4) }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function _mergedColIsDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
}

function mergedColThStyle(col: string): Record<string, string> {
  const dark = _mergedColIsDark()
  const userBg = configStore.config.table.columnColors?.[col]
  if (userBg) {
    const alpha = dark ? (_mergedColLuminance(userBg) > 0.72 ? 0.22 : 0.4) : 1
    return { backgroundColor: _mergedColWithAlpha(userBg, alpha) }
  }
  const src = mergedColSourceMap.value.get(col)
  if (!src) return {}
  return { backgroundColor: dark ? _mergedColWithAlpha(SOURCE_COLORS[src].bg, 0.3) : SOURCE_COLORS[src].bg }
}

function mergedColTdStyle(col: string): Record<string, string> {
  const dark = _mergedColIsDark()
  const userBg = configStore.config.table.columnColors?.[col]
  const userFg = configStore.config.table.columnTextColors?.[col]
  const style: Record<string, string> = {}
  if (userBg) {
    const alpha = dark ? (_mergedColLuminance(userBg) > 0.72 ? 0.12 : 0.24) : 0.24
    style.backgroundColor = _mergedColWithAlpha(userBg, alpha)
  } else {
    const src = mergedColSourceMap.value.get(col)
    if (src) style.backgroundColor = dark ? _mergedColWithAlpha(SOURCE_COLORS[src].light, 0.2) : SOURCE_COLORS[src].light
  }
  if (userFg) style.color = dark ? userFg : _mergedColWithAlpha(userFg, 0.82)
  return style
}
</script>

<style scoped>
.relation-config {
  width: 100%;
}

.relation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.relation-header-left {
  display: flex;
  flex-direction: column;
}

.relation-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 2px;
}

.relation-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
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
  flex-shrink: 0;
}

.btn-next:hover {
  opacity: 0.9;
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
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  padding: 16px;
}

/* ── 主表栏 ── */
.main-table-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
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
  background: var(--bg-surface);
  border: 1px solid var(--border);
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
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--text-primary);
  cursor: pointer;
  font-family: monospace;
  transition: all 0.15s;
}

.suggest-chip:hover {
  background: var(--primary-light, #dbeafe);
  border-color: var(--primary);
}

/* Dark theme for suggestions toggle and label */
:root[data-theme="dark"] .suggest-toggle,
:root[data-theme="dark"] .suggest-label {
  color: var(--primary-light, #93c5fd);
}

/* ── 关联预览 ── */
.relation-graph {
  margin: 8px 0;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.show-fields-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.show-fields-toggle input {
  margin: 0;
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
  color: inherit;
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
}

.graph-flow {
  position: relative;
  transition: transform 0.2s ease;
  overflow: hidden;
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

/* Table color differentiation */
.graph-card.table-color-0 {
  background: #f0f9ff;
}

.graph-card.table-color-1 {
  background: #faf5ff;
}

.graph-card.table-color-2 {
  background: #fff7ed;
}

.graph-card.table-color-3 {
  background: #f0fdf4;
}

.graph-card.is-main.table-color-0,
.graph-card.is-main.table-color-1,
.graph-card.is-main.table-color-2,
.graph-card.is-main.table-color-3 {
  background: #fffbeb;
}

:root[data-theme="dark"] .graph-card.table-color-0 {
  background: rgba(96, 165, 250, 0.1);
  border-color: rgba(96, 165, 250, 0.3);
}

:root[data-theme="dark"] .graph-card.table-color-1 {
  background: rgba(167, 139, 250, 0.1);
  border-color: rgba(167, 139, 250, 0.3);
}

:root[data-theme="dark"] .graph-card.table-color-2 {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.3);
}

:root[data-theme="dark"] .graph-card.table-color-3 {
  background: rgba(52, 211, 153, 0.1);
  border-color: rgba(52, 211, 153, 0.3);
}

:root[data-theme="dark"] .graph-card.is-main.table-color-0,
:root[data-theme="dark"] .graph-card.is-main.table-color-1,
:root[data-theme="dark"] .graph-card.is-main.table-color-2,
:root[data-theme="dark"] .graph-card.is-main.table-color-3 {
  background: rgba(245, 158, 11, 0.1);
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

:root[data-theme="dark"] .gc-key-tag {
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
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
  gap: 10px;
  margin-top: 16px;
}

.relation-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.relation-list-header h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.relation-count {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 10px;
}

.btn-add-relation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-relation:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light, #eff6ff);
}

.relation-empty {
  margin-top: 0;
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  border: 2px dashed var(--primary, #93c5fd);
  border-radius: 10px;
  background: var(--primary-light, #eff6ff);
}

.empty-graphic {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-icon {
  font-size: 32px;
}

.empty-title {
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.empty-hint {
  max-width: 360px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.empty-arrow {
  font-size: 18px;
  color: var(--primary);
  margin-top: 6px;
  animation: bounce-arrow 1.2s ease infinite;
}

@keyframes bounce-arrow {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(6px);
  }
}

.relation-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.2s;
}

.relation-card:hover {
  border-color: var(--border-light, #e5e7eb);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.relation-card.editing {
  border-color: var(--primary);
  background: var(--primary-light, #eff6ff);
}

.rel-left-table,
.rel-right-table {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.rel-tbl-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.rel-role-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.rel-role-badge.main {
  background: #dbeafe;
  color: #1d4ed8;
}

.rel-role-badge.dim {
  background: #f3e8ff;
  color: #7c3aed;
}

.rel-row-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.rel-join-icon {
  font-size: 16px;
  color: var(--primary);
  flex-shrink: 0;
  opacity: 0.7;
}

.rel-key-fields {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.rel-key-label {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.rel-key-value {
  font-size: 12px;
  font-family: monospace;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ── 关联表单弹窗 ── */
.relation-form-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.relation-form-popup {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  width: 640px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  animation: rf-slide-in 0.2s ease;
}

@keyframes rf-slide-in {
  from { opacity: 0; transform: translateY(-16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.rf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.rf-header h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.rf-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.rf-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 0;
}

.form-row {
  display: flex;
  gap: 10px;
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
  gap: 3px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 70px;
}

.join-type-option:hover {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.join-type-option.active {
  border-color: var(--primary);
  background: var(--primary-light, #eff6ff);
}

.join-type-option input {
  display: none;
}

.jt-venn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.jt-venn svg {
  display: block;
}

.jt-label {
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
}

.jt-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.col-info-hint {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 3px;
  line-height: 1.3;
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

/* Preview Tabs */
.preview-section {
  margin-top: 12px;
}

.preview-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 12px;
}

.preview-tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.preview-tab:hover {
  color: var(--text-primary);
}

.preview-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.preview-quality {
  padding: 12px 0;
}

.quality-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.quality-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg-hover);
  border-radius: 8px;
}

.quality-label {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.quality-warning {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  color: #92400e;
  font-size: 12px;
}

/* 合并表列定义区域 */
.merged-col-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}

.merged-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 12px;
}

.merged-card h4 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-head h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 8px;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.btn-save,
.btn-reset {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.btn-save.saved {
  border-color: #22c55e;
  color: #22c55e;
}

:root[data-theme="dark"] .btn-save.saved {
  border-color: #4ade80;
  color: #4ade80;
}

.detect-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.sample-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.sample-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.sample-table th,
.sample-table td {
  padding: 6px 10px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

.sample-table th {
  background: var(--bg-hover);
  font-weight: 500;
  position: sticky;
  top: 0;
}

.sample-table td {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.key-tag {
  font-size: 10px;
  margin-left: 3px;
  opacity: 0.7;
}

/* Suggestions Panel */
.suggestions-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.suggestions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.suggest-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.suggest-icon {
  font-size: 18px;
}

.suggest-title-row h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.suggest-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  background: var(--primary);
  color: white;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 600;
}

.suggest-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.suggest-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.suggest-toggle-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.suggest-toggle-switch input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  transition: background 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.suggest-toggle-switch input:checked + .toggle-slider {
  background: var(--primary);
}

.suggest-toggle-switch input:checked + .toggle-slider::after {
  transform: translateX(16px);
}

.btn-help, .btn-collapse {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-help:hover, .btn-collapse:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Suggestion Cards */
.suggestion-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.suggestion-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-surface);
}

.suggestion-card:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.suggestion-card.selected {
  border-color: var(--primary);
  background: var(--primary-light, #eff6ff);
}

.sc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sc-tables {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.sc-checkmark {
  width: 22px;
  height: 22px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.sc-fields {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  margin-bottom: 10px;
}

.sc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sc-confidence {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.sc-confidence.high {
  background: #d1fae5;
  color: #065f46;
}

.sc-confidence.medium {
  background: #fef3c7;
  color: #92400e;
}

.sc-confidence.low {
  background: #fee2e2;
  color: #991b1b;
}

.sc-preview-btn {
  font-size: 12px;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.sc-preview-btn:hover {
  text-decoration: underline;
}

.show-more-wrap {
  text-align: center;
  margin-top: 12px;
}

.btn-show-more {
  font-size: 13px;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-show-more:hover {
  text-decoration: underline;
}

</style>
