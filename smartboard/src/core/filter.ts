/**
 * 条件筛选引擎 — 解析并应用 "列名 运算符 值" 表达式
 * 被 preview-store 和 DashboardView 共享
 */

export function parseFilter(
  filter: string,
): { column: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: string } | null {
  if (!filter || !filter.trim()) return null
  const s = filter.trim()
  const m = s.match(/^(.+?)\s*(=|!=|>=|<=|>|<)\s*(.+)$/)
  if (!m) return null
  const col = m[1].trim()
  const value = m[3].trim()
  const opMap: Record<string, 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'> = {
    '=': 'eq', '!=': 'ne', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte',
  }
  return { column: col, op: opMap[m[2]] || 'eq', value }
}

export function applyFilter(
  rows: Record<string, string | number>[],
  filter: string | undefined,
  conditions?: string,
): Record<string, string | number>[] {
  let result = rows

  // 单条件
  if (filter && filter.trim()) {
    const parsed = parseFilter(filter)
    if (parsed) {
      result = result.filter((r) => matchRow(r, parsed))
    }
  }

  // 多条件（; 分隔）
  if (conditions && conditions.trim()) {
    const conds = conditions.split(';').map((c) => c.trim()).filter((c) => c)
    for (const cond of conds) {
      const parsed = parseFilter(cond)
      if (parsed) {
        result = result.filter((r) => matchRow(r, parsed))
      }
    }
  }

  return result
}

function matchRow(
  r: Record<string, string | number>,
  parsed: { column: string; op: string; value: string },
): boolean {
  const cellVal = String(r[parsed.column] ?? '').trim()
  const cellNum = Number(cellVal.replace(/,/g, ''))
  const filterNum = Number(parsed.value.replace(/,/g, ''))
  const useNumeric = !isNaN(cellNum) && !isNaN(filterNum)

  switch (parsed.op) {
    case 'eq': return useNumeric ? cellNum === filterNum : cellVal === parsed.value
    case 'ne': return useNumeric ? cellNum !== filterNum : cellVal !== parsed.value
    case 'gt': return useNumeric ? cellNum > filterNum : cellVal > parsed.value
    case 'gte': return useNumeric ? cellNum >= filterNum : cellVal >= parsed.value
    case 'lt': return useNumeric ? cellNum < filterNum : cellVal < parsed.value
    case 'lte': return useNumeric ? cellNum <= filterNum : cellVal <= parsed.value
    default: return true
  }
}
