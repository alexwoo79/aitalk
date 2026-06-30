<template>
  <div class="column-config-panel">
    <!-- 显示列控制 -->
    <div class="table-col-header">
      <span>{{ t('config.displayColumns') }} ({{ configStore.config.table.columns.length }}/{{ allHeaders.length +
        computedTableCols.length
      }})</span>
      <button class="btn-link" @click="selectAllColumns">{{ t('common.selectAll') }}</button>
      <button class="btn-link" @click="clearAllColumns">{{ t('common.clearAll') }}</button>
    </div>

    <!-- 数据列卡片网格 -->
    <div class="col-grid" data-drag-list="table">
      <template v-for="(col, ci) in regularTableCols" :key="col">
        <div class="col-card-wrap">
          <div class="col-card" :class="[
            'role-' + effRole(col),
            { 'is-computed': isComputedCol(col), 'is-expanded': isColCardOpen(col), 'drag-placeholder': dragPlaceholder === ci && dragList === 'table' }
          ]" :data-drag-idx="ci" @click="toggleColCard(col)">
            <span class="drag-handle col-drag" :title="t('config.dragTitle')"
              @pointerdown.prevent="onPointerDown($event, ci, 'table')" @click.stop>⋮</span>
            <span class="col-icon">{{ roleIcon(effRole(col)) }}</span>
            <div class="col-text">
              <span class="col-name">
                {{ col }}
                <span v-if="isComputedCol(col)" class="col-computed-badge">计算</span>
              </span>
              <span class="col-meta" @click.stop="cycleRole(col)">
                {{ colTypeLabel(col) }} · {{ roleLabel(effRole(col)) }} 🖉
              </span>
            </div>
            <label class="col-vis-cb" @click.stop :title="t('config.showInTable')">
              <input type="checkbox" :checked="configStore.config.table.columns.includes(col)"
                @change="isComputedCol(col) ? toggleComputedColSelected(col) : configStore.toggleTableColumn(col)" />
            </label>
            <template v-if="isComputedCol(col)">
              <button class="col-action-btn" @click.stop="copyComputedCol(col)" :title="t('config.copy')">📋</button>
              <button class="col-action-btn col-action-del" @click.stop="removeComputedColByName(col)"
                :title="t('config.remove')">🗑</button>
            </template>
            <span class="col-expand-icon" :class="{ 'is-edit': isComputedCol(col) }"
              @click.stop="isComputedCol(col) ? openComputedColEditor((configStore.config.table.computedColumns || []).findIndex(cc => cc.name === col)) : null">{{
                isComputedCol(col) ? '✎' :
                  (isColCardOpen(col) ? '' : '▸') }}</span>
          </div>
          <!-- 卡片原位下方展开的设置面板 -->
          <div v-if="isColCardOpen(col)" class="col-settings-inline">
            <div class="csi-header">
              <span class="csi-icon">{{ roleIcon(effRole(col)) }}</span>
              <span class="csi-name">{{ col }}</span>
              <span v-if="isComputedCol(col)" class="col-computed-badge">计算</span>
              <span class="csi-meta">{{ colTypeLabel(col) }} · {{ roleLabel(effRole(col)) }}</span>
              <button class="csi-close" @click="toggleColCard(col)" :title="t('config.collapse')">✕</button>
            </div>
            <div class="csi-body">
              <div class="col-card-settings">
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.columnBgColor') }}</span>
                  <span class="ccs-control" @click.stop>
                    <input type="color" class="color-picker-sm"
                      :value="configStore.config.table.columnColors?.[col] || '#ffffff'"
                      @input="(e) => configStore.setColumnColor(col, (e.target as HTMLInputElement).value)" />
                    <button v-if="configStore.config.table.columnColors?.[col]" class="ccs-clear"
                      @click.stop="configStore.setColumnColor(col, '')">✕</button>
                  </span>
                </div>
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.columnFontColor') }}</span>
                  <span class="ccs-control" @click.stop>
                    <input type="color" class="color-picker-sm"
                      :value="configStore.config.table.columnTextColors?.[col] || '#000000'"
                      @input="(e) => configStore.setColumnTextColor(col, (e.target as HTMLInputElement).value)" />
                    <button v-if="configStore.config.table.columnTextColors?.[col]" class="ccs-clear"
                      @click.stop="configStore.setColumnTextColor(col, '')">✕</button>
                  </span>
                </div>
                <template v-if="isNumericCol(col)">
                  <div class="ccs-row">
                    <span class="ccs-label">{{ t('config.summaryRow') }}</span>
                    <span class="ccs-control">
                      <select class="ccs-select" :value="(configStore.config.table.summaryAggs || {})[col] || ''"
                        @change="(e) => configStore.setSummaryAgg(col, (e.target as HTMLSelectElement).value as any)">
                        <option value="">{{ t('common.none') }}</option>
                        <option value="sum">{{ t('config.aggSum') }}</option>
                        <option value="avg">{{ t('config.aggAvg') }}</option>
                        <option value="count">{{ t('config.aggCount') }}</option>
                        <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                        <option value="min">{{ t('config.aggMin') }}</option>
                        <option value="max">{{ t('config.aggMax') }}</option>
                      </select>
                    </span>
                  </div>
                </template>
                <template v-if="effRole(col) === 'metric'">
                  <div class="ccs-row">
                    <span class="ccs-label">{{ t('config.format') }}</span>
                    <span class="ccs-control ccs-control-inline" @click.stop>
                      <select class="ccs-select"
                        :value="(configStore.config.table.columnFormats || {})[col]?.format || ''"
                        @change="(e) => setColFormatField(col, 'format', (e.target as HTMLSelectElement).value)">
                        <option value="">{{ t('config.formatOptions.unset') }}</option>
                        <option value="number">{{ t('config.formatOptions.number') }}</option>
                        <option value="integer">{{ t('config.formatOptions.integer') }}</option>
                        <option value="percent">{{ t('config.formatOptions.percent') }}</option>
                        <option value="currency">{{ t('config.formatOptions.currency') }}</option>
                      </select>
                      <template v-if="(configStore.config.table.columnFormats || {})[col]?.format === 'currency'">
                        <select class="ccs-select ccs-select-sm"
                          :value="(configStore.config.table.columnFormats || {})[col]?.unit || 'yuan'"
                          @change="(e) => setColFormatField(col, 'unit', (e.target as HTMLSelectElement).value)">
                          <option value="yuan">{{ t('config.unitOptions.yuan') }}</option>
                          <option value="wan">{{ t('config.unitOptions.wan') }}</option>
                          <option value="yi">{{ t('config.unitOptions.yi') }}</option>
                        </select>
                        <input type="text" class="ccs-input-sm"
                          :value="(configStore.config.table.columnFormats || {})[col]?.prefix || ''"
                          @input="(e) => setColFormatField(col, 'prefix', (e.target as HTMLInputElement).value)"
                          maxlength="4" :placeholder="t('config.prefix')" />
                      </template>
                    </span>
                  </div>
                  <div class="ccs-row">
                    <span class="ccs-label">{{ t('config.decimals') }}</span>
                    <span class="ccs-control">
                      <input type="number" class="ccs-input-sm"
                        :value="(configStore.config.table.columnFormats || {})[col]?.decimals ?? 2"
                        @input="(e) => setColFormatField(col, 'decimals', Number((e.target as HTMLInputElement).value))"
                        min="0" max="6" step="1" />
                    </span>
                  </div>
                </template>
              </div>
              <!-- 条件着色规则面板 -->
              <div v-if="isNumericCol(col)" class="col-card-rules-panel">
                <div class="ccrp-header" @click.stop="toggleColRules(col)">
                  <span class="ccrp-title">{{ t('config.columnTextRule') }}</span>
                  <span v-if="ruleCount(col)" class="ccrp-badge">{{ ruleCount(col) }}</span>
                  <span class="ccrp-arrow">{{ expandedColRules.has(col) ? '▼' : '▶' }}</span>
                </div>
                <div v-show="expandedColRules.has(col)" class="ccrp-body">
                  <div v-for="(rule, ri) in (configStore.config.table.columnTextRules?.[col] || [])" :key="ri"
                    class="ccrp-rule-row">
                    <input type="text" class="input input-xs ccrp-cond" :value="rule.condition"
                      :placeholder="t('config.columnTextRulePlaceholder')"
                      @input="(e) => configStore.setColumnTextRule(col, ri, { condition: (e.target as HTMLInputElement).value, color: rule.color })" />
                    <input type="color" class="color-picker-sm rule-text-color" :value="rule.color"
                      @input="(e) => configStore.setColumnTextRule(col, ri, { condition: rule.condition, color: (e.target as HTMLInputElement).value })" />
                    <button class="btn-icon tct-rule-remove"
                      @click="configStore.removeColumnTextRule(col, ri)">✕</button>
                  </div>
                  <button class="btn-link ccrp-add-btn"
                    @click="configStore.setColumnTextRule(col, (configStore.config.table.columnTextRules?.[col]?.length || 0), { condition: '', color: '#333333' })">{{
                      t('config.columnTextRuleAdd') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 计算列卡片网格 -->
    <div v-if="computedTableCols.length" class="col-grid-label">计算列 ({{ computedTableCols.length }})</div>
    <div class="col-grid" data-drag-list="table-computed">
      <template v-for="(col, ci) in computedTableCols" :key="col">
        <div class="col-card-wrap">
          <div class="col-card" :class="[
            'role-' + effRole(col),
            { 'is-computed': true, 'is-expanded': isColCardOpen(col), 'drag-placeholder': dragPlaceholder === ci && dragList === 'table-computed' }
          ]" :data-drag-idx="ci" @click="toggleColCard(col)">
            <div class="col-card-row1">
              <span class="drag-handle col-drag" :title="t('config.dragTitle')"
                @pointerdown.prevent="onPointerDown($event, ci, 'table-computed')" @click.stop>⋮</span>
              <span class="col-icon-wrap">
                <span class="col-icon">{{ roleIcon(effRole(col)) }}</span>
                <span class="col-computed-badge">计算</span>
              </span>
              <div class="col-text">
                <span class="col-name">{{ col }}</span>
                <span class="col-meta">
                  {{ colTypeLabel(col) }} · {{ roleLabel(effRole(col)) }}
                </span>
              </div>
              <label class="col-vis-cb" @click.stop :title="t('config.showInTable')">
                <input type="checkbox" :checked="configStore.config.table.columns.includes(col)"
                  @change="toggleComputedColSelected(col)" />
              </label>
              <span class="col-expand-icon is-edit"
                @click.stop="openComputedColEditor((configStore.config.table.computedColumns || []).findIndex(cc => cc.name === col))">✎</span>
            </div>
            <div class="col-card-row2">
              <button class="col-action-btn" @click.stop="copyComputedCol(col)" :title="t('config.copy')">📋</button>
              <button class="col-action-btn col-action-del" @click.stop="removeComputedColByName(col)"
                :title="t('config.remove')">🗑</button>
            </div>
          </div>
          <!-- 设置面板（与数据列相同） -->
          <div v-if="isColCardOpen(col)" class="col-settings-inline">
            <div class="csi-header">
              <span class="csi-icon">{{ roleIcon(effRole(col)) }}</span>
              <span class="csi-name">{{ col }}</span>
              <span class="col-computed-badge">计算</span>
              <span class="csi-meta">{{ colTypeLabel(col) }} · {{ roleLabel(effRole(col)) }}</span>
              <button class="csi-close" @click="toggleColCard(col)" :title="t('config.collapse')">✕</button>
            </div>
            <div class="csi-body">
              <div class="col-card-settings">
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.columnBgColor') }}</span>
                  <span class="ccs-control" @click.stop>
                    <input type="color" class="color-picker-sm"
                      :value="configStore.config.table.columnColors?.[col] || '#ffffff'"
                      @input="(e) => configStore.setColumnColor(col, (e.target as HTMLInputElement).value)" />
                    <button v-if="configStore.config.table.columnColors?.[col]" class="ccs-clear"
                      @click.stop="configStore.setColumnColor(col, '')">✕</button>
                  </span>
                </div>
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.columnFontColor') }}</span>
                  <span class="ccs-control" @click.stop>
                    <input type="color" class="color-picker-sm"
                      :value="configStore.config.table.columnTextColors?.[col] || '#000000'"
                      @input="(e) => configStore.setColumnTextColor(col, (e.target as HTMLInputElement).value)" />
                    <button v-if="configStore.config.table.columnTextColors?.[col]" class="ccs-clear"
                      @click.stop="configStore.setColumnTextColor(col, '')">✕</button>
                  </span>
                </div>
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.summaryRow') }}</span>
                  <span class="ccs-control">
                    <select class="ccs-select" :value="(configStore.config.table.summaryAggs || {})[col] || ''"
                      @change="(e) => configStore.setSummaryAgg(col, (e.target as HTMLSelectElement).value as any)">
                      <option value="">{{ t('common.none') }}</option>
                      <option value="sum">{{ t('config.aggSum') }}</option>
                      <option value="avg">{{ t('config.aggAvg') }}</option>
                      <option value="count">{{ t('config.aggCount') }}</option>
                      <option value="unique_count">{{ t('config.aggUniqueCount') }}</option>
                      <option value="min">{{ t('config.aggMin') }}</option>
                      <option value="max">{{ t('config.aggMax') }}</option>
                    </select>
                  </span>
                </div>
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.format') }}</span>
                  <span class="ccs-control ccs-control-inline" @click.stop>
                    <select class="ccs-select"
                      :value="(configStore.config.table.columnFormats || {})[col]?.format || ''"
                      @change="(e) => setColFormatField(col, 'format', (e.target as HTMLSelectElement).value)">
                      <option value="">{{ t('config.formatOptions.unset') }}</option>
                      <option value="number">{{ t('config.formatOptions.number') }}</option>
                      <option value="integer">{{ t('config.formatOptions.integer') }}</option>
                      <option value="percent">{{ t('config.formatOptions.percent') }}</option>
                      <option value="currency">{{ t('config.formatOptions.currency') }}</option>
                    </select>
                    <template v-if="(configStore.config.table.columnFormats || {})[col]?.format === 'currency'">
                      <select class="ccs-select ccs-select-sm"
                        :value="(configStore.config.table.columnFormats || {})[col]?.unit || 'yuan'"
                        @change="(e) => setColFormatField(col, 'unit', (e.target as HTMLSelectElement).value)">
                        <option value="yuan">{{ t('config.unitOptions.yuan') }}</option>
                        <option value="wan">{{ t('config.unitOptions.wan') }}</option>
                        <option value="yi">{{ t('config.unitOptions.yi') }}</option>
                      </select>
                      <input type="text" class="ccs-input-sm"
                        :value="(configStore.config.table.columnFormats || {})[col]?.prefix || ''"
                        @input="(e) => setColFormatField(col, 'prefix', (e.target as HTMLInputElement).value)"
                        maxlength="4" :placeholder="t('config.prefix')" />
                    </template>
                  </span>
                </div>
                <div class="ccs-row">
                  <span class="ccs-label">{{ t('config.decimals') }}</span>
                  <span class="ccs-control">
                    <input type="number" class="ccs-input-sm"
                      :value="(configStore.config.table.columnFormats || {})[col]?.decimals ?? 2"
                      @input="(e) => setColFormatField(col, 'decimals', Number((e.target as HTMLInputElement).value))"
                      min="0" max="6" step="1" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div class="col-card col-card-add" @click="openComputedColEditor(-1)">
        <span class="col-add-icon">＋</span>
        <span class="col-add-text">{{ t('config.addComputedCol') }}</span>
      </div>
    </div>

    <!-- 行条件颜色 -->
    <div class="table-config-bottom">
      <div class="table-row-cond-wrap">
        <label>{{ t('config.rowConditionColor') }}</label>
        <div class="row-colors-list">
          <div v-for="(rule, ri) in (configStore.config.table.rowConditionColors || [])" :key="'rc-' + ri"
            class="color-rule-row">
            <span class="rule-index">{{ ri + 1 }}</span>
            <input type="text" class="input input-xs rule-cond-input" :value="rule.condition"
              :placeholder="t('config.rowConditionPlaceholder')" list="row-cond-cols"
              @input="(e) => rule.condition = (e.target as HTMLInputElement).value" />
            <input type="color" class="color-picker-mini" :value="rule.color"
              @input="(e) => rule.color = (e.target as HTMLInputElement).value" :title="t('config.columnColor')" />
            <input type="color" class="color-picker-mini rule-text-color" :value="rule.textColor || '#000000'"
              @input="(e) => rule.textColor = (e.target as HTMLInputElement).value"
              :title="t('config.columnTextColor')" />
            <button class="btn-icon rule-remove" @click="configStore.removeRowConditionColor(ri)"
              :title="t('config.removeColor')">✕</button>
          </div>
          <button class="btn-link tcc-rule-add"
            @click="configStore.addRowConditionColor({ condition: '', color: '#ffff00' })">{{
              t('config.rowConditionColorAdd') }}</button>
          <datalist id="row-cond-cols">
            <template v-for="col in filterableColumns" :key="col">
              <option :value="col + ' = '" />
              <option :value="col + ' != '" />
              <option v-if="isNumericCol(col)" :value="col + ' > '" />
              <option v-if="isNumericCol(col)" :value="col + ' < '" />
              <option v-if="!isNumericCol(col)" :value="col + ' in '" />
              <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
            </template>
          </datalist>
        </div>
      </div>
    </div>

    <!-- 计算列编辑器弹窗 -->
    <Teleport to="body">
      <div v-if="showComputedColEditor" class="modal-overlay" @click.self="cancelComputedColEdit">
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h3>{{ editingComputedColIdx >= 0 ? t('config.editComputedCol') : t('config.addComputedCol') }}</h3>
            <button class="btn-icon" @click="cancelComputedColEdit">✕</button>
          </div>
          <div class="modal-body">
            <label class="cc-field-label">{{ t('config.colName') }}</label>
            <input v-model="computedColForm.name" class="input" :placeholder="t('config.colName')" />
            <p class="sec-desc" style="margin-top:4px;margin-bottom:10px">💡 {{ t('config.compColNameHint') }}</p>

            <div class="cc-section-title">{{ t('config.variables') }}</div>
            <div v-for="(v, vi) in computedColForm.variables" :key="vi" class="formula-var-row">
              <span class="var-alias">{{ v.alias }}</span>
              <select v-model="v.column" class="input input-sm" style="flex:1">
                <option value="">{{ t('config.selectColumnPlaceholder') }}</option>
                <option v-for="col in allDataCols" :key="col" :value="col">{{ col }}</option>
              </select>
              <input v-model="v.filter" class="input input-sm formula-filter" :placeholder="t('config.columnFilter')"
                list="cc-filter-cols" />
              <button v-if="computedColForm.variables.length > 1" class="btn-icon"
                @click="computedColForm.variables.splice(vi, 1)" :title="t('config.remove')">✕</button>
            </div>
            <button class="btn-link" @click="addComputedColVariable" style="margin-bottom:6px">{{
              t('config.addVariable')
              }}</button>

            <div class="cc-section-title" style="margin-top:14px">{{ t('config.sharedFilter') }} <span
                class="formula-hint">{{
                  t('config.sharedFilterHint') }}</span></div>
            <div class="filter-wrap" style="margin-bottom:14px">
              <input v-model="computedColForm.filter" class="input filter-input"
                :placeholder="t('config.leaveEmptyAll')" list="cc-filter-shared" />
            </div>

            <datalist id="cc-filter-shared">
              <template v-for="col in filterableColumns" :key="col">
                <option :value="col + ' = '" />
                <option :value="col + ' != '" />
                <option v-if="isNumericCol(col)" :value="col + ' > '" />
                <option v-if="isNumericCol(col)" :value="col + ' < '" />
                <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
              </template>
            </datalist>
            <datalist id="cc-filter-cols">
              <template v-for="col in filterableColumns" :key="col">
                <option :value="col + ' = '" />
                <option :value="col + ' != '" />
                <option v-if="isNumericCol(col)" :value="col + ' > '" />
                <option v-if="isNumericCol(col)" :value="col + ' < '" />
                <option v-if="!isNumericCol(col)" :value="col + ' in '" />
                <option v-if="!isNumericCol(col)" :value="col + ' ~ '" />
              </template>
            </datalist>

            <div class="cc-section-title" style="margin-top:14px">{{ t('config.colExpr') }}</div>
            <div class="formula-btns">
              <button v-for="v in computedColForm.variables" :key="v.alias" class="period-btn"
                @click="computedColForm.expression += v.alias">{{ v.alias }}</button>
              <span v-if="computedColForm.variables.length" class="toggle-sep" style="margin:0 4px"></span>
              <button class="period-btn func-btn" @click="insertCCFunc('SUM')">SUM</button>
              <button class="period-btn func-btn" @click="insertCCFunc('AVG')">AVG</button>
              <button class="period-btn func-btn" @click="insertCCFunc('COUNT')">CNT</button>
              <button class="period-btn func-btn" @click="insertCCFunc('UNIQUE_COUNT')">UNIQ</button>
              <button class="period-btn func-btn" @click="insertCCFunc('MIN')">MIN</button>
              <button class="period-btn func-btn" @click="insertCCFunc('MAX')">MAX</button>
              <span class="toggle-sep" style="margin:0 4px"></span>
              <button class="period-btn" @click="insertCCOp('+')">+</button>
              <button class="period-btn" @click="insertCCOp('-')">−</button>
              <button class="period-btn" @click="insertCCOp('*')">×</button>
              <button class="period-btn" @click="insertCCOp('/')">÷</button>
              <button class="period-btn" @click="insertCCOp('(')">(</button>
              <button class="period-btn" @click="insertCCOp(')')">)</button>
            </div>
            <input v-model="computedColForm.expression" class="input" :placeholder="t('config.colExprPlaceholder')"
              style="margin-top:6px" />

            <label class="cc-modal-cb" style="margin-top:12px">
              <input type="checkbox" v-model="computedColForm.selected" />
              {{ t('config.showInTable') }}
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" @click="saveComputedCol">{{ t('common.save') }}</button>
            <button class="btn" @click="cancelComputedColEdit">{{ t('common.cancel') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config-store'
import { useDataStore } from '@/stores/data-store'
import { usePreviewStore } from '@/stores/preview-store'

const { t } = useI18n()
const configStore = useConfigStore()
const dataStore = useDataStore()
const previewStore = usePreviewStore()

const { roleOverrides } = storeToRefs(dataStore)

// ====== Headers ======
const allHeaders = computed(() => {
  if (dataStore.hasRelations) return previewStore.effectiveHeaders
  return dataStore.dataSet?.headers ?? []
})

const filterableColumns = computed(() =>
  allHeaders.value.filter((h) => !dataStore.excludedColumns.has(h)),
)

const orderedTableCols = computed(() => {
  const headers = [...allHeaders.value]
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      // 计算列卡片始终显示（即使取消选中），仅 selected 控制是否在表格中渲染
      if (c.name && !headers.includes(c.name)) {
        headers.push(c.name)
      }
    }
  }
  const order = configStore.config.table.columnOrder
  if (!order || order.length === 0) return headers
  const seen = new Set(order)
  const result = order.filter(h => headers.includes(h))
  for (const h of headers) {
    if (!seen.has(h)) result.push(h)
  }
  return result
})

/** 仅含数据列（非计算列） */
const regularTableCols = computed(() =>
  orderedTableCols.value.filter(h => !isComputedCol(h))
)

/** 仅含计算列 */
const computedTableCols = computed(() =>
  orderedTableCols.value.filter(h => isComputedCol(h))
)

watch([orderedTableCols, () => configStore.config.table.columnOrder], () => {
  const order = configStore.config.table.columnOrder
  const cols = orderedTableCols.value
  if (!order || order.length === 0) return
  if (cols.length !== order.length || cols.some((h, i) => h !== order[i])) {
    configStore.config.table.columnOrder = [...cols]
  }
}, { flush: 'sync' })

const allDataCols = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return []
  if (dataStore.hasRelations) return allHeaders.value.filter((h) => !dataStore.excludedColumns.has(h))
  let cols = ds.headers.filter((h) => !dataStore.excludedColumns.has(h))
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      if (c.selected !== false && c.name && !cols.includes(c.name)) {
        cols.push(c.name)
      }
    }
  }
  return cols
})

