<template>
    <div class="chart-container">
        <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="flex:1;min-height:200px" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { ChartSpec } from '@/types/spec'
import { buildBarOption } from '@/core/chart-options'
import { useTheme } from '@/composables/use-theme'

const { theme } = useTheme()

const props = defineProps<{
    chart: ChartSpec
    rows: Record<string, string | number>[]
}>()

const option = computed(() => buildBarOption(props.chart, props.rows))
</script>
