<template>
  <div class="file-uploader" :class="{ dragging }">
    <div class="upload-icon">📁</div>
    <p class="upload-text">拖拽 CSV 或 XLSX 文件到此处</p>
    <p class="upload-sub">或点击按钮选择文件</p>
    <button class="btn-choose" @click="openDialog">选择文件</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useDataStore } from '@/stores/data-store'
import { readFile, readTextFile } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
import { parseFile } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'

const emit = defineEmits<{ loaded: [] }>()
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
  dataStore.loading = true
  dataStore.error = null
  try {
    const fileName = filePath.split('/').pop() || filePath
    const ext = fileName.toLowerCase().split('.').pop()

    let parsed
    if (ext === 'xlsx' || ext === 'xls') {
      const data = await readFile(filePath)
      parsed = parseFile(fileName, data)
    } else {
      const text = await readTextFile(filePath)
      parsed = parseFile(fileName, text)
    }

    const classifications = classifyAllColumns(parsed.headers, parsed.rows)
    const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
    const chartDimensions = selectChartDimensions(parsed.headers, classifications)

    dataStore.dataSet = {
      headers: parsed.headers,
      rows: parsed.rows,
      rawRows: parsed.rawRows,
      classifications,
      primaryMetric,
      chartDimensions,
      filePath,
      fileName,
    }
    emit('loaded')
  } catch (err: any) {
    dataStore.error = err.message || '文件解析失败'
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
