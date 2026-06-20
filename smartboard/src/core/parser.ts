import Papa from 'papaparse'
import { read, utils } from 'xlsx'
import type { ParsedFile } from '@/types/data'

/**
 * 解析 CSV 文本（Papa Parse）
 */
export function parseCSV(text: string): ParsedFile {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1)
  }

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.data.length < 2) {
    throw new Error('CSV 文件至少需要 1 行表头和 1 行数据')
  }

  const headers = (result.data[0] as string[]).map((h: string) => h.trim())
  const rawRows = result.data.slice(1) as (string | number)[][]

  // Convert to dict rows
  const rows: Record<string, string | number>[] = rawRows.map((row) => {
    const obj: Record<string, string | number> = {}
    headers.forEach((h, i) => {
      const val = row[i]
      if (val === undefined || val === null || val === '') {
        obj[h] = ''
      } else if (typeof val === 'number') {
        obj[h] = val
      } else {
        obj[h] = String(val).trim()
      }
    })
    return obj
  })

  return { headers, rows, rawRows }
}

/**
 * 解析 XLSX 二进制数据（SheetJS）
 */
export function parseXLSX(data: Uint8Array): ParsedFile {
  const workbook = read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('XLSX 文件没有工作表')

  const sheet = workbook.Sheets[sheetName]
  const rawData = utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })

  if (rawData.length < 2) {
    throw new Error('XLSX 文件至少需要 1 行表头和 1 行数据')
  }

  const headers = (rawData[0] as string[]).map((h: string) => {
    let s = String(h).trim()
    // Strip BOM from first header
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1)
    return s
  })

  const rawRows = rawData.slice(1) as (string | number)[][]
  const rows: Record<string, string | number>[] = rawRows.map((row) => {
    const obj: Record<string, string | number> = {}
    headers.forEach((h, i) => {
      const val = row[i]
      if (val === undefined || val === null || val === '') {
        obj[h] = ''
      } else if (typeof val === 'number') {
        obj[h] = val
      } else {
        obj[h] = String(val).trim()
      }
    })
    return obj
  })

  return { headers, rows, rawRows }
}

/**
 * 根据文件名自动选择解析器
 */
export function parseFile(fileName: string, data: Uint8Array | string): ParsedFile {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'xlsx' || ext === 'xls') {
    if (typeof data === 'string') throw new Error('XLSX 文件需要二进制数据')
    return parseXLSX(data)
  }
  const text = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data)
  return parseCSV(text)
}