// ====== Column helpers ======
function isComputedCol(col: string): boolean {
  return (configStore.config.table.computedColumns || []).some(c => c.name === col)
}

function isNumericCol(col: string): boolean {
  if (isComputedCol(col)) return true
  return (dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col])?.type === 'numeric'
}

function effRole(col: string): string {
  const override = roleOverrides.value[col]
  if (override) return override
  if (isComputedCol(col)) return 'metric'
  const cls = dataStore.getEffectiveClassification(col)
  if (cls?.role) return cls.role
  return dataStore.dataSet?.classifications[col]?.role || 'ignore'
}

const roleIcons: Record<string, string> = {
  metric: '📊', dimension: '📋', time_axis: '📅', label: '🏷️', ignore: '—',
}
function roleIcon(role?: string): string {
  return role ? (roleIcons[role] ?? '') : ''
}

function typeLabel(type?: string): string {
  if (!type) return ''
  const map: Record<string, string> = {
    numeric: t('classification.type.numeric'),
    categorical: t('classification.type.categorical'),
    date: t('classification.type.date'),
    text: t('classification.type.text'),
  }
  return map[type] ?? type
}

function colTypeLabel(col: string): string {
  if (isComputedCol(col)) return t('classification.type.numeric')
  const cls = dataStore.getEffectiveClassification(col) || dataStore.dataSet?.classifications[col]
  return typeLabel(cls?.type)
}

