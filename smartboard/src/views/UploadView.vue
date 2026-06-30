<template>
  <div class="upload-view">
    <!-- 右上角操作按钮 -->
    <div class="tips-actions">
      <button class="tips-toggle" @click="showTips = !showTips">
        {{ t('upload.dataTips.toggle') }}
        <span class="tips-arrow">{{ showTips ? '▲' : '▼' }}</span>
      </button>
      <span class="sample-download" role="button" tabindex="0" @click="downloadSample" @keydown.enter="downloadSample"
        @keydown.space.prevent="downloadSample">
        {{ t('upload.sampleDownload') }}
      </span>
    </div>

    <div v-if="showTips" class="tips-panel">
      <p class="tips-title">{{ t('upload.dataTips.title') }}</p>
      <ul class="tips-list">
        <li>{{ t('upload.dataTips.format') }}</li>
        <li>{{ t('upload.dataTips.header') }}</li>
        <li>{{ t('upload.dataTips.uniqueNames') }}</li>
        <li>{{ t('upload.dataTips.consistentType') }}</li>
        <li>{{ t('upload.dataTips.noEmpty') }}</li>
      </ul>
      <p class="tips-subtitle">{{ t('upload.dataTips.cleanTips') }}</p>
      <ul class="tips-list tips-list-secondary">
        <li>{{ t('upload.dataTips.tip1') }}</li>
        <li>{{ t('upload.dataTips.tip2') }}</li>
        <li>{{ t('upload.dataTips.tip3') }}</li>
        <li>{{ t('upload.dataTips.tip4') }}</li>
        <li>{{ t('upload.dataTips.tip5') }}</li>
      </ul>
      <button class="btn btn-sm btn-primary tips-got-it" @click="showTips = false">
        {{ t('upload.dataTips.gotIt') }}
      </button>
    </div>

    <!-- 上传区域（有数据后折叠） -->
    <div class="upload-section" :class="{ collapsed: dataStore.dataSet }">
      <div class="upload-section-header">
        <h2>{{ t('upload.title') }}</h2>
        <p class="subtitle" v-if="!dataStore.dataSet">{{ t('upload.subtitle') }}</p>
        <button v-if="dataStore.dataSet && uploadCollapsed" class="btn-link expand-upload" @click="uploadCollapsed = false">
          + {{ t('upload.addMoreFiles', '添加更多文件') }}
        </button>
      </div>

      <template v-if="!dataStore.dataSet || !uploadCollapsed">
        <!-- 导入方式 Tab 栏 -->
        <div class="method-tabs">
          <button v-for="mtab in methodTabs" :key="mtab.key" class="method-tab"
            :class="{ active: activeMethod === mtab.key }" @click="activeMethod = mtab.key">
            {{ mtab.label }}
          </button>
        </div>

        <!-- 各导入方式面板 -->
        <div class="method-panel">
          <FileUploader v-if="activeMethod === 'file'" @loaded="onFileLoaded" />
          <PasteZone v-if="activeMethod === 'paste'" />
          <UrlImport v-if="activeMethod === 'url'" />
          <DatabaseImport v-if="activeMethod === 'database'" />
          <FeishuImport v-if="activeMethod === 'feishu'" />
        </div>
      </template>
    </div>

    <!-- 加载 / 错误状态 -->
    <div v-if="dataStore.loading" class="loading">
      <div class="spinner"></div>
      <span>{{ t('upload.parsing') }}</span>
    </div>
    <div v-if="dataStore.error" class="error-banner">
      <span>{{ dataStore.error }}</span>
      <button class="btn" @click="dataStore.clearData()">{{ t('common.close') }}</button>
    </div>

    <!-- 数据预览区（有数据时显示） -->
    <template v-if="dataStore.dataSet">
      <!-- Tab 栏：表名 + 关联 -->
      <div class="table-tabs">
        <button v-for="table in dataStore.tableList" :key="table.id" class="table-tab"
          :class="{ active: table.isActive }" @click="switchTable(table.id)">
          <!-- 编辑模式 -->
          <span v-if="editingTabId === table.id" class="tab-rename-wrap" @click.stop>
            <input ref="renameInput" v-model="editName" class="tab-rename-input" maxlength="60"
              @keydown.enter="confirmRename" @keydown.escape="cancelRename" />
            <button class="tab-rename-ok" @click.stop="confirmRename" :title="t('common.confirm')">✓</button>
            <button class="tab-rename-cancel" @click.stop="cancelRename" :title="t('common.cancel')">✕</button>
          </span>
          <!-- 显示模式 -->
          <span v-else class="tab-table-name" :title="t('upload.doubleClickToRename')"
            @dblclick.stop="startRename(table)">{{ table.name }}</span>
          <span class="tab-remove" role="button" tabindex="0" :title="t('upload.removeTable')"
            @click.stop="dataStore.removeTable(table.id)" @keydown.enter.stop="dataStore.removeTable(table.id)"
            @keydown.space.prevent.stop="dataStore.removeTable(table.id)">✕</span>
        </button>
        <button v-if="dataStore.tableCount > 1" class="table-tab" :class="{ active: activeTab === 'relation' }"
          @click="activeTab = 'relation'">{{ t('upload.tabRelation') }}</button>
        <span class="tab-rename-hint" :title="t('upload.doubleClickToRename')">💡 {{ t('upload.renameHint') }}</span>
      </div>

      <!-- 关联 Tab 内容 -->
      <div v-if="activeTab === 'relation' && dataStore.tableCount > 1" class="tab-body">
        <RelationConfig />
      </div>

      <!-- 数据预览 Tab 内容 -->
      <div v-else class="tab-body">
        <DataPreview :data-set="dataStore.dataSet!" @next="goToConfig" @toggleExclude="onToggleExclude" />
      </div>
    </template>

    <!-- Excel 多 Sheet 选择弹窗 -->
    <SheetSelector :visible="!!dataStore.pendingSheetSelection"
      :file-name="dataStore.pendingSheetSelection?.filePath?.replace(/^.*[/\\]/, '') ?? ''"
      :sheets="dataStore.pendingSheetSelection?.sheets ?? []" @confirm="onSheetsConfirmed"
      @cancel="dataStore.cancelSheetSelection()" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { isTauri } from '@/composables/use-rust-bridge'
