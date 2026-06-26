// SmartBoard Tauri 后端入口
//
// 注册所有 Tauri 命令，启动应用。

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
            // ── 聚合计算 ──
            commands::groupby::groupby_agg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
