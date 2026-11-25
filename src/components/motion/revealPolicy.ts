/**
 * CP6 scroll-reveal timing and decision contract. Owner-approved correction:
 * the reveal mirrors the accepted hero entrance feel — 18px upward movement,
 * opacity 0 → 1.00, 500ms ease-out, triggered near viewport entry, one reveal
 * per section, never replayed.
 */

/** Upward displacement of the one-shot reveal, in CSS px (mirrors the hero entrance). */
export const REVEAL_DISPLACEMENT_PX = 18;

/**
 * Reveal duration in ms. CP7 T4 final visual-parity refinement: matched to the
 * owner's approved interactive simulation (520ms, cubic-bezier(.2, .75, .25, 1)).
 * Opacity and transform are the only animated properties.
 */
export const REVEAL_DURATION_MS = 520;

/** Stagger delay between consecutive reveal starts, in ms (CP7 T4 final stagger polish: owner-directed 140ms tuning value). */
export const REVEAL_STAGGER_MS = 140;

/**
 * Bounded arrival-coordination window (CP7 T4 final visual-parity
 * refinement). Adjacent observer batches used to each restart at slot 0, so
 * blocks entering one or two frames apart started nearly simultaneously
 * (measured 51–84ms gaps, and an ordering violation where a later batch's
 * first wave started 51ms before the earlier batch's staggered member).
 * When a new batch arrives within this window of the ongoing cascade's next
 * free start, its waves continue that cascade instead — capped so no wave
 * ever waits more than the window beyond its own arrival (an element that
 * enters much later is never delayed by earlier elements).
 */
export const REVEAL_ARRIVAL_COORDINATION_WINDOW_MS = 200;

/**
 * Pure decision for one batch's cascade base time. `nowMs` is the batch flush
 * time, `cascadeNextFreeMs` the absolute time the ongoing cascade's next
 * stagger slot begins (null when no cascade is active). The batch joins the
 * cascade only when the next free start is still in the future and within the
 * coordination window; otherwise it starts fresh at its own arrival.
 */
export function coordinateBatchBase(
  nowMs: number,
  cascadeNextFreeMs: number | null,
  windowMs: number = REVEAL_ARRIVAL_COORDINATION_WINDOW_MS,
): number {
  if (cascadeNextFreeMs === null) return nowMs;
  if (cascadeNextFreeMs <= nowMs) return nowMs;
  if (cascadeNextFreeMs - nowMs > windowMs) return nowMs;
  return cascadeNextFreeMs;
}

/**
 * IntersectionObserver root margin. CP7 T4 rework: the observer fires when
 * the wrapper actually enters the viewport. The previous -12% bottom margin
 * triggered ~143px after visual entry, letting painted final-state content
 * scroll in before its reveal reset and re-animated it (the owner's defect).
 * The arming hide (CSS) covers the pre-entry frames instead of the margin.
 */
export const REVEAL_ROOT_MARGIN = '0px 0px 0px 0px';

/**
 * Assign stagger slots to one observer batch, in DOM order. CP7 T4 final
 * stagger polish: every wave arriving in the same batch takes the next
 * consecutive slot, so consecutive reveal starts sit REVEAL_STAGGER_MS apart
 * — a desktop card row's members stagger left-to-right, the heading leads
 * its row, and the Projects sequence stays heading → row 1 → row 2. A solo
 * arrival always takes slot 0, so it gains no cascade delay, and slots never
 * accumulate across batches: each viewport-entry batch restarts at slot 0
 * (CP7 T4 requirement 5).
 */
export function assignRevealBatchSlots(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index);
}

/**
 * Safeguard 2 (CP7 E-1): the pre-play decision is made from the observer's
 * own arrival snapshot (`entry.boundingClientRect`), not a stale re-read at
 * callback time, so a fast continuous scroll can no longer travel past the
 * skip line between the entry crossing and the callback. A position that is
 * deep inside the viewport at arrival is only a skip when the scroll tempo
 * says the visitor jumped there in one event (keyboard End, instant
 * `scrollTo`); a continuous traversal — however fast — always plays.
 */
