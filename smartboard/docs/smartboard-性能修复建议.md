# SmartBoard 性能优化修复建议

> 本文档覆盖 11 项未修复的性能问题和 2 项部分修复的改进建议，按优先级 P0 → P1 → P2 排列。
> 每项均包含：问题说明、当前代码、建议代码、影响分析。

---

## P0-1：公式引擎 `new Function()` 逐行编译

**文件**：`src/core/formula-engine.ts`  
**问题**：`computeRowWise()` 在循环内对每一行调用 `new Function()`，触发 JS 编译器流水线（解析→编译→执行）。50,000 行 = 50,000 次编译器调用。  
**影响**：公式型 KPI 完全阻塞 UI 线程，数据量大时卡顿严重。

### 当前代码（第 88-122 行）

```typescript
function computeRowWise(
  rows: Record<string, string | number>[],
  innerExpr: string,
  vars: FormulaVar[],
): number[] {
  const aliasMap = new Map(vars.map(v => [v.alias, v.column]))
  const results: number[] = []
  for (const row of rows) {
    const rowVals: Record<string, number> = {}
    for (const v of vars) {
      const colVal = row[v.column]
      rowVals[v.alias] = getNumericValue(colVal, 0)
    }
    let expr = innerExpr
    for (const v of vars) {
      expr = expr.replace(new RegExp(`\\b${v.alias}\\b`, 'g'), String(rowVals[v.alias]))
    }
    try {
      const result = new Function(`"use strict"; return (${expr})`)()  // ← 每行编译
      if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
        results.push(result)
      }
    } catch {
      // 跳过计算失败的行
    }
  }
  return results
}
```

### 建议代码

```typescript
function computeRowWise(
  rows: Record<string, string | number>[],
  innerExpr: string,
  vars: FormulaVar[],
): number[] {
  // 在循环外预编译一次函数，别名为参数
  const aliases = vars.map(v => v.alias)
  let fn: Function
  try {
    fn = new Function(...aliases, `"use strict"; return (${innerExpr})`)
  } catch {
    return []
  }

  const results: number[] = []
  for (const row of rows) {
    // 提取该行各变量的原始数值
    const args = vars.map(v => getNumericValue(row[v.column], 0))
    try {
      const result = fn(...args)
      if (typeof result === 'number' && isFinite(result) && !isNaN(result)) {
        results.push(result)
      }
    } catch {
      // 跳过计算失败的行
    }
  }
  return results
}
```

**优化效果**：编译器只调用 1 次而非 N 次。50,000 行数据预估从 ~500ms 降至 ~5ms。

---

## P0-2：`Math.min/max(...spread)` 栈溢出风险（6 处）

**问题**：展开运算符把数组元素全部压入调用栈，V8 上限约 65,536 个参数，超过即 `RangeError: Maximum call stack size exceeded`。  
**影响**：大数据集下直接崩溃。

### 通用安全替代方案

建议新增一个工具函数，所有位置统一调用：

**文件**：`src/core/numeric.ts`（新增）

```typescript
/** 安全的数组 min/max，不依赖展开运算符，避免栈溢出 */
export function safeMin(arr: number[]): number {
  if (arr.length === 0) return 0
  let m = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i]
  return m
}

export function safeMax(arr: number[]): number {
  if (arr.length === 0) return 0
  let m = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i]
  return m
}
```

### 需要替换的 6 个位置

| # | 文件 | 行 | 当前代码 | 替换为 |
|---|------|-----|---------|--------|
| 1 | `aggregator.ts` | 47 | `Math.min(...values)` | `safeMin(values)` |
| 2 | `aggregator.ts` | 50 | `Math.max(...values)` | `safeMax(values)` |
| 3 | `chart-options.ts` | 30 | `Math.min(...arr)` | `safeMin(arr)` |
| 4 | `chart-options.ts` | 31 | `Math.max(...arr)` | `safeMax(arr)` |
| 5 | `chart-options.ts` | 563 | `Math.min(...values)` | `safeMin(values)` |
| 6 | `chart-options.ts` | 564 | `Math.max(...values)` | `safeMax(values)` |
| 7 | `preview-store.ts` | 139 | `Math.min(...vals)` | `safeMin(vals)` |
| 8 | `preview-store.ts` | 139 | `Math.max(...vals)` | `safeMax(vals)` |
| 9 | `preview-store.ts` | 156 | `Math.min(...vs)` | `safeMin(vs)` |
| 10 | `preview-store.ts` | 156 | `Math.max(...vs)` | `safeMax(vs)` |
| 11 | `formula-engine.ts` | 131 | `Math.min(...values)` | `safeMin(values)` |
| 12 | `formula-engine.ts` | 132 | `Math.max(...values)` | `safeMax(values)` |
| 13 | `DashboardView.vue` | 1096 | `Math.min(...vals)` | `safeMin(vals)` |
| 14 | `DashboardView.vue` | 1097 | `Math.max(...vals)` | `safeMax(vals)` |

