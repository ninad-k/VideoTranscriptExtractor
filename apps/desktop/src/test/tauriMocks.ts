import { vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;

const listeners = new Map<string, Set<Listener>>();

export function emitEvent(name: string, payload: unknown) {
  const set = listeners.get(name);
  if (!set) return;
  for (const cb of set) cb({ payload });
}

export function installTauriMocks() {
  vi.mock("@tauri-apps/api/core", () => {
    return {
      invoke: vi.fn(),
    };
  });
  vi.mock("@tauri-apps/api/event", () => {
    return {
      listen: vi.fn(async (name: string, cb: Listener) => {
        const set = listeners.get(name) ?? new Set<Listener>();
        set.add(cb);
        listeners.set(name, set);
        return () => {
          set.delete(cb);
        };
      }),
    };
  });
  vi.mock("@tauri-apps/plugin-dialog", () => {
    return {
      open: vi.fn(),
      save: vi.fn(),
    };
  });
}

