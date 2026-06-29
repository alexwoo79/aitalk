<template>
  <div class="import-card">
    <div class="import-icon">🌐</div>
    <p class="import-text">{{ t('upload.urlTitle') }}</p>
    <p class="import-sub">{{ t('upload.urlLocalHint') }}</p>

    <div class="card-input-row">
      <input v-model="url" type="text" class="card-input" :placeholder="t('upload.urlPlaceholder')"
        @keyup.enter="doFetch" />
      <select v-model="format" class="card-select">
        <option value="auto">{{ t('upload.urlAutoDetect') }}</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </div>

    <div class="card-btn-row">
      <button class="btn btn-sm btn-primary" @click="doFetch" :disabled="loading || !url.trim()">
        {{ loading ? t('upload.urlFetching') : t('upload.urlFetch') }}
      </button>
      <button v-if="loading" class="btn btn-sm btn-stop" @click="cancel">{{ t('common.stop') }}</button>
    </div>

    <div v-if="error" class="card-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { fetchFromUrl } from '@/composables/use-rust-bridge'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

const url = ref('')
const format = ref<'csv' | 'json' | 'auto'>('auto')
const loading = ref(false)

// localStorage 暂存
onMounted(() => {
  url.value = localStorage.getItem('sb_url_import') || ''
  const fmt = localStorage.getItem('sb_url_format')
  if (fmt === 'csv' || fmt === 'json' || fmt === 'auto') format.value = fmt
})
watch(url, (v) => { localStorage.setItem('sb_url_import', v) })
watch(format, (v) => { localStorage.setItem('sb_url_format', v) })
const cancelled = ref(false)
const statusText = ref('')
const error = ref('')
const success = ref(false)

const statusClass = computed(() => ({
  'status-loading': loading.value,
  'status-success': success.value,
  'status-error': !!error.value,
}))

/** 剥离不可见的 Unicode 控制字符（Windows 复制路径时自动附加） */
function stripInvisible(s: string): string {
  return s.replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\uFEFF\u00AD]/g, '')
}

/** 将 Rust 后端的英文错误消息翻译为当前语言 */
function translateRustError(msg: string): string {
  // 文件不存在
  if (/^File not found:/i.test(msg)) {
    const path = msg.replace(/^File not found: /i, '')
    return t('upload.fileNotFound') + path
  }
  // 数据库文件不存在
  if (/^Database file not found:/i.test(msg)) {
    const path = msg.replace(/^Database file not found: /i, '')
    return t('upload.dbFileNotFound') + path
  }
  return msg
}

async function doFetch() {
  const trimmed = stripInvisible(url.value.trim())
  if (!trimmed) return

  loading.value = true
  cancelled.value = false
  statusText.value = t('upload.urlFetching')
  error.value = ''
  success.value = false

  try {
    const result = await fetchFromUrl(trimmed, format.value, true)
    if (cancelled.value) return
    if (result.ok && result.data) {
      dataStore.loadFromPayload(result.data, url.value.trim())
      configStore.generateAutoConfig()
      success.value = true
      statusText.value = t('upload.urlSuccess')
      url.value = ''
    } else {
      // UNC 网络路径错误时附加本地化提示
      const errMsg = translateRustError(result.error ?? '')
      const isUncError = /^(File not found|文件不存在): \\\\./m.test(errMsg)
      error.value = isUncError
        ? errMsg + '\n' + t('upload.uncPathHint')
        : errMsg || t('upload.urlError')
      statusText.value = ''
    }
  } catch (e: any) {
    if (cancelled.value) return

    // Detect local file path (not supported in browser)
    // 先剥离不可见字符再检测，避免 Windows 复制路径时附带的 Unicode 控制字符干扰
    const stripped = stripInvisible(trimmed)
    const isLocal = /^(file:\/\/|\/|[A-Za-z]:[\\/]|~\/|\\\\|\\\\\\\\|\/\/)/.test(stripped)
    if (isLocal) {
      error.value = t('upload.urlLocalNotSupported') ?? '浏览器模式不支持本地/网络路径，请在桌面应用中使用或使用文件上传功能'
      statusText.value = ''
      loading.value = false
      return
    }

    // Browser fallback: try fetch + parse locally
    try {
      const resp = await fetch(trimmed)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const contentType = resp.headers.get('content-type') ?? ''
      const text = await resp.text()

      if (format.value === 'json' || contentType.includes('json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
        const json = JSON.parse(text)
        const rows = Array.isArray(json) ? json : (json.data ?? json.rows ?? [json])
        if (rows.length > 0) {
          const headers = Object.keys(rows[0])
          const csvText = [headers.join(','), ...rows.map((r: any) => headers.map((h: string) => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
          dataStore.loadFileContent(url.value.trim(), csvText)
          configStore.generateAutoConfig()
          success.value = true
          statusText.value = t('upload.urlSuccess')
          url.value = ''
          loading.value = false
          return
        }
      }

      // Treat as CSV
      dataStore.loadFileContent(url.value.trim(), text)
      configStore.generateAutoConfig()
      success.value = true
      statusText.value = t('upload.urlSuccess')
      url.value = ''
    } catch (e2: any) {
      error.value = e2.message ?? t('upload.urlError')
      statusText.value = ''
    }
  } finally {
    loading.value = false
  }
}

function cancel() {
  cancelled.value = true
  loading.value = false
  statusText.value = ''
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
  min-height: 130px;
  gap: 12px;
}

.import-card:hover {
  border-color: var(--primary);
  background: var(--primary-light);
}

.import-icon {
  font-size: 36px;
  margin-bottom: 2px;
  opacity: 0.9;
}

.import-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
}

.import-sub {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  max-width: 400px;
  line-height: 1.5;
  margin: 0;
}

.card-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 500px;
}

.card-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.card-input:focus {
  outline: none;
  border-color: var(--primary);
}

.card-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.card-btn {
  margin-top: 2px;
}

.card-btn-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-stop {
  background: var(--bg-primary);
  color: #e74c3c;
  border: 1px solid #e74c3c;
}

.btn-stop:hover {
  background: #fef2f2;
}

.card-status {
  font-size: 13px;
}

.status-loading {
  color: var(--text-secondary);
}

.status-success {
  color: #27ae60;
}

.status-error {
  color: #e74c3c;
}

.card-error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
</style>
