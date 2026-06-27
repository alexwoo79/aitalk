全部检查完毕，以下是汇总。原始报告共 18 个问题，现在来看修复情况：

---

## 已修复（5 项）

**`RwLock` 替换 `Mutex`** — `state.rs` 全部 7 个全局变量已从 `Mutex` 改为 `RwLock`，并发读操作不再串行化。

**锁顺序统一** — `push_clean_history` 和 `pop_clean_history` 现在都按 `GLOBAL_DF → CLEAN_HISTORY` 的顺序获取锁，死锁风险已消除。代码中还有注释明确标注了锁顺序。

**`getFilterOptions()` 加了缓存** — `preview-store.ts` 用 `Map<string, string[]>` 缓存了筛选选项，不再每次渲染都全量扫描。不过注意缓存目前没有失效机制，数据集变更时可能返回旧值。

**`buildSpec()` 日期范围改用 reduce** — `preview-store.ts` 中取日期极值已从 `.sort()` 改为 O(n) 的 `reduce`。

**KPI 列名提取移到循环外** — `compute.rs` 中 `names` 向量现在在 KPI 循环外只构建一次。

---

## 部分修复（2 项）

**`buildEffectiveDS()` 加了手动缓存** — `preview-store.ts` 增加了 `_cachedEffectiveDS` 变量，同一轮 `applyFilters` 周期内不会重复 join。但这是手动缓存而非 Vue `computed`，且没有失效逻辑，数据变更时可能返回旧值。

**KPI 筛选 DataFrame 共享** — `compute.rs` 用 `HashMap<String, DataFrame>` 缓存了相同 filter 条件的 KPI 结果。无筛选条件的 KPI 直接共享 `&filtered` 引用（很好）。但每个不同的 filter 仍然会 clone + lazy + collect 一次。

---

## 未修复（11 项）

**P0 — 公式引擎 `new Function()` 逐行编译** — `formula-engine.ts:112` 仍在 `for (const row of rows)` 循环内调用 `new Function()`。这是前端最严重的性能瓶颈，大数据集下完全阻塞 UI。应在循环外预编译一个函数，循环内只传参数调用。

**P0 — `Math.min/max(...spread)` 栈溢出** — 仍有 **6 处**使用展开运算符：`aggregator.ts:47-50`、`chart-options.ts:30-31` 和 `563-564`、`preview-store.ts:139` 和 `156`、`DashboardView.vue:1096-1097`。数组超过约 65,536 个元素会直接崩溃。

**P1 — `applyFilters()` 链式 `.filter()`** — `preview-store.ts:83-90` 仍然先 `[...e.rows]` 拷贝全量行，再逐条件 `.filter()` 产生多个中间数组。全文搜索仍然 `Object.values(r).some(v => String(v).toLowerCase().includes(q))` 对每行每列做字符串转换。应合并为单次遍历。

**P2 — 高级分析在主线程** — `analysis.ts` 的时序分析、K-means 聚类、十分位计算仍然是纯同步函数，无 Web Worker 或异步卸载。

**P2 — 行颜色逐行解析** — `DashboardView.vue:988-1003` 的 `getRowColorStyle()` 仍在表格 `v-for` 中对每行每条规则重新解析条件表达式。

**P2 — `onDateColumnChange()` 仍用 `.sort()` 求极值** — `DashboardView.vue:427-429` 对全量日期排序只为取首尾，`buildSpec()` 那边已修复但这里没有。

**P2 — `summaryValues` 重复 `tableRows` 过滤逻辑** — `DashboardView.vue:1052-1101` 仍独立执行与 `tableRows` 相同的搜索和条件筛选。

**P2 — `dateRangeCount` 用 `.filter().length`** — `DashboardView.vue:856-867` 仍创建中间数组只为取 `.length`。

**P0（后端）— `get_active_df()` 深拷贝** — `state.rs` 仍返回 `.cloned()` 的完整 DataFrame 副本。虽然新增了 `with_active_df` 闭包读取的辅助函数，但大多数调用者仍用 `get_active_df()`。需要 `Arc<DataFrame>` 才能根本解决。

**P1（后端）— `compute_groupby` 每图 `.clone().lazy()`** — `compute.rs` 的图表循环中，每张图仍对整个 filtered DataFrame 做一次深拷贝。

**P1（后端）— `df_to_payload` 行式序列化** — `df_util.rs:132-145` 仍逐行逐列构建 JSON，每个 cell 一次 `col_name.clone()`。且仍无行数限制，全量发送。

**P2（后端）— `register_dataset` 仍 clone DataFrame** — `state.rs:69`。

**P2（后端）— 剪贴板/SQLite 经临时文件** — `datasource.rs` 的 `paste_from_clipboard` 和 `load_sqlite_query` 仍写临时文件再 Polars 读取。

