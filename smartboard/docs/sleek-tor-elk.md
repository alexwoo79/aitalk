# SmartBoard 性能分析报告（纯分析，不修改代码）

## Context
对 SmartBoard（Tauri 2 + Vue 3 + Rust/Polars）项目进行性能分析。项目是桌面数据仪表盘构建工具，支持多数据源（CSV/Excel/JSON/Parquet/SQLite/MySQL/PostgreSQL/飞书），前端 ECharts 渲染，后端 Polars 处理数据。

---

## 前端（TypeScript / Vue）

### P0 — 严重
1. **`new Function()` 逐行编译** — `formula-engine.ts:112`，每行数据触发一次 JS 编译器流水线
2. **`Math.min/max(...spread)` 栈溢出** — 6 处文件，数组超 65536 元素即崩溃

### P1 — 高
3. **`buildEffectiveDS()` 重复 Join** — `preview-store.ts:32-56`，每次筛选触发 2~3 次全量 join
4. **`applyFilters()` 链式中间数组** — `preview-store.ts:79-89`，5~8 次 `.filter()` 各产生新数组
5. **`getFilterOptions()` 无缓存** — `preview-store.ts:140`，每列每次渲染全量扫描

### P2 — 中等
6. **高级分析在主线程** — `analysis.ts` K-means/时序/十分位阻塞 UI
7. **行颜色逐行解析** — `DashboardView.vue:988-1003`，1000 行 × 3 规则 = 3000 次解析
8. **日期范围 `.sort()` 求极值** — O(n log n) 可改 O(n)
9. **`summaryValues` 与 `tableRows` 重复过滤** — 相同谓词执行两次

## 后端（Rust / Tauri / Polars）

### P0 — 架构级
10. **`get_active_df()` 深拷贝** — `state.rs:93-99`，每次 IPC 调用克隆整个 DataFrame
11. **全 `Mutex` 无 `RwLock`** — `state.rs:21-41`，并发读操作串行化
12. **锁顺序不一致** — `push_clean_history` vs `pop_clean_history`，死锁风险

### P1 — 高
13. **IPC Payload 全量行式序列化** — `df_util.rs:110-154`，200 万次字符串分配/100k 行
14. **KPI/图表逐项 clone+collect** — `compute.rs:86-118`，~17 次 DataFrame 深拷贝/刷新
15. **DataFrame 冗余存储** — 同一数据 6 个副本（GLOBAL_DF + REGISTRY + HISTORY + IPC + 前端）

### P2 — 中等
16. **CPU 工作在 async 线程** — 所有 command 的 Polars 操作阻塞 tokio 线程池
17. **SQLite/剪贴板经临时文件** — `datasource.rs`，内存→磁盘→内存无谓周转
18. **Lazy Frame 未真正融合** — `.lazy()` 后紧跟 `.collect()`，优化器无法发挥作用

## 架构级问题
- 前后端分工不均：最耗 CPU 的分析计算（时序/聚类/公式）全在 JS 主线程，Rust 只做基础聚合
- 数据 6 份副本：Rust GLOBAL_DF → REGISTRY(clone) → HISTORY(clone) → IPC JSON → dataStore → filteredRows

## 验证方式
- Chrome DevTools Performance 面板录制筛选切换，观察 Long Task
- Rust 端 `std::time::Instant` 打点 `compute_dashboard` 各阶段
- Activity Monitor 观察内存随数据集和 undo 操作的增长
- 100k+ 行 CSV 验证 `Math.min(...spread)` 栈溢出
