<template>
  <div class="import-card" :class="{ 'has-tables': tables.length > 0 }">
    <div class="import-icon">🗄️</div>
    <p class="import-text">{{ t('upload.dbTitle') }}</p>
    <div class="db-mode-toggle">
      <button class="mode-btn" :class="{ active: dbMode === 'sqlite' }" @click="dbMode = 'sqlite'">SQLite {{ t('upload.dbFile') }}</button>
      <button class="mode-btn" :class="{ active: dbMode === 'remote' }" @click="dbMode = 'remote'">MySQL / PG</button>
    </div>
    <template v-if="dbMode === 'sqlite'">
      <button class="btn btn-sm card-btn" @click="selectFile" :disabled="loading">{{ selectedFile ? t('common.edit') + '...' : t('upload.selectFile') }}</button>
    </template>
    <template v-if="dbMode === 'remote'">
      <input v-model="connString" type="text" class="card-input" :placeholder="t('upload.dbConnPlaceholder')" @keyup.enter="testConnection" />
      <div class="card-btn-row">
        <button class="btn btn-sm card-btn" @click="testConnection" :disabled="loading || !connString">{{ loading ? t('upload.feishuTesting') : t('upload.dbTestConn') }}</button>
        <button v-if="loading" class="btn btn-sm btn-stop" @click="cancel">{{ t('common.stop') }}</button>
      </div>
    </template>
    <div v-if="tables.length > 0" class="tables-section">
      <div class="tables-header">{{ t('upload.dbTables') }}</div>
      <div class="tables-list">
        <label v-for="table in tables" :key="table.name" class="table-row" :class="{ selected: selectedTables.includes(table.name) }">
          <input type="checkbox" :value="table.name" v-model="selectedTables" />
          <span class="table-name">{{ table.name }}</span>
          <span v-if="isSqlite && (table as any).row_count !== undefined" class="table-meta">{{ (table as any).row_count }} {{ t('common.rows') }}</span>
        </label>
      </div>
      <div class="tables-actions">
        <button class="btn btn-sm" @click="selectAllTables">{{ t('common.selectAll') }}</button>
        <button class="btn btn-sm" @click="selectedTables = []">{{ t('common.clearAll') }}</button>
      </div>
      <div class="card-actions" v-if="selectedTables.length > 0">
        <button class="btn btn-primary" @click="importSelected" :disabled="loading">{{ loading ? t('upload.parsing') : t('upload.dbExecute') }}</button>
        <button v-if="loading" class="btn btn-sm btn-stop" @click="cancel">{{ t('common.stop') }}</button>
      </div>
    </div>
    <div class="sql-section" v-if="(isSqlite && selectedFile) || (!isSqlite && connString)">
      <div class="sql-header" @click="showSql = !showSql"><span>{{ t('upload.dbCustomSql') }}</span><span class="sql-arrow">{{ showSql ? '▲' : '▼' }}</span></div>
      <div v-if="showSql" class="sql-body">
        <textarea v-model="customSql" class="sql-textarea" :placeholder="t('upload.dbSqlPlaceholder')" rows="3"></textarea>
        <button class="btn btn-sm btn-primary" @click="executeSql" :disabled="loading || !customSql.trim()">{{ loading ? t('upload.parsing') : t('upload.dbExecute') }}</button>
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
import { listSqliteTables, loadSqliteTable, executeSqliteQuery, type SqliteTableInfo, testDbConnection, loadDbTable, executeDbQuery } from '@/composables/use-rust-bridge'
import { isTauri } from '@/composables/use-rust-bridge'

const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

const dbMode = ref<'sqlite' | 'remote'>('sqlite')
const isSqlite = computed(() => dbMode.value === 'sqlite')
const selectedFile = ref('')
const selectedFileName = computed(() => selectedFile.value ? selectedFile.value.replace(/^.*[/\\]/, '') : '')
const connString = ref('')

// localStorage 暂存
onMounted(() => {
  connString.value = localStorage.getItem('sb_db_conn_string') || ''
})
watch(connString, (v) => { localStorage.setItem('sb_db_conn_string', v) })

interface TableItem { name: string; row_count?: number; column_count?: number }
const tables = ref<TableItem[]>([])
const selectedTables = ref<string[]>([])
const customSql = ref('')
const showSql = ref(false)
const loading = ref(false)
const cancelled = ref(false)
const statusText = ref('')
const error = ref('')
const success = ref(false)
const statusClass = computed(() => ({ 'status-loading': loading.value, 'status-success': success.value, 'status-error': !!error.value }))

