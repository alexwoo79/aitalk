#!/usr/bin/env python3
"""生成测试数据文件: JSON, Parquet, SQLite"""
import json, csv, sqlite3, os
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE, "smartboard-sample-data.csv")

# ── 读取 CSV ──
rows = []
with open(CSV_PATH, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        r["销售额"] = int(r["销售额"])
        r["销量"] = int(r["销量"])
        r["利润"] = int(r["利润"])
        r["客户数"] = int(r["客户数"])
        rows.append(r)
print(f"Loaded {len(rows)} rows from CSV")

# ═══════════════════════════════════════════════════════════════
# 1. JSON 文件 (数组格式)
# ═══════════════════════════════════════════════════════════════
json_path = os.path.join(BASE, "sample-data.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
print(f"Created: {json_path}")

# ═══════════════════════════════════════════════════════════════
# 2. Parquet 文件
# ═══════════════════════════════════════════════════════════════
df = pd.DataFrame(rows)
parquet_path = os.path.join(BASE, "sample-data.parquet")
df.to_parquet(parquet_path, index=False)
print(f"Created: {parquet_path}")

# ═══════════════════════════════════════════════════════════════
# 3. SQLite 数据库 (含多表)
# ═══════════════════════════════════════════════════════════════
db_path = os.path.join(BASE, "sample-database.db")

# Remove old file
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)

# Table 1: 销售数据 (main table)
conn.execute("""
    CREATE TABLE sales (
        id INTEGER PRIMARY KEY,
        日期 TEXT, 区域 TEXT, 城市 TEXT,
        产品类别 TEXT, 产品名称 TEXT,
        销售额 INTEGER, 销量 INTEGER, 利润 INTEGER, 客户数 INTEGER
    )
""")
for i, r in enumerate(rows):
    conn.execute(
        "INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?)",
        (i+1, r["日期"], r["区域"], r["城市"],
         r["产品类别"], r["产品名称"],
         r["销售额"], r["销量"], r["利润"], r["客户数"])
    )

# Table 2: 区域汇总
conn.execute("""
    CREATE TABLE region_summary AS
    SELECT 区域,
           SUM(销售额) as 总销售额,
           SUM(销量) as 总销量,
           SUM(利润) as 总利润,
           COUNT(*) as 记录数
    FROM sales GROUP BY 区域
""")

# Table 3: 产品类别汇总
conn.execute("""
    CREATE TABLE category_summary AS
    SELECT 产品类别,
           SUM(销售额) as 总销售额,
           AVG(利润) as 平均利润,
           COUNT(DISTINCT 产品名称) as 产品数
    FROM sales GROUP BY 产品类别
""")

conn.commit()

# Verify
tables = conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).fetchall()
for t in tables:
    count = conn.execute(f"SELECT COUNT(*) FROM [{t[0]}]").fetchone()[0]
    print(f"  Table '{t[0]}': {count} rows")

conn.close()
print(f"Created: {db_path}")
print("\n✅ All test files generated.")
