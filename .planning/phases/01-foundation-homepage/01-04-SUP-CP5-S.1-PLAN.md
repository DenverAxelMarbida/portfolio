# CP5-S.1 — Screenshot Carousel Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans (inline) — see Execution Handoff at the end of this file. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the CP5 manual crossfade with an accessible, auto-advancing, drag/swipeable slide carousel on homepage project cards and project detail pages, inside every existing budget.

**Architecture:** Pure policy module (`carouselPolicy.ts`) + one imperative controller chunk (`carouselClient.ts`) loaded through a dedicated deferred loader (`carouselRuntime.ts`, mirroring `motionRuntime.ts`), attached to `ProjectMedia` markup. Servers and pre-runtime renders show exactly one screenshot; the full slide track, dots and live region appear only after the runtime chunk is ready, so no hidden-slide content ever exists without JS. Zero React re-renders for navigation or autoplay — the controller writes attributes/styles only.

**Tech stack:** React 19.3.1 (existing), native Pointer Events / IntersectionObserver / `visibilitychange` / CSS transforms — no new dependencies.

**Spec:** CP5-S.1 proposal (chat, 2026-11-10) + owner revisions 1–12 (chat, 2026-11-10), which override the proposal where they differ. Planning records: `.planning/phases/01-foundation-homepage/01-04-EXECUTION.md` (CP5, CP5-S records), `01-04-PLAN.md`, `.planning/STATE.md`.

## Global Constraints (from owner revisions 1–12, binding on every task)

1. Slide carousel **replaces** the CP5 crossfade; crossfade-specific tests are retired with equivalent carousel coverage; CP5 card lift and `:focus-within` behavior are untouched.
2. Stable media viewport with `object-fit: contain`; no cropping; **zero between-slide layout shift** — the figure box gets a fixed `aspect-ratio` = the tallest slide's ratio within that carousel (my call; reversible at owner visual acceptance).
3. Autoplay exactly every 5s (`AUTOPLAY_GAP_MS = 5000`), and runs **only while ALL of**: not hovered, not focus-within, not dragging, motionAllowed (not reduced, not globally paused), document visible, carousel is onscreen, carousel holds the autoplay license, and the media has >1 screenshot. (This corrects the contradictory wording in §1 of the proposal.)
4. Homepage: **one** visible carousel may autoplay at a time — shared coordinator grants the license to the most visible card (largest `intersectionRatio`, ties broken by DOM document order). Detail pages: the single carousel autoplays independently under the same rule set.
5. Manual drag/swipe, keyboard arrows, accessible pagination dots, seamless looping, and **silent** autoplay are required behaviors (live region announces manual navigation only).
6. **Trackpad/wheel navigation is deferred out of this checkpoint** (owner marked it optional; not intercepting browser navigation gestures or vertical scrolling is mandatory). No wheel listeners ship in this checkpoint; the deferral is recorded in the execution record and can be revisited in a later owner-approved checkpoint.
7. No-JS / pre-runtime rendering: exactly one accessible first screenshot; **no hidden-slide DOM content**, no dead controls.
8. Carousel runtime is a **separate deferred chunk** from the motion runtime; manual navigation works when animations are disabled.
9. Tier 1 tactical cleanup only; **HARD GATE:** if any `npm run build` measurement exceeds `initial JS 95,000 B / largest deferred 30,000 B / CSS 8,000 B / total JS 200,000 B` gzip, STOP the run and report exact measurements. Never raise a budget.
10. No React Router removal, no deferred-manifest split.
11. Preserve all CP4, CP4.5(A–E), CP5, CP5-S content behavior (full regression before claim).
12. CP5-S remains **pending owner visual acceptance** until this refinement passes owner review.

**Project-level constraints (persisted):** no commits, pushes, or dependency installs — owner authorization only; exact pins preserved; every new behavior lands RED → GREEN; every E2E run follows a fresh `npm run build` (stale-dist hazard); E2E interactions gate on `[data-startup-indicator]` removal.

## Review Focus (spec-implied inputs not owned by a single test — each line is pinned by the named task)

| Risk | Expected behavior | Pinned by |
|---|---|---|
| Pointer press inside media, release outside the figure | Track snaps to the nearest slide, no stuck drag, click suppressed | Task 4 (pointer capture + pointercancel test) |
| Exactly one screenshot (real projects after a failed image leaves 1) | No dots, no focus stop, no autoplay, no clone — static figure identical to today | Task 2 + Task 5 |
| A carousel image fails to load mid-session | Single "Screenshots pending" honest path for that media; other carousels unaffected | Task 2 |
| Two homepage cards at equal visibility (e.g. split viewport) | License tie-break deterministic (DOM order), no license flapping between 50/50 observers | Task 5 |
| Autoplay tick lands exactly when a manual interaction begins | Interaction wins; countdown resets to full 5s afterwards; no double-advance | Task 5 |