function roleLabel(role?: string): string {
  if (!role) return ''
  const map: Record<string, string> = {
    metric: t('classification.role.metric'),
    dimension: t('classification.role.dimension'),
    time_axis: t('classification.role.time_axis'),
    label: t('classification.role.label'),
    ignore: t('classification.role.ignore'),
  }
  return map[role] ?? role
}

const ROLE_CYCLE = ['metric', 'dimension', 'time_axis', 'label', 'ignore']
function cycleRole(col: string) {
  const current = effRole(col)
  const idx = ROLE_CYCLE.indexOf(current)
  const next = ROLE_CYCLE[(idx + 1) % ROLE_CYCLE.length]
  dataStore.setRoleOverride(col, next)
}

// ====== Card expand/collapse ======
const expandedColCards = ref(new Set<string>())
function toggleColCard(col: string) {
  if (expandedColCards.value.has(col)) {
    expandedColCards.value.delete(col)
  } else {
    expandedColCards.value.clear()
    expandedColCards.value.add(col)
  }
  expandedColCards.value = new Set(expandedColCards.value)
}
function isColCardOpen(col: string): boolean {
  return expandedColCards.value.has(col)
}

// ====== Conditional text rules ======
const expandedColRules = ref(new Set<string>())
function toggleColRules(col: string) {
  if (expandedColRules.value.has(col)) {
    expandedColRules.value.delete(col)
  } else {
    expandedColRules.value.add(col)
  }
  expandedColRules.value = new Set(expandedColRules.value)
}
function ruleCount(col: string): number {
  return configStore.config.table.columnTextRules?.[col]?.length || 0
}