import FileUploader from '@/components/upload/FileUploader.vue'
import PasteZone from '@/components/upload/PasteZone.vue'
import UrlImport from '@/components/upload/UrlImport.vue'
import DatabaseImport from '@/components/upload/DatabaseImport.vue'
import FeishuImport from '@/components/upload/FeishuImport.vue'
import DataPreview from '@/components/upload/DataPreview.vue'
import RelationConfig from '@/components/upload/RelationConfig.vue'
import SheetSelector from '@/components/upload/SheetSelector.vue'

const router = useRouter()
const { t, locale } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

// ── 导入方式 Tab ──
type MethodKey = 'file' | 'paste' | 'url' | 'database' | 'feishu'
const activeMethod = ref<MethodKey>('file')

const methodTabs = computed(() => {
  const tabs: { key: MethodKey; label: string }[] = [
    { key: 'file', label: '📂 ' + t('upload.methodFile') },
    { key: 'paste', label: '📋 ' + t('upload.methodPaste') },
    { key: 'url', label: '🌐 ' + t('upload.methodUrl') },
    { key: 'feishu', label: '📊 ' + t('upload.methodFeishu') },
  ]
  if (isTauri()) {
    tabs.push({ key: 'database', label: '🗄️ ' + t('upload.methodDatabase') })
  }
  return tabs
})

// Tab state: 默认预览，多表时可切换到「关联」
const activeTab = ref<'data' | 'relation'>('data')

// 切换表时回到数据预览
function switchTable(id: string) {
  dataStore.switchTable(id)
  activeTab.value = 'data'
}

// ── 双击重命名表 ──
const editingTabId = ref<string | null>(null)
const editName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

interface TableInfo {
  id: string
  name: string
}

