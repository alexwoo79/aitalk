<!-- src/components/upload/TableListPanel.vue -->
<template>
  <div class="table-list-panel">
    <div class="panel-header">
      <span class="panel-title">{{ t('upload.tables') }}</span>
      <span class="panel-count">{{ tableCount }}</span>
    </div>

    <div v-if="tables.length === 0" class="panel-empty">
      <p>{{ t('upload.noTables') }}</p>
    </div>

    <ul v-else class="table-list">
      <li
        v-for="table in tables"
        :key="table.id"
        class="table-item"
        :class="{ active: table.isActive, main: table.isMain }"
        @click="dataStore.switchTable(table.id)"
      >
        <div class="table-info">
          <span class="table-status" :class="{ loaded: true }">●</span>
          <div class="table-details">
            <span class="table-name" :title="table.name">{{ table.name }}</span>
            <span class="table-meta">{{ table.rows }}{{ t('upload.rows') }} × {{ table.cols }}{{ t('upload.cols') }}</span>
          </div>
        </div>
        <div class="table-actions">
          <button
            v-if="!table.isMain && tables.length > 1"
            class="btn-icon"
            :title="t('upload.setMainTable')"
            @click.stop="dataStore.setMainTable(table.id)"
          >⭐</button>
          <button
            v-if="table.isMain"
            class="btn-icon active-star"
            :title="t('upload.mainTable')"
            @click.stop="dataStore.setMainTable(null)"
          >⭐</button>
          <button
            class="btn-icon btn-delete"
            :title="t('upload.removeTable')"
            @click.stop="dataStore.removeTable(table.id)"
          >✕</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'

const { t } = useI18n()
const dataStore = useDataStore()

const tables = dataStore.tableList
const tableCount = dataStore.tableCount
</script>

<style scoped>
.table-list-panel {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 1px 8px;
  border-radius: 10px;
}

.panel-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.table-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  flex: 1;
  overflow-y: auto;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 2px;
}

.table-item:hover {
  background: var(--bg-hover);
}

.table-item.active {
  background: var(--primary-light);
  border: 1px solid var(--primary);
}

.table-item.main {
  border-left: 3px solid var(--warning);
}

.table-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.table-status {
  font-size: 8px;
  flex-shrink: 0;
  color: var(--success);
}

.table-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.table-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.table-item:hover .table-actions {
  opacity: 1;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.btn-icon:hover {
  background: var(--bg-hover);
}

.active-star {
  color: var(--warning) !important;
  opacity: 1 !important;
}

.btn-delete:hover {
  color: var(--error);
  background: var(--bg-error);
}
</style>
