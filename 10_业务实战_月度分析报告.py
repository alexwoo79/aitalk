"""
=== AI 辅助学习 · 业务实战篇 ===
用 AI 完成一份完整的业务分析报告

场景：你是某公司的运营分析师，每月需要整理销售数据、找出问题、生成报告。
过去你需要花半天时间在 Excel 里折腾，现在用 AI + Python 10 分钟搞定。

这个脚本展示了 AI 如何帮你完成：
1. 数据清洗（处理缺失值、异常值）
2. 关键指标计算（同比、环比、达成率）
3. 异常检测（自动标记需要关注的区域）
4. 生成分析报告（文本形式，可直接粘贴到邮件/文档）

运行方式：python 10_业务实战_月度分析报告.py
"""

import json
from datetime import datetime


# ============================================================
# 1. 模拟业务数据（实际工作中从 CSV/数据库/Excel 导入）
# ============================================================

# 月度销售数据：4 个区域 × 3 个月
sales_data = [
    {"区域": "华东", "月份": "2024-10", "目标额(万)": 120, "实际额(万)": 135, "客户数": 45},
    {"区域": "华东", "月份": "2024-11", "目标额(万)": 130, "实际额(万)": 128, "客户数": 42},
    {"区域": "华东", "月份": "2024-12", "目标额(万)": 150, "实际额(万)": 165, "客户数": 51},
    {"区域": "华南", "月份": "2024-10", "目标额(万)": 100, "实际额(万)": 95,  "客户数": 38},
    {"区域": "华南", "月份": "2024-11", "目标额(万)": 110, "实际额(万)": 115, "客户数": 40},
    {"区域": "华南", "月份": "2024-12", "目标额(万)": 120, "实际额(万)": 88,  "客户数": 35},
    {"区域": "华北", "月份": "2024-10", "目标额(万)": 80,  "实际额(万)": 82,  "客户数": 28},
    {"区域": "华北", "月份": "2024-11", "目标额(万)": 85,  "实际额(万)": None,"客户数": 30},
    {"区域": "华北", "月份": "2024-12", "目标额(万)": 90,  "实际额(万)": 95,  "客户数": 32},
    {"区域": "西南", "月份": "2024-10", "目标额(万)": 60,  "实际额(万)": 58,  "客户数": 20},
    {"区域": "西南", "月份": "2024-11", "目标额(万)": 65,  "实际额(万)": 70,  "客户数": 22},
    {"区域": "西南", "月份": "2024-12", "目标额(万)": 70,  "实际额(万)": 72,  "客户数": 24},
]


# ============================================================
# 2. 数据清洗：AI 帮你写好的清洗逻辑
# ============================================================
# 💡 提示词示例：
#    "我有月度销售数据，实际额字段可能有缺失值(None)，请帮我做数据清洗：
#     缺失值用该区域前后月份的均值填充，并标记为估算值。"

def clean_data(data):
    """数据清洗：处理缺失值"""
    cleaned = []
    for row in data:
        row = dict(row)  # 复制一份
        if row["实际额(万)"] is None:
            # 找到同区域其他月份的数据来估算
            region_data = [r["实际额(万)"] for r in data
                          if r["区域"] == row["区域"] and r["实际额(万)"] is not None]
            if region_data:
                row["实际额(万)"] = round(sum(region_data) / len(region_data), 1)
                row["备注"] = "⚠️ 估算值"
            else:
                row["实际额(万)"] = 0
                row["备注"] = "❌ 无法估算"
        else:
            row["备注"] = ""
        cleaned.append(row)
    return cleaned


# ============================================================
# 3. 关键指标计算：AI 帮你设计指标体系
# ============================================================
# 💡 提示词示例：
#    "请帮我计算以下业务指标：达成率、环比增长率、客单价。
#     达成率低于 80% 或环比下降超过 15% 的需要标记预警。"

def calculate_metrics(data):
    """计算关键业务指标"""
    results = []
    for row in data:
        actual = row["实际额(万)"]
        target = row["目标额(万)"]

        # 达成率
        achievement = actual / target if target > 0 else 0

        # 客单价（万元/客户）
        arpu = round(actual / row["客户数"], 2) if row["客户数"] > 0 else 0

        # 环比（找上月数据）
        month_idx = int(row["月份"].split("-")[1])
        prev_month = f"{row['月份'].split('-')[0]}-{month_idx - 1:02d}"
        prev_data = [r for r in data if r["区域"] == row["区域"] and r["月份"] == prev_month]
        if prev_data:
            prev_actual = prev_data[0]["实际额(万)"]
            growth = (actual - prev_actual) / prev_actual if prev_actual > 0 else 0
        else:
            growth = None

        # 预警判断
        alerts = []
        if achievement < 0.8:
            alerts.append("🔴 达成率低于80%")
        if growth is not None and growth < -0.15:
            alerts.append("🟡 环比下降超过15%")

        results.append({
            "区域": row["区域"],
            "月份": row["月份"],
            "实际额(万)": actual,
            "目标额(万)": target,
            "达成率": f"{achievement:.1%}",
            "环比增长": f"{growth:.1%}" if growth is not None else "—",
            "客单价(万)": arpu,
            "客户数": row["客户数"],
            "预警": " | ".join(alerts) if alerts else "✅",
            "备注": row.get("备注", ""),
        })
    return results


