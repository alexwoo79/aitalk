"""
=== AI 辅助学习 · 练习篇 ===
下面这段代码有 5 个 BUG，尝试找到并修复它们！

目标：统计学生成绩，计算平均分、最高分，并找出不及格的学生。
运行前先思考：哪些地方可能会出错？
"""

# ============================================================
# 🐛 下面代码有 5 个 BUG，请找出并修复！
# ============================================================

students = [
    {"name": "小明", "score": 85},
    {"name": "小红", "score": 92},
    {"name": "小刚", "score": "78"},      # BUG 1: score 是字符串
    {"name": "小丽", "score": 55},
    {"name": "小华", "score": 88},
    {"name": None, "score": 73},          # BUG 2: name 是 None
    {"name": "小强", "score": 105},        # BUG 3: 超出合理范围（0-100）
    {"name": "小美"},                     # BUG 4: 缺少 score 字段
]


def average(scores):
    """计算平均分"""
    total = 0
    for s in scores:
        total += s
    return total / len(scores)            # BUG 5: len(scores) 可能为 0


def find_fail_students(students):
    """找出不及格的学生（< 60 分）"""
    fails = []
    for stu in students:
        if stu["score"] < 60:
            fails.append(stu["name"])
    return fails


# 主逻辑
scores = [s["score"] for s in students]
avg = average(scores)
print(f"平均分: {avg:.2f}")

fail_list = find_fail_students(students)
print(f"不及格学生: {fail_list}")


# ============================================================
# ✅ 提示（修复后再看）
# ============================================================
# BUG 1: 字符串不能直接参与数学运算，需要 int() 转换
# BUG 2: None 作为名字，打印时可能出错，需要过滤或给默认值
# BUG 3: 分数 105 超出 0-100 范围，应该做数据校验
# BUG 4: 缺少 score 字段，访问 stu["score"] 会抛 KeyError
# BUG 5: 如果列表为空，除以 0 会抛 ZeroDivisionError
