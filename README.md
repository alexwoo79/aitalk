# AI 赋能学习与业务：从概念到实战

一套面向团队的 AI 辅助编程学习材料，覆盖 Python、R、Rust 三门语言，通过真实案例展示 AI 如何降低编程学习门槛、加速业务开发效率。

## 适合谁

- 想用 AI 工具辅助日常数据分析的业务同事
- 正在学习编程、希望用 AI 加速理解的新手
- 对 AI 辅助开发感兴趣的技术人员
- 想了解 AI 如何改变工作方式的任何人

## 快速开始

### 环境要求

| 语言 | 最低版本 | 安装方式 |
|------|---------|----------|
| Python | 3.10+ | `brew install python` 或 [python.org](https://www.python.org/downloads/) |
| R | 4.0+ | `brew install r` 或 [r-project.org](https://www.r-project.org/) |
| Rust | 最新稳定版 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |

### 运行示例

```bash
# Python 篇
python 01_pandas入门_生活例子.py                        # 入门：奶茶店数据筛选
python 02_debug练习_找bug.py                              # 练习：找出 5 个 Bug
pip install flask && python 03_flask应用_图书管理.py       # 进阶：Flask API 应用

# R 语言篇
Rscript 04_R_dplyr管道操作.R                              # dplyr 管道分析
Rscript 05_R_flextable条件格式.R                          # 专业表格输出
R -e "rmarkdown::render('06_R_Markdown报告模板.Rmd')"      # 一键生成 PDF 报告
quarto render 06_Quarto报告模板.qmd                       # Quarto 报告（推荐）

# Rust 篇
rustc 07_Rust_所有权_生活类比.rs && ./07_Rust_所有权_生活类比  # 所有权概念
rustc 08_Rust_模式匹配练习.rs && ./08_Rust_模式匹配练习        # 模式匹配
cd 09_Rust_Tauri应用 && cargo run                              # 桌面应用
```

## 文件结构

```
aitalk/
├── 00_AI辅助学习架构.md          ← 总体架构文档（培训讲稿）
├── prompt_examples.md            ← AI 提示词实战手册
├── ai_tool_guide.md              ← AI 工具选择指南
│
│   🐍 Python 篇
├── 01_pandas入门_生活例子.py      ← 入门：用奶茶店场景学 pandas 筛选
├── 02_debug练习_找bug.py          ← 练习：5 个典型 Bug 调试训练
├── 02_debug练习_找bug_纯净版.py   ← 练习：不含提示的练习版
├── 02_debug练习_找bug_答案.py     ← 练习：教师参考答案
├── 03_flask应用_图书管理.py       ← 进阶：Flask RESTful API 完整项目
│
│   📊 R 语言篇
├── 04_R_dplyr管道操作.R           ← 入门：dplyr 管道 + 多表关联
├── 05_R_flextable条件格式.R       ← 进阶：条件颜色/图标专业表格
├── 06_R_Markdown报告模板.Rmd      ← 高级：R Markdown PDF 报告
├── 06_Quarto报告模板.qmd          ← 高级：Quarto 新一代报告模板
│
│   🦀 Rust 篇（拓展视野）
├── 07_Rust_所有权_生活类比.rs     ← 入门：用房产证/搬家等类比理解所有权
├── 08_Rust_模式匹配练习.rs        ← 练习：6 个模式匹配实战场景
└── 09_Rust_Tauri应用/             ← 进阶：Rust + Web 技术的全栈桌面应用
```

## 学习路径建议

三条路径可以独立学习，也可以按顺序递进：

**Python 入门** → `01_pandas入门` → `02_debug练习` → `03_flask应用`

**R 数据分析** → `04_dplyr管道` → `05_flextable表格` → `06_报告模板`

**Rust 拓展** → `07_所有权类比` → `08_模式匹配` → `09_Tauri应用`

每个模块都对应「入门→练习→进阶」三层学习架构。详细内容见 [架构文档](00_AI辅助学习架构.md)。

## 培训使用建议

**如果是面对面/线上培训：**

1. 先打开 PPT 做 10-15 分钟的概念引导
2. 然后进入 live demo——当场打开 AI 工具，让同事出题
3. 实时演示「人 + AI」协作过程，展示提示词的迭代优化
4. 最后把这个仓库分享给同事作为自学参考

**如果是自学：**

1. 先读 [AI 提示词实战手册](prompt_examples.md)，了解怎么跟 AI 对话
2. 选一条学习路径，按顺序运行代码
3. 遇到不理解的地方，把代码喂给 AI 让它逐行解释
4. 尝试自己改需求，让 AI 帮你重新生成

## 许可

内部培训材料，仅供团队学习使用。
