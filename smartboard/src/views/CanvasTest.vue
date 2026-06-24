<template>
  <div class="test-page">
    <h2>Canvas Test</h2>
    <p>拖拽/缩放方块，测试 vue3-grid-layout 布局能力</p>

    <!-- 工具栏 -->
    <div class="test-toolbar">
      <div class="tt-group">
        <span class="tt-label">统一尺寸</span>
        <button @click="setAllSizes(3, 2)">小 3×2</button>
        <button @click="setAllSizes(6, 4)">中 6×4</button>
        <button @click="setAllSizes(12, 5)">大 12×5</button>
      </div>
      <div class="tt-group">
        <span class="tt-label">选中尺寸 ({{ selectedIds.size }})</span>
        <button @click="setSelectedSizes(3, 2)" :disabled="selectedIds.size === 0">小</button>
        <button @click="setSelectedSizes(6, 4)" :disabled="selectedIds.size === 0">中</button>
        <button @click="setSelectedSizes(12, 5)" :disabled="selectedIds.size === 0">大</button>
      </div>
      <div class="tt-group">
        <span class="tt-label">行高</span>
        <input type="range" min="30" max="120" v-model.number="rowHeight" />
        <span>{{ rowHeight }}px</span>
      </div>
      <div class="tt-group">
        <span class="tt-label">列数</span>
        <select v-model.number="colNum">
          <option :value="6">6</option>
          <option :value="8">8</option>
          <option :value="12">12</option>
          <option :value="16">16</option>
        </select>
      </div>
      <div class="tt-group">
        <button @click="selectAll">全选</button>
        <button @click="deselectAll">取消</button>
        <button @click="autoLayout">自动排列</button>
        <button @click="addBlock">+ 添加</button>
        <button class="btn-danger" @click="resetLayout">重置</button>
      </div>
      <div class="tt-group">
        <span class="tt-label">容器切分</span>
        <select v-model="sectionMode">
          <option value="">无</option>
          <option value="h2">左右两栏</option>
          <option value="v2">上下两栏</option>
          <option value="4">2×2 四格</option>
          <option value="t2b">上栏+下两栏</option>
        </select>
      </div>
    </div>

    <!-- 画布容器（包裹 overlay） -->
    <div class="canvas-wrapper" :style="canvasWrapperStyle">
      <!-- 虚线区域 overlay -->
      <div v-if="sectionMode" class="section-overlay">
        <div v-for="s in sections" :key="s.key" class="section-zone"
          :style="{
            left: s.left + 'px',
            top: s.top + 'px',
            width: s.width + 'px',
            height: s.height + 'px',
          }"
        >
          <span class="sz-label">{{ s.label }}</span>
        </div>
      </div>

      <grid-layout
        :key="gridKey"
        :layout="layout"
        :col-num="colNum"
        :row-height="rowHeight"
        :is-draggable="true"
        :is-resizable="true"
        :margin="[10, 10]"
        @layout-updated="onUpdate"
        class="test-canvas"
      >
      <grid-item v-for="item in layout" :key="item.i"
        :x="item.x" :y="item.y" :w="item.w" :h="item.h"
        :min-w="2" :min-h="1" :i="item.i"
      >
        <div class="test-block"
          :class="{ selected: selectedIds.has(item.i) }"
          :style="{ background: item.bg }"
          @click.stop="toggleSelect(item.i)"
        >
          <strong>{{ item.i }}</strong>
          <span>{{ item.w }}×{{ item.h }}</span>
          <button v-if="selectedIds.has(item.i)" class="sel-badge">✓</button>
        </div>
      </grid-item>
    </grid-layout>
    </div><!-- /canvas-wrapper -->

    <!-- JSON 输出 -->
    <details class="layout-dump">
      <summary>Layout JSON ({{ layout.length }} items)</summary>
      <pre>{{ JSON.stringify(layout.map(({ bg, ...rest }) => rest), null, 2) }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316','#6366F1','#14B8A6']

const DEFAULT_LAYOUT = [
  { i: 'block-0', x: 0, y: 0, w: 4, h: 3 },
  { i: 'block-1', x: 4, y: 0, w: 4, h: 2 },
  { i: 'block-2', x: 8, y: 0, w: 4, h: 2 },
  { i: 'block-3', x: 0, y: 3, w: 6, h: 3 },
  { i: 'block-4', x: 6, y: 3, w: 6, h: 3 },
  { i: 'block-5', x: 0, y: 6, w: 3, h: 2 },
  { i: 'block-6', x: 3, y: 6, w: 3, h: 2 },
  { i: 'block-7', x: 6, y: 6, w: 6, h: 2 },
]

function makeLayout(raw: typeof DEFAULT_LAYOUT) {
  return raw.map((r, i) => ({ ...r, bg: COLORS[i % COLORS.length] }))
}

const layout = ref(makeLayout(DEFAULT_LAYOUT))
const rowHeight = ref(80)
const colNum = ref(12)
const gridKey = ref(0)
const selectedIds = ref(new Set<string>())
const sectionMode = ref('')

// ====== 容器切分 ======
interface Section { key: string; label: string; left: number; top: number; width: number; height: number }

const sections = computed((): Section[] => {
  const margin = 10  // 与 grid margin 一致
  const colW = (canvasW.value - (colNum.value + 1) * margin) / colNum.value
  const rowH = rowHeight.value + margin
  // 估算总行数：取所有块的最大 y+h
  const totalRows = Math.max(6, ...layout.value.map(l => l.y + l.h))
  const totalW = colNum.value * colW + (colNum.value + 1) * margin
  const totalH = totalRows * rowH + margin

  switch (sectionMode.value) {
    case 'h2': { // 左右两栏
      const mid = Math.floor(colNum.value / 2)
      const leftW = mid * colW + (mid + 1) * margin
      return [
        { key: 'L', label: 'A', left: 0, top: 0, width: leftW, height: totalH },
        { key: 'R', label: 'B', left: leftW, top: 0, width: totalW - leftW, height: totalH },
      ]
    }
    case 'v2': { // 上下两栏
      const midRow = Math.floor(totalRows / 2)
      const topH = midRow * rowH + margin
      return [
        { key: 'T', label: 'A', left: 0, top: 0, width: totalW, height: topH },
        { key: 'B', label: 'B', left: 0, top: topH, width: totalW, height: totalH - topH },
      ]
    }
    case '4': { // 2×2 四格
      const midCol = Math.floor(colNum.value / 2)
      const midRow = Math.floor(totalRows / 2)
      const leftW = midCol * colW + (midCol + 1) * margin
      const topH = midRow * rowH + margin
      return [
        { key: 'TL', label: 'A', left: 0, top: 0, width: leftW, height: topH },
        { key: 'TR', label: 'B', left: leftW, top: 0, width: totalW - leftW, height: topH },
        { key: 'BL', label: 'C', left: 0, top: topH, width: leftW, height: totalH - topH },
        { key: 'BR', label: 'D', left: leftW, top: topH, width: totalW - leftW, height: totalH - topH },
      ]
    }
    case 't2b': { // 上栏+下两栏
      const topRows = Math.floor(totalRows * 0.4)
      const topH = topRows * rowH + margin
      const midCol = Math.floor(colNum.value / 2)
      const leftW = midCol * colW + (midCol + 1) * margin
      const botH = totalH - topH
      return [
        { key: 'TOP', label: 'A', left: 0, top: 0, width: totalW, height: topH },
        { key: 'BL', label: 'B', left: 0, top: topH, width: leftW, height: botH },
        { key: 'BR', label: 'C', left: leftW, top: topH, width: totalW - leftW, height: botH },
      ]
    }
    default: return []
  }
})

// 估算画布尺寸（用于 overlay 定位）
const canvasW = ref(800) // 会在 onMounted 时更新
const canvasWrapperStyle = computed(() => {
  const cw = canvasW.value
  if (!cw) return {}
  return { width: cw + 'px', position: 'relative' as const }
})

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  const el = document.querySelector('.test-canvas') as HTMLElement
  if (el) {
    canvasW.value = el.offsetWidth
    resizeObs = new ResizeObserver(() => {
      canvasW.value = el.offsetWidth
    })
    resizeObs.observe(el)
  }
})
onUnmounted(() => { resizeObs?.disconnect() })

