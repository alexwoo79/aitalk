/**
 * 聚合计算 — group-by + sum/avg/count/min/max
 */

type AggFunc = 'sum' | 'avg' | 'count' | 'min' | 'max'

function getNumericVal(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/,/g, '').replace(/%/g, '').trim()
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

export interface AggResult {
  label: string
  value: number
}

/**
 * 按维度列分组，对指标列执行聚合
 */
export function aggregate(
  rows: Record<string, string | number>[],
  dimCol: string,
  metricCol: string,
  agg: AggFunc = 'sum',
): AggResult[] {
  const groups = new Map<string, number[]>()

  for (const row of rows) {
    const key = String(row[dimCol] ?? '').trim()
    if (!key) continue
    const val = metricCol === 'count' ? 1 : getNumericVal(row[metricCol])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(val)
  }

  const results: AggResult[] = []
  for (const [label, values] of groups) {
    let value: number
    switch (agg) {
      case 'sum':
        value = values.reduce((a, b) => a + b, 0)
        break
      case 'avg':
        value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
        break
      case 'count':
        value = values.length
        break
      case 'min':
        value = Math.min(...values)
        break
      case 'max':
        value = Math.max(...values)
        break
      default:
        value = values.reduce((a, b) => a + b, 0)
    }
    results.push({ label, value })
  }

  return results.sort((a, b) => b.value - a.value)
}

/**
 * 计算单列的描述性统计
 */
export function computeColumnStats(values: (string | number)[]): {
  sum: number; avg: number; min: number; max: number; count: number
} {
  const nums = values.map(getNumericVal).filter((n) => n !== 0 || values.some((v) => v === 0 || v === '0'))
  if (nums.length === 0) return { sum: 0, avg: 0, min: 0, max: 0, count: 0 }
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    sum,
    avg: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    count: nums.length,
  }
}
