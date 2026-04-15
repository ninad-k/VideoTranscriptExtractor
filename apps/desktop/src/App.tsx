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

function AppIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vteG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#vteG)" />
      <path
        d="M15 17h18v4H15v-4zm0 7h12v4H15v-4zm0 7h18v4H15v-4z"
        fill="rgba(255,255,255,0.92)"
      />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 7h10v10H7z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 5h2v14h-2zM5 11h14v2H5z"
      />
    </svg>
  );
}

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

  const hasQueued = useMemo(
    () => jobs.some((j) => j.status === "queued"),
    [jobs],
  );

  const hasActive = useMemo(
    () =>
      jobs.some((j) => j.status === "extracting" || j.status === "transcribing"),
    [jobs],
  );

  const totalProgress = useMemo(() => {
    const relevant = jobs.filter(
      (j) =>
        j.status === "queued" ||
        j.status === "extracting" ||
        j.status === "transcribing" ||
        j.status === "completed",
    );
    if (relevant.length === 0) return null;
    const sum = relevant.reduce(
      (acc, j) => acc + (j.status === "completed" ? 100 : j.progress ?? 0),
      0,
    );
    return Math.max(0, Math.min(100, sum / relevant.length));
  }, [jobs]);

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
      if (p.status === "extracting" || p.status === "transcribing") {
        setProcessing(true);
      }
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

  useEffect(() => {
    let unlistenAdd: (() => void) | undefined;
    let unlistenStart: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let unlistenToggleHelp: (() => void) | undefined;
    let unlistenCopy: (() => void) | undefined;
    let unlistenExportSrt: (() => void) | undefined;
    let unlistenExportVtt: (() => void) | undefined;
    let unlistenExportTxt: (() => void) | undefined;
    void listen("app://add_videos", () => void onPickVideos()).then((fn) => {
      unlistenAdd = fn;
    });
    void listen("app://start_queue", () => void onStartQueue()).then((fn) => {
      unlistenStart = fn;
    });
    void listen("app://cancel_queue", () => void onCancel()).then((fn) => {
      unlistenCancel = fn;
    });
    void listen("app://toggle_help", () => setShowHelp((v) => !v)).then((fn) => {
      unlistenToggleHelp = fn;
    });
    void listen("app://copy_transcript", () => void copyTranscriptToClipboard()).then((fn) => {
      unlistenCopy = fn;
    });
    void listen("app://export_srt", () => void exportJob("srt")).then((fn) => {
      unlistenExportSrt = fn;
    });
    void listen("app://export_vtt", () => void exportJob("vtt")).then((fn) => {
      unlistenExportVtt = fn;
    });
    void listen("app://export_txt", () => void exportJob("txt")).then((fn) => {
      unlistenExportTxt = fn;
    });
    return () => {
      unlistenAdd?.();
      unlistenStart?.();
      unlistenCancel?.();
      unlistenToggleHelp?.();
      unlistenCopy?.();
      unlistenExportSrt?.();
      unlistenExportVtt?.();
      unlistenExportTxt?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!hasQueued) return;
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

  const copyTranscriptToClipboard = async () => {
    if (!selected || selected.status !== "completed" || segments.length === 0) return;
    const text = segments
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
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
      <header className="app-header">
        <div className="brand">
          <AppIcon />
          <div>
            <h1>Video Transcript Extractor</h1>
            <p className="subtitle">Offline transcription • Local processing</p>
          </div>
        </div>
        <div className="chip">
          Developed By: <b>Ninad K.</b>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-left">
          <button type="button" className="btn" onClick={() => void onPickVideos()}>
            <IconPlus /> Add videos
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void onStartQueue()}
            disabled={!hasQueued || processing || hasActive}
            title={!hasQueued ? "Add videos to enable" : undefined}
          >
            <IconPlay /> {processing || hasActive ? "Running" : "Start queue"}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void onCancel()}
            disabled={!(processing || hasActive)}
          >
            <IconStop /> Cancel
          </button>
        </div>
        <div className="toolbar-right">
          {totalProgress != null && (
            <span className="chip">
              Total: {Math.round(totalProgress)}%
              <span style={{ width: 140, display: "inline-block" }}>
                <span className="progress-bar" style={{ marginTop: 0 }}>
                  <div style={{ width: `${Math.min(100, totalProgress)}%` }} />
                </span>
              </span>
            </span>
          )}
          <button type="button" className="btn" onClick={() => setShowHelp((v) => !v)}>
            Help
          </button>
        </div>
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
              <label>
                Next jobs (temporary override)
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as QualityPreset)}
                    aria-label="Next jobs quality"
                  >
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                  </select>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as LanguageHint)}
                    aria-label="Next jobs language"
                  >
                    <option value="auto">Auto</option>
                    <option value="hi">Hindi</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </label>
              <button type="button" className="btn primary" onClick={() => void onSaveSettings()}>
                Save settings
              </button>
              <p className="hint">
                Quality/Language defaults apply to new jobs. Use the File menu for common actions.
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
            <button type="button" className="btn" onClick={() => void exportJob("srt")}>
              Export SRT
            </button>
            <button type="button" className="btn" onClick={() => void exportJob("vtt")}>
              Export WebVTT
            </button>
            <button type="button" className="btn" onClick={() => void exportJob("txt")}>
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

      <div className="footer">
        Developed By: <b>Ninad K.</b>
      </div>
    </div>
  );
}
