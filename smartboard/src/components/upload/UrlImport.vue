<template>
  <div class="import-card">
    <div class="import-icon">🌐</div>
    <p class="import-text">{{ t('upload.urlTitle') }}</p>
    <p class="import-sub">{{ t('upload.urlPlaceholder') }}</p>

    <div class="card-input-row">
      <input
        v-model="url"
        type="text"
        class="card-input"
        :placeholder="t('upload.urlPlaceholder')"
        @keyup.enter="doFetch"
      />
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
import { ref, computed } from 'vue'
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
const cancelled = ref(false)
const statusText = ref('')
const error = ref('')
const success = ref(false)

const statusClass = computed(() => ({
  'status-loading': loading.value,
  'status-success': success.value,
  'status-error': !!error.value,
}))

async function doFetch() {
  const trimmed = url.value.trim()
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
      error.value = result.error ?? t('upload.urlError')
      statusText.value = ''
    }
  } catch (e: any) {
    if (cancelled.value) return
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
.btn-stop:hover { background: #fef2f2; }
.card-status {
  font-size: 13px;
}
.status-loading { color: var(--text-secondary); }
.status-success { color: #27ae60; }
.status-error { color: #e74c3c; }
.card-error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
</style>