export const REVEAL_SKIP_TOP_RATIO = 0.5;

/**
 * A single scroll displacement of at least this many px counts as a jump
 * arrival (keyboard End, instant `scrollTo`). Real continuous input — wheel
 * notches and trackpad momentum — stays far below this per-event delta, so a
 * fast manual traversal is never mistaken for a teleport.
 */
export const REVEAL_JUMP_DELTA_PX = 480;

/** How long a scroll tempo observation stays decisive. */
export const REVEAL_JUMP_WINDOW_MS = 250;

export type RevealDecision = 'play' | 'skip';

interface ScrollTempoRecord {
  at: number;
  delta: number;
}

const scrollTempoRecords: ScrollTempoRecord[] = [];
let scrollTempoLastY: number | null = null;
let scrollTempoAttached = false;

function noteScrollTempoEvent(): void {
  const at = performance.now();
  const y = window.scrollY;
  if (scrollTempoLastY !== null) {
    scrollTempoRecords.push({ at, delta: Math.abs(y - scrollTempoLastY) });
  }
  scrollTempoLastY = y;
  while (
    scrollTempoRecords.length > 0 &&
    at - scrollTempoRecords[0]!.at > REVEAL_JUMP_WINDOW_MS
  ) {
    scrollTempoRecords.shift();
  }
}

/**
 * Installs the shared page scroll-tempo listener once (all Reveal waves share
 * it). The listener only records small displacement samples and never
 * reflows; it stays attached for the document lifetime.
 */
export function ensureScrollTempoTracking(): void {
  if (scrollTempoAttached || typeof window === 'undefined') return;
  scrollTempoAttached = true;
  scrollTempoLastY = window.scrollY;
  window.addEventListener('scroll', noteScrollTempoEvent, { passive: true });
}

/**
 * The largest scroll displacement among recent events, or 0 when the recent
 * tempo is ordinary traversal. Deep-jump arrivals report a displacement no
 * continuous input produces.
 */
export function recentScrollJumpDelta(): number {
  const now = performance.now();
  let max = 0;
  for (const record of scrollTempoRecords) {
    if (now - record.at > REVEAL_JUMP_WINDOW_MS) continue;
    if (record.delta > max) max = record.delta;
  }
  return max;
}

/**
 * Safeguard 1: initial classification uses the actual viewport bounds, not
 * the observer's shrunken root margin — any section already visible when the
 * controller initializes skips its reveal.
 */
export function sectionVisibleInViewport(
  rect: { top: number; bottom: number },
  viewportHeight: number,
): boolean {
  return rect.top < viewportHeight && rect.bottom > 0;
}

/**
 * Safeguard 2: decide from the arrival snapshot plus scroll tempo, all at the
 * arrival callback itself so the animation starts on the frame the wave
 * enters (a deferred start would play offscreen under fast scrolling). A
 * fresh arrival near the entry line always plays; a position already deep
 * inside the viewport plays only when the recent tempo is ordinary
 * traversal, and skips when a single event teleported the visitor there.
 */
export function revealDecisionFromEntry(
  rect: { top: number },
  viewportHeight: number,
  recentJumpDeltaPx: number,
): RevealDecision {
  if (rect.top >= viewportHeight * REVEAL_SKIP_TOP_RATIO) return 'play';
  return recentJumpDeltaPx >= REVEAL_JUMP_DELTA_PX ? 'skip' : 'play';
}

/**
 * Stagger delay in ms for each reveal item group inside one section, in
 * markup (DOM) order, at the owner-directed REVEAL_STAGGER_MS cadence.
 * Projects has two groups (heading, grid); Approach has four (heading,
 * synchronized overview paragraphs, capabilities, workflow).
 */
export function revealSchedule(count: number): number[] {
  const items: number[] = [];
  for (let index = 0; index < Math.max(0, count); index += 1) {
    items.push(index * REVEAL_STAGGER_MS);
  }
  return items;
}
