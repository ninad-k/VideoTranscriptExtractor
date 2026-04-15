use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ffmpeg_path: String,
    pub model_cache_dir: String,
    pub default_quality: String,
    pub default_language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ffmpeg_path: String::new(),
            model_cache_dir: String::new(),
            default_quality: "final".into(),
            default_language: "auto".into(),
        }
    }
}

pub fn settings_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("VideoTranscriptExtractor")
        .join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(s) = serde_json::from_slice::<AppSettings>(&bytes) {
            return s;
        }
    }
    AppSettings::default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}