async function selectFile() {
  if (!isTauri()) { error.value = '仅桌面应用支持'; return }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({ filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }], multiple: false })
    if (result) { selectedFile.value = result as string; tables.value = []; selectedTables.value = []; error.value = ''; await loadSqliteTableList() }
  } catch (e: any) { error.value = e?.message ?? '选择文件失败' }
}
async function loadSqliteTableList() {
  loading.value = true; error.value = ''
  try {
    const result = await listSqliteTables(selectedFile.value)
    if (result.ok && result.data) { tables.value = result.data.map(t => ({ name: t.name, row_count: t.row_count, column_count: t.column_count })); statusText.value = `找到 ${tables.value.length} 个表`; success.value = true }
    else { error.value = result.error ?? '读取失败' }
  } catch (e: any) { error.value = e?.message ?? '读取失败' } finally { loading.value = false }
}
async function testConnection() {
  loading.value = true; cancelled.value = false; error.value = ''; statusText.value = t('upload.feishuTesting'); tables.value = []; success.value = false
  try {
    const result = await testDbConnection(connString.value)
    if (cancelled.value) return
    if (result.ok && result.data) { tables.value = result.data.tables; statusText.value = `${result.data.driver} ${result.data.version}`; success.value = true }
    else { error.value = result.error ?? '连接失败'; statusText.value = '' }
  } catch (e: any) { error.value = e?.message ?? '连接失败'; statusText.value = '' } finally { loading.value = false }
}
function selectAllTables() { selectedTables.value = tables.value.map(t => t.name) }
async function importSelected() {
  loading.value = true; cancelled.value = false; error.value = ''
  try {
    for (const name of selectedTables.value) {
      const result = isSqlite.value ? await loadSqliteTable(selectedFile.value, name) : await loadDbTable(connString.value, name)
      if (cancelled.value) return
      if (result.ok && result.data) { dataStore.loadFromPayload(result.data, name); configStore.generateAutoConfig() }
      else { error.value = result.error ?? '导入失败'; break }
    }
  } catch (e: any) { error.value = e?.message ?? '导入失败' } finally { loading.value = false }
}
async function executeSql() {
  if (!customSql.value.trim()) return
  loading.value = true; cancelled.value = false; error.value = ''
  try {
    const result = isSqlite.value ? await executeSqliteQuery(selectedFile.value, customSql.value.trim()) : await executeDbQuery(connString.value, customSql.value.trim(), 'SQL查询')
    if (cancelled.value) return
    if (result.ok && result.data) { dataStore.loadFromPayload(result.data, 'SQL查询'); configStore.generateAutoConfig(); customSql.value = '' }
    else { error.value = result.error ?? '执行失败' }
  } catch (e: any) { error.value = e?.message ?? '执行失败' } finally { loading.value = false }
}

function cancel() {
  cancelled.value = true
  loading.value = false
  statusText.value = ''
}
</script>

<style scoped>
.import-card { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; border: 2px dashed var(--border); border-radius: 12px; background: var(--bg-surface); transition: all 0.3s ease; min-height: 130px; gap: 10px; }
.import-card:hover { border-color: var(--primary); background: var(--primary-light); }
.import-card.has-tables { align-items: stretch; justify-content: flex-start; padding: 20px 24px; gap: 12px; }
.import-icon { font-size: 36px; opacity: 0.9; }
.import-text { font-size: 15px; font-weight: 500; color: var(--text-primary); margin: 0; }
.import-sub { font-size: 12px; color: var(--text-secondary); text-align: center; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
.db-mode-toggle { display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.mode-btn { padding: 6px 16px; border: none; background: var(--bg-primary); font-size: 12px; cursor: pointer; color: var(--text-secondary); }
.mode-btn.active { background: var(--primary); color: #fff; }
.mode-btn:first-child { border-right: 1px solid var(--border); }
.card-input { width: 100%; max-width: 460px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary); box-sizing: border-box; }
.card-input:focus { outline: none; border-color: var(--primary); }
.card-btn { margin-top: 2px; }
.card-status { font-size: 13px; }
.status-loading { color: var(--text-secondary); } .status-success { color: #27ae60; } .status-error { color: #e74c3c; }
.tables-section { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.tables-header { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.tables-list { max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-primary); }
.table-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); }
.table-row:last-child { border-bottom: none; } .table-row.selected { background: var(--highlight-bg, #e8f4fd); } .table-row:hover { background: var(--bg-secondary); }
.table-name { font-weight: 500; flex-shrink: 0; } .table-meta { color: var(--text-secondary); font-size: 11px; margin-left: auto; }
.tables-actions { display: flex; gap: 6px; } .card-actions { display: flex; gap: 8px; justify-content: center; margin-top: 4px; }
.sql-section { width: 100%; border-top: 1px solid var(--border); padding-top: 10px; }
.sql-header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary); padding: 4px 0; user-select: none; }
.sql-header:hover { color: var(--text-primary); } .sql-arrow { font-size: 10px; opacity: 0.6; }
.sql-body { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.sql-textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: monospace; font-size: 12px; resize: vertical; background: var(--bg-primary); color: var(--text-primary); margin-bottom: 8px; box-sizing: border-box; }
.sql-textarea:focus { outline: none; border-color: var(--primary); }
.card-error { color: #e74c3c; font-size: 13px; text-align: center; }
.card-btn-row { display: flex; gap: 8px; align-items: center; }
.btn-stop { background: var(--bg-primary); color: #e74c3c; border: 1px solid #e74c3c; }
.btn-stop:hover { background: #fef2f2; }
</style>
