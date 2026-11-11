import { useHydrated } from './useHydrated';

/**
 * Visible only during real boot. React removes it on the first hydrated render;
 * CSS dismisses it after three seconds if JavaScript never starts. It never
 * receives focus and never delays content or navigation.
 */
export function StartupIndicator() {
  const hydrated = useHydrated();
  if (hydrated) return null;

  return (
    <span className="startup-indicator" data-startup-indicator aria-hidden="true">
      <span className="startup-indicator-dot" />
      Denver.dev
    </span>
  );
}
