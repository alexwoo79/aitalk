/**
 * 高级分析算法 — 从 dashboard_gen.py 迁移
 * timeseries / decile / cluster (K-means)
 */

// ====== Timeseries ======

export interface TimeseriesData {
  labels: string[]
  values: number[]
  ma: (number | null)[]       // MA3 移动平均
  mom: (number | null)[]       // 环比 %
  yoy: (number | null)[]       // 同比 % (仅月度)
  trend: number[]              // 线性回归趋势
  forecast: { labels: string[]; values: number[] }
}

function getNumericVal(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim()
  if (s.endsWith('%')) s = s.slice(0, -1)
  s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? NaN : n
}

function getPeriodKey(dateStr: string, period: 'month' | 'quarter' | 'year'): string | null {
  const m = dateStr.match(/^(\d{4})[-/.](\d{1,2})/)
  if (!m) return null
  const y = m[1], mo = parseInt(m[2])
  if (period === 'year') return y
  if (period === 'quarter') return `${y}-Q${Math.ceil(mo / 3)}`
  return `${y}-${String(mo).padStart(2, '0')}`
}

function nextPeriodKeys(lastKey: string, period: 'month' | 'quarter' | 'year', count: number): string[] {
  const result: string[] = []
  if (period === 'year') {
    let y = parseInt(lastKey)
    for (let i = 0; i < count; i++) result.push(String(++y))
  } else if (period === 'quarter') {
    const [y, q] = lastKey.split('-Q').map(Number)
    let yr = y, qt = q
    for (let i = 0; i < count; i++) {
      qt++
      if (qt > 4) { qt = 1; yr++ }
      result.push(`${yr}-Q${qt}`)
    }
  } else {
    const [y, m] = lastKey.split('-').map(Number)
    let yr = y, mo = m
    for (let i = 0; i < count; i++) {
      mo++
      if (mo > 12) { mo = 1; yr++ }
      result.push(`${yr}-${String(mo).padStart(2, '0')}`)
    }
  }
  return result
}

/**
 * 时序分析：按周期聚合，计算 MA3、环比、同比、趋势、预测
 */
export function computeTimeseries(
  rows: Record<string, string | number>[],
  dateCol: string,
  metricCol: string,
  period: 'month' | 'quarter' | 'year' = 'month',
): TimeseriesData | null {
  // 按周期分组求和
  const groups: Record<string, number> = {}
  for (const row of rows) {
    const dv = String(row[dateCol] || '').trim()
    const key = getPeriodKey(dv, period)
    if (!key) continue
    const v = getNumericVal(row[metricCol])
    if (!isNaN(v)) groups[key] = (groups[key] || 0) + v
  }

  const sortedKeys = Object.keys(groups).sort()
  if (sortedKeys.length < 2) return null

  const labels = sortedKeys
  const values = sortedKeys.map((k) => groups[k])

  // MA3 移动平均
  const ma: (number | null)[] = values.map((_, i) => {
    if (i < 2) return null
    return (values[i - 2] + values[i - 1] + values[i]) / 3
  })

  // 环比 MoM%
  const mom: (number | null)[] = values.map((v, i) => {
    if (i === 0 || values[i - 1] === 0) return null
    return ((v - values[i - 1]) / Math.abs(values[i - 1])) * 100
  })

  // 同比 YoY% — 仅月度数据
  let yoy: (number | null)[] = []
  if (period === 'month' && labels.length > 12) {
    yoy = values.map((v, i) => {
      if (i < 12 || values[i - 12] === 0) return null
      return ((v - values[i - 12]) / Math.abs(values[i - 12])) * 100
    })
  } else {
    yoy = values.map(() => null)
  }

  // 线性回归趋势
  const n = values.length
  const xs = values.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = meanY - slope * meanX
  const trend = values.map((_, i) => intercept + slope * i)

  // 预测：外推 3 个周期
  const forecastCount = 3
  const forecastLabels = nextPeriodKeys(labels[labels.length - 1], period, forecastCount)
  const forecastValues = forecastLabels.map((_, i) => intercept + slope * (n + i))

  return { labels, values, ma, mom, yoy, trend, forecast: { labels: forecastLabels, values: forecastValues } }
}

