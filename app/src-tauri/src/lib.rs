mod archive;
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

/// Mesma ideia de `finish`, para operações que produzem mais de um
/// arquivo de saída (compactar várias imagens de uma vez, por exemplo).
fn finish_many(result: anyhow::Result<Vec<String>>) -> Result<Vec<String>, String> {
    let paths = result.map_err(|e| e.to_string())?;

    #[cfg(windows)]
    for path in &paths {
        notify_shell_file_created(path);
    }

    Ok(paths)
}

#[tauri::command]
fn zip_files(input_paths: Vec<String>, output_dir: String) -> Result<Vec<String>, String> {
    finish_many(archive::zip_files(&input_paths, &output_dir))
}

#[tauri::command]
fn compact_files(input_paths: Vec<String>, output_dir: String) -> Result<Vec<String>, String> {
    finish_many(archive::compact_files(&input_paths, &output_dir))
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Uma segunda tentativa de abrir o app só traz a janela
            // existente pra frente, em vez de criar outra instância
            // (o que duplicaria o ícone da bandeja e os hooks globais).
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            convert_image,
            compress_image,
            rotate_image,
            flip_image,
            strip_metadata,
            supported_image_formats,
            convert_table,
            supported_table_formats,
            zip_files,
            compact_files,
            default_output_dir,
            wheel_dismiss
        ])
        .setup(|app| {
            #[cfg(windows)]
            global_drag::start(app.handle().clone());

            // Liga a inicialização automática com o Windows já na primeira
            // execução, já que é o próprio propósito do app ficar rodando
            // em segundo plano (sem isso o gesto global do Shift/Ctrl só
            // funciona depois de abrir manualmente). Fica disponível pra
            // desligar a qualquer momento pelo menu da bandeja.
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }
            }

            let autostart_enabled = {
                use tauri_plugin_autostart::ManagerExt;
                app.autolaunch().is_enabled().unwrap_or(false)
            };

            let show_item =
                tauri::menu::MenuItem::with_id(app, "show", "Abrir arquivoX", true, None::<&str>)?;
            let autostart_item = tauri::menu::CheckMenuItem::with_id(
                app,
                "autostart",
                "Iniciar com o Windows",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu =
                tauri::menu::Menu::with_items(app, &[&show_item, &autostart_item, &quit_item])?;

            let autostart_item_for_toggle = autostart_item.clone();
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("arquivoX")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "autostart" => {
                        use tauri_plugin_autostart::ManagerExt;
                        let autostart = app.autolaunch();
                        let currently_enabled = autostart.is_enabled().unwrap_or(false);
                        let result = if currently_enabled {
                            autostart.disable()
                        } else {
                            autostart.enable()
                        };
                        if result.is_ok() {
                            let _ = autostart_item_for_toggle.set_checked(!currently_enabled);
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
