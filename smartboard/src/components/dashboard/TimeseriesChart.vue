<template>
  <div class="timeseries-chart" style="display:flex;flex-direction:column;flex:1;min-height:0">
    <h3 class="chart-title">{{ displayTitle }}</h3>
    <!-- 指标切换 -->
    <div v-if="activeMetrics.length > 1" class="metric-toggle">
      <button v-for="m in activeMetrics" :key="m" class="period-btn" :class="{ active: selectedMetric === m }"
        @click="selectedMetric = m">
        {{ m }}
      </button>
    </div>
    <!-- 周期切换 -->
    <div class="period-toggle">
      <button v-for="p in periods" :key="p.key" class="period-btn" :class="{ active: period === p.key }"
        @click="period = p.key">
        {{ p.label }}
      </button>
    </div>
    <!-- 图表 -->
    <div class="chart-container" v-if="option">
      <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="flex:1;min-height:200px" />
    </div>
    <div v-else class="no-data-msg">数据不足，无法生成时序分析</div>
    <!-- 信息面板 -->
    <div v-if="tsData" class="ts-info">
      <span>最新: <strong>{{ tsData.labels[tsData.labels.length - 1] }}</strong></span>
      <span>值: <strong>{{ fmtValue(tsData.values[tsData.values.length - 1]) }}</strong></span>
      <template v-if="lastMom != null">
        <span>环比: <strong :style="{ color: lastMom >= 0 ? '#10B981' : '#EF4444' }">
            {{ lastMom >= 0 ? '+' : '' }}{{ lastMom.toFixed(1) }}%</strong>
        </span>
      </template>
      <template v-if="lastYoy != null">
        <span>同比: <strong :style="{ color: lastYoy >= 0 ? '#10B981' : '#EF4444' }">
            {{ lastYoy >= 0 ? '+' : '' }}{{ lastYoy.toFixed(1) }}%</strong>
        </span>
      </template>
      <template v-if="tsData.forecast.values.length > 0">
        <span>下期预测: <strong>{{ fmtValue(tsData.forecast.values[0]) }}</strong></span>
      </template>
      <button class="table-toggle" @click="showTable = !showTable">
        {{ showTable ? '收起明细 ↑' : '展开明细表 ↓' }}
      </button>
    </div>
    <!-- 数据明细表 -->
    <div v-if="showTable && tsData" class="ts-table-wrap">
      <table class="ts-table">
        <thead>
          <tr>
            <th class="ts-th sortable" @click="toggleTableSort('period')">
              周期 {{ tableSortCol === 'period' ? (tableSortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="ts-th sortable" @click="toggleTableSort('value')">
              实际值 {{ tableSortCol === 'value' ? (tableSortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="ts-th">MA3</th>
            <th class="ts-th sortable" @click="toggleTableSort('mom')">
              环比% {{ tableSortCol === 'mom' ? (tableSortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="ts-th sortable" @click="toggleTableSort('yoy')">
              同比% {{ tableSortCol === 'yoy' ? (tableSortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="ts-th">趋势</th>
            <th class="ts-th">预测</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.period">
            <td class="ts-td">{{ row.period }}</td>
            <td class="ts-td ts-num">{{ row.value != null ? fmtValue(row.value) : '—' }}</td>
            <td class="ts-td ts-num">{{ row.ma != null ? fmtValue(row.ma) : '—' }}</td>
            <td class="ts-td ts-num" :style="momStyle(row.mom)">{{ fmtPct(row.mom) }}</td>
            <td class="ts-td ts-num" :style="momStyle(row.yoy)">{{ fmtPct(row.yoy) }}</td>
            <td class="ts-td ts-num">{{ row.trend != null ? fmtValue(row.trend) : '—' }}</td>
            <td class="ts-td ts-num" :class="{ 'ts-forecast': row.forecast != null }">
              {{ row.forecast != null ? fmtValue(row.forecast) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent, DataZoomComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { resolveTitle } from '@/core/chart-options'
import { useTheme } from '@/composables/use-theme'
import { computeTimeseries } from '@/core/analysis'

use([CanvasRenderer, LineChart, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent])

const { theme } = useTheme()

const props = defineProps<{
  rows: Record<string, string | number>[]
  dateColumn: string
  metric: string
  metrics?: string[]
  title?: string
}>()

const COLORS = {
  actual: '#3B82F6',
  ma: '#F59E0B',
  trend: '#6B7280',
  forecast: '#10B981',
}

const periods = [
  { key: 'month' as const, label: '月' },
  { key: 'quarter' as const, label: '季' },
  { key: 'year' as const, label: '年' },
]

const period = ref<'month' | 'quarter' | 'year'>('month')
const selectedMetric = ref(props.metric)
const displayTitle = computed(() => resolveTitle(props.title || '时序分析', selectedMetric.value ? [selectedMetric.value] : []))

// 当 metric/metrics 变化时重置选中指标
watch(() => props.metric, (v) => { selectedMetric.value = v })

const activeMetrics = computed(() =>
  props.metrics && props.metrics.length > 0 ? props.metrics : [props.metric],
)

const tsData = computed(() =>
  computeTimeseries(props.rows, props.dateColumn, selectedMetric.value, period.value),
)

const lastMom = computed(() => {
  if (!tsData.value) return null
  const last = tsData.value.mom[tsData.value.mom.length - 1]
  return last
})

const lastYoy = computed(() => {
  if (!tsData.value) return null
  const last = tsData.value.yoy[tsData.value.yoy.length - 1]
  return last
})

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function fmtValue(n: number): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const option = computed(() => {
  const td = tsData.value
  if (!td || td.labels.length === 0) return null

  const allLabels = [...td.labels, ...td.forecast.labels]
  const actualData = [...td.values, ...new Array(td.forecast.labels.length).fill(null)]
  const maData = [...td.ma, ...new Array(td.forecast.labels.length).fill(null)]
  const trendData = [...td.trend, ...new Array(td.forecast.labels.length).fill(null)]
  const forecastData = new Array(td.labels.length - 1).fill(null) as (number | null)[]
  forecastData.push(td.values[td.values.length - 1])
  td.forecast.values.forEach((v) => forecastData.push(v))

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params
          .filter((p: any) => p.value != null)
          .map((p: any) => `${p.seriesName}: ${fmtValue(p.value)}`)
          .join('<br/>')
      },
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: {
      type: 'category',
      data: allLabels,
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, formatter: (v: number) => fmtCompact(v) },
    },
    dataZoom: [{ type: 'inside' }],
    series: [
      {
        name: '实际值',
        type: 'line',
        data: actualData,
        lineStyle: { color: COLORS.actual, width: 2 },
        itemStyle: { color: COLORS.actual },
        areaStyle: { color: COLORS.actual + '22' },
        smooth: true,
      },
      {
        name: 'MA3',
        type: 'line',
        data: maData,
        lineStyle: { color: COLORS.ma, width: 2, type: 'dashed' },
        itemStyle: { color: COLORS.ma },
        smooth: true,
        symbol: 'none',
      },
      {
        name: '趋势',
        type: 'line',
        data: trendData,
        lineStyle: { color: COLORS.trend, width: 1.5, type: 'dotted' },
        itemStyle: { color: COLORS.trend },
        smooth: false,
        symbol: 'none',
      },
      {
        name: '预测',
        type: 'line',
        data: forecastData,
        lineStyle: { color: COLORS.forecast, width: 2, type: 'dashed' },
        itemStyle: { color: COLORS.forecast },
        smooth: true,
        symbolSize: 6,
      },
    ],
  }
})
// ====== Data table ======
const showTable = ref(false)
const tableSortCol = ref<'period' | 'value' | 'mom' | 'yoy'>('period')
const tableSortDir = ref<'asc' | 'desc'>('desc')

function toggleTableSort(col: 'period' | 'value' | 'mom' | 'yoy') {
  if (tableSortCol.value === col) {
    tableSortDir.value = tableSortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    tableSortCol.value = col
    tableSortDir.value = 'desc'
  }
}

interface TsTableRow {
  period: string
  value: number | null
  ma: number | null
  mom: number | null
  yoy: number | null
  trend: number | null
  forecast: number | null
}

const tableRows = computed<TsTableRow[]>(() => {
  const td = tsData.value
  if (!td) return []

  const rows: TsTableRow[] = []

  // 实际数据行
  for (let i = 0; i < td.labels.length; i++) {
    rows.push({
      period: td.labels[i],
      value: td.values[i],
      ma: td.ma[i],
      mom: td.mom[i],
      yoy: td.yoy[i],
      trend: td.trend[i],
      forecast: null,
    })
  }

  // 预测行
  for (let i = 0; i < td.forecast.labels.length; i++) {
    rows.push({
      period: td.forecast.labels[i] + ' (预测)',
      value: null,
      ma: null,
      mom: null,
      yoy: null,
      trend: null,
      forecast: td.forecast.values[i],
    })
  }

  // 排序
  const col = tableSortCol.value
  const dir = tableSortDir.value === 'desc' ? -1 : 1
  rows.sort((a, b) => {
    if (col === 'period') return String(a.period).localeCompare(String(b.period)) * dir
    const va = a[col] ?? -Infinity
    const vb = b[col] ?? -Infinity
    return (va - vb) * dir
  })

  return rows
})

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

function momStyle(v: number | null): Record<string, string> {
  if (v == null) return {}
  return { color: v >= 0 ? '#10B981' : '#EF4444' }
}
</script>

<style scoped>
.period-toggle {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.metric-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.period-btn {
  padding: 4px 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.period-btn.active {
  background: #3B82F6;
  color: white;
  border-color: #3B82F6;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.ts-info {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ts-info strong {
  color: var(--text-primary);
}

.no-data-msg {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.table-toggle {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-left: 8px;
}

.table-toggle:hover {
  text-decoration: underline;
}

.ts-table-wrap {
  margin-top: 12px;
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.ts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.ts-th {
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--border);
  border-left: 1px dashed var(--border-light);
  font-weight: 600;
  color: var(--text-secondary);
  z-index: 1;
}

.ts-th:first-child {
  border-left: none;
}

.ts-th.sortable {
  cursor: pointer;
}

.ts-th.sortable:hover {
  color: var(--primary);
}

/* 数值列表头右对齐 */
.ts-th:nth-child(n+2) {
  text-align: right;
}

.ts-td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  border-left: 1px dashed var(--border-light);
}

.ts-td:first-child {
  border-left: none;
}

.ts-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ts-forecast {
  color: #10B981;
  font-style: italic;
}

.ts-table tbody tr:hover {
  background: var(--bg-hover);
}
</style>
