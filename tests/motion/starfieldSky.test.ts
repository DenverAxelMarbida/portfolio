import { describe, expect, test } from 'vitest';
import {
  ASCENT_SPEED_PX_PER_MS,
  METEOR_HEAD_ALPHA,
  METEOR_GROW_FRACTION,
  METEOR_MAX_LIFETIME_MS,
  METEOR_MAX_TRAIL_PX,
  METEOR_MIN_TRAIL_PX,
  METEOR_TRAVEL_LENGTH_FACTOR,
  advanceAscent,
  createMeteorClock,
  meteorEnvelope,
  meteorGapMs,
  meteorGeometry,
  meteorHeadAlpha,
  meteorHeadTravel,
  meteorLifetimeMs,
  meteorProgress,
  meteorStreakShare,
  meteorTrailLengthPx,
  updateMeteorClock,
  wrapPageY,
  type Meteor,
} from '../../src/components/motion/starfieldSky';

describe('infinite ascent', () => {
  test('advances purely with elapsed time', () => {
    expect(advanceAscent(0, 1000, ASCENT_SPEED_PX_PER_MS, 10_000)).toBeCloseTo(
      ASCENT_SPEED_PX_PER_MS * 1000,
    );
  });

  test('is frame-independent: chunked deltas equal one full delta', () => {
    const one = advanceAscent(0, 1000, ASCENT_SPEED_PX_PER_MS, 10_000);
    const chunked = advanceAscent(
      advanceAscent(
        advanceAscent(0, 300, ASCENT_SPEED_PX_PER_MS, 10_000),
        400,
        ASCENT_SPEED_PX_PER_MS,
        10_000,
      ),
      300,
      ASCENT_SPEED_PX_PER_MS,
      10_000,
    );
    expect(chunked).toBeCloseTo(one);
  });

  test('runs at the owner-mandated 50 px/s', () => {
    expect(ASCENT_SPEED_PX_PER_MS).toBe(0.05);
  });

  test('hidden and paused intervals never accrue animation time', () => {
    // A zero or negative delta is a resumed frame after a frozen loop; it
    // must not create a catch-up jump.
    expect(advanceAscent(12.5, 0, ASCENT_SPEED_PX_PER_MS, 10_000)).toBe(12.5);
    expect(advanceAscent(12.5, -80, ASCENT_SPEED_PX_PER_MS, 10_000)).toBe(12.5);
  });

  test('wraparound keeps the ascent bounded without overshoot', () => {
    expect(wrapPageY(-3, 1000)).toBe(997);
    expect(wrapPageY(1003, 1000)).toBe(3);
    expect(wrapPageY(0, 1000)).toBe(0);
    let offset = 999;
    for (let stepping = 0; stepping < 100; stepping += 1) {
      offset = advanceAscent(offset, 50, ASCENT_SPEED_PX_PER_MS, 1000);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(1000);
    }
  });
});

