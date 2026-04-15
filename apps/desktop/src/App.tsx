import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  Job,
  ProgressPayload,
  QualityPreset,
  LanguageHint,
  TranscriptSegment,
} from "./types";
import "./App.css";
import Help from "./Help";

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const p = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(sec, 2)}.${p(ms, 3)}`;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [quality, setQuality] = useState<QualityPreset>("final");
  const [language, setLanguage] = useState<LanguageHint>("auto");
  const [processing, setProcessing] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const segments: TranscriptSegment[] = useMemo(() => {
    if (!selected?.segments_json) return [];
    try {
      return JSON.parse(selected.segments_json) as TranscriptSegment[];
    } catch {
      return [];
    }
  }, [selected]);

  const filteredSegments = useMemo(() => {
    const q = segmentFilter.trim().toLowerCase();
    const withIndex = segments.map((s, i) => ({ s, i }));
    if (!q) return withIndex;
    return withIndex.filter(({ s }) => s.text.toLowerCase().includes(q));
  }, [segments, segmentFilter]);

  const refreshJobs = useCallback(async () => {
    const list = await invoke<Job[]>("list_jobs");
    setJobs(list);
    setSelectedId((prev) => {
      if (prev && list.some((j) => j.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, []);

  const refreshSettings = useCallback(async () => {
    const s = await invoke<AppSettings>("get_settings");
    setSettings(s);
    setQuality(s.default_quality);
    setLanguage(s.default_language);
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshJobs();
  }, [refreshJobs, refreshSettings]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<ProgressPayload>("transcription://progress", (event) => {
      const p = event.payload;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === p.job_id
            ? {
                ...j,
                status: p.status,
                progress: p.progress,
                message: p.message,
                rtf: p.rtf,
                eta_seconds: p.eta_seconds,
                audio_duration_sec: p.audio_duration_sec,
              }
            : j,
        ),
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("transcription://job_updated", () => {
      void refreshJobs();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refreshJobs]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("transcription://queue_idle", () => {
      setProcessing(false);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("app://show_help", () => {
      setShowHelp(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const onPickVideos = async () => {
    const paths = await open({
      multiple: true,
      filters: [
        {
          name: "Video",
          extensions: [
            "mp4",
            "mkv",
            "webm",
            "mov",
            "avi",
            "m4v",
            "mpeg",
            "mpg",
            "wmv",
          ],
        },
      ],
    });
    if (!paths) return;
    const list = Array.isArray(paths) ? paths : [paths];
    await invoke<string[]>("enqueue_jobs", {
      paths: list,
      quality,
      language,
    });
    await refreshJobs();
  };

  const onStartQueue = async () => {
    setProcessing(true);
    try {
      const started = await invoke<boolean>("start_queue");
      if (!started) {
        setProcessing(false);
      }
    } catch {
      setProcessing(false);
    }
    await refreshJobs();
  };

  const onCancel = async () => {
    await invoke("cancel_queue");
    await refreshJobs();
  };

  const onSaveSettings = async () => {
    if (!settings) return;
    await invoke("save_settings", { settings });
    await refreshSettings();
  };

  const updateSegmentText = async (index: number, text: string) => {
    if (!selected) return;
    const next = segments.map((s, i) =>
      i === index ? { ...s, text } : s,
    );
    await invoke("update_job_segments", {
      jobId: selected.id,
      segments: next,
    });
    await refreshJobs();
  };

  const exportJob = async (format: "srt" | "vtt" | "txt") => {
    if (!selected || selected.status !== "completed") return;
    const base =
      selected.input_path.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") ??
      "transcript";
    const ext = format === "vtt" ? "vtt" : format === "srt" ? "srt" : "txt";
    const path = await save({
      defaultPath: `${base}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!path) return;
    await invoke("export_job", {
      jobId: selected.id,
      targetPath: path,
      format,
    });
  };

  const badgeClass = (status: Job["status"]) => {
    if (status === "completed") return "badge completed";
    if (status === "failed" || status === "cancelled") return "badge failed";
    if (
      status === "extracting" ||
      status === "transcribing" ||
      status === "queued"
    )
      return "badge running";
    return "badge";
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>Video Transcript Extractor</h1>
          <p className="subtitle">
            Offline Hindi / English / Hinglish transcripts (Whisper on-device)
          </p>
        </div>
      </header>

      <div className="toolbar">
        <button type="button" className="primary" onClick={() => void onPickVideos()}>
          Add videos
        </button>
        <button
          type="button"
          onClick={() => void onStartQueue()}
          disabled={processing || jobs.length === 0}
        >
          {processing ? "Processing…" : "Start queue"}
        </button>
        <button type="button" onClick={() => void onCancel()}>
          Cancel
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Quality
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityPreset)}
          >
            <option value="draft">Draft (faster)</option>
            <option value="final">Final (best)</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageHint)}
          >
            <option value="auto">Auto</option>
            <option value="hi">Hindi hint</option>
            <option value="en">English hint</option>
          </select>
        </label>
        <button type="button" onClick={() => setShowHelp((v) => !v)}>
          Help
        </button>
      </div>

      {showHelp && <Help />}

      <div className="layout">
        <div className="panel">
          <h2>Queue</h2>
          {jobs.length === 0 ? (
            <p className="hint">Add video files to begin. Processing stays on this machine.</p>
          ) : (
            <ul className="job-list">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className={
                    j.id === selectedId ? "job-item active" : "job-item"
                  }
                  onClick={() => setSelectedId(j.id)}
                >
                  <div className="job-path">{j.input_path}</div>
                  <div className="job-meta">
                    <span className={badgeClass(j.status)}>{j.status}</span>
                    {j.model && <span>Model: {j.model}</span>}
                    {j.rtf != null && j.rtf > 0 && (
                      <span>RTF ≈ {j.rtf.toFixed(2)}×</span>
                    )}
                    {j.eta_seconds != null &&
                      j.eta_seconds > 0 &&
                      (j.status === "transcribing" ||
                        j.status === "extracting") && (
                        <span>ETA ≈ {formatClock(j.eta_seconds)}</span>
                      )}
                    {j.audio_duration_sec != null && j.audio_duration_sec > 0 && (
                      <span>Audio {formatClock(j.audio_duration_sec)}</span>
                    )}
                  </div>
                  {(j.status === "transcribing" ||
                    j.status === "extracting" ||
                    j.status === "queued") && (
                    <div className="progress-bar">
                      <div style={{ width: `${Math.min(100, j.progress)}%` }} />
                    </div>
                  )}
                  {j.message && (
                    <div className="hint" style={{ marginTop: 6 }}>
                      {j.message}
                    </div>
                  )}
                  {j.error && <div className="error-box">{j.error}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="panel">
          <h2>Settings</h2>
          {settings && (
            <div className="settings-grid">
              <label>
                FFmpeg path (optional)
                <input
                  value={settings.ffmpeg_path}
                  onChange={(e) =>
                    setSettings({ ...settings, ffmpeg_path: e.target.value })
                  }
                  placeholder="ffmpeg on PATH if empty"
                />
              </label>
              <label>
                Model cache directory
                <input
                  value={settings.model_cache_dir}
                  onChange={(e) =>
                    setSettings({ ...settings, model_cache_dir: e.target.value })
                  }
                  placeholder="System default if empty"
                />
              </label>
              <label>
                Default quality
                <select
                  value={settings.default_quality}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_quality: e.target.value as QualityPreset,
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="final">Final</option>
                </select>
              </label>
              <label>
                Default language hint
                <select
                  value={settings.default_language}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      default_language: e.target.value as LanguageHint,
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button type="button" className="primary" onClick={() => void onSaveSettings()}>
                Save settings
              </button>
              <p className="hint">
                Install Python deps in <code>services/transcriber</code>, ensure{" "}
                <code>ffmpeg</code> is available, and use a GPU for best speed on
                large models.
              </p>
            </div>
          )}
        </aside>
      </div>

      {selected && selected.status === "completed" && segments.length > 0 && (
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2>Review & export</h2>
          <div className="search-row">
            <input
              type="search"
              placeholder="Search in transcript…"
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
            />
          </div>
          <div className="export-row">
            <button type="button" onClick={() => void exportJob("srt")}>
              Export SRT
            </button>
            <button type="button" onClick={() => void exportJob("vtt")}>
              Export WebVTT
            </button>
            <button type="button" onClick={() => void exportJob("txt")}>
              Export TXT
            </button>
          </div>
          <div className="segments" style={{ marginTop: "0.75rem" }}>
            {filteredSegments.map(({ s, i }) => (
                <div key={s.id ?? i} className="segment-row">
                  <div className="segment-time">
                    {formatTimestamp(s.start)} → {formatTimestamp(s.end)}
                  </div>
                  <div className="segment-text">
                    <textarea
                      value={s.text}
                      onChange={(e) =>
                        void updateSegmentText(i, e.target.value)
                      }
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
