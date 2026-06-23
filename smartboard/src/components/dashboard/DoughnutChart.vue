<template>
    <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div class="metric-toggle">
            <select v-if="availableMetrics.length > 1" v-model="selectedMetric" class="input input-sm metric-select">
                <option v-for="m in availableMetrics" :key="m" :value="m">{{ m }}</option>
            </select>
            <span v-if="availableMetrics.length > 1" class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: showLabel }" @click="showLabel = !showLabel" :title="t('chart.toggle.dataLabel')">
                {{ t('common.label') }}
            </button>
        </div>
        <div class="chart-container" v-if="option" ref="containerRef">
            <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="width:100%;height:100%"
                ref="chartRef" />
        </div>
        <div v-else class="no-data-msg">{{ t('common.noData') }}</div>
    </div>
</template>

<script setup lang="ts">
import {  ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import {  buildDoughnutOption, resolveTitle, buildToolbox } from '@/core/chart-options'
import {  useChartDownload } from '@/composables/use-chart-download'
import {  useTheme } from '@/composables/use-theme'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { theme } = useTheme()
const { downloadPNG, downloadCSV } = useChartDownload()

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
    void (theme.value)
    const opt = buildDoughnutOption(effectiveChart.value, props.rows, showLabel.value)
    if (opt && Object.keys(opt).length > 0 && opt.toolbox) {
        Object.assign(opt.toolbox.feature, {
            mySaveAsImage: { title: '💾 PNG', show: true, icon: 'path://M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h2v2H8v-2zm0-4h2v2H8v-2zm4 4h2v2h-2v-2zm0-4h2v2h-2v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadPNG(ci) } },
            mySaveCSV: { title: '📄 CSV', show: true, icon: 'path://M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm0 2h7v5h5v11H6V4zm2 4h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadCSV(ci, ci.getOption()) } },
        })
        delete opt.toolbox.feature.saveAsImage
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