describe('shooting stars scheduling', () => {
  test('gaps stay inside the 3–7s window, inclusive of the bounds', () => {
    expect(meteorGapMs(0)).toBe(3000);
    expect(meteorGapMs(1)).toBe(7000);
    expect(meteorGapMs(0.5)).toBe(5000);
  });

  test('lifetimes stay inside the approved 900–1300ms window', () => {
    expect(meteorLifetimeMs(0)).toBe(900);
    expect(meteorLifetimeMs(1)).toBe(METEOR_MAX_LIFETIME_MS);
    expect(meteorLifetimeMs(0.5)).toBe(1100);
    expect(meteorLifetimeMs(-2)).toBe(900);
    expect(meteorLifetimeMs(3)).toBe(METEOR_MAX_LIFETIME_MS);
  });

  test('the clock starts idle and schedules the first gap', () => {
    expect(createMeteorClock(0, 0.25)).toEqual({
      active: null,
      nextSpawnAt: meteorGapMs(0.25),
    });
  });

  test('a not-yet-due clock never spawns', () => {
    const clock = createMeteorClock(0, 0.5);
    expect(updateMeteorClock(clock, clock.nextSpawnAt - 1, null)).toEqual(clock);
  });

  test('a due clock spawns with bounded lifetime and schedules the next gap', () => {
    const clock = createMeteorClock(0, 0.5);
    const gapRoll = 0.3;
    const lifetimeRoll = 1;
    const geometry = meteorGeometry({
      startX: 100,
      startY: 50,
      directionRoll: 0.9,
      angleRoll: 0,
      trailLengthPx: 400,
    });
    const spawned = updateMeteorClock(clock, clock.nextSpawnAt, {
      gapRoll,
      lifetimeRoll,
      geometry,
    });
    expect(spawned.active).not.toBeNull();
    expect(spawned.active!.lifetime).toBe(METEOR_MAX_LIFETIME_MS);
    expect(spawned.nextSpawnAt).toBe(
      clock.nextSpawnAt + METEOR_MAX_LIFETIME_MS + meteorGapMs(gapRoll),
    );

    // Exact millisecond overlap cannot happen: the next spawn is scheduled
    // strictly after the active meteor's lifetime.
    const overlapped = updateMeteorClock(spawned, clock.nextSpawnAt + METEOR_MAX_LIFETIME_MS - 1, {
      gapRoll,
      lifetimeRoll,
      geometry,
    });
    expect(overlapped.active).toEqual(spawned.active);
    expect(overlapped.nextSpawnAt).toBe(spawned.nextSpawnAt);
  });

  test('an expired clock without geometry input keeps the schedule idle', () => {
    const clock = createMeteorClock(0, 0);
    const spawned = updateMeteorClock(clock, clock.nextSpawnAt, {
      gapRoll: 0,
      lifetimeRoll: 1,
      geometry: meteorGeometry({
        startX: 0,
        startY: 0,
        directionRoll: 0.9,
        angleRoll: 0,
        trailLengthPx: 400,
      }),
    });
    const expired = spawned.active!.spawnAt + spawned.active!.lifetime;
    const settled = updateMeteorClock(spawned, expired, null);
    expect(settled.active).toBeNull();
    expect(settled.nextSpawnAt).toBe(spawned.nextSpawnAt);
  });

  test('progress stays inside [0,1] and is null outside the flight window', () => {
    const meteor: Meteor = {
      geometry: { startX: 0, startY: 0, endX: 100, endY: 40 },
      spawnAt: 100,
      lifetime: 400,
    };
    expect(meteorProgress(meteor, 100)).toBe(0);
    expect(meteorProgress(meteor, 300)).toBeCloseTo(0.5);
    expect(meteorProgress(meteor, 500)).toBe(1);
    expect(meteorProgress(meteor, 501)).toBeNull();
    expect(meteorProgress(meteor, 99)).toBeNull();
  });
});

