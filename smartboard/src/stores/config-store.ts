import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DashboardConfig, KpiFormItem, ChartFormItem } from '@/types/config'
import { useDataStore } from './data-store'
import i18n from '@/i18n'

const t = i18n.global.t

export type ConfigSection = 'title' | 'filters' | 'dateColumn' | 'kpis' | 'charts' | 'table' | 'computedCols'

function normalizePreviewDevice(mode: unknown): 'desktop' | 'tablet' | 'mobile' {
  if (mode === 'tablet' || mode === 'mobile') return mode
  return 'desktop'
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<DashboardConfig>({
    title: '',
    previewDevice: 'desktop',
    kpis: [],
    filters: [],
    charts: [],
    table: { sortBy: '', columns: [], summaryAggs: {} },
  })

  const dataStore = useDataStore()

  // 各区域独立保存状态（快照存在 = 曾保存过，对比当前值判断是否 dirty）
  const sectionSnapshots = ref<Partial<Record<ConfigSection, any>>>({})

  // ====== 自动配置的计算基础（供各区域复用） ======
  function _effRole(col: string): string {
    const override = dataStore.roleOverrides[col]
    if (override) return override
    // 跨表列：优先用 getEffectiveClassification 查找所有表的分类
    const cls = dataStore.getEffectiveClassification(col)
    if (cls?.role) return cls.role
    return dataStore.dataSet?.classifications[col]?.role || 'ignore'
  }

  function _autoBase() {
    const ds = dataStore.dataSet
    if (!ds) return null
    const excluded = dataStore.excludedColumns
    // Phase 4: 有关联表时使用跨表合并后的有效列头
    const headers = dataStore.hasRelations
      ? dataStore.effectiveHeaders
      : ds.headers
    const metricCols = headers.filter((h) => _effRole(h) === 'metric' && !excluded.has(h))
    const dimCols = headers.filter((h) => _effRole(h) === 'dimension' && !excluded.has(h))
    const dims = dimCols.length > 0 ? dimCols : ds.chartDimensions.filter((d) => !excluded.has(d))
    const primaryMetric = ds.primaryMetric && !excluded.has(ds.primaryMetric)
      ? ds.primaryMetric
      : (metricCols.length > 0 ? metricCols[0] : null)
    const dateCol = headers.find((h) => {
      const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
      return cls?.type === 'date' && !excluded.has(h)
    })
    return { ds, excluded, metricCols, dims, primaryMetric, dateCol }
  }

  // ====== 各区域独立自动生成 ======

  function generateAutoTitle() {
    const base = _autoBase()
    if (!base) return
    config.value.title = t('config.autoTitle', { name: base.ds.fileName.replace(/\.[^.]+$/, '') })
  }

  function generateAutoFilters() {
    const base = _autoBase()
    if (!base) return
    // 所有有效角色为 dimension 的列都作为筛选项（含用户手动覆盖的）
    config.value.filters = base.ds.headers.filter(
      (h) => _effRole(h) === 'dimension' && !base.excluded.has(h),
    )
  }

  function generateAutoKpis() {
    const base = _autoBase()
    if (!base) return
    config.value.kpis = base.metricCols.slice(0, 6).map((col) => {
      const cls = dataStore.getEffectiveClassification(col) || base.ds.classifications[col]
      const defaultAgg = cls?.format === 'percent' ? 'avg'
        : cls?.type === 'numeric' ? 'sum'
          : 'unique_count'
      return {
        column: col,
        label: col,
        agg: defaultAgg as 'sum' | 'avg' | 'unique_count',
        format: 'global',
        prefix: cls?.prefix,
        selected: true,
      }
    })
  }

  function generateAutoCharts() {
    const base = _autoBase()
    if (!base) return
    const { ds, metricCols, dims, primaryMetric, dateCol } = base
    const charts: ChartFormItem[] = []

    for (const dim of dims.slice(0, 3)) {
      const cls = dataStore.getEffectiveClassification(dim) || ds.classifications[dim]
      const uniqueCount = cls?.uniqueCount ?? 0
      if (uniqueCount <= 8) {
        charts.push({ id: crypto.randomUUID(), type: 'doughnut', title: t('config.autoChart.proportion', { dim }), dimension: dim, metric: 'count' })
        if (primaryMetric) {
          charts.push({ id: crypto.randomUUID(), type: 'bar', title: t('config.autoChart.comparison', { dim }), dimension: dim, metrics: [primaryMetric] })
        }
      } else if (uniqueCount <= 20) {
        charts.push({ id: crypto.randomUUID(), type: 'horizontal_bar', title: t('config.autoChart.ranking', { dim }), dimension: dim, metric: primaryMetric || undefined, metrics: primaryMetric ? [primaryMetric] : undefined })
      }
    }
    if (primaryMetric) {
      charts.push({ id: crypto.randomUUID(), type: 'histogram', title: t('config.autoChart.distribution', { metric: primaryMetric }), metric: primaryMetric })
    }
    if (dateCol && primaryMetric) {
      charts.push({ id: crypto.randomUUID(), type: 'line', title: t('config.autoChart.monthlyTrend', { metric: primaryMetric }), dateColumn: dateCol, metric: primaryMetric })
    }
    // 基础图表最多 6 张
    const basic = charts.slice(0, 6)

    // 高级分析
    if (dateCol && primaryMetric) {
      basic.push({ id: crypto.randomUUID(), type: 'timeseries', title: t('config.autoChart.timeseries', { metric: primaryMetric }), dateColumn: dateCol, metric: primaryMetric })
    }
    if (primaryMetric) {
      basic.push({ id: crypto.randomUUID(), type: 'decile', title: t('config.autoChart.decile', { metric: primaryMetric }), metric: primaryMetric })
    }
    if (metricCols.length >= 2) {
      basic.push({ id: crypto.randomUUID(), type: 'cluster', title: t('config.autoChart.cluster'), metrics: metricCols.slice(0, 5), clusterMetrics: metricCols.slice(0, 5), k: 3 })
    }
    config.value.charts = basic.map((c) => ({ ...c, selected: true }))
  }

  function generateAutoTable() {
    const base = _autoBase()
    if (!base) return
    const { ds, metricCols, excluded, primaryMetric } = base
    // Phase 4: 有关联表时使用跨表合并后的列头，确保与 Dashboard 显示一致
    const effectiveHeaders = dataStore.hasRelations
      ? dataStore.effectiveHeaders.filter((h) => !excluded.has(h))
      : ds.headers.filter((h) => !excluded.has(h))
    const cols = effectiveHeaders
    // 预设合计：数值列默认求和，维度/日期列默认唯一计数
    const summaryAggs: Record<string, string> = {}
    for (const h of cols) {
      const cls = dataStore.getEffectiveClassification(h) || ds.classifications[h]
      if (cls?.type === 'numeric') summaryAggs[h] = 'sum'
      else if (cls?.role === 'dimension' || cls?.type === 'date') summaryAggs[h] = 'unique_count'
    }
    // 预设占比计算列（基于主指标，受高级数据定义 toggle 控制）
    const maybeCC: any[] = []
    if (primaryMetric && localStorage.getItem('smartboard-advanced-config') === '1') {
      const ratioName = t('config.presetRatioCol')
      const existing = config.value.table?.computedColumns || []
      const hasRatio = existing.some(c => c.name === ratioName)
      if (!hasRatio) {
        maybeCC.push({
          name: ratioName,
          selected: true,
          variables: [{ alias: 'A', column: primaryMetric }],
          expression: 'A/SUM(A)',
        })
        // 占比列默认在表格显示
        if (!cols.includes(ratioName)) cols.push(ratioName)
        // 占比列默认汇总=求和
        summaryAggs[ratioName] = 'sum'
        // 占比列默认格式：百分比，2位小数
        if (!config.value.table) config.value.table = {} as any
        if (!config.value.table.columnFormats) config.value.table.columnFormats = {}
        config.value.table.columnFormats[ratioName] = { format: 'percent', decimals: 2 }
      } else {
        // 已存在则恢复默认选中状态
        const ratioCol = existing.find(c => c.name === ratioName)
        if (ratioCol) ratioCol.selected = true
        if (!cols.includes(ratioName)) cols.push(ratioName)
        summaryAggs[ratioName] = 'sum'
        // 确保已有占比列也有默认格式
        if (!config.value.table) config.value.table = {} as any
        if (!config.value.table.columnFormats) config.value.table.columnFormats = {}
        if (!config.value.table.columnFormats[ratioName]) {
          config.value.table.columnFormats[ratioName] = { format: 'percent', decimals: 2 }
        }
      }
      maybeCC.push(...existing)
    } else {
      maybeCC.push(...(config.value.table?.computedColumns || []))
    }
    config.value.table = {
      sortBy: (ds.primaryMetric && !excluded.has(ds.primaryMetric) ? ds.primaryMetric : metricCols[0]) || '',
      columns: cols,
      summaryAggs: summaryAggs as Record<string, 'sum' | 'avg' | 'count' | 'unique_count' | 'min' | 'max'>,
      computedColumns: maybeCC,
      columnFormats: {} as Record<string, { format?: string; unit?: 'yuan' | 'wan' | 'yi'; prefix?: string; decimals?: number }>,
      columnColors: undefined,
      columnTextColors: undefined,
      columnTextRules: undefined,
      rowConditionColors: undefined,
      columnOrder: undefined,
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
    config.value.kpis.push({ ...kpi, selected: kpi.selected ?? true })
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

  function selectAllKpis() {
    config.value.kpis = config.value.kpis.map((k) => ({ ...k, selected: true }))
  }
  function clearAllKpis() {
    config.value.kpis = config.value.kpis.map((k) => ({ ...k, selected: false }))
  }
  function toggleKpiSelected(index: number) {
    const kpi = config.value.kpis[index]
    if (kpi) kpi.selected = !kpi.selected
  }

  function addChart(chart: ChartFormItem) {
    config.value.charts.push({ ...chart, selected: chart.selected ?? true })
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

  function selectAllCharts() {
    config.value.charts = config.value.charts.map((c) => ({ ...c, selected: true }))
  }
  function clearAllCharts() {
    config.value.charts = config.value.charts.map((c) => ({ ...c, selected: false }))
  }
  function toggleChartSelected(id: string) {
    const chart = config.value.charts.find((c) => c.id === id)
    if (chart) chart.selected = !chart.selected
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

  /** 拖拽调整表格列顺序 */
  function reorderTableColumns(fromIndex: number, toIndex: number) {
    if (!config.value.table.columnOrder) {
      const ds = dataStore.dataSet
      if (!ds) return
      const headers = dataStore.hasRelations
        ? dataStore.effectiveHeaders
        : ds.headers
      config.value.table.columnOrder = [...headers]
    }
    const arr = [...config.value.table.columnOrder]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    config.value.table.columnOrder = arr
  }

  /** 添加计算列 */
  function addComputedCol() {
    if (!config.value.table.computedColumns) {
      config.value.table.computedColumns = []
    }
    const alias = String.fromCharCode(65 + config.value.table.computedColumns.length)
    config.value.table.computedColumns.push({
      name: '',
      variables: [],
      expression: '',
      selected: true,
    })
  }

  /** 移除计算列 */
  function removeComputedCol(index: number) {
    const cols = config.value.table.computedColumns
    if (!cols) return
    const name = cols[index]?.name
    cols.splice(index, 1)
    // 清理 columns 列表
    if (name) {
      const ci = config.value.table.columns.indexOf(name)
      if (ci !== -1) config.value.table.columns.splice(ci, 1)
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
      previewDevice: 'desktop',
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
    computedCols: () => config.value.table.computedColumns ? JSON.parse(JSON.stringify(config.value.table.computedColumns)) : [],
  }

  const sectionSetters: Record<ConfigSection, (data: any) => void> = {
    title: (v) => { config.value.title = v },
    filters: (v) => { config.value.filters = v },
    dateColumn: (v) => { config.value.dateColumns = v && v.length > 0 ? v : undefined },
    kpis: (v) => { config.value.kpis = v },
    charts: (v) => { config.value.charts = v },
    table: (v) => { config.value.table = v },
    computedCols: (v) => { config.value.table.computedColumns = v && v.length > 0 ? v : [] },
  }

  const sectionAutoGens: Record<ConfigSection, () => void> = {
    title: generateAutoTitle,
    filters: generateAutoFilters,
    dateColumn: () => { config.value.dateColumns = undefined },
    kpis: generateAutoKpis,
    charts: generateAutoCharts,
    table: generateAutoTable,
    computedCols: () => { config.value.table.computedColumns = [] },
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
    const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'kpis', 'charts', 'table', 'computedCols']
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

  /** 仅重置看板配置（保留数据表定义和计算列） */
  function resetDashboardToAuto() {
    const sections: ConfigSection[] = ['title', 'filters', 'dateColumn', 'kpis', 'charts']
    for (const sec of sections) {
      sectionAutoGens[sec]()
      delete sectionSnapshots.value[sec]
    }
  }

  // ====== Phase 5: 完整配置导出/导入（含多表关系） ======

  /** 导出完整配置（DashboardConfig + 多表关系 + 表元数据） */
  function exportFullConfig(): string {
    const ds = dataStore
    const tableMeta = Object.entries(ds.tables).map(([id, t]) => ({
      id,
      name: t.fileName || t.sheetName || '未命名',
      filePath: t.filePath,
      sheetName: t.sheetName,
      sheetIndex: t.sheetIndex,
      headers: t.headers,
      rows: t.rows.length,
    }))

    const full = {
      version: 2,
      config: JSON.parse(JSON.stringify(config.value)),
      relations: ds.relations.map(r => ({
        leftTableId: r.leftTableId,
        leftColumn: r.leftColumn,
        rightTableId: r.rightTableId,
        rightColumn: r.rightColumn,
        joinType: r.joinType,
      })),
      mainTableId: ds.mainTableId,
      tableMeta,
      exportedAt: new Date().toISOString(),
    }
    return JSON.stringify(full, null, 2)
  }

  /** 导入完整配置，恢复多表关系和 Dashboard 设置 */
  function importFullConfig(json: string): { ok: boolean; message: string } {
    try {
      const full = JSON.parse(json)
      if (!full.version || full.version < 2) {
        config.value = {
          ...full,
          previewDevice: normalizePreviewDevice((full as DashboardConfig).previewDevice),
        }
        return { ok: true, message: '已导入配置（旧版格式，不含多表关系）' }
      }
      if (full.relations && Array.isArray(full.relations)) {
        dataStore.relations = full.relations.map((r: any) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          ...r,
        }))
      }
      if (full.mainTableId) dataStore.mainTableId = full.mainTableId
      if (full.config) {
        config.value = {
          ...full.config,
          previewDevice: normalizePreviewDevice(full.config.previewDevice),
        }
      }
      return { ok: true, message: `已导入配置（${full.tableMeta?.length || 0} 张表，${full.relations?.length || 0} 个关联）` }
    } catch (e: any) {
      return { ok: false, message: `导入失败: ${e.message}` }
    }
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
    resetDashboardToAuto,
    exportFullConfig,
    importFullConfig,
    editTitle,
    addKpi,
    removeKpi,
    updateKpi,
    reorderKpis,
    selectAllKpis,
    clearAllKpis,
    toggleKpiSelected,
    addChart,
    removeChart,
    updateChart,
    reorderCharts,
    selectAllCharts,
    clearAllCharts,
    toggleChartSelected,
    toggleFilter,
    toggleTableColumn,
    reorderTableColumns,
    addComputedCol,
    removeComputedCol,
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
