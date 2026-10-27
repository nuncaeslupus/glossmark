//! The `.desktop` template the Linux bundles (deb, AppImage) install.
//! It is a Handlebars template: values like `{{name}}` are filled at bundle time,
//! so this checks the keys and the literal parts the desktop relies on.

use std::path::Path;

const TEMPLATE: &str = "linux/glossmark.desktop";

fn desktop_entry() -> Vec<(String, String)> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(TEMPLATE);
    let text = std::fs::read_to_string(&path).expect("read linux/glossmark.desktop");
    assert!(
        text.lines().any(|l| l.trim() == "[Desktop Entry]"),
        "missing [Desktop Entry] group"
    );
    text.lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_owned(), v.trim().to_owned()))
        .collect()
}

fn value<'a>(entry: &'a [(String, String)], key: &str) -> &'a str {
    entry
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
        .unwrap_or_else(|| panic!("missing {key}= in the .desktop file"))
}

#[test]
fn test_desktop_file_declares_markdown_mime() {
    // The bundles only install this file if tauri.conf.json points at it.
    let conf_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let conf: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(conf_path).expect("read tauri.conf.json"))
            .expect("parse tauri.conf.json");
    assert_eq!(
        conf["bundle"]["linux"]["deb"]["desktopTemplate"].as_str(),
        Some(TEMPLATE),
        "bundle.linux.deb.desktopTemplate must point at the tested template"
    );

    let entry = desktop_entry();

    let mime: Vec<&str> = value(&entry, "MimeType")
        .split(';')
        .filter(|m| !m.is_empty())
        .collect();
    assert!(mime.contains(&"text/markdown"), "MimeType = {mime:?}");

    // CLI arguments are plain paths (document.rs does not decode file:// URIs), so %F, not %U.
    let exec = value(&entry, "Exec");
    assert!(exec.split_whitespace().any(|a| a == "%F"), "Exec = {exec}");

    assert!(!value(&entry, "Name").is_empty());
    assert!(!value(&entry, "Icon").is_empty());
    assert_eq!(value(&entry, "Type"), "Application");
}
