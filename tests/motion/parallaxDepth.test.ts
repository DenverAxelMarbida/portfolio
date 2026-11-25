import { describe, expect, test } from 'vitest';
import {
  CONSTELLATION_DEPTH_FACTOR,
  HEADING_DEFAULT_OPACITY_START,
  HEADING_DEFAULT_RANGE_PX,
  STARFIELD_DEPTH_FACTOR,
  constellationDepthOffset,
  headingDepthRamp,
  headingEntryProgress,
  headingRampSettles,
  starfieldDepthOffset,
} from '../../src/components/motion/parallaxDepth';

describe('starfield depth offset', () => {
  test('the starfield travels at half the native scroll speed', () => {
    // The canvas projects page-anchored stars at `pageY - scrollY`; the helper
    // supplies the additive offset that slows that projection to 0.5×.
    expect(STARFIELD_DEPTH_FACTOR).toBe(0.5);
    expect(starfieldDepthOffset(0)).toBe(0);
    expect(starfieldDepthOffset(1000)).toBe(500);
    expect(starfieldDepthOffset(4000)).toBe(2000);
  });

  test('the offset is linear and additive per pixel of scroll', () => {
    // Additivity is what guarantees the apparent speed: projected screen Y
    // moves -scrollY + offset, so d(screenY)/d(scrollY) = -1 + factor.
    expect(starfieldDepthOffset(300 + 300)).toBe(starfieldDepthOffset(300) * 2);
  });
});

describe('constellation depth offset', () => {
  test('the constellation travels at 0.7x the native scroll speed', () => {
    // The canvas scrolls with the hero at native speed, so the painted
    // correction is the *complement* of the target factor: 1 - 0.7.
    expect(CONSTELLATION_DEPTH_FACTOR).toBe(0.7);
    expect(constellationDepthOffset(0, 420)).toBe(0);
    expect(constellationDepthOffset(200, 420)).toBeCloseTo(60);
    // Past the cap the offset pins at the canvas-height correction.
    expect(constellationDepthOffset(1000, 420)).toBeCloseTo(0.3 * 420);
  });

  test('the correction is capped at the canvas height', () => {
    // The cap keeps the figure inside its overflow-hidden canvas while the
    // hero is still on screen instead of sliding it out of view.
    expect(constellationDepthOffset(5000, 420)).toBeCloseTo(0.3 * 420);
    expect(constellationDepthOffset(1000, 300)).toBeCloseTo(0.3 * 300);
  });

  test('negative scroll positions clamp to zero', () => {
    expect(constellationDepthOffset(-50, 420)).toBe(0);
  });
});

describe('heading entry progress', () => {
  const viewportHeight = 800;

  test('0 when the heading top sits at the viewport bottom edge', () => {
    expect(headingEntryProgress(viewportHeight, viewportHeight)).toBe(0);
  });

  test('1 when the heading top reaches the viewport top', () => {
    expect(headingEntryProgress(0, viewportHeight)).toBe(1);
  });

  test('0.5 when the heading top sits at the viewport middle', () => {
    expect(headingEntryProgress(viewportHeight / 2, viewportHeight)).toBeCloseTo(0.5);
  });

  test('clamps headings still below the fold and already scrolled past', () => {
    expect(headingEntryProgress(viewportHeight * 2, viewportHeight)).toBe(0);
    expect(headingEntryProgress(-viewportHeight, viewportHeight)).toBe(1);
  });

  test('a degenerate viewport reports the settled state', () => {
    expect(headingEntryProgress(100, 0)).toBe(1);
  });
});

describe('heading depth ramp', () => {
  // WCAG floor: the ramp's static below-fold state (progress 0) is what axe
  // samples. Against the page background (#080808) the heading's ~#f4 color
  // composites to 2.44:1 at opacity 0.3 and 3.67:1 at 0.4 — both below the
  // 4.5:1 threshold that applies to the 20px semibold h3s. 0.5 composites to
  // ~4.9:1, passing at every heading size, while the 40px rise keeps the
  // entrance effect.
  const opacityStart = HEADING_DEFAULT_OPACITY_START;

  test('an entering heading sits below its layout position and faded', () => {
    expect(headingDepthRamp(0, 40, opacityStart)).toEqual({ y: 40, opacity: opacityStart });
  });

  test('a settled heading sits at its natural position, fully opaque', () => {
    expect(headingDepthRamp(1, 40, opacityStart)).toEqual({ y: 0, opacity: 1 });
  });

  test('the ramp is linear between the two ends', () => {
    expect(headingDepthRamp(0.5, 40, opacityStart).y).toBe(20);
    expect(headingDepthRamp(0.5, 40, opacityStart).opacity).toBeCloseTo(
      opacityStart + (1 - opacityStart) / 2,
    );
  });

  test('progress beyond the entry range clamps to the settled state', () => {
    expect(headingDepthRamp(2, 40, opacityStart)).toEqual({ y: 0, opacity: 1 });
    expect(headingDepthRamp(-1, 40, opacityStart)).toEqual({ y: 40, opacity: opacityStart });
  });

  test('the static state clears the strictest WCAG threshold it can be sampled at', () => {
    // Every heading span is sampled by axe at progress 0 (below the fold),
    // and the 20px semibold h3s are judged at 4.5:1, not the 3:1 large-text
    // ratio. The composite over the page background must clear 4.5:1.
    const compositOverBackground = (alpha: number) => alpha * 244 + (1 - alpha) * 8;
    const luminance = (gray: number) =>
      Math.pow((gray / 255 + 0.055) / 1.055, 2.4);
    const backgroundLuminance = luminance(8);
    const ratio = (alpha: number) =>
      (luminance(compositOverBackground(alpha)) + 0.05) / (backgroundLuminance + 0.05);
    expect(ratio(opacityStart)).toBeGreaterThanOrEqual(4.5);
  });

  test('the approved defaults match the CP7 values (contrast-corrected ramp start)', () => {
    expect(HEADING_DEFAULT_RANGE_PX).toBe(40);
    expect(HEADING_DEFAULT_OPACITY_START).toBe(0.5);
  });
});

describe('heading ramp settle latch (CP7 T4 final refinement)', () => {
  const viewportHeight = 720;

  test('a heading whose top reaches the viewport top is settled, and stays settled above it', () => {
    expect(headingRampSettles(0, viewportHeight)).toBe(true);
    expect(headingRampSettles(-40, viewportHeight)).toBe(true);
  });

  test('a heading still entering from the fold is not settled', () => {
    expect(headingRampSettles(viewportHeight, viewportHeight)).toBe(false);
    expect(headingRampSettles(300, viewportHeight)).toBe(false);
  });

  test('a degenerate viewport reports the settled state', () => {
    expect(headingRampSettles(300, 0)).toBe(true);
  });
});
