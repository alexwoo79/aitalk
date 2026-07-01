// SmartBoard Tauri 后端入口
//
// 注册所有 Tauri 命令，启动应用。

#![allow(dead_code)] // 预置模块（clean/undo/chart-store 等）Phase 5+ 逐步启用

mod commands;
mod df_util;
mod state;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // ── 文件加载 ──
            commands::loader::load_file,
            commands::loader::load_files,
            commands::loader::get_dataframe_info,
            // ── Excel 选区 ──
            commands::excel_selection::list_excel_sheets,
            commands::excel_selection::load_excel_sheet,
            // ── 数据合并 ──
            commands::merge::join_datasets,
            commands::merge::concat_datasets,
            // ── SQL 数据库（仅桌面端）──
            #[cfg(not(target_os = "ios"))]
            commands::database::test_db_connection,
            #[cfg(not(target_os = "ios"))]
            commands::database::execute_db_query,
            #[cfg(not(target_os = "ios"))]
            commands::database::load_db_table,
            commands::compute::compute_dashboard,
            commands::groupby::groupby_agg,
            commands::groupby::compute_kpi_values,
            commands::groupby::compute_chart_data,
            commands::groupby::compute_table_summary,
            commands::groupby::compute_chart_groupby_filtered,
            // ── 高级分析 ──
            commands::analysis::compute_timeseries,
            commands::analysis::compute_deciles,
            commands::analysis::compute_clusters,
            // ── 多数据源接入 ──
            commands::datasource::paste_from_clipboard,
            commands::datasource::load_json_file,
            commands::datasource::load_parquet_file,
            commands::datasource::fetch_from_url,
            commands::datasource::list_sqlite_tables,
            commands::datasource::load_sqlite_table,
            commands::datasource::execute_sqlite_query,
            // ── 飞书多维表格 ──
            commands::feishu::test_feishu_connection,
            commands::feishu::load_feishu_table,
            // ── 局域网分享 ──
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::get_server_status,
            commands::server::update_server_html,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
