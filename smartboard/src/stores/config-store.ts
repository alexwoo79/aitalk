import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardConfig, KpiFormItem, ChartFormItem } from '@/types/config'
import { useDataStore } from './data-store'

export const useConfigStore = defineStore('config', () => {
  const config = ref<DashboardConfig>({
    title: '',
    kpis: [],
    filters: [],
    charts: [],
    table: { sortBy: '', topN: 15, columns: [] },
  })

  const dataStore = useDataStore()

  // 自动生成推荐配置
  function generateAutoConfig() {
    const ds = dataStore.dataSet
    if (!ds) return

    // 标题：文件名去掉扩展名
    config.value.title = ds.fileName.replace(/\.[^.]+$/, '') + ' 分析看板'

    // KPI：所有 metric 列，最多 6 个
    const metricCols = ds.headers.filter(
      (h) => ds.classifications[h]?.role === 'metric',
    )
    config.value.kpis = metricCols.slice(0, 6).map((col) => {
      const cls = ds.classifications[col]
      return {
        column: col,
        label: col,
        agg: (cls.format === 'percent' ? 'avg' : 'sum') as 'sum' | 'avg',
        format: cls.format,
        prefix: cls.prefix,
      }
    })

    // 筛选：所有 categorical dimension 列
    config.value.filters = ds.headers.filter(
      (h) => ds.classifications[h]?.role === 'dimension' && ds.classifications[h]?.type === 'categorical',
    )

    // 图表：自动配置（对齐 dashboard_gen.py 逻辑）
    config.value.charts = []
    const dims = ds.chartDimensions
    const primaryMetric = ds.primaryMetric || (metricCols.length > 0 ? metricCols[0] : null)

    // 按维度唯一值数量分类
    for (const dim of dims.slice(0, 3)) {
      const cls = ds.classifications[dim]
      const uniqueCount = cls?.uniqueCount ?? 0

      if (uniqueCount <= 8) {
        // 低基数维度 → doughnut(计数) + bar(主指标)
        config.value.charts.push({
          id: crypto.randomUUID(),
          type: 'doughnut',
          title: `${dim} 占比`,
          dimension: dim,
          metric: 'count',
        })
        if (primaryMetric) {
          config.value.charts.push({
            id: crypto.randomUUID(),
            type: 'bar',
            title: `${dim} 对比`,
            dimension: dim,
            metrics: [primaryMetric],
          })
        }
      } else if (uniqueCount <= 20) {
        // 中基数维度 → horizontal_bar
        config.value.charts.push({
          id: crypto.randomUUID(),
          type: 'horizontal_bar',
          title: `${dim} 排行`,
          dimension: dim,
          metric: primaryMetric || undefined,
          metrics: primaryMetric ? [primaryMetric] : undefined,
        })
      }
    }

    // 主指标 → histogram
    if (primaryMetric) {
      config.value.charts.push({
        id: crypto.randomUUID(),
        type: 'histogram',
        title: `${primaryMetric} 分布`,
        metric: primaryMetric,
      })
    }

    // 日期列 + 主指标 → line 趋势
    const dateCol = ds.headers.find((h) => ds.classifications[h]?.type === 'date')
    if (dateCol && primaryMetric) {
      config.value.charts.push({
        id: crypto.randomUUID(),
        type: 'line',
        title: `${primaryMetric} 月度趋势`,
        dateColumn: dateCol,
        metric: primaryMetric,
      })
    }

    // 最多 6 张基础图表
    config.value.charts = config.value.charts.slice(0, 6)

    // ====== 高级分析图表 ======

    // 时序分析：有日期列 + 主指标
    if (dateCol && primaryMetric) {
      config.value.charts.push({
        id: crypto.randomUUID(),
        type: 'timeseries',
        title: `${primaryMetric} 时序分析`,
        dateColumn: dateCol,
        metric: primaryMetric,
      })
    }

    // 十分位分析：有主指标
    if (primaryMetric) {
      config.value.charts.push({
        id: crypto.randomUUID(),
        type: 'decile',
        title: `${primaryMetric} 十分位分析`,
        metric: primaryMetric,
      })
    }

    // 聚类分析：2+ 指标列
    if (metricCols.length >= 2) {
      config.value.charts.push({
        id: crypto.randomUUID(),
        type: 'cluster',
        title: '聚类分析',
        metrics: metricCols.slice(0, 5),
        clusterMetrics: metricCols.slice(0, 5),
        k: 3,
      })
    }

    // 表格排序
    config.value.table = {
      sortBy: ds.primaryMetric || metricCols[0] || '',
      topN: 15,
      columns: ds.headers.slice(),
    }
  }

  function editTitle(title: string) {
    config.value.title = title
  }

  function addKpi(kpi: KpiFormItem) {
    config.value.kpis.push(kpi)
  }

  function removeKpi(index: number) {
    config.value.kpis.splice(index, 1)
  }

  function updateKpi(index: number, patch: Partial<KpiFormItem>) {
    const kpi = config.value.kpis[index]
    if (kpi) Object.assign(kpi, patch)
  }

  function reorderKpis(fromIndex: number, toIndex: number) {
    const arr = [...config.value.kpis]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    config.value.kpis = arr
  }

  function addChart(chart: ChartFormItem) {
    config.value.charts.push(chart)
  }

  function removeChart(id: string) {
    const idx = config.value.charts.findIndex((c) => c.id === id)
    if (idx !== -1) config.value.charts.splice(idx, 1)
  }

  function updateChart(id: string, updates: Partial<ChartFormItem>) {
    const chart = config.value.charts.find((c) => c.id === id)
    if (chart) Object.assign(chart, updates)
  }

  function reorderCharts(fromIndex: number, toIndex: number) {
    const arr = [...config.value.charts]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    config.value.charts = arr
  }

  function toggleFilter(column: string) {
    const idx = config.value.filters.indexOf(column)
    if (idx !== -1) {
      config.value.filters.splice(idx, 1)
    } else {
      config.value.filters.push(column)
    }
  }

  function toggleTableColumn(column: string) {
    const idx = config.value.table.columns.indexOf(column)
    if (idx !== -1) {
      config.value.table.columns.splice(idx, 1)
    } else {
      config.value.table.columns.push(column)
    }
  }

  function resetConfig() {
    config.value = {
      title: '',
      kpis: [],
      filters: [],
      charts: [],
      table: { sortBy: '', topN: 15, columns: [] },
    }
  }

  const hasData = computed(() => dataStore.dataSet !== null)
  const hasConfig = computed(() => config.value.charts.length > 0)

  return {
    config,
    hasData,
    hasConfig,
    generateAutoConfig,
    editTitle,
    addKpi,
    removeKpi,
    updateKpi,
    reorderKpis,
    addChart,
    removeChart,
    updateChart,
    reorderCharts,
    toggleFilter,
    toggleTableColumn,
    resetConfig,
  }
})
