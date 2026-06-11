// ============================================================
// AI 辅助 Rust · 进阶篇：Tauri 桌面应用 — 备忘录管理器
//
// 运行前需要安装 Tauri CLI：
//   cargo install tauri-cli
//
// 项目初始化（实际项目中由 AI 帮你生成完整结构）：
//   cargo install create-tauri-app
//   cargo tauri init
//   cargo tauri dev
//
// 本文档展示的是 AI 为你生成的核心后端代码骨架。
// ============================================================

// 阻止创建控制台窗口（Windows）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use chrono::Local;

// ============================================================
// 数据结构
// ============================================================

/// 一条备忘录
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Memo {
    id: usize,
    title: String,
    content: String,
    tags: Vec<String>,
    created_at: String,
    pinned: bool,
}

/// 应用状态（内存存储）
struct AppState {
    memos: Mutex<Vec<Memo>>,
    next_id: Mutex<usize>,
}

// ============================================================
// Tauri 命令（前端通过 invoke 调用这些函数）
// ============================================================

/// 获取所有备忘录（支持标签筛选 + 搜索）
#[tauri::command]
fn get_memos(
    state: State<AppState>,
    tag_filter: Option<String>,
    search: Option<String>,
) -> Result<Vec<Memo>, String> {
    let memos = state.memos.lock().map_err(|e| e.to_string())?;

    let filtered: Vec<Memo> = memos
        .iter()
        .filter(|m| {
            // 标签筛选
            let tag_ok = match &tag_filter {
                Some(tag) => m.tags.contains(tag),
                None => true,
            };
            // 关键词搜索（标题或内容）
            let search_ok = match &search {
                Some(keyword) => {
                    let kw = keyword.to_lowercase();
                    m.title.to_lowercase().contains(&kw)
                        || m.content.to_lowercase().contains(&kw)
                }
                None => true,
            };
            tag_ok && search_ok
        })
        .cloned()
        .collect();

    Ok(filtered)
}

/// 创建新备忘录
#[tauri::command]
fn create_memo(
    state: State<AppState>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<Memo, String> {
    let mut memos = state.memos.lock().map_err(|e| e.to_string())?;
    let mut next_id = state.next_id.lock().map_err(|e| e.to_string())?;

    let memo = Memo {
        id: *next_id,
        title,
        content,
        tags,
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        pinned: false,
    };

    *next_id += 1;
    memos.push(memo.clone());
    Ok(memo)
}

/// 更新备忘录
#[tauri::command]
fn update_memo(
    state: State<AppState>,
    id: usize,
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    pinned: Option<bool>,
) -> Result<Memo, String> {
    let mut memos = state.memos.lock().map_err(|e| e.to_string())?;

    let memo = memos
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("备忘录 #{} 不存在", id))?;

    if let Some(t) = title { memo.title = t; }
    if let Some(c) = content { memo.content = c; }
    if let Some(tags) = tags { memo.tags = tags; }
    if let Some(p) = pinned { memo.pinned = p; }

    Ok(memo.clone())
}

/// 切换置顶状态
#[tauri::command]
fn toggle_pin(state: State<AppState>, id: usize) -> Result<Memo, String> {
    let mut memos = state.memos.lock().map_err(|e| e.to_string())?;
    let memo = memos
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("备忘录 #{} 不存在", id))?;
    memo.pinned = !memo.pinned;
    Ok(memo.clone())
}

/// 删除备忘录
#[tauri::command]
fn delete_memo(state: State<AppState>, id: usize) -> Result<String, String> {
    let mut memos = state.memos.lock().map_err(|e| e.to_string())?;
    let len_before = memos.len();
    memos.retain(|m| m.id != id);

    if memos.len() == len_before {
        Err(format!("备忘录 #{} 不存在", id))
    } else {
        Ok(format!("备忘录 #{} 已删除", id))
    }
}

/// 获取所有标签（去重）
#[tauri::command]
fn get_all_tags(state: State<AppState>) -> Result<Vec<String>, String> {
    let memos = state.memos.lock().map_err(|e| e.to_string())?;
    let mut tags: Vec<String> = memos
        .iter()
        .flat_map(|m| m.tags.clone())
        .collect();
    tags.sort();
    tags.dedup();
    Ok(tags)
}

/// 统计信息
#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<Stats, String> {
    let memos = state.memos.lock().map_err(|e| e.to_string())?;
    Ok(Stats {
        total: memos.len(),
        pinned: memos.iter().filter(|m| m.pinned).count(),
        total_tags: memos.iter().flat_map(|m| &m.tags).count(),
    })
}

#[derive(Debug, Serialize)]
struct Stats {
    total: usize,
    pinned: usize,
    total_tags: usize,
}

// ============================================================
// 应用入口
// ============================================================
fn main() {
    tauri::Builder::default()
        // 注册全局状态
        .manage(AppState {
            memos: Mutex::new(Vec::new()),
            next_id: Mutex::new(1),
        })
        // 注册所有命令（前端可调用）
        .invoke_handler(tauri::generate_handler![
            get_memos,
            create_memo,
            update_memo,
            toggle_pin,
            delete_memo,
            get_all_tags,
            get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}

// ============================================================
// 💡 AI 辅助要点
// ============================================================
// 1. 你只需描述：「一个备忘录桌面应用，支持增删改查、标签、置顶」
// 2. AI 生成：数据结构 + Tauri 命令 + 状态管理
// 3. 前端通过 invoke('create_memo', { title: '...', ... }) 调用后端
// 4. Rust 的所有权系统确保多线程安全（Mutex）
// 5. Serialize/Deserialize 自动处理 JSON 序列化
