import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DataSet, DataQualitySummary, Relation, ExcelWorkbookMeta, SheetInfo, ColumnClassification } from '@/types/data'
import { parseFile } from '@/core/parser'
import { getXLSXSheetNames, parseXLSXSheet } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'
import { parseNumeric } from '@/core/numeric'
import { readTextFile, readFile, stat } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
// Rust bridge — 在 Tauri 环境下优先使用 Rust 后端
import { isTauri, listExcelSheets, loadExcelSheet } from '@/composables/use-rust-bridge'

/** 生成唯一 ID */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const useDataStore = defineStore('data', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 多表状态（Phase 1）
  // ─────────────────────────────────────────────────────────────────────────
  const tables = ref<Map<string, DataSet>>(new Map())
  const activeTableId = ref<string | null>(null)
  const relations = ref<Relation[]>([])
  const mainTableId = ref<string | null>(null)
  const excelWorkbooks = ref<Map<string, ExcelWorkbookMeta>>(new Map())

  // ─────────────────────────────────────────────────────────────────────────
  // 向后兼容：activeDataSet 计算属性
  // ─────────────────────────────────────────────────────────────────────────
  const dataSet = computed<DataSet | null>(() => {
    if (!activeTableId.value) return null
    return tables.value.get(activeTableId.value) ?? null
  })

  /** @deprecated 使用 dataSet (computed) */
  const _dataSet = ref<DataSet | null>(null)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const excludedColumns = ref<Set<string>>(new Set())
  const roleOverrides = ref<Record<string, string>>({})
  const xlsxSheetNames = ref<string[]>([])
  const activeSheetIndex = ref(0)
  let _xlsxRawData: Uint8Array | null = null
  let _xlsxFilePath: string | null = null

  async function loadFromDialog() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: '数据文件', extensions: ['csv', 'xlsx', 'xls'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (!selected) return 0

    const paths = Array.isArray(selected) ? selected : [selected]
    let loaded = 0
    for (const filePath of paths) {
      await loadFile(filePath)
      if (!error.value) loaded++
    }
    return loaded
  }

  async function loadFile(filePath: string) {
    loading.value = true
    error.value = null
    try {
      const fileName = filePath.replace(/^.*[/\\]/, '') || filePath
      const ext = fileName.toLowerCase().split('.').pop()!

      let parsed
      if (ext === 'xlsx' || ext === 'xls') {
        const data = await readFile(filePath)
        _xlsxRawData = data
        _xlsxFilePath = filePath

        // ⭐ 优先用 Rust 后端列出 sheet
        let sheetNames: string[]
        if (isTauri()) {
          const result = await listExcelSheets(filePath)
          if (result.ok && result.data) {
            sheetNames = result.data.map((s: SheetInfo) => s.name)
            // 存储工作簿元数据
            const wbMeta: ExcelWorkbookMeta = {
              path: filePath,
              sheets: result.data,
            }
            excelWorkbooks.value.set(filePath, wbMeta)
          } else {
            // Fallback 到 SheetJS
            sheetNames = getXLSXSheetNames(data)
          }
        } else {
          sheetNames = getXLSXSheetNames(data)
        }

        xlsxSheetNames.value = sheetNames
        activeSheetIndex.value = 0
        parsed = parseXLSXSheet(data, 0)
      } else {
        xlsxSheetNames.value = []
        _xlsxRawData = null
        _xlsxFilePath = null
        const text = await readTextFile(filePath)
        parsed = parseFile(fileName, text)
      }

      const classifications = classifyAllColumns(parsed.headers, parsed.rows)
      const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
      const chartDimensions = selectChartDimensions(parsed.headers, classifications)
      const dataQuality = buildDataQuality(parsed.headers, parsed.rows, classifications)

      let fileSize: number | undefined
      let fileModified: string | undefined
      let fileHash: string | undefined
      try {
        const fileStat = await stat(filePath)
        fileSize = fileStat.size
        fileModified = fileStat.mtime ? new Date(fileStat.mtime as any).toISOString() : undefined
        const raw = await readFile(filePath)
        let djb2 = 5381
        for (let i = 0; i < raw.length; i++) djb2 = ((djb2 << 5) + djb2 + raw[i]) | 0
        fileHash = 'djb2:' + (djb2 >>> 0).toString(16)
      } catch { /* 静默 */ }

      const dsId = uid()
      const ds: DataSet = {
        id: dsId,
        headers: parsed.headers,
        rows: parsed.rows,
        rawRows: parsed.rawRows,
        classifications,
        primaryMetric,
        chartDimensions,
        filePath,
        fileName,
        fileSize,
        fileModified,
        fileHash,
        dataQuality,
      }

      // 注册到多表 Map
      tables.value.set(dsId, ds)
      activeTableId.value = dsId

      // 向后兼容
      _dataSet.value = ds
    } catch (e: any) {
      error.value = e.message || '文件加载失败'
      console.error('loadFile error:', e)
    } finally {
      loading.value = false
    }
  }

  /** 从原始文本内容加载（HTML5 拖放 / 浏览器环境） */
  async function loadFileContent(fileName: string, text: string) {
    loading.value = true
    error.value = null
    try {
      const parsed = parseFile(fileName, text)
      const classifications = classifyAllColumns(parsed.headers, parsed.rows)
      const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
      const chartDimensions = selectChartDimensions(parsed.headers, classifications)
      const dataQuality = buildDataQuality(parsed.headers, parsed.rows, classifications)

      const dsId = uid()
      const ds: DataSet = {
        id: dsId,
        headers: parsed.headers,
        rows: parsed.rows,
        rawRows: parsed.rawRows,
        classifications,
        primaryMetric,
        chartDimensions,
        filePath: '',
        fileName,
        dataQuality,
      }

      tables.value.set(dsId, ds)
      activeTableId.value = dsId
      _dataSet.value = ds
    } catch (e: any) {
      error.value = e.message || '文件加载失败'
    } finally {
      loading.value = false
    }
  }

  function toggleExcludeColumn(column: string) {
    const s = new Set(excludedColumns.value)
    if (s.has(column)) {
      s.delete(column)
    } else {
      s.add(column)
    }
    excludedColumns.value = s
  }

  function clearExcluded() {
    excludedColumns.value = new Set()
  }

  function clearData() {
    tables.value.clear()
    activeTableId.value = null
    _dataSet.value = null
    error.value = null
    clearExcluded()
    roleOverrides.value = {}
    relations.value = []
    mainTableId.value = null
    excelWorkbooks.value.clear()
  }

  function setRoleOverride(col: string, role: string) {
    roleOverrides.value = { ...roleOverrides.value, [col]: role }
  }

  /**
   * 扫描全部行，收集存在格式异常的数值列
   * 每列最多保留 3 个异常样本供 UI 展示
   */
  function buildDataQuality(
    headers: string[],
    rows: Record<string, string | number>[],
    classifications: Record<string, any>,
  ): DataQualitySummary {
    const dirtyColumns: DataQualitySummary['dirtyColumns'] = []
    for (const col of headers) {
      // 只看被分类为 numeric 且有 dirtyCount 的列
      const cls = classifications[col]
      if (!cls || cls.type !== 'numeric' || !cls.dirtyCount || cls.dirtyCount === 0) continue

      const samples: string[] = []
      let dirtyTotal = 0
      for (const row of rows) {
        const v = row[col]
        if (v === undefined || v === null || v === '') continue
        const { clean, value } = parseNumeric(v)
        if (!isNaN(value) && !clean) {
          dirtyTotal++
          if (samples.length < 3) {
            samples.push(typeof v === 'number' ? String(v) : String(v))
          }
        }
      }
      if (dirtyTotal > 0) {
        dirtyColumns.push({ column: col, dirtyCount: dirtyTotal, totalCount: rows.length, samples })
      }
    }
    return { dirtyColumns, hasIssues: dirtyColumns.length > 0 }
  }

  async function selectSheet(index: number) {
    if (!_xlsxRawData || index >= xlsxSheetNames.value.length) return
    loading.value = true
    activeSheetIndex.value = index
    try {
      // ⭐ 如果 Tauri 环境，尝试用 Rust 加载指定 sheet
      let parsed
      if (isTauri() && _xlsxFilePath) {
        const result = await loadExcelSheet(_xlsxFilePath, index)
        if (result.ok && result.data) {
          const payload = result.data
          // 将 ChartPayload 转为 ParsedFile 格式
          const headers = payload.columns.map(c => c.name)
          const rows = payload.rows.map(r => {
            const obj: Record<string, string | number> = {}
            for (const h of headers) obj[h] = (r[h] as string | number) ?? ''
            return obj
          })
          const rawRows = payload.rows.map(r => headers.map(h => (r[h] as string | number) ?? ''))
          parsed = { headers, rows, rawRows }
        } else {
          // Fallback to SheetJS
          parsed = parseXLSXSheet(_xlsxRawData, index)
        }
      } else {
        parsed = parseXLSXSheet(_xlsxRawData, index)
      }

      const classifications = classifyAllColumns(parsed.headers, parsed.rows)
      const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
      const chartDimensions = selectChartDimensions(parsed.headers, classifications)
      const dataQuality = buildDataQuality(parsed.headers, parsed.rows, classifications)

      const sheetName = xlsxSheetNames.value[index]
      const dsId = uid()
      const ds: DataSet = {
        id: dsId,
        headers: parsed.headers,
        rows: parsed.rows,
        rawRows: parsed.rawRows,
        classifications,
        primaryMetric,
        chartDimensions,
        filePath: _xlsxFilePath ?? '',
        fileName: sheetName,
        dataQuality,
        sheetName,
        sheetIndex: index,
      }

      tables.value.set(dsId, ds)
      activeTableId.value = dsId
      _dataSet.value = ds
    } catch (e: any) {
      error.value = e.message || 'Sheet 加载失败'
    } finally {
      loading.value = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 多表操作（Phase 1 新增）
  // ─────────────────────────────────────────────────────────────────────────

  /** 切换到指定表 */
  function switchTable(id: string) {
    if (tables.value.has(id)) {
      activeTableId.value = id
      _dataSet.value = tables.value.get(id) ?? null
    }
  }

  /** 删除指定表 */
  function removeTable(id: string) {
    tables.value.delete(id)
    // 清理关联
    relations.value = relations.value.filter(
      r => r.leftTableId !== id && r.rightTableId !== id,
    )
    if (mainTableId.value === id) mainTableId.value = null
    if (activeTableId.value === id) {
      const remaining = Array.from(tables.value.keys())
      activeTableId.value = remaining.length > 0 ? remaining[0] : null
      _dataSet.value = activeTableId.value ? tables.value.get(activeTableId.value) ?? null : null
    }
  }

  /** 添加关联关系 */
  function addRelation(rel: Omit<Relation, 'id'>) {
    const id = uid()
    relations.value = [...relations.value, { ...rel, id }]
  }

  /** 删除关联关系 */
  function removeRelation(id: string) {
    relations.value = relations.value.filter(r => r.id !== id)
  }

  /** 设定主表 */
  function setMainTable(id: string | null) {
    mainTableId.value = id
  }

  /** 获取活跃表列表 */
  const tableList = computed(() => {
    return Array.from(tables.value.entries()).map(([id, ds]) => ({
      id,
      name: ds.fileName || ds.sheetName || '未命名',
      rows: ds.rows.length,
      cols: ds.headers.length,
      isActive: id === activeTableId.value,
      isMain: id === mainTableId.value,
    }))
  })

  const tableCount = computed(() => tables.value.size)

  // ── Phase 4: 跨表字段支持 ──
  const hasRelations = computed(() => relations.value.length > 0)

  /** 跨表字段列表（多表时带 "表名." 前缀，单表时即当前表 headers） */
  const allFieldOptions = computed<string[]>(() => {
    const fields: string[] = []
    if (hasRelations.value) {
      for (const [id, ds] of tables.value) {
        const prefix = (ds.fileName || ds.sheetName || '未命名') + '.'
        for (const h of ds.headers) {
          fields.push(prefix + h)
        }
      }
    } else if (dataSet.value) {
      fields.push(...dataSet.value.headers)
    }
    return fields
  })

  /** 解析 "表名.字段名" → { tableId, column } */
  function parseFieldRef(ref: string): { tableId: string; column: string } | null {
    const dotIdx = ref.indexOf('.')
    if (dotIdx === -1) {
      // 无前缀：默认当前活跃表
      if (!activeTableId.value) return null
      return { tableId: activeTableId.value, column: ref }
    }
    const prefix = ref.substring(0, dotIdx)
    const column = ref.substring(dotIdx + 1)
    for (const [id, ds] of tables.value) {
      if ((ds.fileName || ds.sheetName) === prefix) {
        return { tableId: id, column }
      }
    }
    return null
  }

  /** 获取字段的分类信息（支持跨表引用） */
  function getFieldClassification(fieldRef: string): ColumnClassification | null {
    const parsed = parseFieldRef(fieldRef)
    if (!parsed) return null
    const ds = tables.value.get(parsed.tableId)
    return ds?.classifications[parsed.column] ?? null
  }

  return {
    // 多表状态
    tables,
    activeTableId,
    relations,
    mainTableId,
    excelWorkbooks,
    tableList,
    tableCount,
    hasRelations,
    allFieldOptions,
    parseFieldRef,
    getFieldClassification,
    // 向后兼容
    dataSet,
    // 传统状态
    loading,
    error,
    excludedColumns,
    roleOverrides,
    xlsxSheetNames,
    activeSheetIndex,
    // 操作
    loadFromDialog,
    loadFile,
    loadFileContent,
    clearData,
    toggleExcludeColumn,
    clearExcluded,
    setRoleOverride,
    selectSheet,
    // 多表操作
    switchTable,
    removeTable,
    addRelation,
    removeRelation,
    setMainTable,
  }
})
