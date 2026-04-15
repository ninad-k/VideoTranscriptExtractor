use crate::db::Job;
use crate::settings::AppSettings;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri::path::BaseDirectory;

#[derive(Clone)]
pub struct ProcessorState {
    pub cancel: Arc<AtomicBool>,
    pub busy: Arc<AtomicBool>,
    pub current_child: Arc<Mutex<Option<Child>>>,
}

impl Default for ProcessorState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            busy: Arc::new(AtomicBool::new(false)),
            current_child: Arc::new(Mutex::new(None)),
        }
    }
}

pub struct JobResult {
    pub segments_json: String,
    pub model_used: String,
    pub rtf: Option<f64>,
    pub audio_duration_sec: Option<f64>,
}

fn transcriber_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../services/transcriber")
}

fn transcriber_pythonpath() -> PathBuf {
    transcriber_root().join("src")
}

fn resolve_python_program() -> Result<(PathBuf, Vec<String>), String> {
    if let Ok(custom) = std::env::var("VTE_PYTHON") {
        return Ok((PathBuf::from(custom), vec![]));
    }
    if let Ok(py) = which::which("python") {
        return Ok((py, vec![]));
    }
    if let Ok(py) = which::which("python3") {
        return Ok((py, vec![]));
    }
    if let Ok(py) = which::which("py") {
        return Ok((py, vec!["-3".into()]));
    }
    Err(
        "Could not find Python on PATH (tried python, python3, py). Install Python 3.10+ and dependencies, or set VTE_PYTHON."
            .into(),
    )
}

fn platform_bin_dir() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        return "bin/win64";
    }
    #[cfg(target_os = "macos")]
    {
        return "bin/macos";
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return "bin/linux";
    }
}

fn resolve_bundled_sidecar(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let rel = format!("{}/{name}", platform_bin_dir());
    app.path()
        .resolve(rel, BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
}

fn resolve_bundled_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return resolve_bundled_sidecar(app, "ffmpeg.exe");
    }
    #[cfg(not(target_os = "windows"))]
    {
        return resolve_bundled_sidecar(app, "ffmpeg");
    }
}

fn resolve_bundled_transcriber(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return resolve_bundled_sidecar(app, "transcriber.exe");
    }
    #[cfg(not(target_os = "windows"))]
    {
        return resolve_bundled_sidecar(app, "transcriber");
    }
}

fn resolve_bundled_model_dir(app: &AppHandle, model_id: &str) -> Option<PathBuf> {
    let rel = format!("models/{model_id}");
    app.path()
        .resolve(rel, BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
}

pub fn model_for_quality(quality: &str) -> &'static str {
    match quality {
        "draft" => "distil-large-v3",
        _ => "large-v3",
    }
}

#[derive(Debug, Deserialize)]
struct ProgressLine {
    #[serde(rename = "type")]
    line_type: String,
    #[serde(default)]
    percent: Option<f64>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    rtf: Option<f64>,
    #[serde(default)]
    eta_seconds: Option<f64>,
    #[serde(default)]
    audio_duration_sec: Option<f64>,
    #[serde(default)]
    code: Option<String>,
}

fn emit_progress(
    app: &AppHandle,
    job_id: &str,
    status: &str,
    progress: f64,
    message: Option<String>,
    rtf: Option<f64>,
    eta_seconds: Option<f64>,
    audio_duration_sec: Option<f64>,
) {
    let _ = app.emit(
        "transcription://progress",
        serde_json::json!({
            "job_id": job_id,
            "status": status,
            "progress": progress,
            "message": message,
            "rtf": rtf,
            "eta_seconds": eta_seconds,
            "audio_duration_sec": audio_duration_sec,
        }),
    );
}