**优化效果**：彻底消除大数据集栈溢出崩溃风险。

---

## P0-3：`get_active_df()` 深拷贝 DataFrame

**文件**：`src-tauri/src/state.rs`  
**问题**：几乎所有 Tauri command 都通过 `get_active_df()` 获取 DataFrame，每次都 `.cloned()` 做完整堆拷贝。100k 行 × 20 列 = 每次数 MB 级分配。  
**现状**：已新增 `with_active_df` 闭包读取辅助函数，但大多数调用者仍用 `get_active_df()`。

### 建议：引入 `Arc<DataFrame>` 共享所有权

```rust
// state.rs — 类型变更
use std::sync::Arc;

pub static GLOBAL_DF: Lazy<RwLock<Option<Arc<DataFrame>>>> = Lazy::new(|| RwLock::new(None));
pub static DATASET_REGISTRY: Lazy<RwLock<Vec<RuntimeDataset>>> = Lazy::new(|| RwLock::new(Vec::new()));

// RuntimeDataset 也改用 Arc
pub struct RuntimeDataset {
    pub meta: DatasetMeta,
    pub df: Arc<DataFrame>,  // 之前是 DataFrame
}

// get_active_df 返回 Arc，8 字节指针拷贝而非 MB 级深拷贝
pub fn get_active_df() -> Result<Arc<DataFrame>> {
    let guard = GLOBAL_DF.read().unwrap();
    guard
        .as_ref()
        .cloned()  // Arc::clone — O(1)，只拷贝指针
        .ok_or_else(|| anyhow::anyhow!("没有加载数据，请先上传文件"))
}

// 需要可变操作（如写入替换）时：
pub fn replace_active_dataframe(df: DataFrame) {
    let mut guard = GLOBAL_DF.write().unwrap();
    *guard = Some(Arc::new(df));
}
```

**优化效果**：从 O(N) 深拷贝变为 O(1) 指针拷贝。100k 行数据集的每次 IPC 调用从数 MB 拷贝降为 8 字节。

**注意**：需要全局搜索 `get_active_df()` 的所有调用点，将 `DataFrame` 改为 `Arc<DataFrame>`。大部分调用点只需加 `&*` 解引用即可兼容。

---

## P1-1：`applyFilters()` 链式 `.filter()` 中间数组

**文件**：`src/stores/preview-store.ts`（第 81-91 行）  
**问题**：先 `[...e.rows]` 全量拷贝，再逐条件 `.filter()` 产生多个中间数组。全文搜索对每行每列做 `String(v).toLowerCase()` 转换。  
**影响**：5~8 次大数组分配 + GC 压力。

### 当前代码

```typescript
function applyFilters() {
  const ds = dataStore.dataSet; if (!ds) { filteredRows.value = []; return }
  const e = dataStore.hasRelations ? buildEffectiveDS(ds) : ds
  let rows = [...e.rows]  // ← 全量拷贝
  for (const [c, v] of Object.entries(filterValues.value))
    if (v && v !== '__all__')
      rows = rows.filter(r => String(r[c] ?? '').trim() === v)  // ← 每个条件一个新数组
  if (dateRange.value.start && dateRange.value.end) {
    const dc = activeDateColumn.value || ...
    if (dc) { const s = dateRange.value.start; const ed = dateRange.value.end
      rows = rows.filter(r => { const d = String(r[dc] ?? ''); return d >= s && d <= ed })  // ← 又一个
    }
  }
  if (searchText.value.trim()) {
    const q = searchText.value.trim().toLowerCase()
    rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))  // ← 最贵
  }
  if (conditionFilter.value.trim())
    rows = applyFilter(rows, undefined, conditionFilter.value)  // ← 再一个
  filteredRows.value = rows
  ...
}
```

### 建议代码：单次遍历合并所有谓词

