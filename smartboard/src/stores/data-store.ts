import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { DataSet, DataQualitySummary, Relation, ExcelWorkbookMeta, SheetInfo, ColumnClassification, ChartPayload, ParsedFile } from '@/types/data'
import { parseFile } from '@/core/parser'
import { getXLSXSheetNames, parseXLSXSheet } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'
import { parseNumeric } from '@/core/numeric'
import { readTextFile, readFile, stat } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'
// Rust bridge — 在 Tauri 环境下优先使用 Rust 后端
import { isTauri, listExcelSheets, loadExcelSheet, loadFile as rustLoadFile, loadJsonFile, loadParquetFile } from '@/composables/use-rust-bridge'

/** 生成唯一 ID */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const useDataStore = defineStore('data', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 多表状态（Phase 1）
  // ─────────────────────────────────────────────────────────────────────────
  const tables = ref<Record<string, DataSet>>({})
  const activeTableId = ref<string | null>(null)
  const relations = ref<Relation[]>([])
  const mainTableId = ref<string | null>(null)
  const excelWorkbooks = ref<Record<string, ExcelWorkbookMeta>>({})

  // ─────────────────────────────────────────────────────────────────────────
  // 向后兼容：dataSet 始终指向当前活跃表
  // ─────────────────────────────────────────────────────────────────────────
  const dataSet = ref<DataSet | null>(null)

  // 自动同步：activeTableId 或 tables 变化时更新 dataSet
  watch([activeTableId, () => Object.keys(tables.value).length], () => {
    if (activeTableId.value) {
      dataSet.value = tables.value[activeTableId.value] ?? null
    } else {
      dataSet.value = null
    }
  }, { immediate: true })

  const loading = ref(false)
  const error = ref<string | null>(null)
  const excludedColumns = ref<Set<string>>(new Set())
  const roleOverrides = ref<Record<string, string>>({})
  const xlsxSheetNames = ref<SheetInfo[]>([])
  const activeSheetIndex = ref(0)
  let _xlsxRawData: Uint8Array | null = null
  let _xlsxFilePath: string | null = null

  // Excel 多 sheet 选择弹窗
  const pendingSheetSelection = ref<{ filePath: string; sheets: SheetInfo[] } | null>(null)

  async function loadFromDialog() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: '数据文件', extensions: ['csv', 'xlsx', 'xls', 'json', 'parquet'] },
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

      let parsed: ParsedFile
      let totalRowsFromPayload: number | undefined

      // ═══════════════════════════════════════════════════════════════════
      // Tauri 环境：Rust/Polars 后端解析（CSV + Excel 统一处理）
      // ═══════════════════════════════════════════════════════════════════
      if (isTauri()) {
        // Excel：先列出 sheet，多 sheet 时弹窗选择
        if (ext === 'xlsx' || ext === 'xls') {
          const sheetsResult = await listExcelSheets(filePath)
          if (sheetsResult.ok && sheetsResult.data && sheetsResult.data.length > 0) {
            const sheets = sheetsResult.data
            xlsxSheetNames.value = sheets
            _xlsxFilePath = filePath

            if (sheets.length > 1) {
              // 多 sheet → 弹窗选择，暂不加载
              pendingSheetSelection.value = { filePath, sheets }
              loading.value = false
              return
            }
            // 单 sheet → 直接加载
            const result = await loadExcelSheet(filePath, sheets[0].index)
            if (!result.ok || !result.data) {
              throw new Error(result.error || 'Rust 加载失败')
            }
            const payload: ChartPayload = result.data
            totalRowsFromPayload = payload.total_rows
            const headers = payload.columns.map(c => c.name)
            const toVal = (v: unknown): string | number => {
              if (typeof v === 'string' || typeof v === 'number') return v
              return v != null ? String(v) : ''
            }
            const rows: Record<string, string | number>[] = payload.rows.map(row => {
              const obj: Record<string, string | number> = {}
              for (const h of headers) obj[h] = toVal(row[h])
              return obj
            })
            const rawRows: (string | number)[][] = payload.rows.map(row =>
              headers.map(h => toVal(row[h]))
            )
            parsed = { headers, rows, rawRows }
          } else {
            throw new Error('Excel 文件没有可读取的工作表')
          }
        } else if (ext === 'json') {
          // JSON：使用 Rust 后端
          const result = await loadJsonFile(filePath)
          if (!result.ok || !result.data) {
            throw new Error(result.error || 'JSON 加载失败')
          }
          const payload: ChartPayload = result.data
          totalRowsFromPayload = payload.total_rows
          xlsxSheetNames.value = []
          _xlsxRawData = null
          _xlsxFilePath = null

          const headers = payload.columns.map(c => c.name)
          const toVal = (v: unknown): string | number => {
            if (typeof v === 'string' || typeof v === 'number') return v
            return v != null ? String(v) : ''
          }
          const rows: Record<string, string | number>[] = payload.rows.map(row => {
            const obj: Record<string, string | number> = {}
            for (const h of headers) obj[h] = toVal(row[h])
            return obj
          })
          const rawRows: (string | number)[][] = payload.rows.map(row =>
            headers.map(h => toVal(row[h]))
          )
          parsed = { headers, rows, rawRows }
        } else if (ext === 'parquet') {
          // Parquet：使用 Rust 后端
          const result = await loadParquetFile(filePath)
          if (!result.ok || !result.data) {
            throw new Error(result.error || 'Parquet 加载失败')
          }
          const payload: ChartPayload = result.data
          totalRowsFromPayload = payload.total_rows
          xlsxSheetNames.value = []
          _xlsxRawData = null
          _xlsxFilePath = null

          const headers = payload.columns.map(c => c.name)
          const toVal = (v: unknown): string | number => {
            if (typeof v === 'string' || typeof v === 'number') return v
            return v != null ? String(v) : ''
          }
          const rows: Record<string, string | number>[] = payload.rows.map(row => {
            const obj: Record<string, string | number> = {}
            for (const h of headers) obj[h] = toVal(row[h])
            return obj
          })
          const rawRows: (string | number)[][] = payload.rows.map(row =>
            headers.map(h => toVal(row[h]))
          )
          parsed = { headers, rows, rawRows }
        } else {
          // CSV：直接加载
          const result = await rustLoadFile(filePath, 0, 0, -1, false)
          if (!result.ok || !result.data) {
            throw new Error(result.error || 'Rust 加载失败')
          }
          const payload: ChartPayload = result.data
          totalRowsFromPayload = payload.total_rows
          xlsxSheetNames.value = []
          _xlsxRawData = null
          _xlsxFilePath = null

          const headers = payload.columns.map(c => c.name)
          const toVal = (v: unknown): string | number => {
            if (typeof v === 'string' || typeof v === 'number') return v
            return v != null ? String(v) : ''
          }
          const rows: Record<string, string | number>[] = payload.rows.map(row => {
            const obj: Record<string, string | number> = {}
            for (const h of headers) obj[h] = toVal(row[h])
            return obj
          })
          const rawRows: (string | number)[][] = payload.rows.map(row =>
            headers.map(h => toVal(row[h]))
          )
          parsed = { headers, rows, rawRows }
        }
      } else {
        // ═══════════════════════════════════════════════════════════════
        // 浏览器 fallback：JS 解析器
        // ═══════════════════════════════════════════════════════════════
        if (ext === 'xlsx' || ext === 'xls') {
          const data = await readFile(filePath)
          _xlsxRawData = data
          _xlsxFilePath = filePath

          let sheetNames: string[]
          sheetNames = getXLSXSheetNames(data)
          xlsxSheetNames.value = sheetNames.map((n, i) => ({ name: n, index: i, rows: 0, cols: 0 }))
          activeSheetIndex.value = 0
          parsed = parseXLSXSheet(data, 0)
        } else if (ext === 'json') {
          const text = await readTextFile(filePath)
          const jsonData = JSON.parse(text)
          const arr = Array.isArray(jsonData) ? jsonData : (jsonData.data ?? jsonData.rows ?? [jsonData])
          if (arr.length > 0) {
            const keys = Object.keys(arr[0])
            const csvLines = [keys.join(','), ...arr.map((r: any) => keys.map((k: string) => {
              const v = r[k]
              if (v === null || v === undefined) return ''
              const s = String(v)
              return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
            }).join(','))]
            parsed = parseFile(fileName, csvLines.join('\n'))
          } else {
            throw new Error('JSON 数据为空')
          }
        } else if (ext === 'parquet') {
          throw new Error('Parquet 格式仅在桌面应用中支持')
        } else {
          xlsxSheetNames.value = []
          _xlsxRawData = null
          _xlsxFilePath = null
          const text = await readTextFile(filePath)
          parsed = parseFile(fileName, text)
        }
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
        totalRows: totalRowsFromPayload,
      }

      // 注册到多表 Map
      tables.value[dsId] = ds
      activeTableId.value = dsId
      // 向后兼容
      dataSet.value = ds
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
        totalRows: parsed.rows.length,
      }

      tables.value[dsId] = ds
      activeTableId.value = dsId
      dataSet.value = ds
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
    Object.keys(tables.value).forEach(k => delete tables.value[k])
    activeTableId.value = null
    dataSet.value = null
    error.value = null
    clearExcluded()
    roleOverrides.value = {}
    relations.value = []
    mainTableId.value = null
    Object.keys(excelWorkbooks.value).forEach(k => delete excelWorkbooks.value[k])
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
    const info = xlsxSheetNames.value[index]
    if ((!_xlsxRawData && !_xlsxFilePath) || !info) return
    loading.value = true
    activeSheetIndex.value = index
    try {
      // ⭐ 如果 Tauri 环境，尝试用 Rust 加载指定 sheet（使用原始 calamine 索引）
      let parsed
      let totalRows: number | undefined
      if (isTauri() && _xlsxFilePath) {
        const result = await loadExcelSheet(_xlsxFilePath, info.index)
        if (result.ok && result.data) {
          const payload = result.data
          totalRows = payload.total_rows
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
          if (!_xlsxRawData) throw new Error('Sheet 数据不可用')
          parsed = parseXLSXSheet(_xlsxRawData, index)
        }
      } else {
        if (!_xlsxRawData) throw new Error('Sheet 数据不可用')
        parsed = parseXLSXSheet(_xlsxRawData, index)
      }

      const classifications = classifyAllColumns(parsed.headers, parsed.rows)
      const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
      const chartDimensions = selectChartDimensions(parsed.headers, classifications)
      const dataQuality = buildDataQuality(parsed.headers, parsed.rows, classifications)

      const sheetName = info.name
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
        totalRows: totalRows ?? parsed.rows.length,
      }

      tables.value[dsId] = ds
      activeTableId.value = dsId
      dataSet.value = ds
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
    if (id in tables.value) {
      activeTableId.value = id
      dataSet.value = tables.value[id] ?? null
    }
  }

  /** 删除指定表 */
  function removeTable(id: string) {
    delete tables.value[id]
    // 清理关联
    relations.value = relations.value.filter(
      r => r.leftTableId !== id && r.rightTableId !== id,
    )
    if (mainTableId.value === id) mainTableId.value = null
    if (activeTableId.value === id) {
      const remaining = Array.from(Object.keys(tables.value))
      activeTableId.value = remaining.length > 0 ? remaining[0] : null
      dataSet.value = activeTableId.value ? tables.value[activeTableId.value] ?? null : null
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

  /** 编辑关联关系 */
  function updateRelation(id: string, patch: Partial<Omit<Relation, 'id'>>) {
    const idx = relations.value.findIndex(r => r.id === id)
    if (idx !== -1) {
      relations.value = [
        ...relations.value.slice(0, idx),
        { ...relations.value[idx], ...patch },
        ...relations.value.slice(idx + 1),
      ]
    }
  }

  /** 设定主表 */
  function setMainTable(id: string | null) {
    mainTableId.value = id
  }

  /** 获取活跃表列表 */
  const tableList = computed(() => {
    return Array.from(Object.entries(tables.value)).map(([id, ds]) => ({
      id,
      name: ds.fileName || ds.sheetName || '未命名',
      rows: ds.totalRows ?? ds.rows.length,
      cols: ds.headers.length,
      isActive: id === activeTableId.value,
      isMain: id === mainTableId.value,
    }))
  })

  const tableCount = computed(() => Object.keys(tables.value).length)

  // ── Phase 4: 跨表字段支持 ──
  const hasRelations = computed(() => relations.value.length > 0)

  /** 跨表字段列表（多表时带 "表名." 前缀，单表时即当前表 headers） */
  const allFieldOptions = computed<string[]>(() => {
    const fields: string[] = []
    if (hasRelations.value) {
      for (const [id, ds] of Object.entries(tables.value)) {
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

  /** 跨表合并后的有效列头（与 buildEffectiveDS 合并逻辑一致：
   *  右表列仅在名称冲突时添加 "表名." 前缀） */
  const effectiveHeaders = computed<string[]>(() => {
    const ds = dataSet.value
    if (!ds) return []
    if (relations.value.length === 0) return [...ds.headers]

    const headers = [...ds.headers]
    for (const rel of relations.value) {
      const rightDs = tables.value[rel.rightTableId]
      if (!rightDs) continue
      for (const rh of rightDs.headers) {
        // 跳过连接键列（与左表列名相同）
        if (rh === rel.rightColumn && headers.includes(rh)) continue
        const prefixedKey = headers.includes(rh)
          ? (rightDs.fileName || rightDs.sheetName || 'right') + '.' + rh
          : rh
        if (!headers.includes(prefixedKey)) {
          headers.push(prefixedKey)
        }
      }
    }
    return headers
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
    for (const [id, ds] of Object.entries(tables.value)) {
      if ((ds.fileName || ds.sheetName) === prefix) {
        return { tableId: id, column }
      }
    }
    return null
  }

  /** 获取字段的分类信息（支持跨表引用，含非前缀列名） */
  function getFieldClassification(fieldRef: string): ColumnClassification | null {
    // 先尝试带前缀解析（如 "表B.金额"）
    const parsed = parseFieldRef(fieldRef)
    if (parsed) {
      const ds = tables.value[parsed.tableId]
      return ds?.classifications[parsed.column] ?? null
    }
    return null
  }

  /** 获取任意列的分类信息（遍历所有表查找，支持无前缀的跨表列） */
  function getEffectiveClassification(col: string): ColumnClassification | null {
    // 先查活跃表
    const cls = dataSet.value?.classifications[col]
    if (cls) return cls
    // 再查带前缀的引用
    const prefixed = getFieldClassification(col)
    if (prefixed) return prefixed
    // 最后遍历所有表查找（适用于无前缀的同名列）
    for (const ds of Object.values(tables.value)) {
      const found = ds.classifications[col]
      if (found) return found
    }
    return null
  }

  /** 批量加载选中的 Excel 工作表（多 sheet 弹窗确认后调用） */
  async function loadSelectedSheets(indices: number[]) {
    const p = pendingSheetSelection.value
    if (!p || !_xlsxFilePath) return
    loading.value = true
    error.value = null
    try {
      for (const calamineIdx of indices) {
        const result = await loadExcelSheet(p.filePath, calamineIdx)
        if (!result.ok || !result.data) continue
        const payload: ChartPayload = result.data

        const headers = payload.columns.map(c => c.name)
        const toVal = (v: unknown): string | number => {
          if (typeof v === 'string' || typeof v === 'number') return v
          return v != null ? String(v) : ''
        }
        const rows: Record<string, string | number>[] = payload.rows.map(row => {
          const obj: Record<string, string | number> = {}
          for (const h of headers) obj[h] = toVal(row[h])
          return obj
        })
        const rawRows: (string | number)[][] = payload.rows.map(row =>
          headers.map(h => toVal(row[h]))
        )

        const classifications = classifyAllColumns(headers, rows)
        const primaryMetric = selectPrimaryMetric(headers, classifications)
        const chartDimensions = selectChartDimensions(headers, classifications)
        const dataQuality = buildDataQuality(headers, rows, classifications)

        const info = p.sheets.find(s => s.index === calamineIdx)
        const dsId = uid()
        const ds: DataSet = {
          id: dsId,
          headers,
          rows,
          rawRows,
          classifications,
          primaryMetric,
          chartDimensions,
          filePath: p.filePath,
          fileName: info?.name ?? `Sheet_${calamineIdx + 1}`,
          dataQuality,
          sheetName: info?.name,
          sheetIndex: calamineIdx,
          totalRows: payload.total_rows,
        }

        tables.value[dsId] = ds
        if (!activeTableId.value) activeTableId.value = dsId
        dataSet.value = ds
      }
    } catch (e: any) {
      error.value = e.message || '工作表加载失败'
    } finally {
      loading.value = false
      pendingSheetSelection.value = null
    }
  }

  function cancelSheetSelection() {
    pendingSheetSelection.value = null
  }

  /** 从 Rust ChartPayload 直接注册为 DataSet（多数据源接入用） */
  function loadFromPayload(payload: ChartPayload, sourceName: string) {
    const headers = payload.columns.map(c => c.name)
    const toVal = (v: unknown): string | number => {
      if (typeof v === 'string' || typeof v === 'number') return v
      return v != null ? String(v) : ''
    }
    const rows: Record<string, string | number>[] = payload.rows.map(row => {
      const obj: Record<string, string | number> = {}
      for (const h of headers) obj[h] = toVal(row[h])
      return obj
    })
    const rawRows: (string | number)[][] = payload.rows.map(row =>
      headers.map(h => toVal(row[h]))
    )

    const classifications = classifyAllColumns(headers, rows)
    const primaryMetric = selectPrimaryMetric(headers, classifications)
    const chartDimensions = selectChartDimensions(headers, classifications)
    const dataQuality = buildDataQuality(headers, rows, classifications)

    const dsId = uid()
    const ds: DataSet = {
      id: dsId,
      headers,
      rows,
      rawRows,
      classifications,
      primaryMetric,
      chartDimensions,
      filePath: '',
      fileName: sourceName,
      dataQuality,
      totalRows: payload.total_rows,
    }

    tables.value[dsId] = ds
    activeTableId.value = dsId
    dataSet.value = ds
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
    effectiveHeaders,
    parseFieldRef,
    getFieldClassification,
    getEffectiveClassification,
    // 向后兼容
    dataSet,
    // 传统状态
    loading,
    error,
    excludedColumns,
    roleOverrides,
    xlsxSheetNames,
    activeSheetIndex,
    pendingSheetSelection,
    // 操作
    loadFromDialog,
    loadFile,
    loadFileContent,
    loadSelectedSheets,
    cancelSheetSelection,
    loadFromPayload,
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
    updateRelation,
    setMainTable,
  }
})