// ====== Format helpers ======
function setColFormatField(col: string, key: string, value: any) {
  const cf = configStore.config.table.columnFormats || {}
  if (!cf[col]) {
    cf[col] = { format: '', unit: 'yuan', prefix: '', decimals: 2 }
  }
  ; (cf[col] as any)[key] = value
  configStore.config.table.columnFormats = { ...cf }
}

// ====== Computed column editor ======
const showComputedColEditor = ref(false)
const editingComputedColIdx = ref(-1)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const computedColForm = reactive({
  name: '',
  variables: [] as { alias: string; column: string; filter?: string }[],
  expression: '',
  filter: '',
  selected: true,
})

function addComputedColVariable() {
  const idx = computedColForm.variables.length
  computedColForm.variables.push({ alias: ALPHABET[idx] || 'V' + idx, column: '' })
}
function insertCCFunc(func: string) { computedColForm.expression += func + '()' }
function insertCCOp(op: string) { computedColForm.expression += ` ${op} ` }

function openComputedColEditor(idx: number) {
  editingComputedColIdx.value = idx
  if (idx >= 0) {
    const cc = configStore.config.table.computedColumns?.[idx]
    if (cc) {
      computedColForm.name = cc.name
      computedColForm.variables = cc.variables ? [...cc.variables] : []
      computedColForm.expression = cc.expression
      computedColForm.filter = (cc as any).filter || ''
      computedColForm.selected = cc.selected !== false
    }
  } else {
    computedColForm.name = ''
    computedColForm.variables = []
    computedColForm.expression = ''
    computedColForm.filter = ''
    computedColForm.selected = true
  }
  showComputedColEditor.value = true
}

