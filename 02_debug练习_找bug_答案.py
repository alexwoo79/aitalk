"""
=== AI 辅助学习 · 练习篇（教师参考答案）===
5 个 BUG 的定位与修复方案

场景：学生成绩统计系统
"""

students = [
    {"name": "小明", "score": 85},
    {"name": "小红", "score": 92},
    {"name": "小刚", "score": "78"},       # BUG 1: score 是字符串
    {"name": "小丽", "score": 55},
    {"name": "小华", "score": 88},
    {"name": None, "score": 73},           # BUG 2: name 是 None
    {"name": "小强", "score": 105},         # BUG 3: 超出 0-100 范围
    {"name": "小美"},                       # BUG 4: 缺少 score 字段
]


def average(scores):
    """计算平均分"""
    # BUG 5 修复：空列表检查
    if not scores:
        return 0.0

    total = 0
    for s in scores:
        total += s
    return total / len(scores)


def find_fail_students(students):
    """找出不及格的学生（< 60 分）"""
    fails = []
    for stu in students:
        # BUG 2 修复：跳过 name 为 None 的记录
        if stu.get("name") is None:
            continue
        # BUG 4 修复：用 .get() 安全访问 score
        score = stu.get("score")
        if score is None:
            continue
        # BUG 1 修复：确保 score 是数字
        score = int(score) if isinstance(score, str) else score
        # BUG 3 修复：校验分数范围
        if not (0 <= score <= 100):
            print(f"⚠️ 警告：{stu['name']} 的分数 {score} 超出合理范围")
            continue
        if score < 60:
            fails.append(stu["name"])
    return fails


def clean_students(students):
    """数据清洗：过滤无效数据，统一类型"""
    clean = []
    for stu in students:
        # 跳过无效记录
        if stu.get("name") is None:
            print(f"⚠️ 跳过无名字记录：{stu}")
            continue
        if "score" not in stu:
            print(f"⚠️ 跳过缺少分数的记录：{stu['name']}")
            continue

        # 统一分数类型为 int
        score = stu["score"]
        if isinstance(score, str):
            try:
                score = int(score)
            except ValueError:
                print(f"⚠️ 跳过无法转换的分数：{stu['name']} = {score}")
                continue

        # 校验分数范围
        if not (0 <= score <= 100):
            print(f"⚠️ 跳过异常分数：{stu['name']} = {score}")
            continue

        clean.append({"name": stu["name"], "score": score})
    return clean


# 主逻辑（修复后）
clean = clean_students(students)
scores = [s["score"] for s in clean]

avg = average(scores)
print(f"\n有效学生数: {len(clean)}")
print(f"平均分: {avg:.2f}")
print(f"最高分: {max(scores) if scores else 'N/A'}")

fail_list = find_fail_students(students)
print(f"不及格学生: {fail_list if fail_list else '无'}")


# ============================================================
# 5 个 Bug 总结
# ============================================================
print("\n" + "=" * 60)
print("🐛 Bug 总结：")
print("=" * 60)
print("""
BUG 1 - 类型错误：score "78" 是字符串，不能直接参与数学运算
        → 修复：用 int() 转换，或用 isinstance 先检查类型

BUG 2 - 空值处理：name 为 None，打印时会出现 "None" 而非合理名字
        → 修复：检查 None 并跳过，或用 stu.get("name", "未知")

BUG 3 - 数据校验：score=105 超出 0-100 的合理范围
        → 修复：添加 0 <= score <= 100 范围检查

BUG 4 - 缺失字段：小美的记录缺少 score 键，访问 stu["score"] 抛 KeyError
        → 修复：用 .get("score") 安全访问，或在访问前检查键是否存在

BUG 5 - 边界条件：如果 scores 列表为空，len(scores) 为 0，导致除零错误
        → 修复：计算平均分前先检查列表是否为空

💡 最佳实践：
- 永远不要信任外部输入，做好类型检查和范围校验
- 用 .get() 替代 [] 访问字典，避免 KeyError
- 除法前先检查除数是否为零
- 数据清洗和业务逻辑分开，提高代码可读性
""")
