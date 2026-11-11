import { describe, expect, test } from 'vitest';
import {
  HERO_ENTRANCE_DELAY_MS,
  HERO_ENTRANCE_DISPLACEMENT_PX,
  HERO_ENTRANCE_DURATION_MS,
  heroEntranceSchedule,
} from '../../src/components/motion/heroEntrancePolicy';

describe('hero entrance schedule', () => {
  test('stagger uses the approved 100ms timing', () => {
    expect(HERO_ENTRANCE_DELAY_MS).toBe(100);
  });

  test('duration and displacement match approved CP4 settings', () => {
    expect(HERO_ENTRANCE_DURATION_MS).toBe(500);
    expect(HERO_ENTRANCE_DISPLACEMENT_PX).toBe(18);
  });

  test('each item gets its count-ordered stagger delay', () => {
    expect(heroEntranceSchedule(3)).toEqual([
      0,
      HERO_ENTRANCE_DELAY_MS,
      2 * HERO_ENTRANCE_DELAY_MS,
    ]);
    const four = heroEntranceSchedule(4);
    expect(four).toEqual([0, 100, 200, 300]);
    four.forEach((delay, index) => {
      expect(delay).toBe(index * HERO_ENTRANCE_DELAY_MS);
    });
  });

  test('degenerate counts never produce negative or duplicate delays', () => {
    expect(heroEntranceSchedule(0)).toEqual([]);
    expect(heroEntranceSchedule(1)).toEqual([0]);
  });
});
