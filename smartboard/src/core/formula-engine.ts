/**
 * KPI 公式引擎 — 表达式解析 + 自适应计算
 *
 * 支持语法:
 *   SUM(A*B) / SUM(B) * 100    → 混合：行内 A*B 后 SUM，除以前面结果
 *   SUM(A*B-C)                 → 行内 A*B-C 后 SUM
 *   SUM(A) + SUM(B) - SUM(C)  → 各自先聚合再计算
 *   AVG(A*B)                   → 行内 A*B 后 AVG
 *   COUNT(A)                   → 计数
 *   UNIQUE_COUNT(A)            → 唯一计数
 *
 * 聚合函数: SUM, AVG, COUNT, MIN, MAX, UNIQUE_COUNT
 */

import { getNumericValue } from './numeric'
import { applyFilter } from './filter'

export interface FormulaVar {
  alias: string        // A, B, C...
  column: string       // 实际列名
  filter?: string      // 该变量的独立筛选条件
}

export interface FormulaConfig {
  variables: FormulaVar[]
  expression: string
  filter?: string
}

// ====== 表达式解析 ======

interface ParsedTerm {
  type: 'agg'
  func: string           // SUM, AVG, COUNT, MIN, MAX, UNIQUE_COUNT
  innerExpr: string      // 聚合函数内的表达式（如 "A*B-C"）
  aliases: string[]      // innerExpr 中出现的别名
}

/**
 * 解析表达式：提取所有聚合函数调用和其中的变量别名
 * 例: "SUM(A*B)/SUM(B)*100" → [{func:"SUM", innerExpr:"A*B", aliases:["A","B"]}, {func:"SUM", innerExpr:"B", aliases:["B"]}]
 */
export function parseExpression(expr: string, aliases: string[]): ParsedTerm[] {
  const terms: ParsedTerm[] = []
  const aggFuncs = ['UNIQUE_COUNT', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX']
  // 按函数名长度降序排序，确保 UNIQUE_COUNT 先于 COUNT 匹配
  const funcPattern = aggFuncs.sort((a, b) => b.length - a.length).join('|')

  const regex = new RegExp('(' + funcPattern + ')[(]', 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(expr)) !== null) {
    const func = match[1]
    const openIdx = match.index + match[0].length // 跳过 'FUNC('，指向 '(' 之后
    // 用栈找到匹配的 ')'
    let depth = 0
    let closeIdx = -1
    for (let i = openIdx; i < expr.length; i++) {
      if (expr[i] === '(') depth++
      else if (expr[i] === ')') {
        if (depth === 0) { closeIdx = i; break }
        depth--
      }
    }
    if (closeIdx === -1) continue // 括号不匹配，跳过

    const innerExpr = expr.slice(openIdx, closeIdx).trim()
    // 提取 innerExpr 中的别名
    const usedAliases = aliases.filter(a => {
      const re = new RegExp(`\\b${a}\\b`)
      return re.test(innerExpr)
    })

    terms.push({ type: 'agg', func, innerExpr, aliases: usedAliases })
    // 跳过已匹配的区域，继续搜索
    regex.lastIndex = closeIdx + 1
  }

  return terms
}

// ====== 行内计算 ======

/**
 * 对筛选后的行，逐行计算 innerExpr（替换 A/B/C 为原始值）
 * 返回每行的计算结果数组
 */
function computeRowWise(
  rows: Record<string, string | number>[],
  innerExpr: string,
  vars: FormulaVar[],
): number[] {
  // 构建别名 → 列名的映射
  const aliasMap = new Map(vars.map(v => [v.alias, v.column]))

  const results: number[] = []

  // 预编译表达式：一次 Function 构造，循环内只调用
  const aliases = vars.map(v => v.alias)
  const compiled = new Function(...aliases, `"use strict"; return (${innerExpr})`)
  if (typeof compiled !== 'function') {
    console.warn('[Formula] 表达式编译失败:', innerExpr)
    return results
  }

  for (const row of rows) {
    const args: number[] = vars.map(v => getNumericValue(row[v.column], 0))
    try {
      const result = compiled(...args)
      if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
        results.push(result)
      }
    } catch {
      // 跳过计算失败的行
    }
  }

  return results
}

// ====== 聚合函数 ======

