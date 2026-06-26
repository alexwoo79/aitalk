<template>
  <div class="file-uploader" :class="{ dragging }"
    @drop.prevent="onHtmlDrop"
    @dragover.prevent="onHtmlDragOver"
    @dragleave="onHtmlDragLeave">
    <div class="upload-icon">📁</div>
    <p class="upload-text">{{ t('upload.dropHint') }}</p>
    <p class="upload-sub">{{ t('upload.clickHint') }}</p>
    <button class="btn-choose" @click="openDialog">{{ t('upload.selectFile') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useDataStore } from '@/stores/data-store'
import { parseFile } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'
import { parseNumeric } from '@/core/numeric'

const emit = defineEmits<{ loaded: [] }>()
const { t } = useI18n()
const dataStore = useDataStore()
const dragging = ref(false)

let unlistenEnter: UnlistenFn | null = null
let unlistenOver: UnlistenFn | null = null
let unlistenLeave: UnlistenFn | null = null
let unlistenDrop: UnlistenFn | null = null

onMounted(async () => {
  // Tauri 2 drag-drop events — provide file paths from OS
  unlistenEnter = await listen<{ paths: string[] }>('tauri://drag-enter', () => {
    dragging.value = true
  })
  unlistenOver = await listen<{ paths: string[] }>('tauri://drag-over', () => {
    dragging.value = true
  })
  unlistenLeave = await listen<{ paths: string[] }>('tauri://drag-leave', () => {
    dragging.value = false
  })
  unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
    dragging.value = false
    const paths = event.payload.paths
    if (paths.length === 0) return
    await loadFilePath(paths[0])
  })
})

onUnmounted(() => {
  unlistenEnter?.()
  unlistenOver?.()
  unlistenLeave?.()
  unlistenDrop?.()
})

async function openDialog() {
  const success = await dataStore.loadFromDialog()
  if (success) emit('loaded')
}

async function loadFilePath(filePath: string) {
  // 复用 dataStore.loadFile 完整流程（含数据质量检测）
  await dataStore.loadFile(filePath)
  if (!dataStore.error) emit('loaded')
}

// HTML5 drag-and-drop (for OS file drops into the webview)
function onHtmlDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types || []
  if (types.includes('Files')) {
    dragging.value = true
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
}

function onHtmlDragLeave() {
  dragging.value = false
}

async function onHtmlDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return

  dataStore.loading = true
  dataStore.error = null
  try {
    const text = await file.text()
    const parsed = parseFile(file.name, text)
    const classifications = classifyAllColumns(parsed.headers, parsed.rows)
    const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
    const chartDimensions = selectChartDimensions(parsed.headers, classifications)

    // 构建数据质量摘要
    const dirtyColumns: { column: string; dirtyCount: number; totalCount: number; samples: string[] }[] = []
    for (const col of parsed.headers) {
      const cls = classifications[col]
      if (!cls || cls.type !== 'numeric' || !cls.dirtyCount || cls.dirtyCount === 0) continue
      const samples: string[] = []
      let dirtyTotal = 0
      for (const row of parsed.rows) {
        const v = row[col]
        if (v === undefined || v === null || v === '') continue
        const { clean, value } = parseNumeric(v)
        if (!isNaN(value) && !clean) {
          dirtyTotal++
          if (samples.length < 3) samples.push(typeof v === 'number' ? String(v) : String(v))
        }
      }
      if (dirtyTotal > 0) dirtyColumns.push({ column: col, dirtyCount: dirtyTotal, totalCount: parsed.rows.length, samples })
    }

    dataStore.dataSet = {
      headers: parsed.headers,
      rows: parsed.rows,
      rawRows: parsed.rawRows,
      classifications,
      primaryMetric,
      chartDimensions,
      filePath: file.name,
      fileName: file.name,
      dataQuality: { dirtyColumns, hasIssues: dirtyColumns.length > 0 },
    }
    emit('loaded')
  } catch (err: any) {
    dataStore.error = err.message || t('upload.parseError')
  } finally {
    dataStore.loading = false
  }
}
</script>

<style scoped>
.file-uploader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-surface);
  transition: all 0.3s ease;
  cursor: pointer;
}

.file-uploader:hover,
.file-uploader.dragging {
  border-color: var(--primary);
  background: var(--primary-light);
}

.upload-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.upload-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.upload-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.btn-choose {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-choose:hover {
  opacity: 0.9;
}
</style>
