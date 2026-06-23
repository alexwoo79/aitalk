<template>
  <div class="upload-view">
    <div class="upload-section">
      <h2>{{ t('upload.title') }}</h2>
      <p class="subtitle">{{ t('upload.subtitle') }}</p>
      <FileUploader @loaded="onFileLoaded" />
    </div>

    <div v-if="dataStore.loading" class="loading">
      <div class="spinner"></div>
      <span>{{ t('upload.parsing') }}</span>
    </div>

    <div v-if="dataStore.error" class="error-banner">
      <span>{{ dataStore.error }}</span>
      <button class="btn" @click="dataStore.clearData()">{{ t('common.close') }}</button>
    </div>

    <DataPreview v-if="dataStore.dataSet" :data-set="dataStore.dataSet" @next="goToConfig"
      @toggleExclude="onToggleExclude" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDataStore } from '@/stores/data-store'
import { useConfigStore } from '@/stores/config-store'
import FileUploader from '@/components/upload/FileUploader.vue'
import DataPreview from '@/components/upload/DataPreview.vue'

const router = useRouter()
const { t } = useI18n()
const dataStore = useDataStore()
const configStore = useConfigStore()

function onFileLoaded() {
  // Auto-generate config when data is loaded (only if nothing saved yet)
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
</script>

<style scoped>
.upload-view {
  max-width: 1200px;
  margin: 0 auto;
}

.upload-section {
  text-align: center;
  margin-bottom: 32px;
}

.upload-section h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-secondary);
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

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-error);
  color: var(--text-error);
  border-radius: 8px;
  margin-bottom: 24px;
}
</style>
