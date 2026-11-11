import type { activateCarousel, CarouselHandle } from './carouselClient';

export type { CarouselHandle };

export interface CarouselRuntime {
  activateCarousel: typeof activateCarousel;
}

let runtimePromise: Promise<CarouselRuntime> | null = null;

/**
 * Loads the imperative carousel controller only when a media block with more
 * than one screenshot mounts. The dynamic import keeps it in a deferred chunk
 * separate from both the initial bundle and the ambient motion runtime, so
 * manual navigation works even when animations are disabled.
 */
export function loadCarouselRuntime(): Promise<CarouselRuntime> {
  if (!runtimePromise) {
    runtimePromise = import('./carouselClient')
      .then((module) => ({ activateCarousel: module.activateCarousel }))
      .catch((error: unknown) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

export function carouselRuntimeLoaded(): boolean {
  return runtimePromise !== null;
}