function saveComputedCol() {
  const name = computedColForm.name.trim()
  if (!name) return
  const cc = {
    name,
    variables: computedColForm.variables.filter(v => v.column),
    expression: computedColForm.expression,
    filter: computedColForm.filter.trim() || undefined,
    selected: computedColForm.selected,
  }
  if (editingComputedColIdx.value >= 0) {
    const cols = configStore.config.table.computedColumns
    if (cols) cols[editingComputedColIdx.value] = cc
  } else {
    if (!configStore.config.table.computedColumns) {
      configStore.config.table.computedColumns = []
    }
    configStore.config.table.computedColumns.push(cc)
  }
  if (cc.selected && !configStore.config.table.columns.includes(name)) {
    configStore.config.table.columns.push(name)
  } else if (!cc.selected) {
    const ci = configStore.config.table.columns.indexOf(name)
    if (ci !== -1) configStore.config.table.columns.splice(ci, 1)
  }
  showComputedColEditor.value = false
}

function cancelComputedColEdit() { showComputedColEditor.value = false }

function toggleComputedColSelected(ccOrName: { selected?: boolean; name: string } | string) {
  const name = typeof ccOrName === 'string' ? ccOrName : ccOrName.name
  const cc = typeof ccOrName === 'string'
    ? (configStore.config.table.computedColumns || []).find(c => c.name === name)
    : ccOrName
  if (!cc) return
  cc.selected = !cc.selected
  if (cc.selected) {
    if (!configStore.config.table.columns.includes(name)) {
      configStore.config.table.columns.push(name)
    }
  } else {
    const idx = configStore.config.table.columns.indexOf(name)
    if (idx !== -1) configStore.config.table.columns.splice(idx, 1)
  }
}

