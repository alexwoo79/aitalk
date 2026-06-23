<template>
    <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div v-if="availableMetrics.length > 0" class="metric-toggle">
            <button v-for="m in availableMetrics" :key="m" class="period-btn"
                :class="{ active: activeMetrics.includes(m) }" @click="toggleMetric(m)">
                {{ m }}
            </button>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: stacked }" @click="stacked = !stacked" title="切换堆叠 / 分组">
                {{ stacked ? '◫ 堆叠' : '▦ 分组' }}
            </button>
            <span class="toggle-sep"></span>
            <select v-model="sortOrder" class="input input-xs sort-select">
                <option value="none">自然</option>
                <option value="asc">升序</option>
                <option value="desc">降序</option>
            </select>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: showLabel }" @click="showLabel = !showLabel" title="数据标签">
                标签
            </button>
        </div>
        <div class="chart-container" v-if="option" ref="containerRef">
            <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="width:100%;height:100%"
                ref="chartRef" />
        </div>
        <div v-else class="no-data-msg">暂无数据</div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import { buildHorizontalBarOption, resolveTitle } from '@/core/chart-options'
import { useTheme } from '@/composables/use-theme'

const { theme } = useTheme()

const props = defineProps<{
    chart: ChartSpec
    rows: Record<string, string | number>[]
    availableMetrics: string[]
}>()

const configured = computed(() =>
    props.chart.metrics?.length ? props.chart.metrics : (props.chart.metric ? [props.chart.metric] : [])
)
const activeMetrics = ref<string[]>([...configured.value])
const stacked = ref(false)
const sortOrder = ref<'none' | 'asc' | 'desc'>('none')
const showLabel = ref(true)

function toggleMetric(m: string) {
    if (activeMetrics.value.includes(m)) {
        if (activeMetrics.value.length > 1) activeMetrics.value = activeMetrics.value.filter(v => v !== m)
    } else {
        activeMetrics.value = [...activeMetrics.value, m]
    }
}

const effectiveChart = computed<ChartSpec>(() => ({ ...props.chart, metrics: activeMetrics.value }))
const displayTitle = computed(() => resolveTitle(props.chart.title, activeMetrics.value))
const option = computed(() => {
    const opt = buildHorizontalBarOption(effectiveChart.value, props.rows, sortOrder.value, showLabel.value)
    if (stacked.value && opt.series && Array.isArray(opt.series)) {
        opt.series = opt.series.map((s: any) => ({ ...s, stack: 'total' }))
    }
    return opt
})

const wrapRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
let ro: ResizeObserver | null = null

onMounted(() => {
    if (containerRef.value) {
        ro = new ResizeObserver(() => chartRef.value?.chart?.resize())
        ro.observe(containerRef.value)
    }
})

onUnmounted(() => { ro?.disconnect() })

const isFullscreen = ref(false)

function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value
    if (isFullscreen.value) {
        document.addEventListener('keydown', onFullscreenEsc)
    } else {
        document.removeEventListener('keydown', onFullscreenEsc)
        nextTick(() => { chartRef.value?.chart?.resize() })
    }
}
function onFullscreenEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') { isFullscreen.value = false; document.removeEventListener('keydown', onFullscreenEsc); nextTick(() => { chartRef.value?.chart?.resize() }) }
}
</script>