pub async fn run_job(
    app: &AppHandle,
    settings: &AppSettings,
    job: &Job,
    state: &ProcessorState,
) -> Result<JobResult, String> {
    let job_id = job.id.clone();
    let root = transcriber_root();

    let model = model_for_quality(job.quality.as_deref().unwrap_or("final"));
    let language = job.language.as_deref().unwrap_or("auto");

    let temp_dir = std::env::temp_dir().join(format!("vte-{}", job_id));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| e.to_string())?;
    let result_path = temp_dir.join("result.json");

    let mut args: Vec<String> = Vec::new();
    args.extend([
        "transcribe".into(),
        "--input".into(),
        job.input_path.clone(),
        "--result-json".into(),
        result_path.to_string_lossy().into_owned(),
        "--model".into(),
        model.into(),
        "--language".into(),
        language.into(),
    ]);

    // Prefer prebundled models if present (true offline install).
    if let Some(model_dir) = resolve_bundled_model_dir(app, model) {
        args.push("--model-path".into());
        args.push(model_dir.to_string_lossy().into_owned());
    }

    // Prefer explicit settings, else bundled ffmpeg if present.
    if !settings.ffmpeg_path.trim().is_empty() {
        args.push("--ffmpeg".into());
        args.push(settings.ffmpeg_path.trim().into());
    } else if let Some(ffmpeg) = resolve_bundled_ffmpeg(app) {
        args.push("--ffmpeg".into());
        args.push(ffmpeg.to_string_lossy().into_owned());
    }
    if !settings.model_cache_dir.trim().is_empty() {
        args.push("--model-cache-dir".into());
        args.push(settings.model_cache_dir.trim().into());
    }

    let mut cmd: Command;

    if let Some(sidecar) = resolve_bundled_transcriber(app) {
        cmd = Command::new(sidecar);
        cmd.args(&args);
    } else {
        // Dev fallback: run python -m transcriber from repo checkout.
        let (prog, prefix) = resolve_python_program()?;
        if !root.exists() {
            return Err(format!(
                "Bundled transcriber not found, and dev transcriber package not found at {}.",
                root.display()
            ));
        }
        let pythonpath = transcriber_pythonpath();
        if !pythonpath.exists() {
            return Err(format!(
                "Bundled transcriber not found, and dev transcriber src path missing: {}.",
                pythonpath.display()
            ));
        }
        cmd = Command::new(&prog);
        let mut dev_args: Vec<String> = prefix;
        dev_args.extend(["-m".into(), "transcriber".into()]);
        dev_args.extend(args);
        cmd.args(&dev_args)
            .current_dir(&root)
            .env("PYTHONPATH", &pythonpath)
            .env("PYTHONUTF8", "1")
            .env("PYTHONUNBUFFERED", "1");
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "missing stdout".to_string())?;
    let stderr = child.stderr.take();

    {
        let mut slot = state.current_child.lock().await;
        *slot = Some(child);
    }

    let app_logs = app.clone();
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_logs.emit("transcription://log", line);
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        if state.cancel.load(Ordering::SeqCst) {
            break;
        }
        if let Ok(v) = serde_json::from_str::<ProgressLine>(&line) {
            if v.line_type == "error" {
                let code = v.code.clone().unwrap_or_default();
                let msg = v
                    .message
                    .clone()
                    .unwrap_or_else(|| "Transcription error".into());
                {
                    let mut slot = state.current_child.lock().await;
                    if let Some(mut c) = slot.take() {
                        let _ = c.kill().await;
                        let _ = c.wait().await;
                    }
                }
                emit_progress(
                    app,
                    &job_id,
                    "failed",
                    0.0,
                    Some(msg.clone()),
                    None,
                    None,
                    None,
                );
                if code == "cuda_oom" {
                    return Err(format!(
                        "{msg}\n\nTip: use Quality → Draft (smaller/faster model) or free GPU memory, then retry."
                    ));
                }
                return Err(msg);
            }
            if v.line_type == "progress" {
                let status = v.status.as_deref().unwrap_or("transcribing");
                emit_progress(
                    app,
                    &job_id,
                    status,
                    v.percent.unwrap_or(0.0),
                    v.message.clone(),
                    v.rtf,
                    v.eta_seconds,
                    v.audio_duration_sec,
                );
            }
        }
    }

    if state.cancel.load(Ordering::SeqCst) {
        {
            let mut slot = state.current_child.lock().await;
            if let Some(mut c) = slot.take() {
                let _ = c.wait().await;
            }
        }
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err("cancelled".into());
    }

    let mut exit_status = None;
    {
        let mut slot = state.current_child.lock().await;
        if let Some(mut c) = slot.take() {
            exit_status = Some(c.wait().await.map_err(|e| e.to_string())?);
        }
    }

    let ok = exit_status.map(|s| s.success()).unwrap_or(false);
    if !ok {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err("Transcriber process exited with an error. Check stderr logs.".into());
    }

    let bytes = tokio::fs::read(&result_path)
        .await
        .map_err(|e| format!("Missing result file: {e}"))?;
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    let payload: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let segments = payload
        .get("segments")
        .cloned()
        .ok_or_else(|| "result.json missing segments".into())?;
    let segments_json = serde_json::to_string(&segments).map_err(|e| e.to_string())?;
    let model_used = payload
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("unknown")
        .to_string();
    let rtf = payload.get("rtf").and_then(|v| v.as_f64());
    let audio_duration_sec = payload
        .get("audio_duration_sec")
        .and_then(|v| v.as_f64());

    emit_progress(
        app,
        &job_id,
        "completed",
        100.0,
        Some("Done".into()),
        rtf,
        Some(0.0),
        audio_duration_sec,
    );

    Ok(JobResult {
        segments_json,
        model_used,
        rtf,
        audio_duration_sec,
    })
}