/** 全选所有列（含计算列恢复选中） */
function selectAllColumns() {
  configStore.config.table.columns = allHeaders.value.slice()
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) {
      c.selected = true
      if (!configStore.config.table.columns.includes(c.name)) {
        configStore.config.table.columns.push(c.name)
      }
    }
  }
}

/** 清空所有列（含计算列取消选中） */
function clearAllColumns() {
  configStore.config.table.columns = []
  const cc = configStore.config.table.computedColumns
  if (cc) {
    for (const c of cc) c.selected = false
  }
}

/** 复制计算列 */
function copyComputedCol(colName: string) {
  const cc = (configStore.config.table.computedColumns || []).find(c => c.name === colName)
  if (!cc) return
  const newName = cc.name + '_copy'
  const newCC = {
    name: newName,
    variables: cc.variables ? [...cc.variables] : [],
    expression: cc.expression,
    filter: (cc as any).filter || undefined,
    selected: true,
  }
  if (!configStore.config.table.computedColumns) {
    configStore.config.table.computedColumns = []
  }
  configStore.config.table.computedColumns.push(newCC)
  if (!configStore.config.table.columns.includes(newName)) {
    configStore.config.table.columns.push(newName)
  }
}

/** 按名称删除计算列 */
function removeComputedColByName(colName: string) {
  const cols = configStore.config.table.computedColumns
  if (!cols) return
  const idx = cols.findIndex(c => c.name === colName)
  if (idx !== -1) configStore.removeComputedCol(idx)
}

