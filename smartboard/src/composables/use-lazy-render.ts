import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 流式懒加载图表：仅当 chart-card 进入视口时才渲染，避免大数据量时一次性渲染所有图表卡顿。
 *
 * 用法：
 *   const { isVisible, markAllVisible } = useLazyRender(totalCount)
 *
 *   模板中：
 *   <div v-for="(chart, i) in charts" :key="i"
 *        :ref="(el) => setCardRef(i, el as HTMLElement)"
 *        class="chart-card">
 *     <SkeletonChart v-if="!isVisible(i)" />
 *     <RealChart v-else ... />
 *   </div>
 */
export function useLazyRender(totalCount: number) {
    /** 已触发渲染的索引集合 */
    const rendered = ref(new Set<number>())

    /** 是否已全部渲染 */
    const allRendered = ref(false)

    let observer: IntersectionObserver | null = null
    const cardEls = new Map<number, HTMLElement>()

    function isVisible(index: number): boolean {
        if (allRendered.value) return true
        return rendered.value.has(index)
    }

    function markAllVisible() {
        allRendered.value = true
        observer?.disconnect()
        observer = null
    }

    function setCardRef(index: number, el: HTMLElement | null) {
        if (!el) {
            cardEls.delete(index)
            return
        }
        cardEls.set(index, el)
        // 如果 observer 已创建，立即观察新元素
        if (observer && el) {
            observer.observe(el)
        }
    }

    onMounted(() => {
        // 立即渲染前 2 个图表（首屏可见）
        const initial = Math.min(2, totalCount)
        for (let i = 0; i < initial; i++) {
            rendered.value.add(i)
        }
        rendered.value = new Set(rendered.value)

        // 创建 IntersectionObserver 观察后续图表
        observer = new IntersectionObserver(
            (entries) => {
                let changed = false
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        // 从 data-chart-index 获取索引
                        const idx = Number((entry.target as HTMLElement).dataset.chartIndex)
                        if (!isNaN(idx) && !rendered.value.has(idx)) {
                            rendered.value.add(idx)
                            changed = true
                        }
                    }
                }
                if (changed) {
                    rendered.value = new Set(rendered.value)
                    // 如果全部可见，提前标记完成
                    if (rendered.value.size >= totalCount) {
                        allRendered.value = true
                        observer?.disconnect()
                        observer = null
                    }
                }
            },
            {
                rootMargin: '300px 0px', // 提前 300px 开始加载
                threshold: 0.01,
            },
        )

        // 观察已注册的元素
        for (const [idx, el] of cardEls) {
            if (idx >= initial) {
                observer.observe(el)
            }
        }
    })

    onUnmounted(() => {
        observer?.disconnect()
        observer = null
        cardEls.clear()
    })

    return { isVisible, markAllVisible, setCardRef }
}
