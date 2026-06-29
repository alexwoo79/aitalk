/**
 * 图表尺寸管理 composable
 *
 * 解决两个问题：
 * 1. 高DPI缩放（250%）下 ECharts 因子像素值持续触发 resize 导致无限拉伸
 * 2. 双击全屏后图表未填满屏幕
 *
 * 全屏时的 resize 依赖 ResizeObserver 自动触发，无需手动调用。
 */
import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import type VChart from 'vue-echarts'

/** 最小变化阈值（px）：小于此值的变化忽略，防止高DPI子像素抖动 */
const MIN_CHANGE = 1.5

export function useChartResize(
    chartRef: Ref<InstanceType<typeof VChart> | null>,
    containerRef: Ref<HTMLElement | null>,
) {
    const isFullscreen = ref(false)
    let ro: ResizeObserver | null = null
    let _prevW = 0
    let _prevH = 0
    let _resizePending = false

    function scheduleResize() {
        if (_resizePending) return
        _resizePending = true
        requestAnimationFrame(() => {
            if (!containerRef.value) { _resizePending = false; return }
            const w = containerRef.value.offsetWidth
            const h = containerRef.value.offsetHeight
            if (Math.abs(w - _prevW) < MIN_CHANGE && Math.abs(h - _prevH) < MIN_CHANGE) {
                _resizePending = false
                return
            }
            _prevW = w
            _prevH = h
            chartRef.value?.chart?.resize()
            _resizePending = false
        })
    }

    onMounted(() => {
        if (containerRef.value) {
            ro = new ResizeObserver(scheduleResize)
            ro.observe(containerRef.value)
        }
    })

    onUnmounted(() => {
        ro?.disconnect()
        ro = null
    })

    // ── 全屏逻辑 ──
    // 全屏切换完全由 ResizeObserver 自动触发图表重绘
    function onFullscreenEsc(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            isFullscreen.value = false
            document.removeEventListener('keydown', onFullscreenEsc)
        }
    }

    function toggleFullscreen() {
        isFullscreen.value = !isFullscreen.value
        if (isFullscreen.value) {
            document.addEventListener('keydown', onFullscreenEsc)
        } else {
            document.removeEventListener('keydown', onFullscreenEsc)
        }
    }

    return {
        isFullscreen,
        toggleFullscreen,
    }
}