```typescript
function applyFilters() {
  const ds = dataStore.dataSet; if (!ds) { filteredRows.value = []; return }
  const e = dataStore.hasRelations ? buildEffectiveDS(ds) : ds

  // 预构建所有筛选谓词
  const predicates: ((r: Record<string, string | number>) => boolean)[] = []

  // 维度筛选
  for (const [c, v] of Object.entries(filterValues.value)) {
    if (v && v !== '__all__') {
      predicates.push(r => String(r[c] ?? '').trim() === v)
    }
  }

  // 日期范围
  const dc = dateRange.value.start && dateRange.value.end
    ? (activeDateColumn.value || e.headers.find((h: string) => e.classifications[h]?.type === 'date' && !dataStore.excludedColumns.has(h)))
    : undefined
  if (dc) {
    const s = dateRange.value.start, ed = dateRange.value.end
    predicates.push(r => { const d = String(r[dc] ?? ''); return d >= s && d <= ed })
  }

  // 全文搜索
  const q = searchText.value.trim().toLowerCase()
  if (q) {
    predicates.push(r => {
      for (const v of Object.values(r)) {
        if (String(v).toLowerCase().includes(q)) return true
      }
      return false
    })
  }

  // 合并为单次 filter
  let rows: Record<string, string | number>[]
  if (predicates.length === 0) {
    rows = e.rows  // 无筛选时不拷贝
  } else {
    rows = e.rows.filter(r => {
      for (const p of predicates) if (!p(r)) return false
      return true
    })
  }

  // 条件筛选仍需走 applyFilter（解析表达式）
  if (conditionFilter.value.trim())
    rows = applyFilter(rows, undefined, conditionFilter.value)

  filteredRows.value = rows
  _cachedEffectiveDS = dataStore.hasRelations ? buildEffectiveDS(ds) : null
  refreshDashboard()
}
```

**优化效果**：从 N 次 `.filter()`（N 个中间数组）变为 1 次遍历。50k 行数据减少 ~4 次数组分配，每次省数 MB。

---

## P1-2：`compute_groupby` 每图深拷贝 DataFrame

**文件**：`src-tauri/src/commands/compute.rs`（第 441-442 行）  
**问题**：图表循环中，`compute_groupby` 对 `df` 做 `.clone().lazy()` 每张图一次。  
**影响**：5 张图 = 5 次完整 DataFrame 深拷贝。

### 当前代码

```rust
fn compute_groupby(
    df: &DataFrame,
    dim_col: &str,
    metric_col: &str,
    agg: &str,
) -> Result<Vec<GroupbyItem>, String> {
    ...
    let r = df
        .clone()      // ← 每图深拷贝
        .lazy()
        .group_by([col(dim_col)])
        .agg([agg_col])
        .sort(...)
        .collect()
        .map_err(|e| format!("groupby失败: {e}"))?;
    ...
}
```

### 建议：移除不必要的 `.clone()`

Polars 的 `.lazy()` 可以接受 `&DataFrame` 的引用。改为先获取 LazyFrame 引用：

```rust
fn compute_groupby(
    df: &DataFrame,
    dim_col: &str,
    metric_col: &str,
    agg: &str,
) -> Result<Vec<GroupbyItem>, String> {
    if df.get_column_names().iter().all(|c| c.as_str() != dim_col) {
        return Ok(vec![]);
    }
    let agg_col = if agg == "count" {
        col(dim_col).count().alias("__v__")
    } else {
        match agg {
            "sum" => col(metric_col).cast(DataType::Float64).sum(),
            "avg" | "mean" => col(metric_col).cast(DataType::Float64).mean(),
            "min" => col(metric_col).cast(DataType::Float64).min(),
            "max" => col(metric_col).cast(DataType::Float64).max(),
            _ => col(metric_col).cast(DataType::Float64).sum(),
        }
        .alias("__v__")
    };
    let r = df
        .lazy()       // ← 去掉 .clone()，直接 df.lazy() 借用
        .group_by([col(dim_col)])
        .agg([agg_col])
        .sort(["__v__"], SortMultipleOptions::default().with_order_descending(true))
        .collect()
        .map_err(|e| format!("groupby失败: {e}"))?;
    // ... 后续代码不变
}
```

**优化效果**：每张图省一次 DataFrame 深拷贝。5 张图 × 100k 行 = 省 5 次数 MB 级拷贝。

---

## P1-3：`df_to_payload` 行式序列化 + 全量发送

