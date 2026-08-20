fn main() {
    // Register app commands so tauri-build emits their permission
    // identifiers (allow-kit-open-external) for the capabilities file.
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["kit_open_external", "kit_set_zoom"]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