let blockCounter = DEFAULT_LAYOUT.length

// ====== 选中 ======
function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}
function selectAll() { selectedIds.value = new Set(layout.value.map(l => l.i)) }
function deselectAll() { selectedIds.value = new Set() }

// ====== 统一缩放全部 ======
function setAllSizes(w: number, h: number) {
  layout.value = layout.value.map(l => ({ ...l, w, h }))
  gridKey.value++
}

// ====== 统一缩放选中 ======
function setSelectedSizes(w: number, h: number) {
  layout.value = layout.value.map(l => {
    if (selectedIds.value.has(l.i)) return { ...l, w, h }
    return l
  })
  gridKey.value++
}

// ====== 自动排列 ======
function autoLayout() {
  const cols = colNum.value
  let x = 0, y = 0, maxH = 0
  layout.value = layout.value.map((l, i) => {
    const def = DEFAULT_LAYOUT[i % DEFAULT_LAYOUT.length]
    const w = def.w, h = def.h
    if (x + w > cols) { x = 0; y += maxH; maxH = 0 }
    const item = { ...l, x, y, w, h }
    x += w
    if (h > maxH) maxH = h
    return item
  })
  gridKey.value++
}

// ====== 添加/重置 ======
function addBlock() {
  const id = `block-${blockCounter++}`
  const cols = colNum.value
  const last = layout.value[layout.value.length - 1]
  const newX = last ? (last.x + last.w) % cols : 0
  const newY = last ? last.y + (newX === 0 ? last.h : 0) : 0
  layout.value.push({ i: id, x: newX, y: newY, w: 4, h: 2, bg: COLORS[blockCounter % COLORS.length] })
  gridKey.value++
}