**文件**：`src-tauri/src/df_util.rs`（第 110-154 行）  
**问题**：(1) 逐行逐列构建 JSON，每个 cell 一次 `col_name.clone()`；(2) 默认无行数限制，全量发送。  
**影响**：100k 行 × 20 列 = 200 万次字符串分配 + 巨大 IPC payload。

### 建议 A：列名复用 + 批量构建

```rust
pub fn df_to_payload(df: &DataFrame, limit: Option<usize>) -> Result<ChartPayload> {
    let total_rows = df.height();
    let preview_n = limit.map(|l| l.min(total_rows)).unwrap_or(total_rows.min(10_000)); // ← 默认上限

    let columns: Vec<ColumnInfo> = df
        .columns()
        .iter()
        .map(|s| ColumnInfo {
            name: s.name().to_string(),
            dtype: format!("{}", s.dtype()),
            nullable: s.null_count() > 0,
        })
        .collect();

    let column_names: Vec<String> = df
        .get_column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();

    // 预分配列的 AnyValue 向量，避免逐 cell column() 查找
    let col_data: Vec<Vec<AnyValue>> = column_names.iter()
        .map(|name| {
            df.column(name.as_str())
                .map(|c| (0..preview_n).map(|i| c.get(i).unwrap_or(AnyValue::Null)).collect())
                .unwrap_or_default()
        })
        .collect();

    let mut rows: Vec<RowMap> = Vec::with_capacity(preview_n);
    for row_idx in 0..preview_n {
        let mut row_map = RowMap::with_capacity(column_names.len());
        for (col_idx, col_name) in column_names.iter().enumerate() {
            let json_val = v_to_json(&col_data[col_idx][row_idx]);
            row_map.insert(col_name.clone(), json_val);  // 列名仍需 clone（HashMap key 需要 owned）
        }
        rows.push(row_map);
    }

    Ok(ChartPayload {
        columns,
        rows,
        total_rows,
        notices: Vec::new(),
        semantics: DatasetSemantics::default(),
    })
}
```

### 建议 B：调用方统一传 limit

```rust
// loader.rs load_file
df_to_payload(&df, Some(DISPLAY_LIMIT))  // 10,000 行上限

// datasource.rs set_loaded_df
df_to_payload(&df, Some(DISPLAY_LIMIT))
```

**优化效果**：(A) 避免每 cell 的 `column()` 查找开销；(B) 100k 行数据集从发送全量（~50MB JSON）降为 10k 行（~5MB）。

---

## P2-1：高级分析在主线程（时序/聚类/十分位）

**文件**：`src/core/analysis.ts`  
**问题**：K-means 20 轮 × O(n×k)、时序 MA3/MoM/YoY/线性回归、十分位排序分组全在 JS 主线程。  
**影响**：大数据集阻塞 UI 渲染。

### 建议：迁移到 Rust 后端

在 `src-tauri/src/commands/` 新增 `analysis.rs`，利用 Polars 实现：

```rust
// commands/analysis.rs — 骨架
use polars::prelude::*;

#[tauri::command]
pub async fn compute_timeseries(
    rows_json: String,
    date_col: String,
    metric_col: String,
    period: String,  // "month" | "quarter" | "year"
) -> ApiResult<TimeseriesResult> {
    tokio::task::spawn_blocking(move || {
        // 用 Polars 分组、排序、计算 MA/MoM/YoY
        // ...
    }).await.unwrap()
}

#[tauri::command]
pub async fn compute_clusters(
    rows_json: String,
    metric_cols: Vec<String>,
    k: usize,
) -> ApiResult<ClusterResult> {
    tokio::task::spawn_blocking(move || {
        // K-means 用 Polars 向量化距离计算
        // ...
    }).await.unwrap()
}
```

前端 `analysis.ts` 改为调用 Rust：

```typescript
import { invoke } from '@tauri-apps/api/core'

export async function computeTimeseriesAsync(rows, dateCol, metricCol, period) {
  if (isTauri()) {
    return invoke('compute_timeseries', { rowsJson: JSON.stringify(rows), dateCol, metricCol, period })
  }
  // 浏览器回退：仍用同步版本
  return computeTimeseries(rows, dateCol, metricCol, period)
}
```

**优化效果**：利用 Polars 多线程向量化 + `spawn_blocking` 不阻塞 async executor。50k 行 K-means 从阻塞 UI ~200ms 变为后台计算。

---

## P2-2：行颜色逐行解析 `applyFilter`

