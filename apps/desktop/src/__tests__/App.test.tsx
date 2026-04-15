import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installTauriMocks, emitEvent } from "../test/tauriMocks";

installTauriMocks();

import { invoke } from "@tauri-apps/api/core";
import App from "../App";

const invokeMock = vi.mocked(invoke);

function job(overrides: Partial<any> = {}) {
  return {
    id: "job-1",
    input_path: "C:\\video.mp4",
    status: "queued",
    progress: 0,
    message: null,
    model: null,
    quality: "final",
    language: "auto",
    segments_json: null,
    error: null,
    rtf: null,
    eta_seconds: null,
    audio_duration_sec: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function settings(overrides: Partial<any> = {}) {
  return {
    ffmpeg_path: "",
    model_cache_dir: "",
    default_quality: "final",
    default_language: "auto",
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("renders empty state and settings", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return settings();
      if (cmd === "list_jobs") return [];
      throw new Error(`unexpected invoke: ${cmd}`);
    });

    render(<App />);

    expect(
      await screen.findByText("Video Transcript Extractor"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Add video files to begin/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(await screen.findByText(/Model cache directory/i)).toBeInTheDocument();
  });

  it("shows jobs and reacts to progress events", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return settings();
      if (cmd === "list_jobs") return [job({ status: "queued", progress: 0 })];
      throw new Error(`unexpected invoke: ${cmd}`);
    });

    render(<App />);

    expect(await screen.findByText("C:\\video.mp4")).toBeInTheDocument();

    emitEvent("transcription://progress", {
      job_id: "job-1",
      status: "transcribing",
      progress: 42,
      message: "Transcribing…",
      rtf: 1.25,
      eta_seconds: 10,
      audio_duration_sec: 120,
    });

    expect(await screen.findByText(/transcribing/i)).toBeInTheDocument();
    expect(await screen.findByText(/RTF/i)).toBeInTheDocument();
    expect(await screen.findByText(/ETA/i)).toBeInTheDocument();
  });

  it("invokes start_queue and stops processing when queue becomes idle", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return settings();
      if (cmd === "list_jobs") return [job()];
      if (cmd === "start_queue") return true;
      throw new Error(`unexpected invoke: ${cmd}`);
    });

    render(<App />);

    const user = userEvent.setup();
    // Start is disabled when no queued jobs exist.
    // Make the job queued so the Start button enables.
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return settings();
      if (cmd === "list_jobs") return [job({ status: "queued" })];
      if (cmd === "start_queue") return true;
      throw new Error(`unexpected invoke: ${cmd}`);
    });

    const btn = await screen.findByRole("button", { name: /start queue/i });
    await user.click(btn);

    expect(invokeMock).toHaveBeenCalledWith("start_queue");

    emitEvent("transcription://queue_idle", {});
    expect(await screen.findByRole("button", { name: /start queue/i })).toBeEnabled();
  });
});

