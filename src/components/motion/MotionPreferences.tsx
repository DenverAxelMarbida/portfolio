import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { pauseMotionAnimations } from './animationControls';
import { loadMotionRuntime } from './motionRuntime';
import {
  REDUCED_MOTION_QUERY,
  getPausedSnapshot,
  resolveMotionAllowed,
  setPausedPreference,
  subscribePaused,
} from './preferences';
import { useHydrated } from './useHydrated';

export interface MotionPreferences {
  hydrated: boolean;
  reduced: boolean;
  paused: boolean;
  motionAllowed: boolean;
  runtimeReady: boolean;
  setPaused: (paused: boolean) => void;
}

const MotionPreferencesContext = createContext<MotionPreferences | null>(null);

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const readServerReducedMotion = () => false;
const readServerPaused = () => false;

export function MotionPreferencesProvider({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    readServerReducedMotion,
  );
  const paused = useSyncExternalStore(subscribePaused, getPausedSnapshot, readServerPaused);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const motionAllowed = resolveMotionAllowed({ hydrated, reduced, paused });

  const setPaused = useCallback((next: boolean) => {
    if (next) pauseMotionAnimations();
    setPausedPreference(next);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    document.documentElement.dataset.motionPolicy = reduced
      ? 'reduced'
      : paused
        ? 'paused'
        : 'active';

    if (!motionAllowed) {
      pauseMotionAnimations();
      return;
    }

    let active = true;
    document.documentElement.dataset.motionRuntime = 'loading';
    void loadMotionRuntime()
      .then(() => {
        if (!active) return;
        setRuntimeReady(true);
        document.documentElement.dataset.motionRuntime = 'ready';
      })
      .catch(() => {
        if (!active) return;
        setRuntimeReady(false);
        document.documentElement.dataset.motionRuntime = 'unavailable';
      });

    return () => {
      active = false;
    };
  }, [hydrated, motionAllowed, paused, reduced]);

  useEffect(
    () => () => {
      pauseMotionAnimations();
    },
    [],
  );

  const value = useMemo<MotionPreferences>(
    () => ({ hydrated, reduced, paused, motionAllowed, runtimeReady, setPaused }),
    [hydrated, reduced, paused, motionAllowed, runtimeReady, setPaused],
  );

  return <MotionPreferencesContext value={value}>{children}</MotionPreferencesContext>;
}

export function useMotionPreferences(): MotionPreferences {
  const value = useContext(MotionPreferencesContext);
  if (!value) {
    throw new Error('useMotionPreferences must be used inside MotionPreferencesProvider');
  }
  return value;
}