# ============================================================
# 4. 异常检测：自动发现需要关注的问题
# ============================================================
# 💡 提示词示例：
#    "请帮我从以下销售数据中自动检测异常：
#     1. 达成率连续下降的区域
#     2. 某月突然大幅下降的情况
#     3. 客户数和销售额不匹配的情况
#     给出简要的分析原因和建议。"

def detect_anomalies(metrics):
    """异常检测与分析"""
    anomalies = []

    # 按区域分组
    regions = {}
    for m in metrics:
        regions.setdefault(m["区域"], []).append(m)

    for region, months in regions.items():
        # 检查达成率趋势
        achievements = []
        for m in months:
            rate = float(m["达成率"].replace("%", "")) / 100
            achievements.append(rate)

        if len(achievements) >= 2 and all(
            achievements[i] >= achievements[i + 1] for i in range(len(achievements) - 1)
        ):
            anomalies.append({
                "区域": region,
                "类型": "达成率持续下降",
                "详情": f"从 {achievements[0]:.0%} 降至 {achievements[-1]:.0%}",
                "建议": "需要关注该区域的市场策略和团队执行力",
            })

        # 检查单月暴跌
        for i in range(1, len(months)):
            if months[i]["环比增长"] != "—":
                growth = float(months[i]["环比增长"].replace("%", "")) / 100
                if growth < -0.2:
                    anomalies.append({
                        "区域": region,
                        "类型": "单月大幅下滑",
                        "详情": f"{months[i]['月份']} 环比下降 {abs(growth):.0%}",
                        "建议": "排查是否有大客户流失或竞品活动影响",
                    })

    return anomalies


# ============================================================
# 5. 生成分析报告：AI 帮你写的报告模板
# ============================================================
# 💡 提示词示例：
#    "请帮我基于以上分析结果，生成一份月度销售分析报告，包含：
#     执行摘要、整体表现、区域分析、异常预警、行动建议。
#     语气正式但不啰嗦，适合发给管理层。"

def generate_report(metrics, anomalies):
    """生成分析报告"""
    report_date = datetime.now().strftime("%Y年%m月%d日")

    # 整体统计
    total_actual = sum(m["实际额(万)"] for m in metrics)
    total_target = sum(m["目标额(万)"] for m in metrics)
    overall_rate = total_actual / total_target if total_target > 0 else 0
    total_customers = sum(m["客户数"] for m in metrics)
    avg_arpu = total_actual / total_customers if total_customers > 0 else 0

    # 找出最新月份
    latest_month = max(m["月份"] for m in metrics)
    latest_data = [m for m in metrics if m["月份"] == latest_month]

    report = f"""
{'=' * 60}
📊 月度销售分析报告
   报告日期：{report_date}
   数据范围：2024年10月 — 12月
{'=' * 60}

一、执行摘要
{'─' * 40}
• 整体达成率：{overall_rate:.1%}（目标 {total_target} 万，实际 {total_actual:.1f} 万）
• 总客户数：{total_customers} 家
• 平均客单价：{avg_arpu:.2f} 万元

二、{latest_month} 各区域表现
{'─' * 40}"""

    for m in latest_data:
        report += f"""
  {m['区域']}：达成率 {m['达成率']}，环比 {m['环比增长']}，客单价 {m['客单价(万)']} 万 {m['预警']}"""

    if anomalies:
        report += f"""

三、异常预警（共 {len(anomalies)} 项）
{'─' * 40}"""
        for i, a in enumerate(anomalies, 1):
            report += f"""
  {i}. [{a['区域']}] {a['类型']}
     {a['详情']}
     → 建议：{a['建议']}"""

    report += f"""

四、行动建议
{'─' * 40}
  1. 重点关注华南区域 12 月下滑原因，制定 1 月恢复方案
  2. 西南区域连续 3 个月增长，考虑加大资源投入
  3. 华北 11 月数据缺失，需排查数据录入流程

{'=' * 60}
  报告由 AI 辅助生成，数据请以实际系统为准
{'=' * 60}
"""
    return report


# ============================================================
# 主流程
# ============================================================
if __name__ == "__main__":
    print("🔄 正在清洗数据...")
    clean = clean_data(sales_data)

    print("📊 正在计算指标...")
    metrics = calculate_metrics(clean)

    print("🔍 正在检测异常...")
    anomalies = detect_anomalies(metrics)

    print("📝 正在生成报告...\n")
    report = generate_report(metrics, anomalies)
    print(report)

    # 将指标数据导出为 JSON（实际工作中可以导出为 Excel）
    with open("sales_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print("💾 指标数据已导出到 sales_metrics.json")

    print("""
💡 AI 辅助要点：
  • 数据清洗逻辑——告诉 AI "有缺失值，用均值填充"，它自动写出处理代码
  • 指标体系设计——告诉 AI "计算达成率、环比、客单价"，它设计完整公式
  • 异常检测——告诉 AI "自动找出需要关注的问题"，它生成检测规则
  • 报告撰写——告诉 AI "生成管理层报告"，它写出结构化的分析文本
""")