---

## Interfaces (locked names — later tasks consume these exactly)

`src/components/motion/carouselPolicy.ts` exports:

```ts
export const AUTOPLAY_GAP_MS = 5000;
export const DRAG_INTENT_PX = 10;
export const DRAG_COMMIT_WIDTH_FRACTION = 0.25;
export const DRAG_COMMIT_VELOCITY_PX_S = 500;
export function nextIndex(index: number, count: number, delta: 1 | -1): number; // wraps, count > 0
export function swipeDecision(dxPx: number, boxWidth: number, velocityPxPerS: number): 1 | -1 | 0;
export function shouldSuppressClick(draggedPx: number): boolean; // true when |draggedPx| >= DRAG_INTENT_PX
```

`src/components/motion/carouselRuntime.ts` exports (chunks stay decoupled from React file imports):

```ts
import type { activateCarousel } from './carouselClient';
export interface CarouselHandle { goto(index: number, delta?: 1 | -1): void; teardown(): void; }
export interface CarouselRuntime { activateCarousel: typeof activateCarousel; }
/** Memoized dynamic import of ./carouselClient; mirrors loadMotionRuntime(). Rejects once to 'unavailable'. */
export function loadCarouselRuntime(): Promise<CarouselRuntime>;
```

`src/components/motion/carouselClient.ts` exports:

```ts
export function activateCarousel(root: HTMLElement, config: {
  count: number;
  isAutoplayAllowed: () => boolean;     // motion preferences gate (reduced/paused) — read live
  announceManual: (index: number, count: number, alt: string) => void;
}): CarouselHandle;
```

Runtime contract on the DOM (controller-owned; React never re-renders for these):
- Root: `data-carousel-active="n"` (0-based), `data-carousel-count="N"`, `data-carousel-fit="contain"`.
- Track: `data-carousel-track` gets `style.transform = translateX(-n×100%)` (or drag px); offscreen slides get `aria-hidden="true"` (and restore on becoming current); end clone (Task 6) has `data-carousel-clone="true"` and never holds focus or AT attention (`aria-hidden="true"` permanently).
- Dots: buttons with `data-carousel-dot="n"`, active dot gets `aria-current="true"`.
- Status: `p[data-carousel-status][aria-live="polite"]` — text written on manual navigation only.
- Teardown is a full removal contract: clear timer, unobserve, remove listeners, retry state — the controller may be attached/detached repeatedly (hash-navigation remounts).

---

### Task 1: Pure policy module — `carouselPolicy.ts`

**Files:**
- Create: `src/components/motion/carouselPolicy.ts`
- Test: `tests/motion/carouselPolicy.test.ts`

**Interfaces:** Produces everything in the locked Interfaces section above.

- [ ] **Step 1: Write the failing unit tests** — assertions to include: `nextIndex(0, 4, -1) === 3`; `nextIndex(3, 4, 1) === 0`; `nextIndex(1, 4, 1) === 2`; `nextIndex(0, 1, 1) === 0` (single slide never navigates); `swipeDecision(0.251 × width, width, 0) === 1`; `swipeDecision(0.249 × width, width, 0) === 0`; `swipeDecision(10, width, 600) === 1` (velocity alone commits); `swipeDecision(-10, width, -600) === -1`; `swipeDecision(0.25 × width exactly, width, 0) === 1` (exact fraction commits); `shouldSuppressClick(9) === false`; `shouldSuppressClick(10) === true`; `AUTOPLAY_GAP_MS === 5000`.
- [ ] **Step 2:** Run `npx vitest run tests/motion/carouselPolicy.test.ts` → expect FAIL (module missing).
- [ ] **Step 3: Implement the module** — threshold semantics: commit when `|dx| >= DRAG_COMMIT_WIDTH_FRACTION × boxWidth` or `|velocity| >= DRAG_COMMIT_VELOCITY_PX_S`; direction from `sign(dx)` (velocity sign never overrides a committed dx direction).
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5: Full unit suite** `npx vitest run` → all prior suites still green (131 + new).

### Task 2: Two-state `ProjectMedia` + deferred runtime chunk + Tier-1 trim (BUDGET GATE)

