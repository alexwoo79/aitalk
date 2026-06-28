import type { ColumnClassification, ColumnStats } from '@/types/data'
import { parseNumeric, safeMin, safeMax } from './numeric'

// ====== 日期格式检测 ======

const DATE_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/,           // 2024-01-15, 2024/1/15
  /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/,            // 1-15-2024, 15/01/2024
  /^\d{4}年\d{1,2}月\d{1,2}日/,              // 2024年1月15日
  /^\d{8}$/,                                  // 20240115
]

function isDate(val: string): boolean {
  if (!val || val.length < 6) return false
  return DATE_PATTERNS.some((p) => p.test(val.trim()))
}

// ====== 数值解析（使用共享容忍式解析） ======

/**
 * 容忍式 parseNum：能提取数字前缀的值也算作可解析
 * dirtyCount 用于追踪格式异常的值的个数
 */
function parseNum(val: string): number | null {
  const { value } = parseNumeric(val)
  return isNaN(value) ? null : value
}

// ====== ID 模式匹配 ======

const ID_PATTERNS = ['序号', 'id', '编号', 'no', 'code', 'index', 'num', '号码', '编码', '工号']

function isIdColumn(colName: string): boolean {
  const lower = colName.toLowerCase()
  return ID_PATTERNS.some((p) => lower.includes(p))
}

// ====== 统计计算 ======

function computeStats(numVals: number[]): ColumnStats {
  const count = numVals.length
  if (count === 0) {
    return { sum: 0, avg: 0, min: 0, max: 0, count: 0, nonzero: 0, nonzeroRatio: 0 }
  }
  const sum = numVals.reduce((a, b) => a + b, 0)
  const min = safeMin(numVals)
  const max = safeMax(numVals)
  const nonzero = numVals.filter((v) => v !== 0).length
  return {
    sum,
    avg: sum / count,
    min,
    max,
    count,
    nonzero,
    nonzeroRatio: nonzero / count,
  }
}