// ====== Drag & Drop ======
const dragList = ref<'table' | 'table-computed' | null>(null)
const dragIdx = ref(-1)
const dragPlaceholder = ref(-1)
let dragGhost: HTMLElement | null = null
let dragOffY = 0

function onPointerDown(e: PointerEvent, idx: number, list: 'table' | 'table-computed') {
  const handle = e.currentTarget as HTMLElement
  const item = handle.closest('[data-drag-idx]') as HTMLElement
  if (!item) return
  handle.setPointerCapture(e.pointerId)
  dragList.value = list
  dragIdx.value = idx
  dragOffY = e.clientY - item.getBoundingClientRect().top
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
  dragGhost.style.display = 'none'
  const els = document.elementsFromPoint(e.clientX, e.clientY)
  dragGhost.style.display = ''
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
  const from = dragIdx.value
  const to = dragPlaceholder.value
  const listEl = document.querySelector(`[data-drag-list="table"]`)
  if (listEl) {
    const srcItem = listEl.querySelector(`[data-drag-idx="${from}"]`) as HTMLElement
    if (srcItem) srcItem.style.opacity = ''
  }
  if (dragGhost) { dragGhost.remove(); dragGhost = null }
  dragList.value = null
  dragIdx.value = -1
  dragPlaceholder.value = -1
  if (from >= 0 && to >= 0 && from !== to) {
    configStore.reorderTableColumns(from, to)
  }
}
</script>

<style scoped>
/* ====== Grid ====== */
.col-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.col-grid-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  padding-left: 2px;
}

/* ====== Card ====== */
.col-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.col-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.col-card.is-expanded {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .2);
}

.col-card.role-metric {
  background: var(--role-metric-bg);
}

.col-card.role-dimension {
  background: var(--role-dimension-bg);
}

.col-card.role-time_axis {
  background: var(--role-time-bg);
}

.col-card.role-label {
  background: var(--role-label-bg);
}

.col-card.role-ignore {
  background: var(--role-ignore-bg);
  opacity: 0.6;
}

.col-card.is-computed {
  border-left: 3px solid #f59e0b;
  flex-direction: column;
  padding: 6px 10px;
  gap: 4px;
}

.col-card-row1 {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.col-card-row2 {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
  width: 100%;
}

.col-card-row2 .col-action-btn {
  font-size: 12px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: none;
  opacity: 0.5;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.col-card-row2 .col-action-btn:hover {
  opacity: 1;
  background: var(--bg-hover);
}

.col-card-row2 .col-action-del:hover {
  color: #ef4444;
}

.col-card.drag-placeholder {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .25);
  background: rgba(59, 130, 246, .06);
}

/* ====== Virtual add card ====== */
.col-card-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 2px dashed var(--border);
  background: transparent !important;
  cursor: pointer;
  min-height: 64px;
  width: fit-content;
  min-width: 140px;
  padding: 10px 24px;
  border-radius: 8px;
  transition: all 0.15s;
}

