<template>
  <div class="skeleton-chart">
    <div class="sk-title"></div>
    <div class="sk-body">
      <div class="sk-bar" v-for="i in 6" :key="i" :style="{ width: (40 + Math.random() * 50) + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-chart {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--bg-surface);
  border-radius: 8px;
  animation: sk-pulse 1.5s ease-in-out infinite;
}
.sk-title {
  height: 18px;
  width: 35%;
  background: var(--border);
  border-radius: 4px;
}
.sk-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 0;
}
.sk-bar {
  height: 16px;
  background: var(--border);
  border-radius: 4px;
  opacity: 0.7;
}
@keyframes sk-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}
</style>
