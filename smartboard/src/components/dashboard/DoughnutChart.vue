<template>
    <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div class="metric-toggle">
            <select v-if="availableMetrics.length > 1" v-model="selectedMetric" class="input input-sm metric-select">
                <option v-for="m in availableMetrics" :key="m" :value="m">{{ m }}</option>
            </select>
            <span v-if="availableMetrics.length > 1" class="toggle-sep"></span>
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
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import { buildDoughnutOption, resolveTitle } from '@/core/chart-options'
import { useTheme } from '@/composables/use-theme'

const { theme } = useTheme()

const props = defineProps<{
    chart: ChartSpec
    rows: Record<string, string | number>[]
    availableMetrics: string[]
}>()

const defaultMetric = props.chart.metric || props.chart.metrics?.[0] || props.availableMetrics[0] || ''
const selectedMetric = ref(defaultMetric)
const showLabel = ref(true)

watch(() => props.chart.metric, (v) => { if (v) selectedMetric.value = v })

const effectiveChart = computed<ChartSpec>(() => ({ ...props.chart, metric: selectedMetric.value }))
const displayTitle = computed(() => resolveTitle(props.chart.title, selectedMetric.value ? [selectedMetric.value] : []))
const option = computed(() => {
  void (theme.value) // react to theme changes so graphic fill color recomputes
  return buildDoughnutOption(effectiveChart.value, props.rows, showLabel.value)
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
