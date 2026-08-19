//! dsh-desktop-kit — native desktop shell for DeepSeek Harness.
//!
//! Opens one *decorated* window on the harness's loopback web surface
//! (argv[1], default http://127.0.0.1:3080; argv[2] is the window title).
//! Decorated on purpose: native macOS fullscreen (green button / Ctrl+Cmd+F)
//! works out of the box — frameless shells have to wire that up by hand.
//!
//! Lifecycle contract with the host plugin: closing the window exits the
//! process with code 0, which the plugin treats as "shut the harness down".
//! A second launch focuses the existing window (single instance).

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_URL: &str = "http://127.0.0.1:3080";
const DEFAULT_TITLE: &str = "DeepSeek Harness";

fn main() {
    let url = std::env::args().nth(1).unwrap_or_else(|| DEFAULT_URL.to_string());
    let title = std::env::args().nth(2).unwrap_or_else(|| DEFAULT_TITLE.to_string());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second launch: surface the existing window instead of opening another.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            let parsed = Url::parse(&url)
                .unwrap_or_else(|_| Url::parse(DEFAULT_URL).expect("default URL must parse"));
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title(&title)
                .inner_size(1280.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building dsh-desktop-kit")
        .run(|_app, _event| {
            // Default behavior: the process exits with code 0 when the last
            // window closes — that is the lifecycle contract with the plugin.
        });
}
