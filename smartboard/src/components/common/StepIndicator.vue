<template>
  <div class="step-indicator">
    <div v-for="step in steps" :key="step.num"
      class="step" :class="{ active: step.num === current, done: step.num < current }">
      <div class="step-circle">{{ step.num < current ? '✓' : step.num }}</div>
      <span class="step-label">{{ step.label }}</span>
      <div v-if="step.num < steps.length" class="step-line" :class="{ filled: step.num < current }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ current: number }>()

const steps = [
  { num: 1, label: '上传数据' },
  { num: 2, label: '配置看板' },
  { num: 3, label: '查看结果' },
]
</script>

<style scoped>
.step-indicator {
  display: flex;
  align-items: center;
  gap: 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid var(--border);
  color: var(--text-secondary);
  transition: all 0.3s;
}

.step.active .step-circle {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.step.done .step-circle {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.step-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.step.active .step-label {
  color: var(--primary);
  font-weight: 600;
}

.step.done .step-label {
  color: var(--success);
}

.step-line {
  width: 40px;
  height: 2px;
  background: var(--border);
  margin: 0 12px;
  transition: background 0.3s;
}

.step-line.filled {
  background: var(--success);
}
</style>
