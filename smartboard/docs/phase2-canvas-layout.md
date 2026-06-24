# Phase 2: Canvas Free Layout

## 概述

引入 `vue-grid-layout` 实现画布式自由布局，将 Dashboard 的 KPI 卡片和图表变为可拖拽、可缩放的 Widget。

## 架构

```
vue-grid-layout (12列响应式网格)
├── KPI Widget       (w:3, h:2)  ─┐
├── Bar Chart Widget (w:6, h:4)   ├── draggable + resizable
├── Doughnut Widget  (w:3, h:4)   │
├── Line Chart Widget(w:6, h:4)  ─┘
└── ...
```

## 数据类型

```typescript
interface LayoutItem {
  i: string       // widget id: "kpi-0", "chart-{uuid}"
  x: number       // grid column (0-11)
  y: number       // grid row
  w: number       // width in columns (1-12)
  h: number       // height in rows
  minW?: number
  minH?: number
}
```

`DashboardConfig` 和 `DashboardSpec` 新增 `layout?: LayoutItem[]`

## 任务列表

- [x] **Task 1**: 安装依赖 `npm install vue-grid-layout`
- [x] **Task 2**: 类型定义 — `LayoutItem` 接口，`layout` 字段加入 config/spec
- [x] **Task 3**: Store 更新 — `buildSpec` 透传 layout，`resetConfig` 生成默认布局
- [x] **Task 4**: DashboardView — 替换 KPI/图表网格为 `<grid-layout>` + `<grid-item>`
- [x] **Task 5**: CSS — 引入 grid-layout 样式，深色主题适配
- [ ] **Task 6**: 验证 — 拖拽、缩放、布局持久化、刷新恢复

## 涉及文件

| 文件 | 改动 |
|------|------|
| `package.json` | 新增 `vue-grid-layout` 依赖 |
| `src/types/config.ts` | 新增 `LayoutItem`，`DashboardConfig.layout` |
| `src/types/spec.ts` | `DashboardSpec.layout` |
| `src/stores/preview-store.ts` | `buildSpec` 复制 layout |
| `src/stores/config-store.ts` | 自动生成默认布局 |
| `src/views/DashboardView.vue` | 网格替换为 canvas |
| `src/assets/main.css` | 引入 grid-layout 样式 |

## 不包含

- ConfigView 预览区不改动
- 断点响应式布局（mobile/tablet）
- 布局撤销/重做
