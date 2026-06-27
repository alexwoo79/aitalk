<template>
  <div class="import-card" :class="{ 'has-tables': tables.length > 0 }">
    <div class="import-icon">🗄️</div>
    <p class="import-text">{{ t('upload.dbTitle') }}</p>
    <p class="import-sub">{{ selectedFile ? selectedFileName : t('upload.dbSelectFile') }}</p>

    <button class="btn btn-sm card-btn" @click="selectFile" :disabled="loading">
      {{ selectedFile ? t('common.edit') + '...' : t('upload.selectFile') }}
    </button>

    <div v-if="tables.length > 0" class="tables-section">
      <div class="tables-header">{{ t('upload.dbTables') }}</div>
      <div class="tables-list">
        <label
          v-for="table in tables"
          :key="table.name"
          class="table-row"
          :class="{ selected: selectedTables.includes(table.name) }"
        >
          <input
            type="checkbox"
            :value="table.name"
            v-model="selectedTables"
            @change="onTableToggle"
          />
          <span class="table-name">{{ table.name }}</span>
          <span class="table-meta">{{ table.row_count }} {{ t('common.rows') }} · {{ table.column_count }} {{ t('common.columns') }}</span>
        </label>
      </div>
      <div class="tables-actions">
        <button class="btn btn-sm" @click="selectAllTables">{{ t('common.selectAll') }}</button>
        <button class="btn btn-sm" @click="selectedTables = []">{{ t('common.clearAll') }}</button>
      </div>
      <div class="card-actions" v-if="selectedTables.length > 0">
        <button class="btn btn-primary" @click="importSelected" :disabled="loading">
          {{ loading ? t('upload.parsing') : t('upload.dbExecute') }}
        </button>
      </div>
    </div>

    <!-- Custom SQL -->
    <div class="sql-section" v-if="selectedFile">
      <div class="sql-header" @click="showSql = !showSql">
        <span>{{ t('upload.dbCustomSql') }}</span>
        <span class="sql-arrow">{{ showSql ? '▲' : '▼' }}</span>
      </div>
      <div v-if="showSql" class="sql-body">
        <textarea
          v-model="customSql"
          class="sql-textarea"
          :placeholder="t('upload.dbSqlPlaceholder')"
          rows="3"
        ></textarea>
        <button
          class="btn btn-sm btn-primary"
          @click="executeSql"
          :disabled="loading || !customSql.trim()"
        >
          {{ loading ? t('upload.parsing') : t('upload.dbExecute') }}
        </button>
      </div>
    </div>

    <div v-if="error" class="card-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import {
  listSqliteTables,
  loadSqliteTable,
  executeSqliteQuery,
  type SqliteTableInfo,
} from '@/composables/use-rust-bridge'
import { isTauri } from '@/composables/use-rust-bridge'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

const selectedFile = ref('')
const selectedFileName = computed(() => {
  if (!selectedFile.value) return ''
  return selectedFile.value.replace(/^.*[/\\]/, '')
})
const tables = ref<SqliteTableInfo[]>([])
const selectedTables = ref<string[]>([])
const customSql = ref('')
const showSql = ref(false)
const loading = ref(false)
const error = ref('')

async function selectFile() {
  if (!isTauri()) {
    error.value = 'SQLite 导入仅在桌面应用中可用'
    return
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      multiple: false,
    })
    if (result) {
      selectedFile.value = result as string
      tables.value = []
      selectedTables.value = []
      showSql.value = true
      error.value = ''
      await loadTables()
    }
  } catch (e: any) {
    error.value = e?.message ?? '选择文件失败'
  }
}

async function loadTables() {
  if (!selectedFile.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await listSqliteTables(selectedFile.value)
    if (result.ok && result.data) {
      tables.value = result.data
    } else {
      error.value = result.error ?? '读取数据库表失败'
    }
  } catch (e: any) {
    error.value = e?.message ?? '读取数据库表失败'
  } finally {
    loading.value = false
  }
}

function selectAllTables() {
  selectedTables.value = tables.value.map(t => t.name)
}

function onTableToggle() {
  // Clear custom SQL when selecting tables
  customSql.value = ''
}

async function importSelected() {
  if (!selectedFile.value || selectedTables.value.length === 0) return
  loading.value = true
  error.value = ''

  try {
    for (const tableName of selectedTables.value) {
      const result = await loadSqliteTable(selectedFile.value, tableName)
      if (result.ok && result.data) {
        dataStore.loadFromPayload(result.data, tableName)
        configStore.generateAutoConfig()
      } else {
        error.value = result.error ?? '导入表失败'
        break
      }
    }
  } catch (e: any) {
    error.value = e?.message ?? '导入表失败'
  } finally {
    loading.value = false
  }
}

async function executeSql() {
  if (!selectedFile.value || !customSql.value.trim()) return
  loading.value = true
  error.value = ''

  try {
    const result = await executeSqliteQuery(selectedFile.value, customSql.value.trim())
    if (result.ok && result.data) {
      dataStore.loadFromPayload(result.data, 'SQL查询')
      configStore.generateAutoConfig()
      customSql.value = ''
    } else {
      error.value = result.error ?? 'SQL 执行失败'
    }
  } catch (e: any) {
    error.value = e?.message ?? 'SQL 执行失败'
  } finally {
    loading.value = false
  }
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.card-btn {
  margin-top: 2px;
}
.tables-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tables-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.tables-list {
  max-height: 200px;
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
.table-name {
  font-weight: 500;
  flex-shrink: 0;
}
.table-meta {
  color: var(--text-secondary);
  font-size: 11px;
  margin-left: auto;
}
.tables-actions {
  display: flex;
  gap: 6px;
}
.card-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
}
.sql-section {
  width: 100%;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.sql-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px 0;
  user-select: none;
}
.sql-header:hover {
  color: var(--text-primary);
}
.sql-arrow {
  font-size: 10px;
  opacity: 0.6;
}
.sql-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.sql-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
  background: var(--bg-primary);
  color: var(--text-primary);
  margin-bottom: 8px;
  box-sizing: border-box;
}
.sql-textarea:focus {
  outline: none;
  border-color: var(--primary);
}
.card-error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
}
</style>
