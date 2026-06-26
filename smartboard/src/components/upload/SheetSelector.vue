<template>
  <Teleport to="body">
    <div v-if="visible" class="sheet-overlay" @click.self="$emit('cancel')">
      <div class="sheet-dialog">
        <div class="sheet-dialog-header">
          <h3>{{ t('upload.selectSheets') }}</h3>
          <button class="btn-icon" @click="$emit('cancel')">✕</button>
        </div>
        <p class="sheet-dialog-sub">{{ t('upload.selectSheetsHint', { name: fileName }) }}</p>

        <div class="sheet-list">
          <label
            v-for="info in sheets"
            :key="info.index"
            class="sheet-row"
            :class="{ selected: selected.has(info.index) }"
          >
            <input
              type="checkbox"
              :checked="selected.has(info.index)"
              @change="toggle(info.index)"
            />
            <span class="sheet-name">{{ info.name }}</span>
            <span class="sheet-meta">{{ info.rows }}{{ t('common.rows') }} × {{ info.cols }}{{ t('common.columns') }}</span>
          </label>
        </div>

        <div class="sheet-dialog-footer">
          <button class="btn-link" @click="selectAll">{{ t('common.selectAll') }}</button>
          <button class="btn-link" @click="deselectAll">{{ t('common.clearAll') }}</button>
          <div class="footer-spacer"></div>
          <button class="btn" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary" :disabled="selected.size === 0" @click="confirm">
            {{ t('common.confirm') }} ({{ selected.size }})
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SheetInfo } from '@/types/data'

const { t } = useI18n()

defineProps<{
  visible: boolean
  fileName: string
  sheets: SheetInfo[]
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [indices: number[]]
}>()

const selected = ref(new Set<number>())

function toggle(index: number) {
  const s = new Set(selected.value)
  if (s.has(index)) s.delete(index)
  else s.add(index)
  selected.value = s
}

function selectAll() {
  selected.value = new Set(sheets.map(s => s.index))
}

function deselectAll() {
  selected.value = new Set()
}

function confirm() {
  emit('confirm', [...selected.value])
  selected.value = new Set()
}
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.sheet-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sheet-dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.sheet-dialog-sub {
  margin: 0;
  padding: 10px 20px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.sheet-list {
  padding: 12px 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sheet-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s;
}

.sheet-row:hover {
  background: var(--bg-hover);
}

.sheet-row.selected {
  background: var(--primary-light);
}

.sheet-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
  flex-shrink: 0;
}

.sheet-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-meta {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.sheet-dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.footer-spacer {
  flex: 1;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
}

.btn-icon:hover {
  background: var(--bg-hover);
}
</style>