.col-card-add:hover {
  border-color: var(--primary);
  background: rgba(59, 130, 246, .04) !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.col-add-icon {
  font-size: 20px;
  color: var(--text-secondary);
  line-height: 1;
}

.col-add-text {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* ====== Card internals ====== */
.col-card-wrap {
  position: relative;
}

.col-drag {
  cursor: grab;
  color: var(--text-secondary);
  font-size: 12px;
  user-select: none;
  opacity: 0.3;
  flex-shrink: 0;
  padding: 0 2px;
  line-height: 1;
}

.col-drag:hover {
  opacity: 0.7;
}

.col-drag:active {
  cursor: grabbing;
}

.col-icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.col-text {
  flex: 1;
  min-width: 0;
}

.col-name {
  font-weight: 600;
  font-size: 13px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-meta {
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  display: block;
  margin-top: 1px;
}

.col-meta:hover {
  color: var(--primary);
}

.col-vis-cb {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.col-vis-cb input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
  margin: 0;
}

.col-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.col-action-btn:hover {
  opacity: 1;
}

.col-action-del:hover {
  color: #ef4444;
}

.col-expand-icon {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.col-expand-icon.is-edit {
  font-size: 13px;
  opacity: 0.5;
}

.col-card:hover .col-expand-icon {
  opacity: 0.7;
}

.col-card:hover .col-expand-icon.is-edit {
  opacity: 0.9;
}

.col-computed-badge {
  display: inline-flex;
  padding: 1px 5px;
  border-radius: 3px;
  background: #f59e0b;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  margin-left: 4px;
}

.col-icon-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.col-icon-wrap .col-computed-badge {
  margin-left: 0;
  font-size: 8px;
  padding: 0 3px;
  line-height: 1.3;
}

/* ====== Inline settings panel ====== */
.col-settings-inline {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: 340px;
  z-index: 20;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  animation: csp-slide-down 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

@keyframes csp-slide-down {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.csi-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
}

.csi-icon {
  font-size: 15px;
}

.csi-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.csi-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.csi-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.csi-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.csi-body {
  padding: 10px 12px;
}

/* ====== Settings rows ====== */
.col-card-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ccs-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ccs-label {
  width: 48px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.ccs-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ccs-control-inline {
  flex-wrap: wrap;
}

.color-picker-sm {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
}

.ccs-clear {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  border-radius: 3px;
}

.ccs-clear:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, .08);
}

.ccs-select {
  font-size: 12px;
  padding: 4px 24px 4px 8px;
  height: 28px;
  line-height: 28px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: #ffffff !important;
  color: #1a1a1a !important;
  -webkit-text-fill-color: #1a1a1a !important;
  cursor: pointer;
  width: 120px;
  flex-shrink: 0;
}

.ccs-select-sm {
  width: 64px;
  min-width: 64px;
}

.ccs-input-sm {
  font-size: 12px;
  padding: 4px 8px;
  height: 28px;
  line-height: 28px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: #ffffff !important;
  color: #1a1a1a !important;
  -webkit-text-fill-color: #1a1a1a !important;
  width: 64px;
  text-align: center;
  box-sizing: border-box;
  flex-shrink: 0;
}

.ccs-input-sm::placeholder {
  color: #999;
}

.ccs-input-sm::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

/* ====== Conditional rules panel ====== */
.col-card-rules-panel {
  margin-top: 14px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg);
}

.ccrp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s;
  border-bottom: 1px solid var(--border-light);
}

.ccrp-header:hover {
  background: var(--bg-hover);
}

.ccrp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.ccrp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
}

.ccrp-arrow {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ccrp-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ccrp-rule-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ccrp-cond {
  flex: 1;
  min-width: 120px;
}

.ccrp-add-btn {
  font-size: 12px;
  padding: 4px 0;
  text-align: left;
}

/* ====== Table column header ====== */
.table-col-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ====== Row condition colors ====== */
.table-config-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.table-row-cond-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.table-row-cond-wrap>label {
  flex-shrink: 0;
  padding-top: 3px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.row-colors-list {
  display: flex;
  flex-direction: column;
}

.color-rule-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  padding: 2px 4px;
  background: var(--bg);
  border-radius: 5px;
  border: 1px solid var(--border-light);
}

.rule-index {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 14px;
  text-align: center;
  font-family: monospace;
}

.rule-remove {
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.15s;
  font-size: 10px;
}

.rule-remove:hover {
  opacity: 1;
}

.rule-cond-input {
  flex: 1;
  min-width: 140px;
  font-size: 11px;
  height: 24px;
  padding: 2px 6px;
}

.color-picker-mini {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px;
  cursor: pointer;
  flex-shrink: 0;
}

.color-picker-mini.rule-text-color {
  margin-left: 2px;
}

.tct-rule-remove {
  font-size: 10px;
  opacity: 0.4;
}

.tct-rule-remove:hover {
  opacity: 1;
  color: #ef4444;
}

/* ====== Drag ghost ====== */
.drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.85;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  transform: rotate(1deg);
  cursor: grabbing;
}
</style>

<!-- Modal styles (teleported to body, must be unscoped) -->
<style>
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
  width: 620px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
}

.modal-sm {
  width: 440px;
}

.modal-sm .modal-body {
  padding: 16px 20px;
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

/* Formula editor internals */
.cc-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.cc-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-light);
}

.cc-modal-cb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  cursor: pointer;
}

.cc-modal-cb input {
  margin: 0;
}

.formula-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg);
  margin-bottom: 4px;
}

.formula-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.formula-hint {
  font-weight: 400;
  opacity: 0.5;
  font-size: 11px;
}

.formula-var-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.formula-filter {
  flex: 1;
  min-width: 130px;
}

.formula-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.formula-input {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.var-alias {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--primary);
  color: white;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.period-btn {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.15s;
}

.period-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.period-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.func-btn {
  background: #e8f0fe;
  color: #1a73e8;
  border-color: #c4d7f2;
  font-weight: 600;
  font-size: 11px;
  padding: 3px 8px;
}

.filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-input {
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  box-sizing: border-box;
}

.filter-hint {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.sec-desc {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: -4px;
  margin-bottom: 4px;
}

.toggle-sep {
  margin: 0 4px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 2px 4px;
}

.btn-icon:hover {
  color: var(--error);
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 0;
}

.btn-primary {
  padding: 6px 18px;
  border: none;
  border-radius: 6px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
}

.input-sm {
  width: 80px;
  font-size: 12px;
}

.select-sm {
  flex: 1;
}
</style>
