<template>
  <div class="import-card" :class="{ 'has-tables': tables.length > 0 }">
    <div class="import-icon">📊</div>
    <p class="import-text">{{ t('upload.feishuTitle') }}</p>
    <p class="import-sub">{{ t('upload.feishuSubtitle') }}</p>

    <div class="feishu-form">
      <input
        v-model="appId"
        type="text"
        class="card-input"
        :placeholder="t('upload.feishuAppId')"
      />
      <input
        v-model="appSecret"
        type="password"
        class="card-input"
        :placeholder="t('upload.feishuAppSecret')"
      />
      <input
        v-model="baseUrl"
        type="text"
        class="card-input"
        :placeholder="t('upload.feishuBaseUrl')"
        @keyup.enter="doTest"
      />
    </div>

    <div class="card-btn-row">
      <button class="btn btn-sm btn-primary" @click="doTest" :disabled="loading || !appId || !appSecret || !baseUrl">
        {{ loading ? t('upload.feishuTesting') : t('upload.feishuTest') }}
      </button>
      <button v-if="loading" class="btn btn-sm btn-stop" @click="cancel">{{ t('common.stop') }}</button>
    </div>

    <!-- 表格列表 -->
    <div v-if="tables.length > 0" class="tables-section">
      <div class="tables-header">{{ t('upload.feishuTables') }}</div>
      <div class="tables-list">
        <label
          v-for="table in tables"
          :key="table.table_id"
          class="table-row"
          :class="{ selected: selectedTable === table.table_id }"
        >
          <input
            type="radio"
            :value="table.table_id"
            v-model="selectedTable"
          />
          <span class="table-name">{{ table.name }}</span>
          <span class="table-meta">{{ table.fields.length }} {{ t('common.columns') }}</span>
        </label>
      </div>
      <div class="card-actions" v-if="selectedTable">
        <button class="btn btn-primary" @click="doImport" :disabled="loading">
          {{ loading ? t('upload.parsing') : t('upload.feishuImport') }}
        </button>
        <button v-if="loading" class="btn btn-sm btn-stop" @click="cancel">{{ t('common.stop') }}</button>
      </div>
    </div>

    <div v-if="error" class="card-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import {
  testFeishuConnection,
  loadFeishuTable,
  type FeishuTableInfo,
} from '@/composables/use-rust-bridge'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

const appId = ref('')
const appSecret = ref('')
const baseUrl = ref('')
const tables = ref<FeishuTableInfo[]>([])
const selectedTable = ref('')
const loading = ref(false)

// localStorage 暂存
onMounted(() => {
  appId.value = localStorage.getItem('sb_feishu_app_id') || ''
  appSecret.value = localStorage.getItem('sb_feishu_app_secret') || ''
  baseUrl.value = localStorage.getItem('sb_feishu_base_url') || ''
})
watch(appId, (v) => { localStorage.setItem('sb_feishu_app_id', v) })
watch(appSecret, (v) => { localStorage.setItem('sb_feishu_app_secret', v) })
watch(baseUrl, (v) => { localStorage.setItem('sb_feishu_base_url', v) })
const cancelled = ref(false)
const statusText = ref('')
const error = ref('')
const success = ref(false)

const statusClass = computed(() => ({
  'status-loading': loading.value,
  'status-success': success.value,
  'status-error': !!error.value,
}))

async function doTest() {
  loading.value = true
  cancelled.value = false
  statusText.value = t('upload.feishuTesting')
  error.value = ''
  success.value = false
  tables.value = []

  try {
    const result = await testFeishuConnection(appId.value, appSecret.value, baseUrl.value)
    if (cancelled.value) return
    if (result.ok && result.data) {
      tables.value = result.data.tables
      statusText.value = result.data.message
      success.value = result.data.ok
      if (tables.value.length === 1) {
        selectedTable.value = tables.value[0].table_id
      }
    } else {
      error.value = result.error ?? t('upload.feishuError')
      statusText.value = ''
    }
  } catch (e: any) {
    error.value = e?.message ?? t('upload.feishuError')
    statusText.value = ''
  } finally {
    loading.value = false
  }
}

async function doImport() {
  if (!selectedTable.value) return
  loading.value = true
  cancelled.value = false
  error.value = ''

  const table = tables.value.find(t => t.table_id === selectedTable.value)
  try {
    const result = await loadFeishuTable(
      appId.value, appSecret.value, baseUrl.value,
      selectedTable.value, table?.name,
    )
    if (cancelled.value) return
    if (result.ok && result.data) {
      dataStore.loadFromPayload(result.data, table?.name ?? '飞书表格')
      configStore.generateAutoConfig()
      statusText.value = '✅ ' + t('upload.feishuSuccess')
      success.value = true
    } else {
      error.value = result.error ?? t('upload.feishuError')
    }
  } catch (e: any) {
    error.value = e?.message ?? t('upload.feishuError')
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
  gap: 10px;
}
.import-card:hover {
  border-color: var(--primary);
  background: var(--primary-light);
}
.import-card.has-tables {
  align-items: stretch;
  justify-content: flex-start;
  padding: 20px 24px;
  gap: 12px;
}
.import-icon {
  font-size: 36px;
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
  margin: 0;
}
.feishu-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 460px;
}
.card-input {
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
.card-btn {
  margin-top: 2px;
}
.card-btn-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.card-status {
  font-size: 13px;
}
.status-loading { color: var(--text-secondary); }
.status-success { color: #27ae60; }
.status-error { color: #e74c3c; }
.tables-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.tables-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.tables-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
}
.table-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.table-row:last-child { border-bottom: none; }
.table-row.selected { background: var(--highlight-bg, #e8f4fd); }
.table-row:hover { background: var(--bg-secondary); }
.table-name { font-weight: 500; flex-shrink: 0; }
.table-meta {
  color: var(--text-secondary);
  font-size: 11px;
  margin-left: auto;
}
.card-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
}
.card-error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
.btn-stop {
  background: var(--bg-primary);
  color: #e74c3c;
  border: 1px solid #e74c3c;
}
.btn-stop:hover { background: #fef2f2; }
</style>
