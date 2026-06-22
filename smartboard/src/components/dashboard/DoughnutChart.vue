<template>
    <div class="basic-chart-wrap">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div v-if="availableMetrics.length > 1" class="metric-selector">
            <label>指标</label>
            <select v-model="selectedMetric" class="input input-sm metric-select">
                <option v-for="m in availableMetrics" :key="m" :value="m">{{ m }}</option>
            </select>
        </div>
        <div class="chart-container" v-if="option" ref="containerRef">
            <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="width:100%;height:100%"
                ref="chartRef" />
        </div>
        <div v-else class="no-data-msg">暂无数据</div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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

watch(() => props.chart.metric, (v) => { if (v) selectedMetric.value = v })

const effectiveChart = computed<ChartSpec>(() => ({ ...props.chart, metric: selectedMetric.value }))
const displayTitle = computed(() => resolveTitle(props.chart.title, selectedMetric.value ? [selectedMetric.value] : []))
const option = computed(() => buildDoughnutOption(effectiveChart.value, props.rows))

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
</script>
