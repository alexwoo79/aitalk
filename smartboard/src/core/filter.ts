/**
 * 条件筛选引擎 — 解析并应用 "列名 运算符 值" 表达式
 *
 * 分隔符规则:
 *   &  → AND（所有组必须满足）
 *   |  → OR （组内任一条件满足即可）
 *
 * 示例:
 *   "地区 = 北京 & 金额 > 100"        → 地区=北京 AND 金额>100
 *   "地区 = 北京 | 地区 = 上海"       → 地区=北京 OR 地区=上海
 *   "地区 = 北京 | 地区 = 上海 & 金额 > 100" → (地区=北京 OR 地区=上海) AND 金额>100
 */

export function parseFilter(
  filter: string,
): { column: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'; value: string } | null {
  if (!filter || !filter.trim()) return null
  const s = filter.trim()
  // 先匹配 in / contains 表达式（值可能包含括号/引号）
  const inM = s.match(/^(.+?)\s+(in)\s+(.+)$/i)
  if (inM) {
    const result = { column: inM[1].trim(), op: 'in' as const, value: inM[3].trim() }
    console.log('[filter] parseFilter IN:', JSON.stringify(s), '→', JSON.stringify(result))
    return result
  }
  // 兼容半角 ~ 和全角 ～
  const containsM = s.match(/^(.+?)\s+(~|～|contains)\s+(.+)$/i)
  if (containsM) {
    const result = { column: containsM[1].trim(), op: 'contains' as const, value: containsM[3].trim() }
    console.log('[filter] parseFilter CONTAINS:', JSON.stringify(s), '→', JSON.stringify(result))
    return result
  }
  // 标准比较运算符
  const m = s.match(/^(.+?)\s*(=|!=|>=|<=|>|<)\s*(.+)$/)
  if (!m) {
    console.log('[filter] parseFilter FAILED:', JSON.stringify(s))
    return null
  }
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

  // 合并 filter 和 conditions（用 & 连接）
  const allConds: string[] = []
  if (filter && filter.trim()) allConds.push(filter.trim())
  if (conditions && conditions.trim()) allConds.push(conditions.trim())
  const fullExpr = allConds.join(' & ')
  if (!fullExpr) return result

  // 按 & 拆分为 AND 组
  const andGroups = fullExpr.split('&').map((g) => g.trim()).filter((g) => g)

  // 构建列名映射（大小写不敏感），从第一行数据获取实际列名
  const colMap: Record<string, string> = {}
  if (result.length > 0) {
    for (const key of Object.keys(result[0])) {
      colMap[key.toLowerCase()] = key
    }
  }

  for (const group of andGroups) {
    // 按 | 拆分为 OR 子条件
    const orConds = group.split('|').map((c) => c.trim()).filter((c) => c)
    const parsedOrConds = orConds.map(parseFilter).filter((p): p is NonNullable<ReturnType<typeof parseFilter>> => p !== null)

    if (parsedOrConds.length === 0) continue

    // 规范化列名：大小写不敏感匹配实际列名
    for (const p of parsedOrConds) {
      const actual = colMap[p.column.toLowerCase()]
      if (actual) p.column = actual
    }

    // AND 组: 至少一个 OR 条件匹配
    result = result.filter((r) =>
      parsedOrConds.some((parsed) => matchRow(r, parsed)),
    )
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
    case 'in': {
      // 值在列表中：支持逗号/顿号/空格/分号分隔，去掉括号和引号
      const list = parsed.value
        .replace(/^\[|\]$/g, '')  // 去掉外层 []
        .replace(/^\(|\)$/g, '')  // 去掉外层 ()
        .replace(/["']/g, '')     // 去掉引号
        .split(/[,，、;\s]+/)     // 按多种分隔符拆分
        .map((s) => s.trim())
        .filter(Boolean)
      return list.some((item) => {
        const itemNum = Number(item.replace(/,/g, ''))
        if (!isNaN(cellNum) && !isNaN(itemNum)) return cellNum === itemNum
        return cellVal === item
      })
    }
    case 'contains': {
      // 含有某些字符：不区分大小写的子串匹配
      return cellVal.toLowerCase().includes(parsed.value.toLowerCase())
    }
    default: return true
  }
}