describe('comet appearance', () => {
  test('envelope rises quickly, holds the burn, and fades progressively to dark', () => {
    expect(meteorEnvelope(null)).toBe(0);
    expect(meteorEnvelope(-0.1)).toBe(0);
    expect(meteorEnvelope(0)).toBe(0);
    expect(meteorEnvelope(1)).toBe(0);
    expect(meteorEnvelope(1.1)).toBe(0);
    // Rising through the soft fade-in.
    expect(meteorEnvelope(0.05)).toBeGreaterThan(0);
    expect(meteorEnvelope(0.05)).toBeLessThan(1);
    // Full burn through the travel phase.
    expect(meteorEnvelope(0.3)).toBe(1);
    expect(meteorEnvelope(0.6)).toBe(1);
    // Progressive fade over the final stretch, ending dark.
    expect(meteorEnvelope(0.7)).toBeLessThan(meteorEnvelope(0.6));
    expect(meteorEnvelope(0.9)).toBeLessThan(meteorEnvelope(0.7));
  });

  test('head brightness peaks at the approved near-white ceiling', () => {
    expect(meteorHeadAlpha(0.3)).toBeCloseTo(METEOR_HEAD_ALPHA);
    expect(meteorHeadAlpha(0.3)).toBeLessThanOrEqual(0.95);
    expect(meteorHeadAlpha(0)).toBe(0);
    expect(meteorHeadAlpha(1)).toBe(0);
  });

  test('the comet translates continuously to the travel factor, never stalling', () => {
    expect(meteorHeadTravel(null)).toBe(0);
    expect(meteorHeadTravel(0)).toBe(0);
    // Linear in progress up to the factor — no landing plateau.
    expect(meteorHeadTravel(0.25)).toBeCloseTo(METEOR_TRAVEL_LENGTH_FACTOR * 0.25);
    expect(meteorHeadTravel(0.5)).toBeCloseTo(METEOR_TRAVEL_LENGTH_FACTOR * 0.5);
    expect(meteorHeadTravel(0.9)).toBeGreaterThan(1);
    expect(meteorHeadTravel(1)).toBe(METEOR_TRAVEL_LENGTH_FACTOR);
  });

  test('effective head speed stays inside the approved 40-60% band over CP4.5-B', () => {
    // Speeds in trail lengths per lifetime: CP4.5-B covered 1 length in 55%
    // of the life (1/0.55 ≈ 1.82 per life); CP4.5-C covers the travel factor
    // over the whole life. The ratio is the approved speed uplift.
    const cp45bSpeed = 1 / 0.55;
    const cp45cSpeed = METEOR_TRAVEL_LENGTH_FACTOR;
    const uplift = cp45cSpeed / cp45bSpeed;
    expect(uplift).toBeGreaterThanOrEqual(1.4);
    expect(uplift).toBeLessThanOrEqual(1.6);
    expect(cp45cSpeed).toBeGreaterThanOrEqual(cp45bSpeed * 1.4);
    expect(cp45cSpeed).toBeLessThanOrEqual(cp45bSpeed * 1.6);
  });

  test('streak share grows in over the grow fraction then holds full length', () => {
    expect(meteorStreakShare(null)).toBe(0);
    expect(meteorStreakShare(0)).toBe(0);
    expect(meteorStreakShare(METEOR_GROW_FRACTION / 2)).toBeCloseTo(0.5);
    expect(meteorStreakShare(METEOR_GROW_FRACTION)).toBe(1);
    expect(meteorStreakShare(0.6)).toBe(1);
    expect(meteorStreakShare(1)).toBe(1);
  });

  test('trail length is viewport-relative between the approved bounds', () => {
    expect(meteorTrailLengthPx(1080, 0)).toBeCloseTo(1080 * 0.32);
    expect(meteorTrailLengthPx(1080, 1)).toBeCloseTo(Math.min(560, 1080 * 0.5));
    // Small viewports clamp to the absolute minimum, large ones to the max.
    expect(meteorTrailLengthPx(400, 0)).toBe(METEOR_MIN_TRAIL_PX);
    expect(meteorTrailLengthPx(400, 1)).toBe(METEOR_MIN_TRAIL_PX);
    expect(meteorTrailLengthPx(2600, 1)).toBe(METEOR_MAX_TRAIL_PX);
    expect(meteorTrailLengthPx(0, 0.5)).toBe(METEOR_MIN_TRAIL_PX);
  });

  test('geometry keeps trails bounded and favors the lower-right descent', () => {
    const right = meteorGeometry({
      startX: 100,
      startY: 80,
      directionRoll: 0.9,
      angleRoll: 0,
      trailLengthPx: 400,
    });
    const left = meteorGeometry({
      startX: 100,
      startY: 80,
      directionRoll: 0.1,
      angleRoll: 0,
      trailLengthPx: 400,
    });
    expect(right.endX).toBeGreaterThan(100);
    expect(left.endX).toBeLessThan(100);
    // Same heading falls downward in both mirrorings.
    expect(right.endY).toBeGreaterThan(80);
    expect(left.endY).toBeGreaterThan(80);
    const rightLength = Math.hypot(right.endX - 100, right.endY - 80);
    expect(rightLength).toBeCloseTo(400);
    // The mirror share is the approved ~85% lower-right.
    const heading = (directionRoll: number) =>
      Math.sign(
        meteorGeometry({ startX: 0, startY: 0, directionRoll, angleRoll: 0, trailLengthPx: 100 })
          .endX,
      );
    expect(heading(0.14)).toBe(-1);
    expect(heading(0.15)).toBe(1);
    expect(heading(0.9)).toBe(1);
    // Angles stay shallow: no streak is steeper than its shallow fall.
    for (const angleRoll of [0, 0.5, 1]) {
      const geo = meteorGeometry({
        startX: 0,
        startY: 0,
        directionRoll: 0.9,
        angleRoll,
        trailLengthPx: 300,
      });
      const angle = Math.atan2(geo.endY, geo.endX) * (180 / Math.PI);
      expect(angle).toBeGreaterThanOrEqual(18 - 0.001);
      expect(angle).toBeLessThanOrEqual(38 + 0.001);
    }
  });
});
