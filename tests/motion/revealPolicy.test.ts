import { describe, expect, test } from 'vitest';
import {
  HERO_ENTRANCE_DISPLACEMENT_PX,
  HERO_ENTRANCE_DURATION_MS,
} from '../../src/components/motion/heroEntrancePolicy';
import {
  REVEAL_ARRIVAL_COORDINATION_WINDOW_MS,
  REVEAL_DISPLACEMENT_PX,
  REVEAL_DURATION_MS,
  REVEAL_JUMP_DELTA_PX,
  REVEAL_ROOT_MARGIN,
  REVEAL_SKIP_TOP_RATIO,
  REVEAL_STAGGER_MS,
  assignRevealBatchSlots,
  coordinateBatchBase,
  revealDecisionFromEntry,
  revealSchedule,
  sectionVisibleInViewport,
} from '../../src/components/motion/revealPolicy';

describe('reveal policy constants', () => {
  test('matches the owner-approved interactive simulation (CP7 T4 final visual parity)', () => {
    expect(REVEAL_DISPLACEMENT_PX).toBe(18);
    // 520ms is the simulation's duration; the reveal system deliberately
    // retuned from the hero entrance's 500ms — the two systems are separate
    // contracts and no longer share a duration constant.
    expect(REVEAL_DURATION_MS).toBe(520);
    expect(REVEAL_DISPLACEMENT_PX).toBe(HERO_ENTRANCE_DISPLACEMENT_PX);
    expect(REVEAL_DURATION_MS).not.toBe(HERO_ENTRANCE_DURATION_MS);
  });

  test('trigger fires exactly at viewport entry (CP7 T4 rework)', () => {
    // The owner's defect: the -12% margin let ~143px of content scroll in
    // painted at its final state before the wave triggered and reset it.
    // The observer must fire when the wrapper actually enters the viewport.
    expect(REVEAL_ROOT_MARGIN).toBe('0px 0px 0px 0px');
  });

  test('stagger cadence is the owner-directed perceptible 140ms step (CP7 T4 final stagger polish)', () => {
    // CP7 T4 stagger polish: the owner approved the behavior but asked for a
    // subtly perceptible gap between consecutive reveal starts — 140ms,
    // decoupled from the hero entrance's tighter 100ms cadence.
    expect(REVEAL_STAGGER_MS).toBe(140);
    // The schedule is per wrapper: a wrapper with N items staggers them at
    // 140ms steps. Projects (CP6-F) puts one item in each wave wrapper — the
    // heading wave plus each card's own wave — so a card's batch position
    // supplies its offset on arrival. Approach keeps the multi-item cascade.
    expect(revealSchedule(2)).toEqual([0, 140]);
    expect(revealSchedule(4)).toEqual([0, 140, 280, 420]);
    expect(revealSchedule(5)).toEqual([0, 140, 280, 420, 560]);
    expect(revealSchedule(0)).toEqual([]);
  });
});

describe('assignRevealBatchSlots (same-batch stagger slots, CP7 T4 stagger polish)', () => {
  test('every wave in one batch takes the next consecutive slot in DOM order', () => {
    // A fast scroll delivers the projects heading, both row-1 cards and both
    // row-2 cards in one callback: heading slot 0, row 1 slots 1–2
    // (left-to-right), row 2 slots 3–4. Consecutive starts sit 140ms apart;
    // the Projects sequence heading → row 1 → row 2 is preserved by DOM
    // order.
    expect(assignRevealBatchSlots(5)).toEqual([0, 1, 2, 3, 4]);
  });

  test('a solo arrival takes slot 0 and gains no cascade delay', () => {
    expect(assignRevealBatchSlots(1)).toEqual([0]);
  });

  test('slots never accumulate across batches: each batch restarts at slot 0', () => {
    // The mobile requirement: stacked blocks trigger independently and never
    // inherit a page-wide cascade — each viewport-entry batch is fresh.
    expect(assignRevealBatchSlots(3)).toEqual([0, 1, 2]);
    expect(assignRevealBatchSlots(1)).toEqual([0]);
  });

  test('an empty batch has no slots', () => {
    expect(assignRevealBatchSlots(0)).toEqual([]);
  });
});

