<template>
  <transition name="toast-slide">
    <div v-if="visible" class="toast" :class="'toast-' + type">
      <span class="toast-icon">{{ icon }}</span>
      <span class="toast-msg">{{ message }}</span>
      <button class="toast-close" @click="visible = false">✕</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const visible = ref(false)
const message = ref('')
const type = ref<'success' | 'error' | 'info'>('info')

const icon = computed(() => {
  switch (type.value) {
    case 'success': return '✓'
    case 'error': return '✕'
    default: return 'ℹ'
  }
})

let timer: ReturnType<typeof setTimeout> | null = null

function show(msg: string, t: 'success' | 'error' | 'info' = 'info', duration = 3000) {
  message.value = msg
  type.value = t
  visible.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { visible.value = false }, duration)
}

defineExpose({ show })
</script>

<style scoped>
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  font-size: 14px;
  min-width: 240px;
  max-width: 400px;
}

.toast-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.toast-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.toast-info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

.toast-icon {
  font-size: 16px;
  font-weight: 700;
}

.toast-msg { flex: 1; }

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.5;
  font-size: 14px;
  padding: 2px 6px;
}

.toast-close:hover { opacity: 1; }

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s ease;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
