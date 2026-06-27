/**
 * 聚合计算 — group-by + sum/avg/count/min/max
 */

import { getNumericValue } from './numeric'

type AggFunc = 'sum' | 'avg' | 'count' | 'min' | 'max'

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
    const val = metricCol === 'count' ? 1 : getNumericValue(row[metricCol], 0)
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