function applyAgg(values: number[], func: string, rows?: Record<string, string | number>[], col?: string): number {
  switch (func) {
    case 'SUM': return values.reduce((a, b) => a + b, 0)
    case 'AVG': return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
    case 'COUNT': return values.length
    case 'MIN': return values.length > 0 ? values.reduce((a, b) => a < b ? a : b, Infinity) : 0
    case 'MAX': return values.length > 0 ? values.reduce((a, b) => a > b ? a : b, -Infinity) : 0
    case 'UNIQUE_COUNT': {
      if (!rows || !col) return 0
      const unique = new Set(rows.map(r => {
        const v = r[col]
        return v === undefined || v === null || v === '' ? '' : String(v).trim()
      }).filter(s => s !== ''))
      return unique.size
    }
    default: return values.reduce((a, b) => a + b, 0)
  }
}

// ====== 主计算函数 ======

export interface ComputeResult {
  value: number
  error?: string
}

/**
 * 计算公式 KPI 值
 *
 * 流程:
 * 1. 解析表达式，提取所有聚合函数调用
 * 2. 对每个聚合调用: 行内计算 innerExpr → 聚合
 * 3. 将聚合结果替换回表达式
 * 4. 用纯数值表达式计算最终结果
 */
export function computeFormula(
  formula: FormulaConfig,
  rows: Record<string, string | number>[],
): ComputeResult {
  const { variables, expression, filter } = formula

  if (variables.length === 0) {
    return { value: 0, error: '至少需要一个变量' }
  }

  // 应用共享筛选
  let filtered = rows
  if (filter) {
    filtered = applyFilter(rows, filter)
  }
  if (filtered.length === 0) return { value: 0 }

  const aliases = variables.map(v => v.alias)

  // 解析表达式中的聚合函数调用
  const terms = parseExpression(expression, aliases)

  if (terms.length === 0) {
    return { value: 0, error: '表达式中未找到聚合函数（SUM/AVG/COUNT/MIN/MAX/UNIQUE_COUNT）' }
  }

  try {
    // Step 1: 计算每个聚合项的值
    const termValues: { original: string; value: number }[] = []
    for (const term of terms) {
      // 构建完整的原始文本，用于替换
      const original = `${term.func}(${term.innerExpr})`

      // 找出当前 term 涉及的变量
      const termVars = variables.filter(v => term.aliases.includes(v.alias))

      // 合并该 term 的筛选：共享筛选 + 涉及变量的独立筛选
      const termFilters = [filter, ...termVars.map(v => v.filter).filter(Boolean)]
      const combinedFilter = termFilters.filter(Boolean).join(' & ') || undefined
      const termRows = combinedFilter ? applyFilter(filtered, combinedFilter) : filtered

      // 对于 UNIQUE_COUNT，直接用列名聚合（不需要行内计算）
      if (term.func === 'UNIQUE_COUNT' && termVars.length === 1) {
        const col = termVars[0].column
        const aggValue = applyAgg([], 'UNIQUE_COUNT', termRows, col)
        termValues.push({ original, value: aggValue })
        continue
      }

      // 对于 COUNT，用法是 COUNT(A) = 计数列 A 的非空值
      if (term.func === 'COUNT' && termVars.length === 1) {
        const col = termVars[0].column
        const values = termRows.map(r => getNumericValue(r[col], NaN)).filter(v => !isNaN(v))
        const aggValue = applyAgg(values, 'COUNT')
        termValues.push({ original, value: aggValue })
        continue
      }

      // 行内计算 innerExpr
      const rowResults = computeRowWise(termRows, term.innerExpr, variables)
      if (rowResults.length === 0) {
        termValues.push({ original, value: 0 })
        continue
      }
      const aggValue = applyAgg(rowResults, term.func)
      termValues.push({ original, value: aggValue })
    }

    // Step 2: 替换表达式中的聚合调用为计算结果
    let finalExpr = expression
    // 按 original 长度降序替换，避免 SUM(A) 先替换掉 SUM(A*B) 的部分
    const sorted = [...termValues].sort((a, b) => b.original.length - a.original.length)
    for (const tv of sorted) {
      // 用占位符避免部分匹配问题
      finalExpr = finalExpr.split(tv.original).join(String(tv.value))
    }

    // Step 3: 计算最终表达式
    const result = new Function(`"use strict"; return (${finalExpr})`)()
    if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
      return { value: result }
    }
    return { value: 0, error: '计算结果无效' }
  } catch (e: any) {
    return { value: 0, error: e.message || '表达式错误' }
  }
}

// ====== 辅助：生成默认别名序列 ======

const ALIAS_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function nextAlias(index: number): string {
  if (index < 26) return ALIAS_POOL[index]
  // 超过 26 个：AA, AB, AC...
  const i = index - 26
  return String.fromCharCode(65 + Math.floor(i / 26)) + ALIAS_POOL[i % 26]
}
