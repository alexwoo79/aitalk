"""
=== AI 辅助学习 · 练习篇 ===
下面这段代码有 5 个 BUG，尝试找到并修复它们！

场景：学生成绩统计系统
目标：计算平均分、最高分，并找出不及格（< 60 分）的学生。

运行方式：python 02_debug练习_找bug_纯净版.py

提示：代码中隐藏了 5 种不同类型的 Bug，包括数据类型、空值、数据校验、
     缺失字段和边界条件等方面。请先运行看看会报什么错！
"""

students = [
    {"name": "小明", "score": 85},
    {"name": "小红", "score": 92},
    {"name": "小刚", "score": "78"},
    {"name": "小丽", "score": 55},
    {"name": "小华", "score": 88},
    {"name": None, "score": 73},
    {"name": "小强", "score": 105},
    {"name": "小美"},
]


def average(scores):
    """计算平均分"""
    total = 0
    for s in scores:
        total += s
    return total / len(scores)


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