function topValues(values: string[], n: number): [string, number][] {
  const freq = new Map<string, number>()
  for (const v of values) {
    if (v && v !== '') {
      freq.set(v, (freq.get(v) || 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

// ====== 单列分类 ======

/**
 * 对单列进行分类（从 Python classify_column 完整迁移）
 */
export function classifyColumn(values: string[], colName: string): ColumnClassification {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '')
  const total = values.length

  // 超过 95% 为空 → ignore
  if (nonEmpty.length < total * 0.05) {
    return {
      type: 'text', role: 'ignore', format: 'text', label: colName, prefix: '',
      uniqueCount: 0, uniqueRatio: 0, numericRatio: 0, dateRatio: 0, dirtyCount: 0,
    }
  }

  // 采样（最多 500 条）
  const sample = nonEmpty.length > 500 ? nonEmpty.slice(0, 500) : nonEmpty
  const uniqueSet = new Set(sample)
  const uniqueCount = uniqueSet.size
  const uniqueRatio = uniqueCount / sample.length

  // 日期比率（采样前 200 条非空值）
  const dateSample = sample.slice(0, 200)
  const dateCount = dateSample.filter(isDate).length
  const dateRatio = dateCount / dateSample.length

  // 数值比率（容忍式解析 + 脏数据计数）
  const numParsed = sample.map((v) => parseNumeric(v))
  const numCount = numParsed.filter((n) => !isNaN(n.value)).length
  const numericRatio = numCount / sample.length
  const dirtyCount = numParsed.filter((n) => !isNaN(n.value) && !n.clean).length

  // 数值统计（仅用干净值计算 stats，避免脏数据污染 min/max/avg）
  const cleanVals = numParsed.filter((n) => !isNaN(n.value) && n.clean).map((n) => n.value)
  const allNumVals = numParsed.filter((n) => !isNaN(n.value)).map((n) => n.value)
  const numVals = cleanVals.length > 0 ? cleanVals : allNumVals
  const allInt = numVals.length > 0 && numVals.every((n) => Number.isInteger(n))
  const hasPercent = sample.some((v) => v.includes('%'))
  const stats = numVals.length > 0 ? computeStats(numVals) : undefined

  // ====== 决策树 ======

  // 1. 日期列
  if (dateRatio > 0.8) {
    return {
      type: 'date', role: 'time_axis', format: 'date', label: colName, prefix: '',
      uniqueCount, uniqueRatio, numericRatio, dateRatio, stats, dirtyCount,
      topValues: topValues(sample, 5),
    }
  }

  // 2. 数值列
  if (numericRatio > 0.8) {
    const avgAbs = stats ? Math.abs(stats.avg) : 0

    // a) 整数 + 少量唯一值 + 小均值 → 维度（如评分、等级）
    if (allInt && uniqueCount < 15 && avgAbs < 1000) {
      return {
        type: 'numeric', role: 'dimension', format: 'integer', label: colName, prefix: '',
        uniqueCount, uniqueRatio, numericRatio, dateRatio, stats, dirtyCount,
      }
    }

    // b) 整数 + 高唯一率 → 标签（如 ID、序号）
    if (allInt && (uniqueRatio > 0.85 || isIdColumn(colName)) && avgAbs < 1000) {
      return {
        type: 'numeric', role: 'label', format: 'integer', label: colName, prefix: '',
        uniqueCount, uniqueRatio, numericRatio, dateRatio, stats, dirtyCount,
      }
    }

    // c) ID 模式 + 高唯一率 → 标签
    if (isIdColumn(colName) && uniqueRatio > 0.85) {
      return {
        type: 'numeric', role: 'label', format: 'integer', label: colName, prefix: '',
        uniqueCount, uniqueRatio, numericRatio, dateRatio, stats, dirtyCount,
      }
    }

    // d) 默认 → 指标
    const nameIsPercent = /率|ratio|rate|percent/i.test(colName)
    const fmt = (hasPercent || nameIsPercent) ? 'percent' : (allInt ? 'integer' : 'number')
    return {
      type: 'numeric', role: 'metric', format: fmt, label: colName, prefix: '',
      uniqueCount, uniqueRatio, numericRatio, dateRatio, stats, dirtyCount,
    }
  }

  // 3. 低基数文本 → 维度
  if (uniqueCount <= Math.min(20, nonEmpty.length * 0.5)) {
    return {
      type: 'categorical', role: 'dimension', format: 'text', label: colName, prefix: '',
      uniqueCount, uniqueRatio, numericRatio, dateRatio, dirtyCount,
      topValues: topValues(sample, 10),
    }
  }

  // 4. 高唯一率文本 → 标签
  if (uniqueRatio > 0.9) {
    return {
      type: 'text', role: 'label', format: 'text', label: colName, prefix: '',
      uniqueCount, uniqueRatio, numericRatio, dateRatio, dirtyCount,
    }
  }

  // 5. 默认 → 标签
  return {
    type: 'text', role: 'label', format: 'text', label: colName, prefix: '',
    uniqueCount, uniqueRatio, numericRatio, dateRatio, dirtyCount,
    topValues: topValues(sample, 5),
  }
}

// ====== 批量分类 ======

/**
 * 对所有列进行分类
 */
export function classifyAllColumns(
  headers: string[],
  rows: Record<string, string | number>[],
): Record<string, ColumnClassification> {
  const result: Record<string, ColumnClassification> = {}
  for (const h of headers) {
    const values = rows.map((r) => {
      const v = r[h]
      return v === undefined || v === null ? '' : String(v)
    })
    result[h] = classifyColumn(values, h)
  }

  // Ensure at least some dimensions exist — promote best label/ignore columns
  const hasDimension = Object.values(result).some(c => c.role === 'dimension')
  if (!hasDimension) {
    const candidates = headers
      .map(h => ({ col: h, cls: result[h] }))
      .filter(({ cls }) => cls.role === 'label' || cls.role === 'ignore')
      .sort((a, b) => a.cls.uniqueCount - b.cls.uniqueCount)
    for (const { col, cls } of candidates.slice(0, 3)) {
      result[col] = { ...cls, role: 'dimension', type: cls.type === 'numeric' ? 'numeric' : 'categorical' }
    }
  }

  return result
}

// ====== 主指标选择 ======

function scoreMetric(colName: string, cls: ColumnClassification): number {
  let score = 0
  if (cls.role !== 'metric') return -1
  if (cls.stats && cls.stats.nonzero > 0) score += 1
  if (cls.stats && cls.stats.nonzeroRatio > 0.5) score += 1
  if (cls.uniqueCount > 3) score += 1
  if (cls.stats && Math.abs(cls.stats.avg) > 1) score += 1
  if (cls.format === 'currency' || cls.format === 'number') score += 1
  // Prefer columns with Chinese business terms
  const lower = colName.toLowerCase()
  if (['额', '金额', '收入', '利润', '销售', '合同', '订单', '数量', 'amount', 'revenue', 'sales'].some(
    (t) => lower.includes(t),
  )) score += 2
  return score
}

export function selectPrimaryMetric(
  headers: string[],
  classifications: Record<string, ColumnClassification>,
): string | null {
  const metrics = headers
    .filter((h) => classifications[h]?.role === 'metric')
    .map((h) => ({ name: h, score: scoreMetric(h, classifications[h]) }))
    .sort((a, b) => b.score - a.score)
  return metrics.length > 0 ? metrics[0].name : null
}

// ====== 图表维度选择 ======

export function selectChartDimensions(
  headers: string[],
  classifications: Record<string, ColumnClassification>,
): string[] {
  return headers
    .filter((h) => {
      const c = classifications[h]
      return c && c.role === 'dimension' && c.type === 'categorical'
    })
    .slice(0, 3)
}

// ====== 智能关联建议（Phase 3） ======

export interface JoinSuggestion {
  leftTableId: string
  leftTableName: string
  leftColumn: string
  rightTableId: string
  rightTableName: string
  rightColumn: string
  score: number
  reason: string
}

/**
 * 基于字段名相似度和类型匹配，推荐表间关联候选。
 */
export function suggestJoins(
  tables: Record<string, { name: string; headers: string[] }>,
): JoinSuggestion[] {
  const suggestions: JoinSuggestion[] = []
  const entries = Object.entries(tables)

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [leftId, leftTable] = entries[i]
      const [rightId, rightTable] = entries[j]

      for (const leftCol of leftTable.headers) {
        for (const rightCol of rightTable.headers) {
          const score = columnSimilarity(leftCol, rightCol)
          if (score > 0.5) {
            suggestions.push({
              leftTableId: leftId,
              leftTableName: leftTable.name,
              leftColumn: leftCol,
              rightTableId: rightId,
              rightTableName: rightTable.name,
              rightColumn: rightCol,
              score,
              reason: score > 0.9 ? '字段名高度匹配' : score > 0.7 ? '字段名相似' : '可能相关',
            })
          }
        }
      }
    }
  }

  // 按分数降序排列
  suggestions.sort((a, b) => b.score - a.score)
  return suggestions.slice(0, 10)
}

/** 计算两个列名的相似度（0-1） */
function columnSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()

  // 完全相同
  if (la === lb) return 1.0

  // 一个包含另一个
  if (la.includes(lb) || lb.includes(la)) return 0.85

  // 去掉常见后缀后比较（如 _id, _no, _code, 编号, ID）
  const stripSuffix = (s: string) => s.replace(/[ _-]?(id|no|code|编号|号|ID|key)$/i, '')
  const sa = stripSuffix(la)
  const sb = stripSuffix(lb)
  if (sa === sb) return 0.9
  if (sa.includes(sb) || sb.includes(sa)) return 0.75

  // 编辑距离相似度
  const dist = levenshteinDistance(sa, sb)
  const maxLen = Math.max(sa.length, sb.length)
  if (maxLen === 0) return 0
  const sim = 1 - dist / maxLen
  return sim > 0.5 ? sim * 0.8 : 0 // 降权
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
