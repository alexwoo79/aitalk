<template>
  <div
    class="import-card"
    :class="{ focused: isFocused, 'has-data': previewRows.length > 0 }"
    tabindex="0"
    @focus="isFocused = true"
    @blur="isFocused = false"
    @paste="onPaste"
  >
    <template v-if="previewRows.length === 0">
      <div class="import-icon">📋</div>
      <p class="import-text">{{ t('upload.pasteTitle') }}</p>
      <p class="import-sub">{{ t('upload.pasteHint') }}</p>
    </template>
    <template v-else>
      <div class="preview-header">{{ t('upload.pastePreview') }} ({{ rowCount }} {{ t('common.rows') }} × {{ colCount }} {{ t('common.columns') }})</div>
      <div class="preview-table-wrapper">
        <table class="preview-table">
          <thead>
            <tr>
              <th v-for="(label, i) in displayHeaders" :key="i">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in displayRows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-controls">
        <label class="checkbox-label">
          <input type="checkbox" v-model="hasHeader" />
          {{ t('upload.pasteFirstRowHeader') }}
        </label>
        <div class="card-actions">
          <button class="btn btn-sm" @click="clearPaste">{{ t('common.clearAll') }}</button>
          <button class="btn btn-sm btn-primary" @click="doImport" :disabled="loading">
            {{ loading ? t('upload.parsing') : t('upload.pasteRecognize') }}
          </button>
        </div>
      </div>
    </template>
    <div v-if="error" class="card-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { pasteFromClipboard } from '@/composables/use-rust-bridge'
import { parseFile } from '@/core/parser'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

const isFocused = ref(false)
const hasHeader = ref(true)
const loading = ref(false)
const error = ref('')
const rawText = ref('')
const previewRows = ref<string[][]>([])

const headers = computed(() => {
  if (previewRows.value.length === 0) return []
  return previewRows.value[0]
})

const displayHeaders = computed(() => {
  if (hasHeader.value) return headers.value
  if (previewRows.value.length === 0) return []
  return previewRows.value[0].map((_, i) => `${t('common.columns')} ${i + 1}`)
})

const displayRows = computed(() => {
  const rows = previewRows.value
  if (rows.length === 0) return []
  return hasHeader.value ? rows.slice(1, 6) : rows.slice(0, 5)
})

const rowCount = computed(() => {
  const total = previewRows.value.length
  return hasHeader.value ? total - 1 : total
})

const colCount = computed(() => {
  if (previewRows.value.length === 0) return 0
  return previewRows.value[0]?.length ?? 0
})

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (!text.trim()) return
  rawText.value = text

  // Parse TSV locally for preview
  const lines = text.trim().split(/\r?\n/)
  const rows = lines.map(line => line.split('\t'))
  if (rows.length === 0 || rows[0].length === 0) {
    error.value = t('upload.pasteHint')
    return
  }
  previewRows.value = rows
  error.value = ''
}

async function doImport() {
  if (!rawText.value.trim()) return
  loading.value = true
  error.value = ''

  try {
    const result = await pasteFromClipboard(rawText.value, hasHeader.value)
    if (result.ok && result.data) {
      dataStore.loadFromPayload(result.data, `粘贴数据_${new Date().toLocaleTimeString()}`)
      configStore.generateAutoConfig()
      clearPaste()
    } else {
      error.value = result.error ?? t('upload.parseError')
    }
  } catch (e: any) {
    // Fallback: parse locally using parser.ts
    try {
      const parsed = parseFile('paste.tsv', rawText.value)
      dataStore.loadFileContent('粘贴数据', rawText.value)
      configStore.generateAutoConfig()
      clearPaste()
    } catch (e2: any) {
      error.value = e2.message ?? t('upload.parseError')
    }
  } finally {
    loading.value = false
  }
}

function clearPaste() {
  rawText.value = ''
  previewRows.value = []
  error.value = ''
}
</script>

<style scoped>
.import-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
  transition: all 0.3s ease;
  cursor: text;
  min-height: 130px;
  overflow: hidden;
}
.import-card:hover,
.import-card.focused {
  border-color: var(--primary);
  background: var(--primary-light);
}
.import-card.has-data {
  align-items: stretch;
  justify-content: flex-start;
  cursor: default;
  padding: 20px 24px;
  gap: 10px;
}
.import-icon {
  font-size: 36px;
  margin-bottom: 10px;
  opacity: 0.9;
}
.import-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.import-sub {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  max-width: 360px;
  line-height: 1.5;
}
.preview-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}
.preview-table-wrapper {
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.preview-table {
  border-collapse: collapse;
  white-space: nowrap;
  min-width: 100%;
}
.preview-table th,
.preview-table td {
  border: 1px solid var(--border);
  padding: 4px 10px;
  text-align: left;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-table th {
  background: var(--bg-tertiary);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
.card-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.card-error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
</style>
