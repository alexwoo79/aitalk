<template>
  <div class="app-container">
    <header class="app-header">
      <div class="app-logo">
        <svg class="logo-icon" viewBox="0 0 512 512" width="28" height="28">
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#3B82F6" />
              <stop offset="100%" style="stop-color:#6366F1" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="96" fill="url(#logo-grad)" />
          <rect x="120" y="320" width="48" height="80" rx="8" fill="rgba(255,255,255,.9)" />
          <rect x="192" y="240" width="48" height="160" rx="8" fill="rgba(255,255,255,.9)" />
          <rect x="264" y="200" width="48" height="200" rx="8" fill="white" />
          <rect x="336" y="260" width="48" height="140" rx="8" fill="rgba(255,255,255,.8)" />
          <polyline points="144,300 216,220 288,180 360,240" fill="none" stroke="white" stroke-width="10"
            stroke-linecap="round" stroke-linejoin="round" opacity="0.7" />
          <circle cx="380" cy="160" r="12" fill="rgba(255,255,255,.9)" />
          <circle cx="380" cy="160" r="4" fill="#F59E0B" />
        </svg>
        <span>SmartBoard</span>
      </div>
      <StepIndicator :current="currentStep" />
      <div class="header-right">
        <span class="app-version" :title="t('app.version') + ' ' + version.full">{{ version.semver }}<span
            class="app-version-build" v-if="version.build">.{{ version.build }}</span></span>
        <button class="theme-toggle" @click="toggleTheme"
          :title="theme === 'light' ? t('theme.switchDark') : t('theme.switchLight')">
          {{ theme === 'light' ? '🌙' : '☀️' }}
        </button>
        <select class="lang-switch" v-model="locale" @change="setLocale">
          <option v-for="l in LOCALES" :key="l.key" :value="l.key">{{ l.label }}</option>
        </select>
      </div>
    </header>
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StepIndicator from '@/components/common/StepIndicator.vue'
import Toast from '@/components/common/Toast.vue'
import { useTheme } from '@/composables/use-theme'
import { useVersion } from '@/composables/use-version'
import { LOCALES, type SupportedLocale } from '@/i18n'

const route = useRoute()
const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const { theme, toggle: toggleTheme } = useTheme()
const { version } = useVersion()
const { locale, t } = useI18n()

function setLocale() {
  localStorage.setItem('locale', locale.value)
}

// Restore saved locale
onMounted(() => {
  const saved = localStorage.getItem('locale') as SupportedLocale | null
  if (saved && LOCALES.some(l => l.key === saved)) locale.value = saved
})

const stepMap: Record<string, number> = {
  upload: 1,
  config: 2,
  dashboard: 3,
}

const currentStep = computed(() => stepMap[route.name as string] ?? 1)

// Global toast helper
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toastRef.value?.show(message, type)
}

// Expose to window for global access (optional)
if (typeof window !== 'undefined') {
  (window as any).__showToast = showToast
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.logo-icon {
  flex-shrink: 0;
}

.app-version {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  margin-right: 8px;
  white-space: nowrap;
  cursor: default;
}

.app-version-build {
  font-size: 10px;
  opacity: 0.6;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.2s;
  line-height: 1;
  height: 32px;
  display: inline-flex;
  align-items: center;
}

.theme-toggle:hover {
  background: var(--bg-hover);
}

.lang-switch {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  height: 32px;
  outline: none;
}

.lang-switch:focus {
  border-color: var(--primary);
}

.app-main {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