function startRename(table: TableInfo) {
  editingTabId.value = table.id
  editName.value = table.name
  void nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function confirmRename() {
  if (editingTabId.value && editName.value.trim()) {
    dataStore.renameTable(editingTabId.value, editName.value.trim())
  }
  editingTabId.value = null
  editName.value = ''
}

function cancelRename() {
  editingTabId.value = null
  editName.value = ''
}

// Data quality tips: shown by default on first visit, toggleable
const TIPS_STORAGE_KEY = 'smartboard-tips-dismissed'
const showTips = ref(!localStorage.getItem(TIPS_STORAGE_KEY))
const uploadCollapsed = ref(true)

// Persist dismissal to localStorage
watch(showTips, (val) => {
  if (!val) {
    localStorage.setItem(TIPS_STORAGE_KEY, '1')
  }
})

function onFileLoaded() {
  uploadCollapsed.value = true
  if (Object.keys(configStore.sectionSnapshots).length === 0) {
    configStore.generateAutoConfig()
  }
}

function onToggleExclude() {
  // Re-generate config when columns are excluded/restored (only if nothing saved)
  if (Object.keys(configStore.sectionSnapshots).length === 0) {
    configStore.generateAutoConfig()
  }
}

function goToConfig() {
  router.push('/config')
}

function onSheetsConfirmed(indices: number[]) {
  dataStore.loadSelectedSheets(indices)
}

// Sample CSV data embedded for offline download (Tauri-compatible)
const SAMPLE_CSV_ZH = `日期,区域,城市,产品类别,产品名称,销售额,销量,利润,客户数
2024-01-05,华东,上海,电子产品,智能手机,158000,120,32000,85
2024-01-05,华东,上海,电子产品,笔记本电脑,245000,45,51000,42
2024-01-05,华东,杭州,电子产品,智能手机,132000,100,26500,72
2024-01-05,华北,北京,电子产品,笔记本电脑,278000,52,58000,48
2024-01-05,华北,北京,家居用品,办公椅,45000,150,9000,110
2024-01-12,华东,上海,电子产品,平板电脑,98000,80,19500,65
2024-01-12,华东,杭州,家居用品,办公桌,72000,60,15000,48
2024-01-12,华北,北京,电子产品,智能手机,185000,140,37500,95
2024-01-12,华南,深圳,电子产品,笔记本电脑,320000,58,67000,52
2024-01-12,华南,广州,家居用品,办公椅,38000,125,7600,92
2024-01-19,华东,上海,家居用品,书架,28000,90,5600,68
2024-01-19,华东,南京,电子产品,平板电脑,76000,62,15200,55
2024-01-19,华北,北京,家居用品,办公桌,85000,48,18000,42
2024-01-19,华南,深圳,电子产品,智能手机,168000,128,34000,88
2024-01-19,西南,成都,电子产品,笔记本电脑,195000,38,41000,35
2024-01-26,华东,上海,电子产品,智能手机,172000,132,35000,90
2024-01-26,华北,天津,家居用品,办公椅,42000,140,8400,105
2024-01-26,华南,广州,电子产品,平板电脑,112000,90,22500,72
2024-01-26,西南,重庆,电子产品,智能手机,145000,110,29000,78
2024-02-02,华东,上海,家居用品,办公桌,68000,42,14000,38
2024-02-02,华东,杭州,电子产品,笔记本电脑,230000,42,48000,40
2024-02-02,华北,北京,电子产品,智能手机,195000,148,39500,102
2024-02-02,华南,深圳,家居用品,书架,32000,85,6500,65
2024-02-02,西南,成都,电子产品,平板电脑,85000,68,17000,56
2024-02-09,华东,南京,电子产品,智能手机,138000,105,28000,74
2024-02-09,华北,北京,家居用品,办公椅,48000,160,9600,118
2024-02-09,华南,广州,电子产品,笔记本电脑,265000,48,55500,44
2024-02-09,西南,重庆,家居用品,办公桌,55000,38,11500,32
2024-02-16,华东,上海,电子产品,平板电脑,105000,85,21000,68
2024-02-16,华北,天津,电子产品,智能手机,152000,118,30500,82
2024-02-16,华南,深圳,电子产品,笔记本电脑,298000,55,62500,50
2024-02-16,西南,成都,家居用品,书架,25000,78,5000,60
2024-02-23,华东,杭州,家居用品,办公椅,39000,130,7800,98
2024-02-23,华北,北京,电子产品,平板电脑,128000,102,25800,80
2024-02-23,华南,广州,电子产品,智能手机,176000,135,35500,94
2024-02-23,西南,重庆,电子产品,笔记本电脑,210000,40,44000,37
2024-03-01,华东,上海,电子产品,智能手机,188000,142,38000,96
2024-03-01,华东,南京,家居用品,办公桌,62000,40,13000,35
2024-03-01,华北,北京,电子产品,笔记本电脑,310000,56,65000,51
2024-03-01,华南,深圳,家居用品,办公椅,50000,168,10000,122
2024-03-01,西南,成都,电子产品,平板电脑,92000,74,18500,60
2024-03-08,华东,上海,家居用品,书架,30000,95,6000,72
2024-03-08,华北,天津,电子产品,智能手机,165000,125,33000,86
2024-03-08,华南,广州,电子产品,笔记本电脑,285000,52,60000,47
2024-03-08,西南,重庆,家居用品,办公椅,36000,120,7200,90
2024-03-15,华东,杭州,电子产品,平板电脑,88000,70,17600,58
2024-03-15,华北,北京,家居用品,办公桌,78000,46,16500,40
2024-03-15,华南,深圳,电子产品,智能手机,198000,150,40000,105
2024-03-15,西南,成都,电子产品,笔记本电脑,225000,43,47000,39
2024-03-22,华东,上海,电子产品,智能手机,205000,155,41500,108`

const SAMPLE_CSV_EN = `Date,Region,City,Category,Product,Sales,Quantity,Profit,Customers
2024-01-05,East,Shanghai,Electronics,Smartphone,158000,120,32000,85
2024-01-05,East,Shanghai,Electronics,Laptop,245000,45,51000,42
2024-01-05,East,Hangzhou,Electronics,Smartphone,132000,100,26500,72
2024-01-05,North,Beijing,Electronics,Laptop,278000,52,58000,48
2024-01-05,North,Beijing,Home Goods,Office Chair,45000,150,9000,110
2024-01-12,East,Shanghai,Electronics,Tablet,98000,80,19500,65
2024-01-12,East,Hangzhou,Home Goods,Office Desk,72000,60,15000,48
2024-01-12,North,Beijing,Electronics,Smartphone,185000,140,37500,95
2024-01-12,South,Shenzhen,Electronics,Laptop,320000,58,67000,52
2024-01-12,South,Guangzhou,Home Goods,Office Chair,38000,125,7600,92
2024-01-19,East,Shanghai,Home Goods,Bookshelf,28000,90,5600,68
2024-01-19,East,Nanjing,Electronics,Tablet,76000,62,15200,55
2024-01-19,North,Beijing,Home Goods,Office Desk,85000,48,18000,42
2024-01-19,South,Shenzhen,Electronics,Smartphone,168000,128,34000,88
2024-01-19,Southwest,Chengdu,Electronics,Laptop,195000,38,41000,35
2024-01-26,East,Shanghai,Electronics,Smartphone,172000,132,35000,90
2024-01-26,North,Tianjin,Home Goods,Office Chair,42000,140,8400,105
2024-01-26,South,Guangzhou,Electronics,Tablet,112000,90,22500,72
2024-01-26,Southwest,Chongqing,Electronics,Smartphone,145000,110,29000,78
2024-02-02,East,Shanghai,Home Goods,Office Desk,68000,42,14000,38
2024-02-02,East,Hangzhou,Electronics,Laptop,230000,42,48000,40
2024-02-02,North,Beijing,Electronics,Smartphone,195000,148,39500,102
2024-02-02,South,Shenzhen,Home Goods,Bookshelf,32000,85,6500,65
2024-02-02,Southwest,Chengdu,Electronics,Tablet,85000,68,17000,56
2024-02-09,East,Nanjing,Electronics,Smartphone,138000,105,28000,74
2024-02-09,North,Beijing,Home Goods,Office Chair,48000,160,9600,118
2024-02-09,South,Guangzhou,Electronics,Laptop,265000,48,55500,44
2024-02-09,Southwest,Chongqing,Home Goods,Office Desk,55000,38,11500,32
2024-02-16,East,Shanghai,Electronics,Tablet,105000,85,21000,68
2024-02-16,North,Tianjin,Electronics,Smartphone,152000,118,30500,82
2024-02-16,South,Shenzhen,Electronics,Laptop,298000,55,62500,50
2024-02-16,Southwest,Chengdu,Home Goods,Bookshelf,25000,78,5000,60
2024-02-23,East,Hangzhou,Home Goods,Office Chair,39000,130,7800,98
2024-02-23,North,Beijing,Electronics,Tablet,128000,102,25800,80
2024-02-23,South,Guangzhou,Electronics,Smartphone,176000,135,35500,94
2024-02-23,Southwest,Chongqing,Electronics,Laptop,210000,40,44000,37
2024-03-01,East,Shanghai,Electronics,Smartphone,188000,142,38000,96
2024-03-01,East,Nanjing,Home Goods,Office Desk,62000,40,13000,35
2024-03-01,North,Beijing,Electronics,Laptop,310000,56,65000,51
2024-03-01,South,Shenzhen,Home Goods,Office Chair,50000,168,10000,122
2024-03-01,Southwest,Chengdu,Electronics,Tablet,92000,74,18500,60
2024-03-08,East,Shanghai,Home Goods,Bookshelf,30000,95,6000,72
2024-03-08,North,Tianjin,Electronics,Smartphone,165000,125,33000,86
2024-03-08,South,Guangzhou,Electronics,Laptop,285000,52,60000,47
2024-03-08,Southwest,Chongqing,Home Goods,Office Chair,36000,120,7200,90
2024-03-15,East,Hangzhou,Electronics,Tablet,88000,70,17600,58
2024-03-15,North,Beijing,Home Goods,Office Desk,78000,46,16500,40
2024-03-15,South,Shenzhen,Electronics,Smartphone,198000,150,40000,105
2024-03-15,Southwest,Chengdu,Electronics,Laptop,225000,43,47000,39
2024-03-22,East,Shanghai,Electronics,Smartphone,205000,155,41500,108`

// Dynamic sample CSV based on current locale
const sampleCsv = computed(() => {
  return locale.value === 'en-US' ? SAMPLE_CSV_EN : SAMPLE_CSV_ZH
})

async function downloadSample() {
  try {
    // Use Tauri native save dialog (works in both dev & production)
    const filePath = await save({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: 'smartboard-sample-data.csv',
    })
    if (!filePath) return // user cancelled
    await writeTextFile(filePath, sampleCsv.value)
  } catch {
    // Fallback for browser: Blob download
    const blob = new Blob([sampleCsv.value], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'smartboard-sample-data.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

</script>

<style scoped>
.upload-view {
  max-width: 1200px;
  margin: 0 auto;
}

/* ── 上传区域 ── */
.upload-section {
  text-align: center;
  margin-bottom: 24px;
  transition: all 0.3s ease;
}

.upload-section.collapsed {
  margin-bottom: 12px;
}

.upload-section-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.expand-upload {
  font-size: 13px;
  margin-top: 4px;
}

.upload-section h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

/* ── 加载 / 错误 ── */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-secondary);
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--error);
  border-radius: var(--radius);
  background: var(--bg-error);
  color: var(--error);
  font-size: 13px;
}


/* ── 导入方式 Segmented Control ── */
.method-tabs {
  display: inline-flex;
  gap: 3px;
  background: var(--bg-hover, #f1f5f9);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 20px;
  margin-top: 16px;
}

.method-tab {
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.method-tab:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.04);
}

.method-tab.active {
  color: #fff;
  background: var(--primary, #3B82F6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  font-weight: 600;
}

:root[data-theme="dark"] .method-tabs {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme="dark"] .method-tab:hover {
  background: rgba(255, 255, 255, 0.08);
}

.method-panel {
  min-height: 80px;
  padding: 20px 0 12px;
  border-top: 1px solid var(--border-light, #e2e8f0);
}

/* ── Table Tab 栏 ── */
.table-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 16px;
  overflow-x: auto;
  flex-shrink: 0;
}

.table-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.table-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.table-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 500;
}

.tab-table-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}

