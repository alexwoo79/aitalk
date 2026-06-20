import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DataSet } from '@/types/data'
import { parseFile } from '@/core/parser'
import { classifyAllColumns, selectPrimaryMetric, selectChartDimensions } from '@/core/classifier'
import { readTextFile, readFile } from '@tauri-apps/plugin-fs'
import { open } from '@tauri-apps/plugin-dialog'

export const useDataStore = defineStore('data', () => {
  const dataSet = ref<DataSet | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

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

      dataSet.value = {
        headers: parsed.headers,
        rows: parsed.rows,
        rawRows: parsed.rawRows,
        classifications,
        primaryMetric,
        chartDimensions,
        filePath,
        fileName,
      }
    } catch (e: any) {
      error.value = e.message || '文件加载失败'
      console.error('loadFile error:', e)
    } finally {
      loading.value = false
    }
  }

  function clearData() {
    dataSet.value = null
    error.value = null
  }

  return { dataSet, loading, error, loadFromDialog, loadFile, clearData }
})
