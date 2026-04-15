export type JobStatus =
  | "queued"
  | "extracting"
  | "transcribing"
  | "completed"
  | "failed"
  | "cancelled";

export type QualityPreset = "draft" | "final";

export type LanguageHint = "auto" | "hi" | "en";

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avg_logprob?: number | null;
  no_speech_prob?: number | null;
}

export interface Job {
  id: string;
  input_path: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  model: string | null;
  quality: QualityPreset | null;
  language: LanguageHint | null;
  segments_json: string | null;
  error: string | null;
  rtf: number | null;
  eta_seconds: number | null;
  audio_duration_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  ffmpeg_path: string;
  model_cache_dir: string;
  default_quality: QualityPreset;
  default_language: LanguageHint;
}

export interface ProgressPayload {
  job_id: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  rtf: number | null;
  eta_seconds: number | null;
  audio_duration_sec: number | null;
}
