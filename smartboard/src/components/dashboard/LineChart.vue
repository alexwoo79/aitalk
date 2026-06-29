<template>
    <div class="basic-chart-wrap" ref="wrapRef" :class="{ 'is-fullscreen': isFullscreen }" @dblclick="toggleFullscreen">
        <h3 class="chart-title">{{ displayTitle }}</h3>
        <div v-if="availableMetrics.length > 0" class="metric-toggle">
            <button v-for="m in availableMetrics" :key="m" class="period-btn"
                :class="{ active: activeMetrics.includes(m) }" @click="toggleMetric(m)">
                {{ m }}
            </button>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: showArea }" @click="showArea = !showArea" :title="t('chart.toggle.areaTitle')">
                {{ showArea ? t('chart.toggle.area') : t('chart.toggle.line') }}
            </button>
            <span class="toggle-sep"></span>
            <button class="period-btn" :class="{ active: smooth }" @click="smooth = !smooth" :title="t('chart.toggle.smoothTitle')">
                {{ smooth ? t('chart.toggle.smooth') : t('chart.toggle.sharp') }}
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
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { buildLineOption, resolveTitle, buildToolbox } from '@/core/chart-options'
import { useChartDownload } from '@/composables/use-chart-download'
import { useTheme } from '@/composables/use-theme'
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
const showArea = ref(true)
const smooth = ref(true)

function toggleMetric(m: string) {
    if (activeMetrics.value.includes(m)) {
        if (activeMetrics.value.length > 1) activeMetrics.value = activeMetrics.value.filter(v => v !== m)
    } else {
        activeMetrics.value = [...activeMetrics.value, m]
    }
}

const effectiveChart = computed<ChartSpec>(() => ({ ...props.chart, metrics: activeMetrics.value, metric: activeMetrics.value[0] }))
const displayTitle = computed(() => resolveTitle(props.chart.title, activeMetrics.value))
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const containerRef = ref<HTMLElement | null>(null)
let _chartRo: ResizeObserver | null = null
let _chartPrevW = 0, _chartPrevH = 0

onMounted(() => {
    const el = containerRef.value
    if (!el) return
    _chartRo = new ResizeObserver(() => {
        if (!containerRef.value) return
        const w = containerRef.value.offsetWidth
        const h = containerRef.value.offsetHeight
        if (Math.abs(w - _chartPrevW) < 1.5 && Math.abs(h - _chartPrevH) < 1.5) return
        _chartPrevW = w
        _chartPrevH = h
        chartRef.value?.chart?.resize()
    })
    _chartRo.observe(el)
})

onUnmounted(() => {
    _chartRo?.disconnect()
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

const option = computed(() => {
    const opt = buildLineOption(effectiveChart.value, props.rows, showArea.value, smooth.value)
    if (opt && Object.keys(opt).length > 0 && opt.toolbox) {
        Object.assign(opt.toolbox.feature, {
            mySaveAsImage: { title: '💾 PNG', show: true, icon: 'path://M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h2v2H8v-2zm0-4h2v2H8v-2zm4 4h2v2h-2v-2zm0-4h2v2h-2v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadPNG(ci) } },
            mySaveCSV: { title: '📄 CSV', show: true, icon: 'path://M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm0 2h7v5h5v11H6V4zm2 4h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z', onclick: () => { const ci = chartRef.value?.chart; if (ci) downloadCSV(ci, ci.getOption()) } },
        })
        delete opt.toolbox.feature.saveAsImage
    }
    return opt
})
</script>
