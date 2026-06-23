<template>
    <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div v-if="availableMetrics.length > 0" class="metric-toggle">
            <button v-for="m in availableMetrics" :key="m" class="period-btn"
                :class="{ active: activeMetrics.includes(m) }" @click="toggleMetric(m)">
                {{ m }}
            </button>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: stacked }" @click="stacked = !stacked" :title="t('chart.toggle.stackTitle')">
                {{ stacked ? t('chart.toggle.stacked') : t('chart.toggle.grouped') }}
            </button>
            <span class="toggle-sep"></span>
            <select v-model="sortOrder" class="input input-xs sort-select">
                <option value="none">{{ t('chart.sort.natural') }}</option>
                <option value="asc">{{ t('chart.sort.ascending') }}</option>
                <option value="desc">{{ t('chart.sort.descending') }}</option>
            </select>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: showLabel }" @click="showLabel = !showLabel" :title="t('chart.toggle.dataLabel')">
                {{ t('common.label') }}
            </button>
        </div>
        <div class="chart-container" v-if="option" ref="containerRef">
            <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="width:100%;height:100%"
                ref="chartRef" />
        </div>
        <div v-else class="no-data-msg">{{ t('chart.selectMetric') }}</div>
    </div>
</template>

<script setup lang="ts">
import {  ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import {  buildBarOption, resolveTitle, buildToolbox } from '@/core/chart-options'
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
    const opt = buildBarOption(effectiveChart.value, props.rows, sortOrder.value, showLabel.value)
    if (opt && Object.keys(opt).length > 0 && opt.toolbox) {
        Object.assign(opt.toolbox.feature, {
            mySaveAsImage: { title: '💾 PNG', show: true, icon: 'path://M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h2v2H8v-2zm0-4h2v2H8v-2zm4 4h2v2h-2v-2zm0-4h2v2h-2v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadPNG(ci) } },
            mySaveCSV: { title: '📄 CSV', show: true, icon: 'path://M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm0 2h7v5h5v11H6V4zm2 4h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadCSV(ci, ci.getOption()) } },
        })
        delete opt.toolbox.feature.saveAsImage
    }
    if (stacked.value && opt.series && Array.isArray(opt.series)) {
        const last = opt.series.length - 1
        opt.series = opt.series.map((s: any, i: number) => ({
            ...s, stack: 'total',
            itemStyle: { ...s.itemStyle, borderRadius: i === last ? [4, 4, 0, 0] : 0 },
        }))
    }
    return opt
})

// ResizeObserver — 卡片拉伸时同步图表大小
const wrapRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
let ro: ResizeObserver | null = null

onMounted(() => {
    if (containerRef.value) {
        ro = new ResizeObserver(() => {
            chartRef.value?.chart?.resize()
        })
        ro.observe(containerRef.value)
    }
})

onUnmounted(() => {
    ro?.disconnect()
})

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
