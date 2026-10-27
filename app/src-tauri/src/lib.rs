mod image_convert;
mod image_tools;
mod table_convert;

#[cfg(windows)]
mod global_drag;

use std::path::PathBuf;
use tauri::Manager;

/// Encaminha o resultado de uma operação de imagem, avisando o Shell do
/// Windows sobre o arquivo novo quando ela dá certo.
fn finish(result: anyhow::Result<String>) -> Result<String, String> {
    let path = result.map_err(|e| e.to_string())?;

    #[cfg(windows)]
    notify_shell_file_created(&path);

    Ok(path)
}

#[tauri::command]
fn convert_image(input_path: String, output_dir: String, target_format: String) -> Result<String, String> {
    finish(image_convert::convert_image(&input_path, &output_dir, &target_format))
}

#[tauri::command]
fn compress_image(input_path: String, output_dir: String) -> Result<String, String> {
    finish(image_tools::compress_image(&input_path, &output_dir))
}

#[tauri::command]
fn rotate_image(input_path: String, output_dir: String, clockwise: bool) -> Result<String, String> {
    finish(image_tools::rotate_image(&input_path, &output_dir, clockwise))
}

#[tauri::command]
fn flip_image(input_path: String, output_dir: String) -> Result<String, String> {
    finish(image_tools::flip_image(&input_path, &output_dir))
}

#[tauri::command]
fn strip_metadata(input_path: String, output_dir: String) -> Result<String, String> {
    finish(image_tools::strip_metadata(&input_path, &output_dir))
}

/// Avisa o Shell do Windows que um arquivo novo foi criado. Sem isso,
/// janelas do Explorer já abertas na pasta não atualizam sozinhas (o
/// Desktop atualiza porque tem monitoramento próprio sempre ativo).
#[cfg(windows)]
fn notify_shell_file_created(path: &str) {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_CREATE, SHCNF_PATHW};

    let wide = HSTRING::from(path);
    unsafe {
        SHChangeNotify(
            SHCNE_CREATE,
            SHCNF_PATHW,
            Some(wide.as_ptr() as *const _),
            None,
        );
    }
}

#[tauri::command]
fn supported_image_formats() -> Vec<&'static str> {
    image_convert::supported_target_formats()
}

#[tauri::command]
fn convert_table(input_path: String, output_dir: String, target_format: String) -> Result<String, String> {
    finish(table_convert::convert_table(&input_path, &output_dir, &target_format))
}

#[tauri::command]
fn supported_table_formats() -> Vec<&'static str> {
    table_convert::supported_target_formats()
}

#[tauri::command]
fn default_output_dir(input_path: String) -> String {
    PathBuf::from(&input_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(input_path)
}

#[tauri::command]
fn wheel_dismiss(app: tauri::AppHandle) {
    #[cfg(windows)]
    global_drag::dismiss_wheel(&app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            convert_image,
            compress_image,
            rotate_image,
            flip_image,
            strip_metadata,
            supported_image_formats,
            convert_table,
            supported_table_formats,
            default_output_dir,
            wheel_dismiss
        ])
        .setup(|app| {
            #[cfg(windows)]
            global_drag::start(app.handle().clone());

            let show_item =
                tauri::menu::MenuItem::with_id(app, "show", "Abrir arquivoX", true, None::<&str>)?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray_icon = {
                let bytes = include_bytes!("../icons/tray-default.png");
                let decoded = image::load_from_memory(bytes)
                    .expect("ícone da bandeja embutido inválido")
                    .to_rgba8();
                let (width, height) = decoded.dimensions();
                tauri::image::Image::new_owned(decoded.into_raw(), width, height)
            };

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("arquivoX")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            if let Some(main) = app.get_webview_window("main") {
                let main_clone = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