describe('coordinateBatchBase (bounded arrival coordination, CP7 T4 final visual parity)', () => {
  const WINDOW = REVEAL_ARRIVAL_COORDINATION_WINDOW_MS;

  test('a batch arriving while the next cascade slot is still ahead joins it', () => {
    // Adjacent observer frames: the previous batch's next free start is 140ms
    // ahead, so the new batch continues the cascade instead of restarting at
    // 0 — the measured root cause of near-simultaneous starts.
    expect(coordinateBatchBase(1000, 1140)).toBe(1140);
    expect(coordinateBatchBase(1000, 1140, WINDOW)).toBe(1140);
  });

  test('a batch within the coordination window joins the cascade', () => {
    expect(coordinateBatchBase(1000, 1000 + WINDOW)).toBe(1000 + WINDOW);
  });

  test('a cascade start at or before the batch flush is stale — start fresh', () => {
    expect(coordinateBatchBase(1000, 900)).toBe(1000);
    expect(coordinateBatchBase(1000, 1000)).toBe(1000);
  });

  test('a cascade start beyond the coordination window is too far — start fresh', () => {
    // The cap: an element that enters much later is never delayed by earlier
    // elements; the batch restarts at its own arrival.
    expect(coordinateBatchBase(1000, 1000 + WINDOW + 1)).toBe(1000);
    expect(coordinateBatchBase(1000, 1600)).toBe(1000);
  });

  test('no active cascade starts fresh at the batch flush', () => {
    expect(coordinateBatchBase(1000, null)).toBe(1000);
  });

  test('the coordination window is the bounded 200ms tuning value', () => {
    // Bounded so independent arrivals never wait long: large measured gaps
    // (mobile-slow 900ms+) always fall outside and start fresh.
    expect(REVEAL_ARRIVAL_COORDINATION_WINDOW_MS).toBe(200);
  });
});

describe('sectionVisibleInViewport (initial classification)', () => {
  const viewportHeight = 720;

  test('a section below the fold is not visible', () => {
    expect(sectionVisibleInViewport({ top: 900, bottom: 1600 }, viewportHeight)).toBe(false);
  });

  test('a section peeking into the bottom band is visible even though the root margin would miss it', () => {
    // The -12% root margin classifies this as "not intersecting"; the initial
    // classification must use the real viewport and skip such a section.
    expect(sectionVisibleInViewport({ top: 700, bottom: 1400 }, viewportHeight)).toBe(true);
  });

  test('a section crossing the top edge or covering the viewport is visible', () => {
    expect(sectionVisibleInViewport({ top: -500, bottom: 100 }, viewportHeight)).toBe(true);
    expect(sectionVisibleInViewport({ top: -100, bottom: 2000 }, viewportHeight)).toBe(true);
  });

  test('a section scrolled fully past above the viewport is not currently visible', () => {
    expect(sectionVisibleInViewport({ top: -900, bottom: -100 }, viewportHeight)).toBe(false);
  });
});

describe('revealDecisionFromEntry (pre-play arrival decision, CP7 E-1)', () => {
  const viewportHeight = 720;
  const jumpDelta = REVEAL_JUMP_DELTA_PX;

  test('a fresh arrival just past the entry line plays regardless of tempo', () => {
    expect(revealDecisionFromEntry({ top: 630 }, viewportHeight, 0)).toBe('play');
    expect(revealDecisionFromEntry({ top: 500 }, viewportHeight, 0)).toBe('play');
    expect(revealDecisionFromEntry({ top: 630 }, viewportHeight, jumpDelta)).toBe('play');
  });

  test('a section whose top reached exactly the midpoint still plays', () => {
    expect(
      revealDecisionFromEntry(
        { top: viewportHeight * REVEAL_SKIP_TOP_RATIO },
        viewportHeight,
        0,
      ),
    ).toBe('play');
  });

  test('a deep position whose recent tempo holds a teleport-scale displacement skips', () => {
    expect(revealDecisionFromEntry({ top: 359 }, viewportHeight, jumpDelta)).toBe('skip');
    expect(revealDecisionFromEntry({ top: 0 }, viewportHeight, jumpDelta)).toBe('skip');
    expect(revealDecisionFromEntry({ top: -200 }, viewportHeight, jumpDelta)).toBe('skip');
  });

  test('a deep position reached by continuous traversal plays (CP7 E-1 fix)', () => {
    // The owner's defect: fast manual scrolling carries the wave past the
    // skip line while the observer callback is still in flight. Judged from
    // the arrival snapshot with only traversal-scale displacements in the
    // recent tempo window, the wave must play instead of appearing static.
    expect(revealDecisionFromEntry({ top: 359 }, viewportHeight, 0)).toBe('play');
    expect(revealDecisionFromEntry({ top: 0 }, viewportHeight, 0)).toBe('play');
    expect(revealDecisionFromEntry({ top: -200 }, viewportHeight, 0)).toBe('play');
  });
});
