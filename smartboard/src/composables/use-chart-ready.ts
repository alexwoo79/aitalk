import { ref, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * 等待图表容器获得非零尺寸后再渲染。
 * 解决 vue3-grid-layout 内部 grid-item 首次加载时尺寸为 0 的问题。
 */
export function useChartReady() {
    const containerRef = ref<HTMLElement | null>(null)
    const ready = ref(false)

    let obs: ResizeObserver | null = null

    onMounted(() => {
        nextTick(() => {
            const el = containerRef.value
            if (!el) return
            if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                ready.value = true
                return
            }
            obs = new ResizeObserver((entries) => {
                const rect = entries[0]?.contentRect
                if (rect && rect.width > 0 && rect.height > 0) {
                    ready.value = true
                    obs?.disconnect()
                }
            })
            obs.observe(el)
        })
    })

    onUnmounted(() => {
        obs?.disconnect()
    })

    return { containerRef, ready }
}
