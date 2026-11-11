import { afterEach, describe, expect, test, vi } from 'vitest';

const STORAGE_KEY = 'denver.dev:motion:paused';

function stubWindow(storage: unknown) {
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

async function loadPreferences() {
  vi.resetModules();
  return import('../../src/components/motion/preferences');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseStoredPause', () => {
  test('accepts only the explicit true value', async () => {
    const { parseStoredPause } = await loadPreferences();
    expect(parseStoredPause('true')).toBe(true);
    expect(parseStoredPause('false')).toBe(false);
    expect(parseStoredPause('1')).toBe(false);
    expect(parseStoredPause('')).toBe(false);
    expect(parseStoredPause(null)).toBe(false);
  });
});

describe('resolveMotionAllowed', () => {
  test('requires hydration and rejects reduced or paused policy', async () => {
    const { resolveMotionAllowed } = await loadPreferences();
    expect(resolveMotionAllowed({ hydrated: false, reduced: false, paused: false })).toBe(false);
    expect(resolveMotionAllowed({ hydrated: true, reduced: true, paused: false })).toBe(false);
    expect(resolveMotionAllowed({ hydrated: true, reduced: false, paused: true })).toBe(false);
    expect(resolveMotionAllowed({ hydrated: true, reduced: true, paused: true })).toBe(false);
    expect(resolveMotionAllowed({ hydrated: true, reduced: false, paused: false })).toBe(true);
  });

  test('reduced motion wins over a persisted resume choice', async () => {
    const { resolveMotionAllowed } = await loadPreferences();
    expect(resolveMotionAllowed({ hydrated: true, reduced: true, paused: false })).toBe(false);
  });
});

describe('pause preference storage', () => {
  test('reads a persisted pause value and writes changes', async () => {
    const values = new Map<string, string>([[STORAGE_KEY, 'true']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    stubWindow(storage);
    const { getPausedSnapshot, setPausedPreference } = await loadPreferences();

    expect(getPausedSnapshot()).toBe(true);
    setPausedPreference(false);
    expect(values.get(STORAGE_KEY)).toBe('false');
    expect(getPausedSnapshot()).toBe(false);
    setPausedPreference(true);
    expect(getPausedSnapshot()).toBe(true);
  });

  test('treats malformed storage as not paused', async () => {
    stubWindow({
      getItem: () => 'not-a-boolean',
      setItem: () => undefined,
    });
    const { getPausedSnapshot } = await loadPreferences();
    expect(getPausedSnapshot()).toBe(false);
  });

  test('keeps working when storage access is denied', async () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('storage denied');
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { getPausedSnapshot, setPausedPreference } = await loadPreferences();

    expect(getPausedSnapshot()).toBe(false);
    expect(() => setPausedPreference(true)).not.toThrow();
    expect(getPausedSnapshot()).toBe(true);
  });

  test('notifies subscribers and stops after unsubscribe', async () => {
    stubWindow({
      getItem: () => null,
      setItem: () => undefined,
    });
    const { setPausedPreference, subscribePaused } = await loadPreferences();
    const listener = vi.fn();
    const unsubscribe = subscribePaused(listener);

    setPausedPreference(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPausedPreference(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
