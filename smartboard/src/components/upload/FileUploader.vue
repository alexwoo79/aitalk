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
  // 仅在 Tauri 环境下注册（浏览器环境会抛出异常）
  try {
    if (!('__TAURI_INTERNALS__' in window)) return
  } catch { return }

  try {
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
      // 支持多文件拖放
      for (const filePath of paths) {
        await dataStore.loadFile(filePath)
      }
      if (!dataStore.error) emit('loaded')
    })
  } catch {
    // 非 Tauri 环境（浏览器），使用 HTML5 drag-drop
  }
})

onUnmounted(() => {
  unlistenEnter?.()
  unlistenOver?.()
  unlistenLeave?.()
  unlistenDrop?.()
})

async function openDialog() {
  const count = await dataStore.loadFromDialog()
  if (count > 0) emit('loaded')
}

// HTML5 drag-and-drop (for browser fallback)
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
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  // 支持多文件拖放
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const text = await file.text()
    await dataStore.loadFileContent(file.name, text)
  }
  if (!dataStore.error) emit('loaded')
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
