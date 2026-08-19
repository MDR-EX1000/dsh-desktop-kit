//! dsh-desktop-kit — native desktop shell for DeepSeek Harness.
//!
//! The window is declared in tauri.conf.json (decorated, loading page from
//! dist/) and navigated to the harness's loopback URL once the event loop is
//! ready (argv[1], default http://127.0.0.1:3080; argv[2] is the title).
//! Decorated on purpose: native macOS fullscreen (green button / Ctrl+Cmd+F)
//! works out of the box — frameless shells have to wire that up by hand.
//!
//! Lifecycle contract with the host plugin: closing the window exits the
//! process with code 0, which the plugin treats as "shut the harness down".
//! A second launch focuses the existing window (single instance).

use tauri::{Manager, Url};

const DEFAULT_URL: &str = "http://127.0.0.1:3080";
const DEFAULT_TITLE: &str = "DeepSeek Harness";

/// Open a URL with the system handler (browser/mail client). Invoked from the
/// injected client script: WKWebView renders target="_blank" / external links
/// dead by default, so they are delegated here.
#[tauri::command]
fn kit_open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    match parsed.scheme() {
        "http" | "https" | "mailto" => {}
        scheme => return Err(format!("refusing to open scheme {scheme:?}")),
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("unsupported platform".into())
}

fn main() {
    let selftest = std::env::args().any(|arg| arg == "--selftest");
    let url = std::env::args().nth(1).unwrap_or_else(|| DEFAULT_URL.to_string());
    let title = std::env::args().nth(2).unwrap_or_else(|| DEFAULT_TITLE.to_string());
    let parsed = Url::parse(&url)
        .unwrap_or_else(|_| Url::parse(DEFAULT_URL).expect("default URL must parse"));

    let mut builder = tauri::Builder::default();
    // DSH_KIT_NO_SINGLE_INSTANCE=1 runs a side-by-side instance (selftest, dev).
    if std::env::var_os("DSH_KIT_NO_SINGLE_INSTANCE").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second launch: surface the existing window instead of opening another.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .invoke_handler(tauri::generate_handler![kit_open_external])
        .setup(|_app| Ok(()))
        .build(tauri::generate_context!())
        .expect("error while building dsh-desktop-kit")
        .run(move |app, event| {
            if let tauri::RunEvent::Ready = event {
                if let Some(window) = app.get_webview_window("main") {
                    if selftest {
                        // Scriptable proof of native fullscreen: enter, read
                        // state, exit, read state — in-process, no macOS
                        // accessibility permission needed (unlike AppleScript).
                        window.set_title("dsh-desktop-kit selftest").ok();
                        let _ = window.show();
                        let _ = window.set_focus();
                        let ok = (|| {
                            window.set_fullscreen(true).ok()?;
                            std::thread::sleep(std::time::Duration::from_millis(800));
                            let entered = window.is_fullscreen().ok()?;
                            window.set_fullscreen(false).ok()?;
                            std::thread::sleep(std::time::Duration::from_millis(800));
                            let exited = !window.is_fullscreen().ok()?;
                            Some(entered && exited)
                        })();
                        match ok {
                            Some(true) => {
                                println!("SELFTEST fullscreen enter/exit: OK");
                                app.exit(0);
                            }
                            other => {
                                println!("SELFTEST fullscreen enter/exit: FAIL ({other:?})");
                                app.exit(1);
                            }
                        }
                        return;
                    }
                    let _ = window.set_title(&title);
                    let _ = window.navigate(parsed.clone());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            // Default behavior: the process exits with code 0 when the last
            // window closes — that is the lifecycle contract with the plugin.
        });
}
