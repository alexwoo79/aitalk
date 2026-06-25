import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DataSet } from '@/types/data'
import { parseFile } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'
import { readTextFile, readFile, stat } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'

export const useDataStore = defineStore('data', () => {
  const dataSet = ref<DataSet | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const excludedColumns = ref<Set<string>>(new Set())
  const roleOverrides = ref<Record<string, string>>({})

  async function loadFromDialog() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: '数据文件', extensions: ['csv', 'xlsx', 'xls'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (!selected) return false

    const filePath = typeof selected === 'string' ? selected : selected[0]
    await loadFile(filePath)
    return true
  }

  async function loadFile(filePath: string) {
    loading.value = true
    error.value = null
    try {
      const fileName = filePath.split('/').pop() || filePath
      const ext = fileName.toLowerCase().split('.').pop()

      let parsed
      if (ext === 'xlsx' || ext === 'xls') {
        const data = await readFile(filePath)
        parsed = parseFile(fileName, data)
      } else {
        const text = await readTextFile(filePath)
        parsed = parseFile(fileName, text)
      }

      const classifications = classifyAllColumns(parsed.headers, parsed.rows)
      const primaryMetric = selectPrimaryMetric(parsed.headers, classifications)
      const chartDimensions = selectChartDimensions(parsed.headers, classifications)

      // 收集文件元数据（大小、修改时间、哈希）
      let fileSize: number | undefined
      let fileModified: string | undefined
      let fileHash: string | undefined
      try {
        const fileStat = await stat(filePath)
        fileSize = fileStat.size
        fileModified = fileStat.mtime ? new Date(fileStat.mtime as any).toISOString() : undefined
        // DJB2 哈希
        const raw = await readFile(filePath)
        let djb2 = 5381
        for (let i = 0; i < raw.length; i++) djb2 = ((djb2 << 5) + djb2 + raw[i]) | 0
        fileHash = 'djb2:' + (djb2 >>> 0).toString(16)
      } catch { /* 静默失败，不影响主流程 */ }

      dataSet.value = {
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
      }
    } catch (e: any) {
      error.value = e.message || '文件加载失败'
      console.error('loadFile error:', e)
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
    dataSet.value = null
    error.value = null
    clearExcluded()
    roleOverrides.value = {}
  }

  function setRoleOverride(col: string, role: string) {
    roleOverrides.value = { ...roleOverrides.value, [col]: role }
  }

  return { dataSet, loading, error, excludedColumns, roleOverrides, loadFromDialog, loadFile, clearData, toggleExcludeColumn, clearExcluded, setRoleOverride }
})
