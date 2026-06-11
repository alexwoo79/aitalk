"""
=== AI 辅助学习 · 进阶篇 ===
Flask 图书管理 API 应用

当你告诉 AI：「我想做一个图书管理的 Flask 应用，
支持增删改查，用 SQLite 存储」—— AI 帮你搭好框架。

运行方式：
    pip install flask
    python 03_flask应用_图书管理.py
    然后访问 http://127.0.0.1:5000/
"""

from flask import Flask, request, jsonify
import sqlite3
import os

app = Flask(__name__)
DB_NAME = "books.db"


# ============================================================
# 数据库工具函数
# ============================================================
def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # 让查询结果可用列名访问
    return conn


def init_db():
    """初始化数据库表"""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                year INTEGER,
                isbn TEXT UNIQUE
            )
        """)
        conn.commit()


# ============================================================
# API 路由
# ============================================================

@app.route("/")
def home():
    """首页 - API 使用说明"""
    return jsonify({
        "message": "📚 图书管理 API",
        "endpoints": {
            "GET    /books": "获取所有图书",
            "GET    /books/<id>": "获取单本图书",
            "POST   /books": "添加图书 (JSON: title, author, year, isbn)",
            "PUT    /books/<id>": "更新图书 (JSON: 任意字段)",
            "DELETE /books/<id>": "删除图书",
        }
    })


@app.route("/books", methods=["GET"])
def get_books():
    """获取所有图书，支持 ?author= 筛选"""
    author = request.args.get("author")
    with get_db() as conn:
        if author:
            rows = conn.execute(
                "SELECT * FROM books WHERE author LIKE ?",
                (f"%{author}%",)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM books").fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/books/<int:book_id>", methods=["GET"])
def get_book(book_id):
    """获取单本图书"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        if row is None:
            return jsonify({"error": "图书不存在"}), 404
        return jsonify(dict(row))


@app.route("/books", methods=["POST"])
def add_book():
    """添加图书"""
    data = request.get_json()
    required = ["title", "author"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"缺少必填字段: {field}"}), 400

    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO books (title, author, year, isbn)
                   VALUES (?, ?, ?, ?)""",
                (data["title"], data["author"],
                 data.get("year"), data.get("isbn"))
            )
            conn.commit()
        return jsonify({"message": "图书添加成功"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "ISBN 已存在"}), 409


@app.route("/books/<int:book_id>", methods=["PUT"])
def update_book(book_id):
    """更新图书"""
    data = request.get_json()
    allowed = ["title", "author", "year", "isbn"]
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({"error": "没有可更新的字段"}), 400

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [book_id]

    with get_db() as conn:
        cur = conn.execute(
            f"UPDATE books SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "图书不存在"}), 404
        return jsonify({"message": "图书更新成功"})


@app.route("/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id):
    """删除图书"""
    with get_db() as conn:
        cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "图书不存在"}), 404
        return jsonify({"message": "图书已删除"})


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    if not os.path.exists(DB_NAME):
        init_db()
        print("✅ 数据库已初始化")
    print("🚀 服务启动: http://127.0.0.1:5000")
    app.run(debug=True)
