use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub input_path: String,
    pub status: String,
    pub progress: f64,
    pub message: Option<String>,
    pub model: Option<String>,
    pub quality: Option<String>,
    pub language: Option<String>,
    pub segments_json: Option<String>,
    pub error: Option<String>,
    pub rtf: Option<f64>,
    pub eta_seconds: Option<f64>,
    pub audio_duration_sec: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn open_db(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r"
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            input_path TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0,
            message TEXT,
            model TEXT,
            quality TEXT,
            language TEXT,
            segments_json TEXT,
            error TEXT,
            rtf REAL,
            eta_seconds REAL,
            audio_duration_sec REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        ",
    )?;
    Ok(())
}

pub fn insert_job(
    conn: &Connection,
    id: &str,
    input_path: &str,
    quality: &str,
    language: &str,
) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        r"INSERT INTO jobs (id, input_path, status, progress, quality, language, created_at, updated_at)
          VALUES (?1, ?2, 'queued', 0, ?3, ?4, ?5, ?5)",
        params![id, input_path, quality, language, now],
    )?;
    Ok(())
}

pub fn list_jobs(conn: &Connection) -> rusqlite::Result<Vec<Job>> {
    let mut stmt = conn.prepare(
        r"SELECT id, input_path, status, progress, message, model, quality, language,
                 segments_json, error, rtf, eta_seconds, audio_duration_sec, created_at, updated_at
          FROM jobs ORDER BY datetime(created_at) DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Job {
            id: row.get(0)?,
            input_path: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            message: row.get(4)?,
            model: row.get(5)?,
            quality: row.get(6)?,
            language: row.get(7)?,
            segments_json: row.get(8)?,
            error: row.get(9)?,
            rtf: row.get(10)?,
            eta_seconds: row.get(11)?,
            audio_duration_sec: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    rows.collect()
}

pub fn get_job(conn: &Connection, id: &str) -> rusqlite::Result<Option<Job>> {
    let mut stmt = conn.prepare(
        r"SELECT id, input_path, status, progress, message, model, quality, language,
                 segments_json, error, rtf, eta_seconds, audio_duration_sec, created_at, updated_at
          FROM jobs WHERE id = ?1",
    )?;
    stmt.query_row(params![id], |row| {
        Ok(Job {
            id: row.get(0)?,
            input_path: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            message: row.get(4)?,
            model: row.get(5)?,
            quality: row.get(6)?,
            language: row.get(7)?,
            segments_json: row.get(8)?,
            error: row.get(9)?,
            rtf: row.get(10)?,
            eta_seconds: row.get(11)?,
            audio_duration_sec: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })
    .optional()
}

pub fn next_queued(conn: &Connection) -> rusqlite::Result<Option<Job>> {
    let mut stmt = conn.prepare(
        r"SELECT id, input_path, status, progress, message, model, quality, language,
                 segments_json, error, rtf, eta_seconds, audio_duration_sec, created_at, updated_at
          FROM jobs WHERE status = 'queued' ORDER BY datetime(created_at) ASC LIMIT 1",
    )?;
    stmt.query_row([], |row| {
        Ok(Job {
            id: row.get(0)?,
            input_path: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            message: row.get(4)?,
            model: row.get(5)?,
            quality: row.get(6)?,
            language: row.get(7)?,
            segments_json: row.get(8)?,
            error: row.get(9)?,
            rtf: row.get(10)?,
            eta_seconds: row.get(11)?,
            audio_duration_sec: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })
    .optional()
}

pub fn update_job_fields(
    conn: &Connection,
    id: &str,
    status: &str,
    progress: f64,
    message: Option<&str>,
    model: Option<&str>,
    segments_json: Option<&str>,
    error: Option<&str>,
    rtf: Option<f64>,
    eta_seconds: Option<f64>,
    audio_duration_sec: Option<f64>,
) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        r"UPDATE jobs SET status = ?2, progress = ?3, message = ?4, model = COALESCE(?5, model),
            segments_json = COALESCE(?6, segments_json), error = ?7, rtf = COALESCE(?8, rtf),
            eta_seconds = COALESCE(?9, eta_seconds), audio_duration_sec = COALESCE(?10, audio_duration_sec),
            updated_at = ?11
          WHERE id = ?1",
        params![
            id,
            status,
            progress,
            message,
            model,
            segments_json,
            error,
            rtf,
            eta_seconds,
            audio_duration_sec,
            now
        ],
    )?;
    Ok(())
}

pub fn update_segments_only(conn: &Connection, id: &str, segments_json: &str) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE jobs SET segments_json = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, segments_json, now],
    )?;
    Ok(())
}
