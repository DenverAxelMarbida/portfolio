export const MOTION_PAUSE_STORAGE_KEY = 'denver.dev:motion:paused';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface MotionPolicy {
  hydrated: boolean;
  reduced: boolean;
  paused: boolean;
}

/** Motion may only start after hydration, and never against reduced or paused policy. */
export function resolveMotionAllowed({ hydrated, reduced, paused }: MotionPolicy): boolean {
  return hydrated && !reduced && !paused;
}

/** Only the explicit stored string enables the local pause preference. */
export function parseStoredPause(value: string | null): boolean {
  return value === 'true';
}

interface PauseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type Listener = () => void;

const pauseListeners = new Set<Listener>();
let memoryPaused = false;

function readStorage(): PauseStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the persisted pause preference, falling back to in-memory state. */
export function getPausedSnapshot(): boolean {
  const storage = readStorage();
  if (!storage) return memoryPaused;
  try {
    const value = storage.getItem(MOTION_PAUSE_STORAGE_KEY);
    return value === null ? memoryPaused : parseStoredPause(value);
  } catch {
    return memoryPaused;
  }
}

/** Persists the pause preference; denied storage still keeps the in-memory choice. */
export function setPausedPreference(paused: boolean): void {
  memoryPaused = paused;
  const storage = readStorage();
  if (storage) {
    try {
      storage.setItem(MOTION_PAUSE_STORAGE_KEY, String(paused));
    } catch {
      // Storage denial is non-fatal; the in-memory preference still applies.
    }
  }
  for (const listener of pauseListeners) listener();
}

export function subscribePaused(listener: Listener): () => void {
  pauseListeners.add(listener);
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {
      pauseListeners.delete(listener);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOTION_PAUSE_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    pauseListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
