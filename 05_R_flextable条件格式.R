# ============================================================
# AI 辅助 R 语言 · flextable 条件格式专业表格
# 场景：销售业绩看板 — 自动高亮、图标、颜色标注
# 安装：install.packages(c("flextable", "dplyr"))
# 运行：Rscript 05_R_flextable条件格式.R
# ============================================================

library(flextable)
library(dplyr)
library(officer)  # fp_border 来自 officer 包

# ============================================================
# 1. 准备数据：销售团队 KPI
# ============================================================
sales <- data.frame(
  姓名   = c("张三","李四","王五","赵六","钱七","孙八"),
  区域   = c("华东","华南","华北","华东","华南","华北"),
  销售额 = c(85.6, 120.3, 67.8, 95.2, 110.5, 78.9),
  完成率 = c(0.86, 1.20, 0.68, 0.95, 1.11, 0.79),
  利润率 = c(0.22, 0.18, 0.25, 0.15, 0.20, 0.28),
  评级   = c("B","A","C","B","A","C"),
  stringsAsFactors = FALSE
)

cat("原始数据:\n")
print(sales)

# ============================================================
# 2. 基础美化表格
# ============================================================
ft <- sales %>%
  flextable() %>%
  
  # --- 表头样式 ---
  bold(part = "header") %>%
  bg(part = "header", bg = "#2c3e50") %>%
  color(part = "header", color = "white") %>%
  
  # --- 对齐 ---
  align(j = c("姓名","区域","评级"), align = "center") %>%
  align(j = c("销售额","完成率","利润率"), align = "right") %>%
  
  # --- 边框 ---
  border_outer(border = fp_border(color = "#2c3e50", width = 2)) %>%
  border_inner_h(border = fp_border(color = "#bdc3c7", width = 0.5)) %>%
  
  # --- 斑马纹 ---
  bg(i = seq(2, nrow(sales), 2), bg = "#ecf0f1", part = "body") %>%
  
  # --- 列宽 ---
  width(j = "姓名", width = 1.2) %>%
  width(j = "区域", width = 1.0) %>%
  width(j = 3:5, width = 1.3)

cat("\n✅ 基础美化表格已生成: 05_sales_basic.docx\n")
save_as_docx(ft, path = "05_sales_basic.docx")

# ============================================================
# 3. 条件格式：颜色规则
# ============================================================
ft_cond <- sales %>%
  flextable() %>%
  
  set_header_labels(
    `姓名` = "👤 姓名",
    `区域` = "📍 区域",
    `销售额` = "💰 销售额(万)",
    `完成率` = "📊 完成率",
    `利润率` = "📈 利润率",
    `评级` = "⭐ 评级"
  ) %>%
  
  # --- 表头 ---
  bold(part = "header") %>%
  bg(part = "header", bg = "#1a5276") %>%
  color(part = "header", color = "white") %>%
  
  # --- 销售额：颜色渐变（红 → 黄 → 绿）---
  bg(
    j = "销售额",
    bg = function(x) {
      col_numeric <- scales::col_numeric(
        palette = c("#e74c3c", "#f39c12", "#2ecc71"),
        domain = range(x)
      )
      col_numeric(x)
    }
  ) %>%
  color(j = "销售额", color = "white") %>%
  bold(j = "销售额") %>%
  
  # --- 完成率：达标绿色，不达标红色 ---
  bg(
    j = "完成率",
    i = ~ 完成率 >= 1.0,
    bg = "#2ecc71"
  ) %>%
  bg(
    j = "完成率",
    i = ~ 完成率 < 1.0,
    bg = "#e74c3c"
  ) %>%
  color(j = "完成率", color = "white") %>%
  
  # --- 利润率：高于 20% 绿色，否则橙色 ---
  bg(
    j = "利润率",
    i = ~ 利润率 >= 0.20,
    bg = "#d5f5e3"
  ) %>%
  bg(
    j = "利润率",
    i = ~ 利润率 < 0.20,
    bg = "#fdebd0"
  ) %>%
  
  # --- 评级：A 绿色 / B 蓝色 / C 红色 ---
  bg(
    j = "评级",
    i = ~ 评级 == "A",
    bg = "#27ae60"
  ) %>%
  bg(
    j = "评级",
    i = ~ 评级 == "B",
    bg = "#2980b9"
  ) %>%
  bg(
    j = "评级",
    i = ~ 评级 == "C",
    bg = "#c0392b"
  ) %>%
  color(j = "评级", color = "white") %>%
  bold(j = "评级") %>%
  
  # --- 数字格式化 ---
  colformat_double(j = "销售额", digits = 1, suffix = "万") %>%
  colformat_double(j = "完成率", digits = 0, suffix = "%") %>%
  colformat_double(j = "利润率", digits = 0, suffix = "%") %>%
  
  # --- 边框美化 ---
  border_outer(border = fp_border(color = "#1a5276", width = 2.5)) %>%
  border_inner(border = fp_border(color = "#d5dbdb", width = 0.5)) %>%
  
  # --- 自动行高 ---
  autofit()

cat("\n✅ 条件格式专业表格已生成: 05_sales_conditional.docx\n")
save_as_docx(ft_cond, path = "05_sales_conditional.docx")

# ============================================================
# 4. 自定义函数：一键生成报告表格
# ============================================================
make_kpi_table <- function(data, filename) {
  # AI 帮你封装好的「一行出表格」函数
  ft <- data %>%
    flextable() %>%
    theme_booktabs() %>%
    bold(part = "header") %>%
    bg(part = "header", bg = "#34495e") %>%
    color(part = "header", color = "white") %>%
    align(align = "center", part = "all") %>%
    autofit()
  save_as_docx(ft, path = filename)
  invisible(ft)
}

# 一行调用
make_kpi_table(sales, "05_sales_oneliner.docx")
cat("✅ 一键生成表格: 05_sales_oneliner.docx\n")

cat("\n\n=== 💡 AI 辅助要点 ===\n")
cat("1. 自然语言描述：「完成率达标标绿，不达标标红」→ AI 写 bg() + 条件\n")
cat("2. 渐变色背景：scales::col_numeric() 自动计算颜色映射\n")
cat("3. 图标化表头：emoji 直接嵌入列名，报告更生动\n")
cat("4. 封装函数后，一行代码搞定专业格式表格\n")
