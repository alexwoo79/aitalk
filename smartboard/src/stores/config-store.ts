import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardConfig, KpiFormItem, ChartFormItem } from '@/types/config'
import { useDataStore } from './data-store'

export type ConfigSection = 'title' | 'filters' | 'dateColumn' | 'kpis' | 'charts' | 'table' | 'metricDefaults'

export const useConfigStore = defineStore('config', () => {
  const config = ref<DashboardConfig>({
    title: '',
    kpis: [],
    filters: [],
    charts: [],
    table: { sortBy: '', columns: [], summaryAggs: {} },
  })

  const dataStore = useDataStore()

  // 各区域独立保存状态（快照存在 = 曾保存过，对比当前值判断是否 dirty）
  const sectionSnapshots = ref<Partial<Record<ConfigSection, any>>>({})

  // ====== 自动配置的计算基础（供各区域复用） ======
  function _autoBase() {
    const ds = dataStore.dataSet
    if (!ds) return null
    const excluded = dataStore.excludedColumns
    const metricCols = ds.headers.filter(
      (h) => ds.classifications[h]?.role === 'metric' && !excluded.has(h),
    )
    const dims = ds.chartDimensions.filter((d) => !excluded.has(d))
    const primaryMetric = ds.primaryMetric && !excluded.has(ds.primaryMetric)
      ? ds.primaryMetric
      : (metricCols.length > 0 ? metricCols[0] : null)
    const dateCol = ds.headers.find((h) => ds.classifications[h]?.type === 'date' && !excluded.has(h))
    return { ds, excluded, metricCols, dims, primaryMetric, dateCol }
  }

  // ====== 各区域独立自动生成 ======

  function generateAutoTitle() {
    const base = _autoBase()
    if (!base) return
    config.value.title = base.ds.fileName.replace(/\.[^.]+$/, '') + ' 分析看板'
  }

  function generateAutoFilters() {
    const base = _autoBase()
    if (!base) return
    config.value.filters = base.ds.headers.filter(
      (h) => base.ds.classifications[h]?.role === 'dimension' && base.ds.classifications[h]?.type === 'categorical' && !base.excluded.has(h),
    )
  }

  function generateAutoKpis() {
    const base = _autoBase()
    if (!base) return
    config.value.kpis = base.metricCols.slice(0, 6).map((col) => {
      const cls = base.ds.classifications[col]
      return {
        column: col,
        label: col,
        agg: (cls.format === 'percent' ? 'avg' : 'sum') as 'sum' | 'avg',
        format: 'global',
        prefix: cls.prefix,
      }
    })
  }

  function generateAutoCharts() {
    const base = _autoBase()
    if (!base) return
    const { ds, metricCols, dims, primaryMetric, dateCol } = base
    const charts: ChartFormItem[] = []

    for (const dim of dims.slice(0, 3)) {
      const cls = ds.classifications[dim]
      const uniqueCount = cls?.uniqueCount ?? 0
      if (uniqueCount <= 8) {
        charts.push({ id: crypto.randomUUID(), type: 'doughnut', title: `${dim} 占比`, dimension: dim, metric: 'count' })
        if (primaryMetric) {
          charts.push({ id: crypto.randomUUID(), type: 'bar', title: `${dim} 对比`, dimension: dim, metrics: [primaryMetric] })
        }
      } else if (uniqueCount <= 20) {
        charts.push({ id: crypto.randomUUID(), type: 'horizontal_bar', title: `${dim} 排行`, dimension: dim, metric: primaryMetric || undefined, metrics: primaryMetric ? [primaryMetric] : undefined })
      }
    }
    if (primaryMetric) {
      charts.push({ id: crypto.randomUUID(), type: 'histogram', title: '{metric} 分布', metric: primaryMetric })
    }
    if (dateCol && primaryMetric) {
      charts.push({ id: crypto.randomUUID(), type: 'line', title: '{metric} 月度趋势', dateColumn: dateCol, metric: primaryMetric })
    }
    // 基础图表最多 6 张
    const basic = charts.slice(0, 6)

    // 高级分析
    if (dateCol && primaryMetric) {
      basic.push({ id: crypto.randomUUID(), type: 'timeseries', title: '{metric} 时序分析', dateColumn: dateCol, metric: primaryMetric })
    }
    if (primaryMetric) {
      basic.push({ id: crypto.randomUUID(), type: 'decile', title: '{metric} 十分位分析', metric: primaryMetric })
    }
    if (metricCols.length >= 2) {
      basic.push({ id: crypto.randomUUID(), type: 'cluster', title: '聚类分析', metrics: metricCols.slice(0, 5), clusterMetrics: metricCols.slice(0, 5), k: 3 })
    }
    config.value.charts = basic
  }

  function generateAutoTable() {
    const base = _autoBase()
    if (!base) return
    const { ds, metricCols, excluded } = base
    const cols = ds.headers.filter((h) => !excluded.has(h))
    // 预设合计：数值列默认求和，维度/日期列默认唯一计数
    const summaryAggs: Record<string, string> = {}
    for (const h of cols) {
      const cls = ds.classifications[h]
      if (cls?.type === 'numeric') summaryAggs[h] = 'sum'
      else if (cls?.role === 'dimension' || cls?.type === 'date') summaryAggs[h] = 'unique_count'
    }
    config.value.table = {
      sortBy: (ds.primaryMetric && !excluded.has(ds.primaryMetric) ? ds.primaryMetric : metricCols[0]) || '',
      columns: cols,
      summaryAggs: summaryAggs as Record<string, 'sum' | 'avg' | 'count' | 'unique_count' | 'min' | 'max'>,
    }
  }

  function generateAutoLayout() {
    const layout: any[] = []
    let y = 0
    // KPIs: 每行最多 4 个
    const kpis = config.value.kpis
    for (let i = 0; i < kpis.length; i++) {
      const col = i % 4
      layout.push({ i: `kpi-${i}`, x: col * 3, y: Math.floor(i / 4), w: 3, h: 2, minW: 2, minH: 2 })
    }
    y = Math.ceil(kpis.length / 4)
    // Charts: 基础图表宽 6，分析图表宽 12
    const charts = config.value.charts
    let chartY = y
    for (let i = 0; i < charts.length; i++) {
      const isAnalysis = ['timeseries', 'decile', 'cluster', 'line'].includes(charts[i].type)
      if (isAnalysis) {
        layout.push({ i: `chart-${i}`, x: 0, y: chartY, w: 12, h: 5, minW: 6, minH: 4 })
        chartY += 5
      } else {
        const col = i % 2
        layout.push({ i: `chart-${i}`, x: col * 6, y: chartY, w: 6, h: 4, minW: 3, minH: 3 })
        if (col === 1) chartY += 4
      }
    }
    config.value.layout = layout
  }

  // 全部自动生成（兼容旧接口）
  function generateAutoConfig() {
    generateAutoTitle()
    generateAutoFilters()
    generateAutoKpis()
    generateAutoCharts()
    generateAutoTable()
    generateAutoLayout()
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
    if (!kpi) return
    Object.assign(kpi, patch)
    // 如果 patch 显式设为 undefined，删除旧属性
    if ('formula' in patch && patch.formula === undefined) {
      delete (kpi as any).formula
    }
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

  /** 设置/清除列背景色 */
  function setColumnColor(column: string, color: string) {
    if (!config.value.table.columnColors) {
      config.value.table.columnColors = {}
    }
    if (color) {
      config.value.table.columnColors[column] = color
    } else {
      delete config.value.table.columnColors[column]
    }
  }

  /** 设置/清除列字体色 */
  function setColumnTextColor(column: string, color: string) {
    if (!config.value.table.columnTextColors) {
      config.value.table.columnTextColors = {}
    }
    if (color) {
      config.value.table.columnTextColors[column] = color
    } else {
      delete config.value.table.columnTextColors[column]
    }
  }

  /** 添加行条件颜色规则 */
  function addRowConditionColor(rule: { condition: string; color: string; textColor?: string }) {
    if (!config.value.table.rowConditionColors) {
      config.value.table.rowConditionColors = []
    }
    config.value.table.rowConditionColors.push(rule)
  }

  /** 移除行条件颜色规则 */
  function removeRowConditionColor(index: number) {
    config.value.table.rowConditionColors?.splice(index, 1)
  }

  /** 设置底部汇总行聚合函数 */
  function setSummaryAgg(col: string, agg: 'sum' | 'avg' | 'count' | 'unique_count' | 'min' | 'max' | '') {
    if (!config.value.table.summaryAggs) {
      config.value.table.summaryAggs = {}
    }
    if (!agg) {
      delete config.value.table.summaryAggs[col]
    } else {
      config.value.table.summaryAggs[col] = agg
    }
  }

  /** 添加/更新列条件字体色规则 */
  function setColumnTextRule(column: string, index: number, rule: { condition: string; color: string }) {
    if (!config.value.table.columnTextRules) {
      config.value.table.columnTextRules = {}
    }
    if (!config.value.table.columnTextRules[column]) {
      config.value.table.columnTextRules[column] = []
    }
    const arr = config.value.table.columnTextRules[column]
    if (index >= arr.length) {
      arr.push({ condition: rule.condition, color: rule.color })
    } else {
      arr[index] = { condition: rule.condition, color: rule.color }
    }
  }

  /** 移除列条件字体色规则 */
  function removeColumnTextRule(column: string, index: number) {
    config.value.table.columnTextRules?.[column]?.splice(index, 1)
    if (config.value.table.columnTextRules?.[column]?.length === 0) {
      delete config.value.table.columnTextRules[column]
    }
  }

  function resetConfig() {
    config.value = {
      title: '',
      kpis: [],
      filters: [],
      charts: [],
      table: { sortBy: '', columns: [], summaryAggs: {} },
    }
    sectionSnapshots.value = {}
  }

  // ====== 各区域独立保存/重置 ======

  const sectionGetters: Record<ConfigSection, () => any> = {
    title: () => config.value.title,
    filters: () => [...config.value.filters],
    dateColumn: () => config.value.dateColumns ? [...config.value.dateColumns] : [],
    kpis: () => JSON.parse(JSON.stringify(config.value.kpis)),
    charts: () => JSON.parse(JSON.stringify(config.value.charts)),
    table: () => JSON.parse(JSON.stringify(config.value.table)),
    metricDefaults: () => config.value.metricDefaults ? JSON.parse(JSON.stringify(config.value.metricDefaults)) : {},
  }

  const sectionSetters: Record<ConfigSection, (data: any) => void> = {
    title: (v) => { config.value.title = v },
    filters: (v) => { config.value.filters = v },
    dateColumn: (v) => { config.value.dateColumns = v && v.length > 0 ? v : undefined },
    kpis: (v) => { config.value.kpis = v },
    charts: (v) => { config.value.charts = v },
    table: (v) => { config.value.table = v },
    metricDefaults: (v) => { config.value.metricDefaults = Object.keys(v).length > 0 ? v : undefined },
  }

  const sectionAutoGens: Record<ConfigSection, () => void> = {
    title: generateAutoTitle,
    filters: generateAutoFilters,
    dateColumn: () => { config.value.dateColumns = undefined },
    kpis: generateAutoKpis,
    charts: generateAutoCharts,
    table: generateAutoTable,
    metricDefaults: () => { config.value.metricDefaults = undefined },
  }

  /** 保存/解除单个区域（toggle） */
  function saveSection(section: ConfigSection) {
    if (isSectionSaved(section)) {
      // 已保存 → 解除保存
      delete sectionSnapshots.value[section]
    } else {
      // 未保存 → 保存快照
      sectionSnapshots.value[section] = sectionGetters[section]()
    }
  }

  /** 恢复单个区域到上次保存 */
  function restoreSection(section: ConfigSection) {
    if (sectionSnapshots.value[section] !== undefined) {
      sectionSetters[section](JSON.parse(JSON.stringify(sectionSnapshots.value[section])))
    }
  }

  /** 重置单个区域为自动推荐 */
  function resetSectionToAuto(section: ConfigSection) {
    sectionAutoGens[section]()
    delete sectionSnapshots.value[section]
  }

  /** 检查区域是否已保存（有快照且当前值与快照一致） */
  function isSectionSaved(section: ConfigSection): boolean {
    const snap = sectionSnapshots.value[section]
    if (snap === undefined) return false
    return JSON.stringify(sectionGetters[section]()) === JSON.stringify(snap)
  }

  /** 全部保存/解除 */
  function saveAll() {
    const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'metricDefaults']
    if (sections.every((s) => isSectionSaved(s))) {
      // 全部已保存 → 全部解除
      sectionSnapshots.value = {}
    } else {
      for (const sec of sections) {
        sectionSnapshots.value[sec] = sectionGetters[sec]()
      }
    }
  }

  /** 全部重置为自动 */
  function resetAllToAuto() {
    sectionSnapshots.value = {}
    generateAutoConfig()
  }

  const hasData = computed(() => dataStore.dataSet !== null)
  const hasConfig = computed(() => config.value.charts.length > 0)
  const hasSnapshot = computed(() => sectionSnapshots.value !== null)

  return {
    config,
    sectionSnapshots,
    hasData,
    hasConfig,
    generateAutoConfig,
    saveSection,
    restoreSection,
    resetSectionToAuto,
    isSectionSaved,
    saveAll,
    resetAllToAuto,
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
    setColumnColor,
    setColumnTextColor,
    setColumnTextRule,
    removeColumnTextRule,
    addRowConditionColor,
    removeRowConditionColor,
    setSummaryAgg,
    resetConfig,
  }
})
