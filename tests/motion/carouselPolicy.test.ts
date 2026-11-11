import { describe, expect, test } from 'vitest';
import {
  AUTOPLAY_GAP_MS,
  AUTOPLAY_STAGGER_MS,
  DRAG_COMMIT_VELOCITY_PX_S,
  DRAG_COMMIT_WIDTH_FRACTION,
  DRAG_INTENT_PX,
  nextIndex,
  shouldSuppressClick,
  swipeDecision,
} from '../../src/components/motion/carouselPolicy';

describe('index navigation with seamless wrap', () => {
  test('next advances and wraps from the last slide to the first', () => {
    expect(nextIndex(0, 4, 1)).toBe(1);
    expect(nextIndex(1, 4, 1)).toBe(2);
    expect(nextIndex(3, 4, 1)).toBe(0);
  });

  test('previous moves back and wraps from the first slide to the last', () => {
    expect(nextIndex(2, 4, -1)).toBe(1);
    expect(nextIndex(0, 4, -1)).toBe(3);
  });

  test('a single slide never navigates', () => {
    expect(nextIndex(0, 1, 1)).toBe(0);
    expect(nextIndex(0, 1, -1)).toBe(0);
  });
});

describe('drag commit decision', () => {
  const width = 400;

  test('a drag past the width fraction commits in the drag direction', () => {
    expect(swipeDecision(0.251 * width, width, 0)).toBe(1);
    expect(swipeDecision(-0.251 * width, width, 0)).toBe(-1);
    expect(swipeDecision(0.25 * width, width, 0)).toBe(1);
  });

  test('a drag below the width fraction without velocity snaps back', () => {
    expect(swipeDecision(0.249 * width, width, 0)).toBe(0);
    expect(swipeDecision(0, width, 0)).toBe(0);
  });

  test('a fresh, fast flick commits from velocity alone, without fraction growth', () => {
    expect(swipeDecision(DRAG_INTENT_PX, width, DRAG_COMMIT_VELOCITY_PX_S)).toBe(1);
    expect(swipeDecision(-DRAG_INTENT_PX, width, -DRAG_COMMIT_VELOCITY_PX_S)).toBe(-1);
    expect(swipeDecision(-DRAG_INTENT_PX, width, DRAG_COMMIT_VELOCITY_PX_S)).toBe(-1);
  });
});

describe('drag versus click discrimination', () => {
  test('movement within the intent threshold keeps the click', () => {
    expect(shouldSuppressClick(DRAG_INTENT_PX - 1)).toBe(false);
  });

  test('movement at or beyond the intent threshold suppresses the click', () => {
    expect(shouldSuppressClick(DRAG_INTENT_PX)).toBe(true);
    expect(shouldSuppressClick(40)).toBe(true);
  });
});

describe('autoplay timing', () => {
  test('autoplay advances every owner-approved 3.8 seconds', () => {
    expect(AUTOPLAY_GAP_MS).toBe(3800);
  });

  test('the initial same-page stagger between carousel chains is the owner-approved value', () => {
    expect(AUTOPLAY_STAGGER_MS).toBe(350);
  });

  test('the commit fraction and velocity policy are the plan-pinned values', () => {
    expect(DRAG_COMMIT_WIDTH_FRACTION).toBe(0.25);
    expect(DRAG_COMMIT_VELOCITY_PX_S).toBe(500);
    expect(DRAG_INTENT_PX).toBe(10);
  });
});
