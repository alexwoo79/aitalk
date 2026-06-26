/**
 * 共享数值解析 — 容忍式解析，统一 aggregator / analysis / classifier 的行为
 *
 * 与 Number() 不同，parseFloat 会从左到右提取数字前缀：
 *   "160000（不含方案专家评审费1万元）" → 160000
 *   "约 16 万元"                      → NaN（中文在前则失败）
 *
 * 返回值同时包含 clean 标志，用于追踪数据质量。
 */

export interface NumericResult {
    value: number
    /** 原始值是否为干净的数字格式（仅含数字、小数点、逗号、百分号、负号） */
    clean: boolean
}

/**
 * 容忍式数值解析
 * - 数字在前有中文混入 → 提取数字 + clean=false
 * - 纯数字 → 直接解析 + clean=true
 * - 完全无法解析 → value=NaN + clean=false
 */
export function parseNumeric(val: string | number | undefined | null): NumericResult {
    if (val === undefined || val === null || val === '') {
        return { value: NaN, clean: false }
    }

    if (typeof val === 'number') {
        return { value: val, clean: true }
    }

    const raw = String(val).trim()
    if (raw === '' || raw === '-') {
        return { value: NaN, clean: false }
    }

    // 预处理：去逗号、去百分号
    let s = raw.replace(/,/g, '').replace(/%/g, '')

    // 用 parseFloat 做容忍解析（提取数字前缀）
    const n = parseFloat(s)
    if (isNaN(n)) {
        return { value: NaN, clean: false }
    }

    // 判断是否干净：原始值应仅含 数字、逗号、小数点、百分号、负号、空格
    const clean = /^-?[\d,]+(\.\d+)?%?\s*$/.test(raw)

    return { value: n, clean }
}

/**
 * 便捷方法：仅返回数值（容忍解析），NaN 时返回 fallback
 * 用于聚合场景（aggregator 中 fallback=0）
 */
export function getNumericValue(val: string | number | undefined | null, fallback: number = 0): number {
    const { value } = parseNumeric(val)
    return isNaN(value) ? fallback : value
}

/**
 * 便捷方法：仅返回数值（容忍解析），NaN 时返回 NaN
 * 用于分析场景（analysis 中用 filter 跳过 NaN）
 */
export function getNumericOrNaN(val: string | number | undefined | null): number {
    const { value } = parseNumeric(val)
    return value // NaN 就是 NaN，不替换
}
