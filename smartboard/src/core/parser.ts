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

/** Convert Excel date serial number to YYYY-MM-DD (handles 1900 leap year bug) */
function excelSerialToDate(serial: number): string {
  const msPerDay = 86400000
  const offset = serial >= 61 ? 1 : 0
  const d = new Date((serial - offset) * msPerDay + new Date(1899, 11, 30).getTime())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Detect if a number is likely an Excel date serial (e.g. 43631 → 2019-06-15) */
function isExcelDateSerial(n: number, colName: string): boolean {
  if (!Number.isFinite(n) || n !== Math.floor(n)) return false
  // Range 30000–80000 covers ~1982–2118
  if (n < 30000 || n > 80000) return false
  // Only convert if column name hints at date
  return /date|日期|时间|time|day|month|year|年|月|日/.test(colName.toLowerCase())
}

export function parseXLSX(data: Uint8Array): ParsedFile {
  return parseXLSXSheet(data, 0)
}

/** Get valid sheet names from an XLSX file (filter out sheets with no data) */
export function getXLSXSheetNames(data: Uint8Array): string[] {
  const workbook = read(data, { type: 'array' })
  return workbook.SheetNames.filter(name => {
    const sheet = workbook.Sheets[name]
    const raw = utils.sheet_to_json(sheet, { header: 1, defval: '' })
    // Must have at least 1 header row + 1 data row
    return Array.isArray(raw) && raw.length >= 2
  })
}

/** Parse a specific sheet by index (0-based) */
export function parseXLSXSheet(data: Uint8Array, sheetIndex: number): ParsedFile {
  const workbook = read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[sheetIndex]
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

  // Filter out completely empty columns (no header + no data)
  const validIndices: number[] = []
  headers.forEach((h, i) => {
    const hasHeader = h !== ''
    const hasData = rawRows.some(row => {
      const v = row[i]
      return v !== undefined && v !== null && v !== ''
    })
    if (hasHeader || hasData) validIndices.push(i)
  })

  const filteredHeaders = validIndices.map(i => headers[i])
  const filteredRawRows = rawRows.map(row => validIndices.map(i => row[i]))
  const rows: Record<string, string | number>[] = filteredRawRows.map((row) => {
    const obj: Record<string, string | number> = {}
    filteredHeaders.forEach((h, i) => {
      const val = row[i]
      if (val === undefined || val === null || val === '') {
        obj[h] = ''
      } else if (typeof val === 'number') {
        obj[h] = isExcelDateSerial(val, h) ? excelSerialToDate(val) : val
      } else {
        obj[h] = String(val).trim()
      }
    })
    return obj
  })

  return { headers: filteredHeaders, rows, rawRows: filteredRawRows }
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
