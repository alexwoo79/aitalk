<template>
    <div class="resizable-card" :style="containerStyle" ref="containerRef">
        <!-- resize handles -->
        <div class="rs-handle rs-handle-e" @pointerdown.prevent="startResize($event, 'e')"></div>
        <div class="rs-handle rs-handle-s" @pointerdown.prevent="startResize($event, 's')"></div>
        <div class="rs-handle rs-handle-se" @pointerdown.prevent="startResize($event, 'se')"></div>
        <slot />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

const props = defineProps<{
    minW?: number
    minH?: number
}>()

const minW = props.minW ?? 280
const minH = props.minH ?? 200

const containerRef = ref<HTMLElement | null>(null)
const size = reactive({ w: 0, h: 0 })
const containerStyle = reactive<Record<string, string>>({})

type Dir = 'e' | 's' | 'se'
let dir: Dir = 'se'
let startX = 0
let startY = 0
let startW = 0
let startH = 0

function startResize(e: PointerEvent, d: Dir) {
    dir = d
    startX = e.clientX
    startY = e.clientY
    const el = containerRef.value!
    startW = el.offsetWidth
    startH = el.offsetHeight

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    e.preventDefault()
}

function onMove(e: PointerEvent) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    let nw = startW
    let nh = startH
    if (dir === 'e' || dir === 'se') nw = Math.max(minW, startW + dx)
    if (dir === 's' || dir === 'se') nh = Math.max(minH, startH + dy)
    containerStyle.width = nw + 'px'
    containerStyle.height = nh + 'px'
}

function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
}
</script>

<style scoped>
.resizable-card {
    position: relative;
    box-sizing: border-box;
}

.rs-handle {
    position: absolute;
    z-index: 5;
    transition: background 0.15s;
}

.rs-handle-e {
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
}

.rs-handle-s {
    bottom: 0;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
}

.rs-handle-se {
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
}

.rs-handle:hover {
    background: rgba(59, 130, 246, 0.15);
}
</style>