.tab-rename-input {
  max-width: 140px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--primary);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
}

.tab-rename-input:focus {
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.25);
}

.tab-table-meta {
  font-size: 11px;
  opacity: 0.6;
  font-weight: 400;
}

.tab-remove {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s;
}

.table-tab:hover .tab-remove {
  opacity: 0.7;
  color: var(--error);
}

.tab-remove:hover {
  opacity: 1 !important;
  color: #fff !important;
  background: var(--error);
}

.tab-rename-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.tab-rename-ok,
.tab-rename-cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.tab-rename-ok:hover {
  background: #10B981;
  color: #fff;
}

.tab-rename-cancel:hover {
  background: var(--error);
  color: #fff;
}

.tab-rename-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
  opacity: 0.6;
  cursor: default;
}

/* ── Tab 内容 ── */
.tab-body {
  min-height: 200px;
}

/* ── 提示面板 ── */
.upload-view {
  position: relative;
}

.tips-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 8px;
}

.tips-toggle {
  background: none;
  border: none;
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
}

.tips-arrow {
  font-size: 10px;
}

.sample-download {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.sample-download:hover {
  color: var(--primary);
}

.tips-panel {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 32px;
  width: 560px;
  max-width: 90vw;
  padding: 14px 18px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  font-size: 12px;
  color: #92400e;
  text-align: left;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

:root[data-theme="dark"] .tips-panel {
  background: #292524;
  border-color: #78350f;
  color: #fde68a;
}

.tips-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.tips-subtitle {
  font-weight: 600;
  margin-top: 8px;
  margin-bottom: 4px;
}

.tips-list {
  list-style: disc;
  padding-left: 18px;
  margin: 0;
}

.tips-list li {
  margin-bottom: 2px;
}

.tips-list-secondary {
  list-style: circle;
  opacity: 0.75;
}

.tips-got-it {
  margin-top: 8px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
