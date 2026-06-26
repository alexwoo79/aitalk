# SmartBoard 多表上传 + Rust 后端融合 工作计划

> 日期：2026-06-26 | 状态：实施中

## 概要

将 [tauri-vue-bi](https://github.com/user/tauri-vue-bi) 的 Rust/Polars 数据引擎融入 SmartBoard，实现多文件上传、Excel 选区加载、多表关联、跨表 Dashboard。

核心策略：**Rust 负责数据层（加载/清洗/Join/聚合），Vue 负责 UI 层**。分 5 个 Phase 渐进交付。

---

## Phase 0: Rust 后端模块移植（基础设施） ⭐ 最高优先级

**目标**：将 tauri-vue-bi 的核心 Rust 数据引擎模块移植到 SmartBoard 的 `src-tauri/`，建立 Tauri command 通信桥。

### Steps

1. **移植核心依赖** — `Cargo.toml` 添加 polars（lazy、csv、xlsx、parquet）、calamine、serde、serde_json、tokio、uuid
2. **移植 state.rs** — 全局状态：`GLOBAL_DF`、`ORIGINAL_DF`、`CLEAN_HISTORY`、`DATASET_REGISTRY`、`ACTIVE_DATASET_ID`、`GLOBAL_CHART_STORE`
3. **移植 types.rs** — `ApiResult<T>`、`ChartPayload`、`DatasetMeta`、`SheetInfo`、`JoinConfig` 统一 DTO
4. **移植 df_util.rs** — Polars DataFrame → JSON 序列化
5. **移植 commands/loader.rs** — `load_file`、`load_files`（多文件批量）、`get_dataframe_info`
6. **⭐ 新增 commands/excel_selection.rs** — `list_excel_sheets(path) → Vec<SheetInfo>`、`load_excel_sheet(path, index) → DatasetMeta`、`read_excel_selected_range`（从 Excel/WPS 剪贴板读选区）
7. **移植 commands/clean.rs** — `clean_data`、`undo_clean`、`rollback_clean`
8. **移植 commands/merge.rs** — `join_datasets`、`concat_datasets`（多表关联核心）
9. **移植 commands/groupby.rs** — `groupby_agg`（聚合计算）
10. **移植 commands/chart.rs** — `fetch_chart_data`（图表数据准备）
11. **移植 commands/dataset.rs** — `list_datasets`、`switch_dataset`、`save_current_dataset`、`delete_datasets`
12. **注册所有命令** — 在 `lib.rs` Tauri handler 中注册

### 关键文件

| 文件 | 操作 |
|------|------|
| `src-tauri/Cargo.toml` | 添加 polars、calamine |
| `src-tauri/src/lib.rs` | 命令注册 |
| `src-tauri/src/state.rs` | 新建，全局状态 |
| `src-tauri/src/types.rs` | 新建，DTO |
| `src-tauri/src/df_util.rs` | 新建，序列化 |
| `src-tauri/src/commands/loader.rs` | 新建 |
| `src-tauri/src/commands/excel_selection.rs` | ⭐ 新建，Excel 选区 |
| `src-tauri/src/commands/merge.rs` | 新建 |
| `src-tauri/src/commands/groupby.rs` | 新建 |
| `src-tauri/src/commands/chart.rs` | 新建 |
| `src-tauri/src/commands/dataset.rs` | 新建 |

### 验证

- `cargo build` 通过
- invoke `load_file` 返回 `ApiResult<DatasetMeta>`
- invoke `list_excel_sheets("test.xlsx")` 返回 sheet 名 + 行列数
- invoke `load_excel_sheet("test.xlsx", 1)` 加载指定 sheet
- invoke `get_dataframe_info` 返回列信息
- invoke `groupby_agg` 返回聚合 JSON

---

## Phase 1: 前端多表数据模型 + 数据层对接

**目标**：TypeScript 侧支持多数据集，Excel 选区重连到 Rust，`data-store.ts` 从单表扩展为多表。

### Steps

1. **扩展 types/data.ts** — 新增 `MultiTableState`、`Relation`、`DatasetMeta`、`SheetInfo`、`ExcelWorkbookMeta` 接口
2. **重构 data-store.ts** — 从 `DataSet` 改为 `Map<string, DataSet>` + `activeTableId` + `relations[]` + `mainTableId`
3. **⭐ Excel 选区重连** — `DataPreview.vue` sheet 下拉改为调用 Rust `load_excel_sheet`（替代 SheetJS）；`parser.ts` 中 `getXLSXSheetNames` 改为调用 Rust `list_excel_sheets`
4. **新建 composables/use-rust-bridge.ts** — 封装所有 Tauri invoke 为 async 函数
5. **改造 parser.ts** — CSV/Excel 解析改为调用 Rust `load_file`，前端 parser 降级为浏览器 fallback
6. **改造 classifier.ts** — 列类型信息从 Rust `get_dataframe_info` 获取，role 推断保留前端
7. **改造 aggregator.ts** — 聚合改为调用 Rust `groupby_agg`
8. **更新 preview-store.ts** — 适配多表，字段带表名前缀

### 关键文件

| 文件 | 操作 |
|------|------|
| `src/types/data.ts` | 新增接口 |
| `src/stores/data-store.ts` | 重构为多表 + Excel 重连 |
| `src/composables/use-rust-bridge.ts` | 新建 |
| `src/components/upload/DataPreview.vue` | sheet 下拉重连 Rust |
| `src/core/parser.ts` | 改为调用 Rust（保留 fallback）|
| `src/core/classifier.ts` | 改为调用 Rust |
| `src/core/aggregator.ts` | 改为调用 Rust |

### 验证

- 打开含 3 个 sheet 的 xlsx，下拉显示 3 个 sheet 名
- 切换 sheet 数据正确更新
- 上传 2 个 CSV，`tables.size === 2`
- 浏览器环境 fallback 仍可用

---

## Phase 2: 多表上传 UI（UploadView 改造）

**目标**：UploadView 支持多文件，左侧表列表 + 右侧预览/关联。

### Steps

1. **新建 TableListPanel.vue** — 左侧 240px 面板：表名、行数×列数、状态标识、重命名/删除
2. **改造 FileUploader.vue** — 支持 `multiple` + 多文件拖拽，上传后调 Rust `load_files`
3. **改造 UploadView.vue** — 布局：左 TableListPanel + 右 Tab（预览 Tab + 关联 Tab），复用 `DataPreview.vue`
4. **新建 RelationConfig.vue** — 右侧"关联关系"Tab 骨架（表单在 Phase 3）
5. **步骤逻辑** — 单表 UX 完全不变；多表时显示微型步骤条（上传 → 关联 → 完成）
6. **更新 i18n** — `zh-CN.ts`、`en-US.ts` 添加多表 + Excel 选区文案

### 关键文件

| 文件 | 操作 |
|------|------|
| `src/components/upload/TableListPanel.vue` | 新建 |
| `src/components/upload/FileUploader.vue` | 改造 |
| `src/views/UploadView.vue` | 布局重构 |
| `src/components/upload/RelationConfig.vue` | 新建骨架 |
| `src/i18n/zh-CN.ts` | 新增文案 |
| `src/i18n/en-US.ts` | 新增文案 |

---

## Phase 3: 多表关联配置（Join + Relation）

**目标**：用户通过下拉表单建立表间关联，Rust 执行 Polars Join。

### Steps

1. **实现 RelationConfig.vue 表单** — 左表.字段 → join 类型（left/inner/full + 中文解释）→ 右表.字段
2. **智能关联辅助** — 字段名相似度 + 类型匹配，自动推荐候选
3. **关联预览** — 调用 Rust `join_datasets` 返回前 500 行采样
4. **主表设定** — 表列表中星标图标设定主表
5. **关联管理** — 已建立关联卡片列表，支持删除/编辑
6. **基数检测** — 左右字段 `COUNT` vs `COUNT DISTINCT`，N:N 时 Warning
7. **ConfigView 适配** — 字段选择器带表名前缀（`收入台账.合同金额`），跨表混选

### 关键文件

| 文件 | 操作 |
|------|------|
| `src/components/upload/RelationConfig.vue` | 表单实现 |
| `src/stores/data-store.ts` | `addRelation`、`removeRelation`、`setMainTable` |
| `src/composables/use-rust-bridge.ts` | `joinDatasets`、`previewJoin` |
| `src/views/ConfigView.vue` | 字段选择器前缀化 |
| `src/core/classifier.ts` | `suggestJoins()` |

---

## Phase 4: 跨表 Dashboard 渲染

**目标**：跨表 KPI 和图表正确计算和渲染。

### Steps

1. **跨表公式** — `formula-engine.ts` 支持 `表名.字段名` 语法
2. **跨表聚合** — `preview-store.ts` 先调 Rust `join_datasets` 再聚合
3. **跨表图表** — `fetch_chart_data` 内部先 join 再 select
4. **筛选器跨表** — `filter.ts` 条件带表名前缀
5. **KPI 跨表** — 支持跨表字段
6. **向后兼容** — 单表行为不变，无前缀默认当前表

### 关键文件

| 文件 | 操作 |
|------|------|
| `src/core/formula-engine.ts` | `表名.字段名` 语法 |
| `src/stores/preview-store.ts` | 跨表 join + 聚合 |
| `src/core/filter.ts` | 跨表筛选 |
| `src/core/aggregator.ts` | 跨表聚合 |
| `src/views/DashboardView.vue` | 适配 |

---

## Phase 5: 持久化与导入导出（可选增强）

**目标**：多表配置可保存/恢复。

### Steps

1. Rust 侧 Parquet + JSON 状态保存
2. 配置导出含多表关系和关联配置
3. 配置导入恢复多表并重新加载数据
4. 看板快照功能

---

## 关键架构决策

| 决策 | 理由 |
|------|------|
| **Rust 计算 + Vue 渲染** | Polars 比 JS 快 10-100x，tauri-vue-bi 已有成熟实现 |
| **Excel 选区走 Rust Calamine** | 替代 SheetJS 前端解析，统一管道，支持更大文件 |
| **classifier.ts role 推断保留前端** | 需用户交互确认，不适合纯后端 |
| **MVP 用下拉表单非画布** | 降低首版成本，画布后续迭代 |
| **单表零感知** | 单表用户体验与现在完全一致 |
| **直接移植 tauri-vue-bi 模块** | 避免重复造轮子 |

---

## 排除范围

- 画布拖拽连线（后续迭代）
- SQL/HTTP/Google Sheets 外部数据源
- AI/Agent 层
- 全局关联（无 workspace 概念）

---

## 实施顺序

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
(Rust)     (数据模型)   (UI)       (关联)      (渲染)      (持久化)
```

Phase 0/1 可部分并行（Rust 移植 + TS 类型定义）。

---

## Excel 选区功能 ⭐

SmartBoard 已有前端 sheet 切换 UI，Phase 0-1 重连到 Rust：

| 功能 | 现状 | 改造后 |
|------|------|--------|
| 列出 sheet | SheetJS `getXLSXSheetNames()` | Rust `list_excel_sheets` |
| 切换 sheet | SheetJS `parseXLSXSheet()` | Rust `load_excel_sheet` |
| 读 Excel 选区 | ❌ 不支持 | Rust `read_excel_selected_range` |
| 多 sheet 注册 | 切换即替换 | 每个 sheet 注册为独立 dataset |