function resetLayout() {
  blockCounter = DEFAULT_LAYOUT.length
  layout.value = makeLayout(DEFAULT_LAYOUT)
  selectedIds.value = new Set()
  rowHeight.value = 80
  colNum.value = 12
  gridKey.value++
}

function onUpdate(newLayout: any[]) {
  layout.value = newLayout.map((l: any) => ({
    ...l,
    bg: layout.value.find(b => b.i === l.i)?.bg || '#999',
  }))
}
</script>

<style scoped>
.test-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Toolbar */
.test-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.tt-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tt-label {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-right: 2px;
}
.tt-group button {
  font-size: 11px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.tt-group button:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}
.tt-group button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tt-group .btn-danger {
  border-color: #ef4444;
  color: #ef4444;
}
.tt-group .btn-danger:hover {
  background: #fef2f2;
}
.tt-group input[type="range"] {
  width: 80px;
  accent-color: var(--primary);
}
.tt-group select {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}

.test-canvas {
  background: var(--bg-surface);
  border: 2px dashed var(--border);
  border-radius: 12px;
  min-height: 400px;
}

/* 容器切分 overlay */
.canvas-wrapper {
  margin: 0 auto;
}
.section-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.section-zone {
  position: absolute;
  border: 2px dashed rgba(99, 102, 241, 0.4);
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.04);
}
.sz-label {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(99, 102, 241, 0.5);
  letter-spacing: 0.5px;
}

.test-block {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  gap: 4px;
  position: relative;
  cursor: pointer;
  transition: box-shadow 0.15s;
  user-select: none;
}
.test-block:hover {
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.3);
}
.test-block.selected {
  box-shadow: inset 0 0 0 3px #fff, 0 0 0 2px var(--primary);
}
.test-block strong { font-size: 18px; }

.sel-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  color: var(--primary);
  border: none;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.layout-dump {
  margin-top: 24px;
  padding: 16px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 12px;
}
.layout-dump summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.layout-dump pre {
  max-height: 300px;
  overflow: auto;
  margin: 0;
}
</style>