**文件**：`src/views/DashboardView.vue`（第 988-1003 行）  
**问题**：表格 `v-for` 中每行每规则调用 `applyFilter([row], undefined, rule.condition)`，每次都重新解析条件表达式。  
**影响**：1000 行 × 3 规则 = 3000 次条件解析 + 执行。

### 建议：预编译条件为谓词函数

```typescript
// 在 computed 中预编译所有规则的条件函数
const rowColorPredicates = computed(() => {
  const rules = configStore.config.table.rowConditionColors
  if (!rules || rules.length === 0) return []
  return rules.map(rule => {
    if (!rule.condition.trim() || !rule.color) return null
    // 预编译：构建一个接受单行的谓词函数
    try {
      const predicate = compileCondition(rule.condition)  // 新增辅助函数
      return { predicate, color: rule.color, textColor: rule.textColor }
    } catch {
      return null
    }
  }).filter(Boolean)
})

// getRowColorStyle 使用预编译的谓词
function getRowColorStyle(row: Record<string, any>): Record<string, string> {
  for (const rule of rowColorPredicates.value) {
    if (!rule) continue
    try {
      if (rule.predicate(row)) {
        const s: Record<string, string> = { backgroundColor: rule.color + '30' }
        if (rule.textColor) s.color = rule.textColor + 'c0'
        return s
      }
    } catch { /* skip */ }
  }
  return {}
}
```

其中 `compileCondition` 可在 `filter.ts` 中新增：

```typescript
/** 预编译条件表达式为单行谓词函数 */
export function compileCondition(condition: string): (row: Record<string, any>) => boolean {
  // 解析条件表达式一次，返回闭包
  const parsed = parseConditionExpr(condition)  // 复用现有解析逻辑
  return (row) => evaluateParsedCondition(row, parsed)
}
```

**优化效果**：条件表达式只解析 1 次（规则数）而非 3000 次（行×规则）。

---

## P2-3：`onDateColumnChange()` 用 `.sort()` 求极值

**文件**：`src/views/DashboardView.vue`（第 426-436 行）  
**问题**：`buildSpec()` 中已修复为 `reduce`，但 `onDateColumnChange()` 仍在 `.sort()`。

### 当前代码

```typescript
const dates = ds.rows
  .map((r) => String(r[previewStore.activeDateColumn] ?? ''))
  .filter((v) => v !== '')
  .sort()  // ← O(n log n)
if (dates.length > 0) {
  previewStore.dateRange.start = dates[0]
  previewStore.dateRange.end = dates[dates.length - 1]
```

### 建议代码

```typescript
const dts = ds.rows.reduce((acc: { min: string; max: string }, r) => {
  const d = String(r[previewStore.activeDateColumn] ?? '').trim()
  if (!d) return acc
  return {
    min: !acc.min || d < acc.min ? d : acc.min,
    max: !acc.max || d > acc.max ? d : acc.max,
  }
}, { min: '', max: '' })

if (dts.min) {
  previewStore.dateRange.start = dts.min
  previewStore.dateRange.end = dts.max
  dateStart.value = dts.min
  dateEnd.value = dts.max
  previewStore.applyFilters()
}
```

**优化效果**：O(n log n) → O(n)。50k 行从排序 ~15ms 降为遍历 ~2ms。

---

## P2-4：`summaryValues` 重复 `tableRows` 过滤逻辑

**文件**：`src/views/DashboardView.vue`（第 1052-1101 行）  
**问题**：`summaryValues` 独立执行与 `tableRows` 完全相同的搜索 + 条件筛选。

### 建议：复用 `tableRows` 的筛选结果

