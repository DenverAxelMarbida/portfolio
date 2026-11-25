import { describe, expect, test } from 'vitest';
import {
  CONSTELLATION_LINKS,
  CONSTELLATION_MAX_LINK_DISTANCE,
  CONSTELLATION_NODES,
  CONSTELLATION_TWINKLE_BOOST,
  CONSTELLATION_VIEWBOX,
  clampConstellationDpr,
  constellationBudgets,
  constellationFrameInterval,
  linkWithinRange,
  nodeDrift,
  pointerInfluence,
  CONSTELLATION_DRIFT_AMPLITUDE,
  CONSTELLATION_POINTER_INFLUENCE,
} from '../../src/components/motion/constellationGeometry';
import {
  boostTwinkleWave,
  responseFactor,
} from '../../src/components/motion/scrollResponse';

describe('constellation geometry', () => {
  test('keeps the approved Capricornus ten-node/ten-link chain', () => {
    expect(CONSTELLATION_NODES).toHaveLength(10);
    expect(CONSTELLATION_LINKS).toHaveLength(10);
    for (const [from, to] of CONSTELLATION_LINKS) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThan(CONSTELLATION_NODES.length);
      expect(to).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThan(CONSTELLATION_NODES.length);
      expect(from).not.toBe(to);
      expect(linkWithinRange(CONSTELLATION_NODES[from]!, CONSTELLATION_NODES[to]!)).toBe(true);
    }
  });

  test('keeps every rendered link clear of the drift + parallax cull threshold', () => {
    // Base distance must leave room for drift (±8) plus fine-pointer parallax
    // (±14) on both endpoints, so links never blink in and out of range.
    for (const [from, to] of CONSTELLATION_LINKS) {
      const base = Math.hypot(
        CONSTELLATION_NODES[from]!.x - CONSTELLATION_NODES[to]!.x,
        CONSTELLATION_NODES[from]!.y - CONSTELLATION_NODES[to]!.y,
      );
      expect(base).toBeLessThanOrEqual(196);
    }
  });

  test('traces the Capricornus figure in chain order', () => {
    // The links mimic the reference asterism chain: each node connects forward
    // in order and the last edge closes the loop back to the head vertex.
    for (let index = 0; index < CONSTELLATION_LINKS.length; index += 1) {
      const [from, to] = CONSTELLATION_LINKS[index]!;
      expect(from).toBe(index);
      expect(to).toBe((index + 1) % CONSTELLATION_NODES.length);
    }
  });

  test('weights star tiers by traced magnitudes', () => {
    const seen = new Set<string>();
    for (const node of CONSTELLATION_NODES) {
      expect(node.mag).toBeGreaterThan(0);
      expect(node.mag).toBeLessThan(6);
      expect(['primary', 'secondary', 'faint']).toContain(node.tier);
      expect(node.radius).toBeGreaterThan(0);
      expect(node.radius).toBeLessThanOrEqual(5.4);
      expect(node.haloWeight).toBeGreaterThan(0);
      expect(node.haloWeight).toBeLessThanOrEqual(1);
      if (node.tier === 'primary') {
        expect(node.radius).toBeGreaterThan(5);
        expect(node.haloWeight).toBe(1);
      }
      if (node.tier === 'faint') {
        expect(node.radius).toBeLessThan(3.5);
        expect(node.mag).toBeGreaterThanOrEqual(4.35);
      }
      seen.add(node.tier);
    }
    // Varied sizes/brightness require at least two of the three tiers.
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  test('keeps coordinates within the viewBox', () => {
    for (const node of CONSTELLATION_NODES) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(CONSTELLATION_VIEWBOX.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(CONSTELLATION_VIEWBOX.height);
    }
  });

  test('bounds DPR and frame cadence', () => {
    expect(clampConstellationDpr(3)).toBe(1.5);
    expect(clampConstellationDpr(undefined)).toBe(1);
    expect(constellationBudgets(false)).toEqual({ maxNodes: 36, maxFps: 60, maxDpr: 1.5 });
    expect(constellationBudgets(true)).toEqual({ maxNodes: 18, maxFps: 20, maxDpr: 1.5 });
    expect(constellationFrameInterval(false)).toBeCloseTo(16.67, 2);
    expect(constellationFrameInterval(true)).toBe(50);
  });

  test('keeps node drift bounded and deterministic', () => {
    const first = nodeDrift(2, 2000);
    const second = nodeDrift(2, 2000);
    expect(first).toEqual(second);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(CONSTELLATION_DRIFT_AMPLITUDE);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(CONSTELLATION_DRIFT_AMPLITUDE);
  });

  test('returns no pointer influence outside or invalid bounds', () => {
    const rect = { left: 0, top: 0, width: 600, height: 400 };
    expect(pointerInfluence(300, 200, rect)).toMatchObject({ inside: true, x: 0, y: 0 });
    expect(pointerInfluence(-10, 200, rect)).toEqual({ x: 0, y: 0, inside: false });
    const edge = pointerInfluence(600, 400, rect);
    expect(Math.abs(edge.x)).toBeCloseTo(CONSTELLATION_POINTER_INFLUENCE, 5);
    expect(CONSTELLATION_MAX_LINK_DISTANCE).toBe(240);
  });
});

describe('constellation scroll response (CP7 T5)', () => {
  test('the response modulates twinkle only, leaving the drift budget untouched', () => {
    // Twinkle-only by design: the worst-case rendered link length is base
    // (~196) + drift (±8 both endpoints) + pointer (±14 both endpoints) =
    // exactly the 240-unit cull threshold with zero headroom, so any drift
    // increase from the response would blink links in and out of range.
    expect(CONSTELLATION_TWINKLE_BOOST).toBeGreaterThan(0);
    expect(CONSTELLATION_TWINKLE_BOOST).toBeLessThanOrEqual(0.3);
    expect(CONSTELLATION_DRIFT_AMPLITUDE).toBe(8);
    expect(CONSTELLATION_POINTER_INFLUENCE).toBe(14);
  });

  test('the worst-case link length stays clear of the cull threshold with zero response drift', () => {
    // The response level scales brightness only, so the link-distance budget
    // is unchanged by T5: the existing base + drift + pointer worst case.
    for (const [from, to] of CONSTELLATION_LINKS) {
      const base = Math.hypot(
        CONSTELLATION_NODES[from]!.x - CONSTELLATION_NODES[to]!.x,
        CONSTELLATION_NODES[from]!.y - CONSTELLATION_NODES[to]!.y,
      );
      const worstCase =
        base + 2 * CONSTELLATION_DRIFT_AMPLITUDE + 2 * CONSTELLATION_POINTER_INFLUENCE;
      expect(worstCase).toBeLessThanOrEqual(CONSTELLATION_MAX_LINK_DISTANCE);
    }
  });

  test('the boosted brightness wave is clamped to the idle maximum', () => {
    for (const wave of [0, 0.25, 0.5, 0.75, 1]) {
      for (const level of [0, 0.5, 1]) {
        const boosted = boostTwinkleWave(wave, CONSTELLATION_TWINKLE_BOOST, level);
        expect(boosted).toBeGreaterThanOrEqual(0);
        expect(boosted).toBeLessThanOrEqual(1);
        // With brightness ≤ 1, the halo factor (0.8 + 0.2*b) stays ≤ 1 and
        // the core factor (0.85 + 0.3*b) stays at the idle maximum, so halo
        // and core alphas never exceed the approved static ceilings.
        expect(0.8 + 0.2 * boosted).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(boostTwinkleWave(1, CONSTELLATION_TWINKLE_BOOST, 1)).toBe(1);
  });

  test('the twinkle factor is a subtle multiplier that is 1 at rest', () => {
    expect(responseFactor(CONSTELLATION_TWINKLE_BOOST, 0)).toBe(1);
    expect(responseFactor(CONSTELLATION_TWINKLE_BOOST, 1)).toBeCloseTo(1.25);
  });
});
