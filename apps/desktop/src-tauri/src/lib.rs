mod db;
mod export_fmt;
mod settings;
mod worker;

use db::Job;
use settings::AppSettings;
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use worker::ProcessorState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub processor: ProcessorState,
}

fn db_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("VideoTranscriptExtractor")
        .join("jobs.sqlite3")
}

#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    Ok(settings::load_settings())
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings::save_settings(&settings)
}

#[tauri::command]
fn list_jobs(state: State<'_, AppState>) -> Result<Vec<Job>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::list_jobs(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn enqueue_jobs(
    state: State<'_, AppState>,
    paths: Vec<String>,
    quality: String,
    language: String,
) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for path in paths {
        let id = uuid::Uuid::new_v4().to_string();
        db::insert_job(&db, &id, &path, &quality, &language).map_err(|e| e.to_string())?;
        ids.push(id);
    }
    Ok(ids)
}

#[tauri::command]
fn export_job(
    state: State<'_, AppState>,
    job_id: String,
    target_path: String,
    format: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let job = db::get_job(&db, &job_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Job not found".to_string())?;
    let segments_json = job
        .segments_json
        .ok_or_else(|| "Job has no transcript yet".to_string())?;
    let segments = export_fmt::segments_from_json(&segments_json)?;
    let body = match format.as_str() {
        "srt" => export_fmt::to_srt(&segments),
        "vtt" => export_fmt::to_vtt(&segments),
        "txt" => export_fmt::to_txt(&segments),
        other => return Err(format!("Unsupported format: {other}")),
    };
    std::fs::write(&target_path, body).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_job_segments(
    state: State<'_, AppState>,
    job_id: String,
    segments: serde_json::Value,
) -> Result<(), String> {
    let segments_json = serde_json::to_string(&segments).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db::update_segments_only(&db, &job_id, &segments_json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_queue(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    if state
        .processor
        .busy
        .compare_exchange(false, true, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst)
        .is_err()
    {
        return Ok(false);
    }

    state
        .processor
        .cancel
        .store(false, std::sync::atomic::Ordering::SeqCst);

    let db = state.db.clone();
    let processor = state.processor.clone();
    let settings = settings::load_settings();

    tokio::spawn(async move {
        loop {
            if processor
                .cancel
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                processor
                    .cancel
                    .store(false, std::sync::atomic::Ordering::SeqCst);
                break;
            }

            let job_opt = {
                let db = db.clone();
                tokio::task::spawn_blocking(move || -> Result<Option<Job>, String> {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    db::next_queued(&conn).map_err(|e| e.to_string())
                })
                .await
            };

            let job = match job_opt {
                Ok(Ok(Some(j))) => j,
                Ok(Ok(None)) => break,
                Ok(Err(e)) => {
                    let _ = app.emit("transcription://log", format!("db error: {e}"));
                    break;
                }
                Err(_) => break,
            };

            let job_id = job.id.clone();
            {
                let db = db.clone();
                let res = tokio::task::spawn_blocking(move || {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    db::update_job_fields(
                        &conn,
                        &job_id,
                        "transcribing",
                        2.0,
                        Some("Starting…"),
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                    )
                })
                .await;
                let _ = res;
            }
            let _ = app.emit("transcription://job_updated", &job_id);

            let outcome = worker::run_job(&app, &settings, &job, &processor).await;

            match outcome {
                Ok(result) => {
                    let db2 = db.clone();
                    let job_id2 = job_id.clone();
                    let sj = result.segments_json.clone();
                    let model = result.model_used.clone();
                    let rtf = result.rtf;
                    let dur = result.audio_duration_sec;
                    let _ = tokio::task::spawn_blocking(move || {
                        let conn = db2.lock().map_err(|e| e.to_string())?;
                        db::update_job_fields(
                            &conn,
                            &job_id2,
                            "completed",
                            100.0,
                            Some("Done"),
                            Some(&model),
                            Some(&sj),
                            None,
                            rtf,
                            Some(0.0),
                            dur,
                        )
                        .map_err(|e| e.to_string())
                    })
                    .await;
                }
                Err(err) => {
                    if err == "cancelled" {
                        let db2 = db.clone();
                        let job_id2 = job_id.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            let conn = db2.lock().map_err(|e| e.to_string())?;
                            db::update_job_fields(
                                &conn,
                                &job_id2,
                                "cancelled",
                                0.0,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                                None,
                            )
                            .map_err(|e| e.to_string())
                        })
                        .await;
                    } else {
                        let db2 = db.clone();
                        let job_id2 = job_id.clone();
                        let err2 = err.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            let conn = db2.lock().map_err(|e| e.to_string())?;
                            db::update_job_fields(
                                &conn,
                                &job_id2,
                                "failed",
                                0.0,
                                None,
                                None,
                                None,
                                Some(&err2),
                                None,
                                None,
                                None,
                            )
                            .map_err(|e| e.to_string())
                        })
                        .await;
                    }
                }
            }

            let _ = app.emit("transcription://job_updated", &job_id);
        }

        processor
            .busy
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = app.emit("transcription://queue_idle", json!({}));
    });

    Ok(true)
}

#[tauri::command]
async fn cancel_queue(state: State<'_, AppState>) -> Result<(), String> {
    state
        .processor
        .cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(mut c) = state
        .processor
        .current_child
        .lock()
        .await
        .take()
    {
        let _ = c.kill().await;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = db_path();
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let conn = db::open_db(&path).map_err(|e| format!("database: {e}"))?;
            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                processor: ProcessorState::default(),
            });

            let help_item = MenuItem::with_id(app, "help_user_guide", "User guide", true, None)
                .map_err(|e| e.to_string())?;

            let help_menu = Menu::with_items(app, &[&help_item]).map_err(|e| e.to_string())?;
            let menu = Menu::with_items(
                app,
                &[
                    &Submenu::with_items(app, "Help", true, &help_menu)
                        .map_err(|e| e.to_string())?,
                    &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
                ],
            )
            .map_err(|e| e.to_string())?;

            app.set_menu(menu).map_err(|e| e.to_string())?;

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id().as_ref() == "help_user_guide" {
                    let _ = handle.emit("app://show_help", json!({}));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            list_jobs,
            enqueue_jobs,
            start_queue,
            cancel_queue,
            export_job,
            update_job_segments
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
