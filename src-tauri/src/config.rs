use crate::error::IpcError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const VERSION: u64 = 1;
pub const MAX_RECENT_FILES: usize = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// `$XDG_CONFIG_HOME/glossmark/config.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u64,
    pub theme: Theme,
    pub default_zoom: u32,
    pub remote_images: bool,
    pub recent_files: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: VERSION,
            theme: Theme::System,
            default_zoom: 100,
            remote_images: true,
            recent_files: Vec::new(),
        }
    }
}

impl Config {
    pub fn normalized(mut self) -> Self {
        self.version = VERSION;
        self.default_zoom = self.default_zoom.clamp(50, 300);
        self.recent_files.truncate(MAX_RECENT_FILES);
        self
    }
}

#[derive(Debug, Serialize)]
pub struct UserCss {
    pub css: Option<String>,
}

pub fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("glossmark"))
}

/// Reads the config; a missing file gives the defaults, and an unreadable or unknown-version
/// file is renamed `config.json.bak` first.
pub fn load(path: &Path) -> Config {
    let text = match fs::read_to_string(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Config::default(),
        read => read.ok(),
    };
    text.as_deref().and_then(parse).unwrap_or_else(|| {
        let _ = fs::rename(path, path.with_extension("json.bak"));
        Config::default()
    })
}

fn parse(text: &str) -> Option<Config> {
    let value: Value = serde_json::from_str(text).ok()?;
    if value.get("version")?.as_u64()? != VERSION {
        return None;
    }
    serde_json::from_value::<Config>(value)
        .ok()
        .map(Config::normalized)
}

pub fn save(path: &Path, config: &Config) -> Result<(), IpcError> {
    let io_err = |e: io::Error| IpcError::from_io(&e, path);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(io_err)?;
    }
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(config).expect("config serialises");
    fs::write(&tmp, text).map_err(io_err)?;
    fs::rename(&tmp, path).map_err(io_err)
}

pub fn read_user_css(path: &Path) -> Result<UserCss, IpcError> {
    match fs::read(path) {
        Ok(bytes) => Ok(UserCss {
            css: Some(String::from_utf8_lossy(&bytes).into_owned()),
        }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(UserCss { css: None }),
        Err(e) => Err(IpcError::from_io(&e, path)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_unknown_version_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let bak = dir.path().join("config.json.bak");

        assert_eq!(load(&path), Config::default());

        for text in [r#"{"version": 2, "theme": "dark"}"#, "{not json", "{}"] {
            fs::write(&path, text).unwrap();
            assert_eq!(load(&path), Config::default(), "{text}");
            assert!(!path.exists());
            assert_eq!(fs::read_to_string(&bak).unwrap(), text);
        }
    }

    #[test]
    fn test_config_round_trips_and_normalises() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("glossmark/config.json");
        let config = Config {
            theme: Theme::Dark,
            default_zoom: 1000,
            remote_images: false,
            recent_files: (0..12).map(|i| format!("/r/{i}.md")).collect(),
            ..Config::default()
        };
        save(&path, &config.clone().normalized()).unwrap();
        let loaded = load(&path);
        assert_eq!(loaded.default_zoom, 300);
        assert_eq!(loaded.recent_files.len(), MAX_RECENT_FILES);
        assert_eq!(loaded.theme, Theme::Dark);
        assert!(!loaded.remote_images);

        fs::write(&path, r#"{"version": 1, "theme": "light"}"#).unwrap();
        assert_eq!(load(&path).default_zoom, 100);
    }

    #[test]
    fn test_user_css_absent_is_null() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("user.css");
        assert_eq!(read_user_css(&path).unwrap().css, None);
        fs::write(&path, "body{}").unwrap();
        assert_eq!(read_user_css(&path).unwrap().css.as_deref(), Some("body{}"));
    }
}
