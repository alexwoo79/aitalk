<template>
  <div class="decile-chart" style="display:flex;flex-direction:column;flex:1;min-height:0">
    <!-- 指标选择 -->
    <div v-if="activeMetrics.length > 1" class="metric-selector">
      <label>分析指标</label>
      <select v-model="selectedMetric" class="metric-select">
        <option v-for="m in activeMetrics" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
    <div class="chart-container" v-if="option">
      <v-chart :option="option" :theme="theme === 'dark' ? 'dark' : ''" autoresize style="flex:1;min-height:200px" />
    </div>
    <div v-else class="no-data-msg">数据不足，无法生成十分位分析</div>
    <!-- 展开明细 -->
    <div v-if="decData" class="dec-actions">
      <button class="table-toggle" @click="showTable = !showTable">
        {{ showTable ? '收起明细 ↑' : '展开明细表 ↓' }}
      </button>
    </div>
    <div v-if="showTable && decData" class="dec-table-wrap">
      <table class="dec-table">
        <thead>
          <tr>
            <th class="dec-th sortable" @click="toggleSort('label')">
              分组 {{ sortCol === 'label' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('count')">
              数量 {{ sortCol === 'count' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('sum')">
              合计 {{ sortCol === 'sum' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th sortable" @click="toggleSort('avg')">
              平均 {{ sortCol === 'avg' ? (sortDir === 'desc' ? '↓' : '↑') : '' }}
            </th>
            <th class="dec-th">范围</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.label">
            <td class="dec-td">{{ row.label }}</td>
            <td class="dec-td dec-num">{{ row.count }}</td>
            <td class="dec-td dec-num">{{ fmtValue(row.sum) }}</td>
            <td class="dec-td dec-num">{{ fmtValue(row.avg) }}</td>
            <td class="dec-td">{{ row.range }}</td>
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
import { BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useTheme } from '@/composables/use-theme'
import { computeDeciles } from '@/core/analysis'

use([CanvasRenderer, BarChart, LineChart, TooltipComponent, LegendComponent, GridComponent])

const { theme } = useTheme()

const props = defineProps<{
  rows: Record<string, string | number>[]
  metric: string
  metrics?: string[]
}>()

const selectedMetric = ref(props.metric)
watch(() => props.metric, (v) => { selectedMetric.value = v })

const activeMetrics = computed(() =>
  props.metrics && props.metrics.length > 0 ? props.metrics : [props.metric],
)

const decData = computed(() => computeDeciles(props.rows, selectedMetric.value))

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function fmtValue(n: number): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const option = computed(() => {
  const dd = decData.value
  if (!dd || dd.labels.length === 0) return null

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        return params.map((p: any) => `${p.seriesName}: ${fmtValue(p.value)}`).join('<br/>')
      },
    },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 60, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dd.labels,
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        position: 'left',
        name: '合计',
        axisLabel: { fontSize: 10, formatter: (v: number) => fmtCompact(v) },
      },
      {
        type: 'value',
        position: 'right',
        name: '数量',
        splitLine: { show: false },
        axisLabel: { fontSize: 10 },
      },
    ],
    series: [
      {
        name: '合计',
        type: 'bar',
        yAxisIndex: 0,
        data: dd.sums,
        itemStyle: { color: '#3B82F6', borderRadius: [3, 3, 0, 0] },
        z: 2,
      },
      {
        name: '数量',
        type: 'line',
        yAxisIndex: 1,
        data: dd.counts,
        lineStyle: { color: '#EF4444', width: 2 },
        itemStyle: { color: '#EF4444' },
        smooth: true,
        symbolSize: 8,
        z: 1,
      },
    ],
  }
})
// ====== Data table ======
const showTable = ref(false)
const sortCol = ref<'label' | 'count' | 'sum' | 'avg'>('label')
const sortDir = ref<'asc' | 'desc'>('asc')

function toggleSort(col: 'label' | 'count' | 'sum' | 'avg') {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortCol.value = col
    sortDir.value = col === 'label' ? 'asc' : 'desc'
  }
}

interface DecRow { label: string; count: number; sum: number; avg: number; range: string }

const tableRows = computed<DecRow[]>(() => {
  const dd = decData.value
  if (!dd) return []

  const rows: DecRow[] = dd.labels.map((lbl, i) => ({
    label: lbl,
    count: dd.counts[i],
    sum: dd.sums[i],
    avg: dd.avgs[i],
    range: dd.ranges[i],
  }))

  const col = sortCol.value
  const dir = sortDir.value === 'desc' ? -1 : 1
  rows.sort((a, b) => {
    if (col === 'label') return a.label.localeCompare(b.label) * dir
    return (a[col] - b[col]) * dir
  })

  return rows
})
</script>

<style scoped>
.metric-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.metric-selector label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.metric-select {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-primary);
  min-width: 120px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.dec-actions {
  margin-top: 10px;
}

.table-toggle {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.table-toggle:hover {
  text-decoration: underline;
}

.dec-table-wrap {
  margin-top: 10px;
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.dec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}

.dec-th {
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

.dec-th:first-child {
  border-left: none;
}

.dec-th:nth-child(n+2) {
  text-align: right;
}

.dec-th.sortable {
  cursor: pointer;
}

.dec-th.sortable:hover {
  color: var(--primary);
}

.dec-td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  border-left: 1px dashed var(--border-light);
}

.dec-td:first-child {
  border-left: none;
}

.dec-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dec-table tbody tr:hover {
  background: var(--bg-hover);
}

.no-data-msg {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