// ====== Decile (十分位) ======

export interface DecileData {
  labels: string[]   // D1..D10
  counts: number[]
  sums: number[]
  avgs: number[]
  ranges: string[]
}

function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

/**
 * 十分位分析：按指标排序后等分为 10 个桶
 */
export function computeDeciles(
  rows: Record<string, string | number>[],
  metricCol: string,
): DecileData | null {
  const nums = rows
    .map((r) => getNumericVal(r[metricCol]))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)

  if (nums.length < 10) return null

  const bucketSize = Math.floor(nums.length / 10)
  const labels: string[] = []
  const counts: number[] = []
  const sums: number[] = []
  const avgs: number[] = []
  const ranges: string[] = []

  for (let i = 0; i < 10; i++) {
    const start = i * bucketSize
    const end = i === 9 ? nums.length : (i + 1) * bucketSize
    const bucket = nums.slice(start, end)
    const sum = bucket.reduce((a, b) => a + b, 0)

    labels.push(`D${i + 1}`)
    counts.push(bucket.length)
    sums.push(sum)
    avgs.push(bucket.length > 0 ? sum / bucket.length : 0)
    ranges.push(`${fmtCompact(bucket[0])}–${fmtCompact(bucket[bucket.length - 1])}`)
  }

  return { labels, counts, sums, avgs, ranges }
}

// ====== K-means Clustering ======

export interface ClusterData {
  points: { x: number; y: number; cluster: number; label: string }[]
  centroids: { x: number; y: number }[]
  colX: string
  colY: string
}

/**
 * K-means 聚类（20 轮迭代，确定性初始化）
 */
export function computeClusters(
  rows: Record<string, string | number>[],
  metricCols: string[],
  k: number = 3,
  xCol?: string,
  yCol?: string,
): ClusterData | null {
  const colX = xCol || metricCols[0]
  const colY = yCol || metricCols[1] || metricCols[0]
  if (!colX || !colY) return null

  // 提取有效点
  const points: { x: number; y: number; label: string }[] = []
  for (const row of rows) {
    const x = getNumericVal(row[colX])
    const y = getNumericVal(row[colY])
    if (!isNaN(x) && !isNaN(y)) {
      // 取第一列文本作为 label
      const label = String(Object.values(row)[0] ?? '')
      points.push({ x, y, label })
    }
  }
  if (points.length < k) return null

  // 初始化聚类中心（等间距取样）
  let centroids: { x: number; y: number }[] = []
  const step = Math.floor(points.length / k)
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, points.length - 1)
    centroids.push({ x: points[idx].x, y: points[idx].y })
  }

  // 迭代
  let assignments = new Array(points.length).fill(0)
  for (let iter = 0; iter < 20; iter++) {
    // 分配
    const newAssign = points.map((p) => {
      let minDist = Infinity, minC = 0
      for (let c = 0; c < centroids.length; c++) {
        const d = (p.x - centroids[c].x) ** 2 + (p.y - centroids[c].y) ** 2
        if (d < minDist) { minDist = d; minC = c }
      }
      return minC
    })

    // 检查收敛
    if (newAssign.every((v, i) => v === assignments[i])) break
    assignments = newAssign

    // 更新中心
    const sums = centroids.map(() => ({ x: 0, y: 0, count: 0 }))
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i]
      sums[c].x += points[i].x
      sums[c].y += points[i].y
      sums[c].count++
    }
    centroids = sums.map((s, i) =>
      s.count > 0
        ? { x: s.x / s.count, y: s.y / s.count }
        : centroids[i],
    )
  }

  return {
    points: points.map((p, i) => ({ ...p, cluster: assignments[i] })),
    centroids,
    colX,
    colY,
  }
}