**P2（后端）— `infer_schema_length(None)`** — `loader.rs:277` 和 `datasource.rs:191` 仍用 `None` 全量扫描推断类型。


全部检查完毕。原始报告 18 个问题的修复情况如下：

---

## 已修复（5 项）

**后端 `RwLock` 替换 `Mutex`** — `state.rs` 全部 7 个全局变量已改为 `RwLock`，并发读不再串行化。

**后端锁顺序统一** — `push_clean_history` 和 `pop_clean_history` 现在都按 `GLOBAL_DF → CLEAN_HISTORY` 顺序获取锁，死锁风险消除，代码中还加了注释标注。

**前端 `getFilterOptions()` 加了缓存** — `preview-store.ts` 用 `Map<string, string[]>` 缓存筛选选项。不过缓存目前没有失效机制，数据集变更时可能返回旧值。

**前端 `buildSpec()` 日期范围改用 reduce** — 取日期极值已从 O(n log n) 的 `.sort()` 改为 O(n) 的 `reduce`。

**后端 KPI 列名提取移到循环外** — `compute.rs` 中 `names` 向量现在只构建一次，不再每个 KPI 重复 collect。

---

## 部分修复（2 项）

**前端 `buildEffectiveDS()` 手动缓存** — 增加了 `_cachedEffectiveDS` 变量，同一轮 `applyFilters` 内不重复 join。但是手动缓存而非 Vue `computed`，且无失效逻辑，数据变更时可能返回陈旧数据。

**后端 KPI 筛选 DataFrame 共享** — `compute.rs` 用 `HashMap<String, DataFrame>` 缓存相同 filter 的结果，无筛选条件的 KPI 直接共享 `&filtered`。但每个不同的 filter 仍然 clone + lazy + collect。

---

## 未修复（11 项）

### P0 — 严重

**1. 公式引擎 `new Function()` 逐行编译**（`formula-engine.ts:112`）— 循环内每行创建一个新的 Function 对象触发 JS 编译器流水线。大数据集下完全阻塞 UI。应在循环外预编译：`const fn = new Function(...aliases, '"use strict"; return (' + innerExpr + ')')`，循环内只 `fn(...args)`。

**2. `Math.min/max(...spread)` 栈溢出**（6 处）— `aggregator.ts:47-50`、`chart-options.ts:30-31` 和 `563-564`、`preview-store.ts:139` 和 `156`、`DashboardView.vue:1096-1097`。数组超 ~65,536 元素即 `RangeError` 崩溃。

**3. `get_active_df()` 深拷贝**（`state.rs`）— 仍返回 `.cloned()` 的完整 DataFrame。虽新增了 `with_active_df` 闭包读取辅助函数，但大多数调用者仍用 `get_active_df()`。根本解决需要 `Arc<DataFrame>`。

### P1 — 高

**4. `applyFilters()` 链式 `.filter()`**（`preview-store.ts:83-90`）— 仍先 `[...e.rows]` 全量拷贝，再逐条件 `.filter()` 产生多个中间数组。全文搜索对每行每列做 `String(v).toLowerCase()` 转换。

**5. `compute_groupby` 每图深拷贝**（`compute.rs`）— 图表循环中每张图对整个 filtered DataFrame 做一次 `.clone().lazy().group_by().collect()`。

**6. `df_to_payload` 行式序列化**（`df_util.rs:132-145`）— 逐行逐列构建 JSON，每个 cell 一次 `col_name.clone()`。且仍无行数限制，全量发送。

### P2 — 中等

**7. 高级分析在主线程**（`analysis.ts`）— 时序/K-means/十分位仍纯同步，无 Web Worker 或 Rust offload。

**8. 行颜色逐行解析**（`DashboardView.vue:988-1003`）— 表格 v-for 中每行每规则重新解析条件表达式。

**9. `onDateColumnChange()` 仍用 `.sort()` 求极值**（`DashboardView.vue:427-429`）— buildSpec 那边已修复但这里没改。

**10. `summaryValues` 重复 `tableRows` 过滤逻辑**（`DashboardView.vue:1052-1101`）。

**11. `dateRangeCount` 用 `.filter().length`**（`DashboardView.vue:856-867`）— 创建中间数组只为取长度。

---

总结：18 个问题中 **5 项已修复、2 项部分修复、11 项未修复**。最需要优先处理的三个：公式引擎的 `new Function()` 逐行编译（前端卡顿元凶）、6 处 `Math.min/max(...spread)`（大数据集崩溃风险）、以及 Rust 端 `get_active_df()` 深拷贝（每次 IPC 都多拷贝数 MB）。