**Files:**
- Modify: `src/components/projects/ProjectMedia.tsx` (full rewrite)
- Create: `src/components/motion/carouselRuntime.ts`, `src/components/motion/carouselClient.ts` (controller skeleton this task: `activateCarousel` attaches, sets `data-carousel-active`/`data-carousel-count`, binds nothing interactive yet)
- Modify: `src/styles/global.css` (delete `@keyframes project-media-fade-out`, `.project-media-leaving`, both reduced/paused leaving rules, `.project-media-controls` button row; add `.project-media-track`, `.project-media-slide`, `.project-media-dots` shells)
- Test: `tests/e2e/projects.spec.ts` (re-derive the synthetic two-screenshot test), `tests/e2e/homepage.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/foundation.spec.ts` (no-JS assertions)

**Interfaces:** Consumes Task 1 nothing yet; provides the markup contract (`data-carousel-track`, `data-carousel-slide`, `data-carousel-figure`) that Tasks 3–6 bind to.

- [ ] **Step 1: Write the failing tests** (RED against current crossfade build):
  1. *Runtime two-state:* with synthetic 2-screenshot project: prerendered/first paint shows exactly **1** `img` (first screenshot src/alt/dims match the CP5-S assertions); after hydration + `loadCarouselRuntime()` resolves, the figure contains a `data-carousel-track` with **2** slides, root has `data-carousel-active="0"`/`data-carousel-count="2"`, and **no** `.project-media-leaving` element and **no** Previous/Next buttons ever exist.
  2. *Runtime failure fallback:* `page.route` → abort the carouselClient chunk request; the figure still shows exactly the first screenshot and **no** dead dot buttons (dots must not render when runtime is not ready).
  3. *Stable dimensions / no crop:* figure box `boundingBox()` identical before and after navigating slides (preliminary nav via the controller's `goto` from `window` test hook — see Step 3 note); each slide `img` has computed `object-fit: contain`; figure has computed `aspect-ratio` equal to the declared slide-dims box ratio.
  4. *No-JS:* existing no-JS assertions keep passing with the strengthened shape: exactly **1** img, first screenshot's alt/src, no element with `data-carousel-dot`, no `aria-live` elements.
  5. *Single-screenshot honesty:* every real slug currently ships 4 screenshots, so this case needs the synthetic fixture with a single-screenshot `project()` record: no track expansion beyond slide 1, no dots, no `data-carousel-count="1"`, no autoplay ever (covered again by Task 5's single-slide fix).
- [ ] **Step 2:** `npx playwright test tests/e2e/projects.spec.ts` (focused file) → expect the new tests FAIL, prior crossfade test still passing (pre-rewrite).
- [ ] **Step 3: Implement.** `ProjectMedia` states: `runtime: 'idle' | 'ready' | 'unavailable'`. Render: `idle`/`unavailable` → today's static figure wrapping ONLY the first available screenshot (keep the existing failed-image honest fallback exactly as-is). `ready` → figure > track (slides 1..N, no clone yet) + dots + status. `ready` is only set after the mount effect resolves `loadCarouselRuntime()` (memoized dynamic import — `carouselRuntime.ts` mirrors `motionRuntime.ts` shape). On import rejection → `unavailable`. Provide a dev-only `window` test hook `__carouselDebugGoto(index)` excluded from production builds (safe: dev E2E only). Deleting crossfade code, fade keyframes, and the button/counter row is part of this task (Tier-1 trim). Rerender count: React re-renders only when `runtime` flips (max once) or preferences change.
- [ ] **Step 4:** Focused file → PASS; then **full** Chromium E2E suite green except tests expected to still reference removed controls (re-derive those in this task, none weakened).
- [ ] **Step 5: BUDGET GATE — `npm run build`.** Read the budget line (prerender.mjs enforces it). Assert initial JS **≤ 95,000 B gzip** (stop and report exact numbers to the owner if exceeded — do not proceed, do not silently trim further); record all four numbers in notes for the execution record.
- [ ] Step 6: lint (`npx eslint . --max-warnings=0`), typecheck (`npx tsc --noEmit`), prettier — clean.

### Task 3: Dots, manual navigation, announcements

**Files:**
- Modify: `src/components/motion/carouselClient.ts`, `src/styles/global.css` (dot styles: ≥44×44px hit area via padded `button`s, visual dot ~10px, focus-visible ring matching existing buttons)
- Test: `tests/e2e/projects.spec.ts`, `tests/e2e/accessibility.spec.ts`

**Interfaces:** Consumes Task 1 `nextIndex`, Task 2 markup contract.

- [ ] **Step 1: Failing tests** — synthetic 2-slide fixture: (a) two dots render with `aria-label` "Go to slide 1: <alt>" pattern including 1-based human numbering; clicking dot 2 → track shifts, `data-carousel-active="1"`, dot 1 loses `aria-current`, dot 2 has `aria-current="true"`; (b) clicking the more-visible homepage card's dot does not navigate the card (URL unchanged); (c) figure focus (tabindex 0 only when count > 1) + `ArrowRight` → next slide; `ArrowLeft` twice wraps to slide N; `Home`/`End` jump; (d) status text becomes "Slide 2 of 2" only on manual nav; autoplay has no announcements once it exists (Task 5); (e) axe: zero new WCAG A/AA violations on home + detail with carousels hydrated.
- [ ] **Step 2:** focused projects.spec run → FAIL.
- [ ] **Step 3: Implement** — `activateCarousel` binds: dot `click`, root `keydown` (`ArrowRight/ArrowLeft/Home/End`), writes `data-carousel-active`, transform, `aria-current`, `aria-label` (slide `aria-label` includes position), and the manual-announce callback. Slides get `role="group"`, `aria-roledescription="slide"`, `aria-label "<n> of <total>"`. Offscreen slides `aria-hidden="true"` managed by the controller (attribute only).
- [ ] **Step 4:** focused run → PASS; full Chromium suite → PASS.
- [ ] **Step 5:** lint/typecheck/prettier clean.

### Task 4: Drag and swipe

**Files:**
- Modify: `src/components/motion/carouselClient.ts`, `src/styles/global.css` (`touch-action: pan-y` on the figure; no vertical interference)
- Test: `tests/e2e/projects.spec.ts` (desktop drag) + `tests/e2e/motion.spec.ts`-style coarse-pointer context for touch

**Interfaces:** Consumes Task 1 `swipeDecision`, `shouldSuppressClick`, `DRAG_INTENT_PX`; Task 3 `goto`.

- [ ] **Step 1: Failing tests** —
  (a) mouse-press on slide 2's image, drag left by 0.30 × width, release → advance to next slide; drag 0.10 × width and release → snap back to the same slide; (b) drag right on slide 1 (no neighbor) → clamps, stays on slide 1, no wrap in Task 6's sense; (c) synthetic click path (`pointerdown` + `pointerup` with ≤ `DRAG_INTENT_PX` movement) does not change slides and does not suppress the click event; (d) move > intent → the subsequent `click` on the card's link never fires and location is unchanged (homepage card not left); (e) pointer capture: press inside, move/release outside the figure → behavior identical to (a); (f) `pointercancel` mid-drag → snaps back, no slide change; (g) native image `dragstart` is prevented (no ghost image drag, no broken gesture); touch context (Pixel 5 emulation): horizontal swipe commits, vertical swipe scrolls the page (`scrollY` increases) with **no** slide change and no scroll lock; rapid flick (short duration, high velocity) commits via the velocity branch.
- [ ] **Step 2:** focused runs → FAIL.
- [ ] **Step 3: Implement** — Pointer Events with `setPointerCapture` on the figure/track; transform updates 1:1 during drag; on release compute `swipeDecision(dx, width, velocityEMA)` → `goto(index ± 1)` or snap-back transition; suppress the post-drag click via `shouldSuppressClick` (capture-phase click listener, one per root, added during drag only); stop the drag when `pointercancel`/lost capture; drag-start sets the controller's dragging gate (Task 5 consumes).
- [ ] **Step 4:** focused runs → PASS; full suite → PASS.
- [ ] **Step 5:** lint/typecheck/prettier clean.

### Task 5: Autoplay lifecycle + homepage license coordinator

**Files:**
- Modify: `src/components/motion/carouselClient.ts` (timer + gates + module-level shared `IntersectionObserver` + license registry)
- Test: `tests/motion/carouselPolicy.test.ts` extend (gates are pure-predicate tested where feasible)
- Test: `tests/e2e/projects.spec.ts` (autoplay on detail page), `homepage.spec.ts` or `constellation.spec.ts`-style scroll group (homepage coordinator, offscreen), hidden-tab matrix
- New file: `tests/e2e/carousel-autoplay.spec.ts` (all groups, matching how motion needs both a dev server (timers) and real content)

**Interfaces:** Consumes `AUTOPLAY_GAP_MS`, `isAutoplayAllowed` gate, Task 3 manual `goto` (reset), Task 4 dragging gate.

- [ ] **Step 1: Failing tests** —
  1. *Timing:* two-screenshot page, no interaction → exactly one advance within 5000–6000ms; a manual dot click resets so the next auto-advance is 5000–6000ms after the click (not sooner); three consecutive auto-advances each spaced within the window.
  2. *Wrap in autoplay:* page with real saklolo161 (4 screenshots): after ~4 advance cycles the cycle 4→1 occurs **without** a reverse multi-slide transit (cover wrap math; seamless-clone assertion refined in Task 6).
  3. *Pause gates:* hover → no advance for >6s across the boundary; focus-within (dot focus) → same; both released → next advance resumes between 5000–6000ms later.
  4. *Reduced motion / global pause:* reduced context → autoplay disabled while drag/dots/keys still work; setting `denver.dev:motion:paused` true (storage) mid-run halts autoplay; resume flips it back on after a full fresh countdown.
  5. *Hidden tab:* `page.evaluate(document.hidden via CDP visibility)` automation: hide for 7s → at most zero-advance during hidden; on visible resume, next advance happens after a **full fresh** 5000ms (no catch-up burst).
  6. *Offscreen detail:* scroll the detail-page carousel out of viewport → no advance (checking `data-carousel-active` unchanged over 7s); scroll back → advance happens after a fresh 5000ms.
  7. *Homepage single license:* 1920×1080 wide viewport showing ≥2 cards: exactly one card (the most visible) advances via autoplay; its neighbors' `data-carousel-active` unchanged. Scroll to a different card → license flips deterministically to it. 50/50 equal-visibility split (two cards) → the earlier-DOM card holds the license, and repeated observer callbacks never cause a flip-flop (assert a stable license map across 3 consecutive observer cycles).
  8. *Cleanup:* standard teardown/remount cycle does not double-bind (no duplicate timer after navigation back to same-page).
- [ ] **Step 2:** new spec run → FAIL (autoplay does not exist yet).
- [ ] **Step 3: Implement** — one `setTimeout` chain per *licensed, visible, allowed* carousel; starts after hydration; `visibilitychange` per instance; single module-level `IntersectionObserver` (thresholds `[0, 0.25, 0.5, 0.75, 1]`); license = max `intersectionRatio` (tie: `compareDocumentPosition` order); license lost → timer torn down; license gain → **fresh** `AUTOPLAY_GAP_MS` countdown; autoplay advance = `nextIndex(index, count, 1)` write only (attributes/transform/live-region untouched).
- [ ] **Step 4:** focused runs → PASS; full Chromium suite → PASS (with the ambient checkpoint groups verified unaffected CP4.5 behavior: ascent/meteor).
- [ ] **Step 5:** lint/typecheck/prettier clean.

### Task 6: Seamless loop wrap (end clone)

**Files:**
- Modify: `src/components/motion/carouselClient.ts`, `ProjectMedia.tsx` (`ready` render includes one end clone of slide 1), `global.css`
- Test: `tests/e2e/projects.spec.ts` (wrap sub-case), `carousel-autoplay.spec.ts` (Task 5 wrap assertion completed)

**Interfaces:** Consumes `nextIndex` wrap; Task 3 dots/keys; Task 4 drag release; Task 5 autoplay.

- [ ] **Step 1: Failing tests** — (a) track contains `count + 1` slide imgs; the extra one has `data-carousel-clone="true"` and is permanently `aria-hidden="true"`; (b) autoplay wrap N→1: no reverse transit; `data-carousel-active` reaches `count` (clone) then silently repositions to `0` without a visible transition (`transition: none` on the silent reposition step; assert via `getAnimations()` empty at the clone landing frame); (c) `End`/`Home` jump uses a covered reposition not a long transit; (d) dot click when already on slide N's clone does not double-advance; (e) keyboard focus never lands on the clone; (f) between-slide box dimensions remain stable while the clone is in play (regression to Task 2's stable-dims check);
- [ ] **Step 2:** focused → FAIL.
- [ ] **Step 3: Implement** — clone slide appended after slide N; `goto(count)` → transition to clone, then immediately continue to index 0: silent reposition `transition: none` + transform=0 then force reflow; only the current slide's `aria-hidden`/`aria-current` set; dots still map 1..N (no dot for the clone).
- [ ] **Step 4:** focused + full suite → PASS.
- [ ] **Step 5:** lint/typecheck/prettier clean; **`npm run build` budget recheck** (report numbers; gate revision 9 hard stop).

### Task 7: Reduced motion & global pause completion + policy CSS guards

**Files:**
- Modify: `global.css` (reduced/paused: slide transitions removed, instant swap; the Carousel is consistent with CP5 guards — no `transform: none` kill of manual navigation)
- Test: `tests/e2e/carousel-autoplay.spec.ts` (reduced/paused matrix out-scope of Task 5 step 1, no partial assertion)

**Interfaces:** Consumes `isAutoplayAllowed` gate (reduced/paused), move/transition CSS class hooks.

- [ ] **Step 1: Failing tests** — reduced/paused contexts: slide-track transition property is removed (`transition: none` / duration 0 computed) under `prefers-reduced-motion: reduce` and `html[data-motion-policy='paused']`; manual navigation still fully functions in both contexts (dots click, keyboard arrows, committed drag all change slides with instant movement); autoplay trails disabled (asserted in Task 5) and no CSS `@keyframes` autoplay artifacts exist; `touch-action: pan-y` unchanged.
- [ ] **Step 2:** focused → FAIL until CSS guards land.
- [ ] **Step 3: Implementation** (CSS only) + manually verify the controller never blocks manual nav regardless of policy (implemented in Tasks 3–5 already; this task asserts it).
- [ ] **Step 4:** focused + full suite → PASS.
- [ ] **Step 5:** lint/typecheck clean.

### Task 8: Measurement, full regression, execution record

**Files:** none (verification + record). No commit.

- [ ] **Step 1: `npm run build`** — record all four numbers (initial ≤95,000 hard gate; deferred largest ≤30,000; CSS ≤8,000; total JS ≤200,000). **Any violation → STOP, report exact numbers (revision 9).**
- [ ] **Step 2: full unit suite** `npx vitest run` → all suites green; the retired crossfade tests are replaced by their carousel equivalents (covered in Tasks 2–6).
- [ ] **Step 3: full Chromium E2E suite** (fresh build, 8 workers) → all green; specifically confirm retained groups: ambient (13, ascent 50px/s + meteors), transitions (6, hero entrance), card-lift/focus-within group (unchanged), per-slug content order, 375px responsive/no-scroll, no-JS cards, axe zero WCAG A/AA.
- [ ] **Step 4: headed dev verification** — headful Chromium captures at 1280×720 / 768 / 375: slide-region geometry, mid-drag frame, wrap 4→1 frame, reduced-motion manual nav (transition removed, navigation functional); detail-page carousel; artifacts in `.tmp-cp5s1/`; ascent unchanged (50px/s measured over 1s).
- [ ] **Step 5: documentation update** — append a CP5-S.1 execution record to `.planning/phases/01-foundation-homepage/01-04-EXECUTION.md` + STATE.md update: scope, owner's 12 revisions, measurements, CP5-S flagged "visual acceptance pending CP5-S.1 carousel". No phase/milestone/milestone-advance work, no CP6 mention in outcomes. **No commit**; stop for owner visual acceptance.
- [ ] **Step 6:** report back to owner with the measurable outcome table for visual review.

## Decisions recorded (reversible, flagged to owner at visual acceptance)

- Figure `aspect-ratio` = tallest slide's ratio **per carousel** (my call; happy to switch to global 16:9 or first-slide ratio at acceptance review).
- Trackpad/wheel navigation **deferred out of CP5-S.1** (owner called it optional; the risk of interfering with navigation gestures is accepted as not worth carrying without an approved design; a follow-up checkpoint can add it).
- Silent autoplay (W3C practice), manual-announce live region only.
- Dot hit area via padded buttons (44px) so target-size is a11y-safe without oversized visual dots.
- `window.__carouselDebugGoto` dev-only hook for dimension tests; must be stripped from production bundles (checked in Task 2 build step).

## Execution Handoff

This plan is saved to `C:\Users\hp\.opencode\plan\cp5-s1-plan.md` (plan mode location; after approval + agent switch it should be mirrored into `.planning/phases/01-foundation-homepage/01-04-SUP-CP5-S.1-PLAN.md` or appended to the 01-04 plan per GSD conventions, since planning-document commits remain owner-controlled).

**Recommended execution: inline (superpowers:executing-plans) rather than per-task subagents.** Tasks 2–6 heavily share the controller's internal event/state design; a fresh reviewer per task would repeatedly rediscover one module, and any interface drift between subagents would surface as late failures in a large interactive E2E suite. The 131-test regression base plus the structural RED→GREEN discipline makes a single coherent implementation context the safer, faster path. One inline review can follow at the end.