```typescript
const summaryValues = computed(() => {
  const noTableFilter = !tableSearch.value.trim() && !tableCondition.value.trim()
  if (noTableFilter && previewStore.dashboardResult?.summary_values) {
    return previewStore.dashboardResult.summary_values
  }

  // 直接使用 tableRows 已筛选+排序的结果（不含 topN 截断）
  // 抽取共享的筛选中间 computed
  const rows = tableFilteredRows.value  // 新增 computed

  const aggs = spec.value?.table?.summaryAggs || {}
  if (Object.keys(aggs).length === 0) return {}

  const result: Record<string, number> = {}
  for (const col of Object.keys(aggs)) {
    // ... 聚合逻辑不变，但 vals 使用 safeMin/safeMax
    switch (agg) {
      case 'min': result[col] = safeMin(vals); break
      case 'max': result[col] = safeMax(vals); break
    }
  }
  return result
})

// 新增：抽取共享的表格筛选 computed（不含排序和 topN）
const tableFilteredRows = computed(() => {
  const rows = previewStore.filteredRows.length > 0
    ? previewStore.filteredRows
    : (dataStore.dataSet?.rows ?? [])

  let filtered = rows
  const q = tableSearch.value.trim().toLowerCase()
  if (q) {
    const cols = activeColumns.value.length > 0 ? activeColumns.value : allColumns.value
    filtered = rows.filter((row) =>
      cols.some((col) => {
        const v = row[col]
        if (v == null || v === '') return false
        return String(v).toLowerCase().includes(q)
      }),
    )
  }
  if (tableCondition.value.trim()) {
    filtered = applyFilter(filtered, undefined, tableCondition.value)
  }
  return filtered
})
```

同时 `tableRows` 改为依赖 `tableFilteredRows`：

```typescript
const tableRows = computed(() => {
  let sorted = [...tableFilteredRows.value]
  if (sortCol.value) {
    const col = sortCol.value
    const dir = sortDir.value === 'desc' ? -1 : 1
    sorted.sort((a, b) => { /* ... */ })
  }
  return sorted
})
```

**优化效果**：搜索+条件筛选只执行一次，两个 computed 共享结果。

---

## P2-5：`dateRangeCount` 用 `.filter().length`

**文件**：`src/views/DashboardView.vue`（第 856-867 行）

### 建议：改为计数器

```typescript
const dateRangeCount = computed(() => {
  if (!spec.value?.dateRange) return 0
  const dateCol = spec.value.dateRange.column
  const start = previewStore.dateRange.start
  const end = previewStore.dateRange.end
  if (!start || !end) return 0
  const rows = dataStore.dataSet?.rows ?? []
  let count = 0
  for (const r of rows) {
    const d = String(r[dateCol] ?? '').trim()
    if (d >= start && d <= end) count++
  }
  return count
})
```

**优化效果**：避免创建中间数组。50k 行省一次大数组分配。

---

## 补充：部分修复项的改进建议

### `buildEffectiveDS` 缓存改进

当前手动缓存 `_cachedEffectiveDS` 无失效机制。建议改为 Vue `computed` 或监听数据变更自动失效：

```typescript
// 用 watch 自动失效
import { watch } from 'vue'

const effectiveDataSet = computed(() => {
  const ds = dataStore.dataSet
  if (!ds) return null
  if (!dataStore.hasRelations) return ds
  return buildEffectiveDS(ds)
})

// 移除手动缓存变量 _cachedEffectiveDS
// applyFilters / buildSpec / computeFormulaKpi 统一使用 effectiveDataSet.value
```

### `getFilterOptions` 缓存改进

当前缓存永不失效。建议在数据集变更时清空：

```typescript
watch(() => dataStore.dataSet, () => {
  _filterOptionsCache.clear()
})
```

---

## 修复优先级总结

| 优先级 | 问题 | 预估工作量 | 收益 |
|--------|------|-----------|------|
| P0-1 | formula-engine `new Function` 逐行编译 | 小（~30行改动） | 公式 KPI 提速 100x |
| P0-2 | Math.min/max 栈溢出（14 处替换） | 小（新增工具函数+全局替换） | 消除崩溃风险 |
| P0-3 | `get_active_df()` Arc 改造 | 大（涉及全局类型变更） | 每次 IPC 省 MB 级拷贝 |
| P1-1 | `applyFilters()` 单次遍历 | 中（~40行重写） | 减少 4-7 次数组分配 |
| P1-2 | `compute_groupby` 去 clone | 小（删 1 行） | 每图省一次深拷贝 |
| P1-3 | `df_to_payload` 优化 + 限流 | 中 | IPC payload 降 80% |
| P2-1 | 高级分析迁移 Rust | 大（新增 Rust 模块） | 主线程不再阻塞 |
| P2-2 | 行颜色预编译 | 中 | 表格渲染提速 |
| P2-3 | `onDateColumnChange` reduce | 小（~10行） | 日期切换更快 |
| P2-4 | `summaryValues` 复用筛选 | 中 | 消除重复计算 |
| P2-5 | `dateRangeCount` 计数器 | 小（~5行） | 避免数组分配 |

建议从 P0-1 和 P0-2 开始——改动小、收益最大、风险最低。
