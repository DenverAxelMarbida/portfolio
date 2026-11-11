# 01-04 Execution record — checkpoint roadmap

Authoritative requirements and acceptance criteria remain in [01-04-PLAN.md](01-04-PLAN.md); this record tracks checkpoint-level progress and evidence and does not modify the plan.

## Owner-approved checkpoint roadmap (2026-11-10)

| Checkpoint | Scope | Status |
|---|---|---|
| CP1-A | Motion dependencies and performance budgets (`motion@14.10.1`, exact pin, bundle budgets) | Complete — owner-authorized 2026-11-07, evidence in [01-04-DEPENDENCY-VERIFICATION.json](01-04-DEPENDENCY-VERIFICATION.json) and [01-PACKAGE-AUDIT.md](01-PACKAGE-AUDIT.md) |
| CP1-B | Shared motion infrastructure (preferences, pause control, startup indicator, deferred runtime) | Complete — verified by the preferences/startup/runtime E2E groups |
| CP2 | Animated constellations and scroll optimization | Complete — verified by the 11-test ambient E2E group |
| CP3 | Hanging ID portrait animation | **Complete pending owner review** — final correction recorded below |
| CP4 | Hero entrance animations | Complete — owner-approved and verified (109 unit tests; 114 Chromium E2E tests) |
| CP4.5 | Infinite Ascent and shooting stars | **Complete — owner visually accepted 2026-11-10**, including refinements B–E (visual reconciliation, cinematic meteors + glow, Capricornus figure, ID-physics retune) |
| CP5 | Project card interactions | **Complete pending owner visual acceptance** — implementation record below |
| CP6 | Scroll-triggered reveals | Upcoming |

Boundaries still in force: no commit, push, or milestone advance without explicit owner authorization. Hero entrances and the initial transitions E2E group are implemented under CP4; remaining Task 3 work (Reveal, card lift, media crossfade, anchor scrolling, and associated regression coverage) is deferred to the upcoming checkpoints.

## CP3 — hanging portrait: final correction (2026-11-10)

### Problem

`RELEASE_IDLE_MS` had been widened from 140ms to 500ms during CP3 so a drag-velocity window would never cancel a deliberate fling. The linear window `decay = max(0, 1 - idle/500)` applied to the smoothed pointer velocity at release means a **stationary hold followed by release retains up to 100% of a stale gesture's speed** for half a second. Demonstrated live: a mouse fling followed by a 300ms motionless hold (expiry factor 0.4) launched the real card 157.44px when the release pose was 100px — a 55px launch from an at-rest pointer.

Root cause: the decay constant contradicted the component's own sampling policy. `onPointerMove` only refreshes the EMA when the gap since the previous sample is under `RELEASE_SAMPLE_MS = 120ms`; beyond that window the smoothed value no longer describes current pointer motion, so giving it any release weight is unwarranted.

### Correction

Momentum at release is now governed by a pure, unit-tested policy instead of a time-window guess:

- `src/components/motion/profileCardMotion.ts`
  - New export `LANYARD_RELEASE_SAMPLE_MS = 120` — the freshness window release momentum keeps.
  - New export `LanyardVelocity` (`{ vx, vy }` in px/s).
  - New pure function `lanyardReleaseVelocity(velocity, holdMs)`: fresh samples (hold ≤ window) return the measured velocity in full; non-finite velocity or staleness beyond the window returns zero momentum.
- `src/components/hero/ProfileCard.tsx`
  - Removed the local `RELEASE_SAMPLE_MS` and `RELEASE_IDLE_MS` constants.
  - `measuredReleaseVelocity()` now delegates the staleness decision to `lanyardReleaseVelocity()`; the 60px/s `MIN_FLING_SPEED` filter and the `lanyardReleaseState()` speed clamp are unchanged.
  - `onPointerMove` uses `LANYARD_RELEASE_SAMPLE_MS` so sampling and release share one freshness definition.
- Regression tests (red → green, none weakened):
  - `tests/motion/profileCardMotion.test.ts` — three new unit tests: moving release keeps full measured velocity; stationary hold (window+1, 500, 60_000) leaves no momentum; invalid velocity or unknown staleness never launches.
  - `tests/e2e/motion.spec.ts` — new portrait test "a stationary hold does not launch the card at release": builds real gesture speed, holds 300ms, releases, then asserts no launch past the release pose (+2px bound) and a clean settle. It failed against the pre-correction code (157.44px launch observed) and passes against the correction.

### CP3 verification results (2026-11-10)

| Check | Result |
|---|---|
| Unit tests (`npm run test`) | 105/105 passed (9 files) |
| Portrait E2E group (12 tests, 8 parallel workers) | 12/12 passed |
| Full Chromium E2E suite (fullyParallel) | **108/108 passed** |
| Lint (`eslint . --max-warnings=0`) | Clean |
| Typecheck (`tsc --noEmit`) | Clean |
| Build + bundle budget | initial JS 92.5/95 KB gzip, CSS 4.9/8 KB, deferred chunk 25.3/30 KB, total JS 117.8/200 KB |

Preserved behaviors confirmed by the suite: drop-once entrance, ±48° sector bounds, shell/document strap anchoring, scroll/resize tracking, pause and resume semantics, hidden-tab and offscreen suspension, coarse-pointer touch drags with scrolling survival, pointer cancellation, reduced-motion static lanyard, and the unchanged image bytes and visual presentation. The real card launch magnitude from the stale window exceeding 50px versus the new ≤2px hold drift frames the physical realism improvement.

One operational note: an intermediate portrait run executed against `dist/` built before the correction (the source fix predates the rebuild) and produced 7 spurious timeouts; it was superseded by fresh-build runs. Verification above is against the corrected build only.

## CP4 — hero entrance animations (2026-11-10)

Scope per owner authorization: hero entrance only (headline, introduction, actions; the eyebrow `profile.title` stays static per the UI-SPEC stagger set "headline/intro/actions"). Reveal export, card lift, media crossfade and anchor scrolling remain CP4.5–CP6 and are untouched.

### Implementation record

| Change | Detail |
|---|---|
| `src/components/motion/heroEntrancePolicy.ts` (new) | Pure timing contract, single source of truth: `HERO_ENTRANCE_DISPLACEMENT_PX = 18`, `HERO_ENTRANCE_DURATION_MS = 500`, `HERO_ENTRANCE_DELAY_MS = 100`, plus `heroEntranceSchedule(count)` returning count-ordered delays `[0, 100, 200]`. Originally implemented with 10px / 340ms / 60ms, subsequently superseded by owner-approved visual tuning. Named `heroEntrancePolicy.ts` because Windows's case-insensitive filesystem collides `heroEntrance.ts` with `HeroEntrance.tsx`. Unit-tested in `tests/motion/heroEntrance.test.ts` (4 tests). |
| `src/components/motion/HeroEntrance.tsx` (new) | Controller component wrapping the hero copy. Follows the ProfileCard precedent: no React state, imperative `dataset` writes only. Contract: `data-hero-entrance` ∈ `pending` (server markup) / `playing` / `played` / `settled` / `skipped`; `data-hero-entrance-runs` ∈ 0/1. Module-scoped `heroEntranceEntered` makes the entrance structurally once-per-document (mirrors the portrait entrance clock); module-scoped `heroEntranceAnimated` distinguishes documents that actually animated from those that skipped, so a later Resume can never rewrite a decisive skip into `played`. Registers one `MotionAnimationControl` while playing → mid-flight pause/reduced flips and hidden tabs settle instantly to the readable final state; completion fires on the last item's `animationend` (`data-hero-entrance-item="2"`) so earlier items finish their full rises. |
| `src/pages/HomePage.tsx` | Hero copy wrapped in `<HeroEntrance>`; items tagged `data-hero-entrance-item="0\|1\|2"` (h1, `.hero-intro`, `.hero-actions`). Eyebrow stays outside the item set — instantly readable. |
| `src/styles/global.css` | One-shot `@keyframes hero-entrance-rise` (opacity 0→1, translateY(18px)→none), `fill-mode: both`, duration 500ms, delays 0/100/200ms applied only when `[data-hero-entrance='playing']`, plus `prefers-reduced-motion` and `html[data-motion-policy='paused']` guards. Originally implemented with 10px / 340ms / 60ms, subsequently superseded by owner-approved visual tuning. No persistent loops; timings bound to the policy module by comment and test. |
| `tests/e2e/motion.spec.ts` | New `transitions` group (6 tests) plus sampler helpers `trackHeroEntranceAnimations` (records every observed `hero-entrance*` CSSAnimation with computed timings), `__resetHeroObservations` (phase reset hook), `readHeroItemStates`, `expectHeroItemsAtRest`. Tests updated to verify the final owner-approved 18px / 500ms / 100ms settings. |

### Rulings carried into the record

1. **First post-hydration entrance is not a "replay".** The plan's never-hide rule guards replays/failure paths; the once-per-document module flag makes replay structurally impossible (same accepted model as ProfileCard's drop-in).
2. **Navigation model is native anchors.** This app's top navigation uses plain `<a href>` which React Router does not intercept — cross-page links are full document loads where "no replay" means once-per-document plus same-document remount idempotence. Chromium probe evidence: brand link `/` from `/#projects` performs a full reload (window marker cleared); fragment-add navigation (`/` → `/#projects`) stays in the same document (marker survives). The no-replay regression therefore covers the real same-document flow: hash navigation (`/#projects`, `/#approach`).
3. **Skip is decisive.** A hydrated reduced or paused preference writes `skipped` at the one entrance opportunity; that decision survives preference flips within the document. A fresh document ≠ a replay (ruling 1).
4. **Pre/post-hydration box comparison was replaced with a post-entrance stability check.** Async webfont loading makes pre-hydration bounding boxes nondeterministic (~4–5px drift observed); two identical post-entrance reads deterministically prove zero entrance-related layout shift.

### Measurement

| Property | Final approved | Original plan bounds |
|---|---|---|
| Displacement | 18px translateY | 8–12px — superseded by owner approval |
| Duration | 500ms per item | 300–450ms — superseded by owner approval |
| Stagger | 100ms steps; items at 0/100/200ms | 50–70ms — superseded by owner approval |
| Final state | opacity 1, transform none, identical to static layout | Immediate readability preserved |

### CP4 verification results (2026-11-10)

| Check | Result |
|---|---|
| Unit tests (`npm run test`) | **109/109 passed** (10 files; includes 4 new heroEntrancePolicy tests and every retained MOTION suite) |
| New E2E `transitions` hero-entrance group (Chromium) | **6/6 passed** — staggered timed entrance to readable rest, reduced-motion skip, paused-storage skip + resume persistence, mid-flight pause settle, hash-navigation no-replay, no-JavaScript readability |
| RED discipline confirmed | Policy unit tests failed before `heroEntrancePolicy.ts` existed (module-missing); all 6 transitions tests failed against the pre-CP4 build on the missing `data-hero-entrance` contract |
| Full Chromium E2E suite | **114/114 passed** |
| Lint (`eslint . --max-warnings=0`) | Clean |
| Typecheck (`tsc --noEmit`) | Clean |
| Build + bundle budget | initial JS 92.9/95 KB gzip (+0.4 KB for controller), CSS 5.1/8 KB, deferred chunk 25.3/30 KB, total JS 118.2/200 KB |

### Owner-approved visual tuning (2026-11-10)

Following browser review, the owner found the original hero entrance motion too subtle and approved stronger, more noticeable movement while retaining the existing ease-out animation.

| Property | Original | Final approved |
|---|---|---|
| Upward displacement | 10px | **18px** |
| Duration per item | 340ms | **500ms** |
| Stagger interval | 60ms | **100ms** |
| Element delays | 0/60/120ms | **0/100/200ms** |
| Easing | ease-out | Unchanged |

These owner-approved values supersede the original CP4 timing bounds in `01-04-PLAN.md` **for hero entrances only**. The original values remain in the implementation history for traceability.

**Files synchronized:**
- `src/components/motion/heroEntrancePolicy.ts`
- `src/styles/global.css`
- `tests/motion/heroEntrance.test.ts`
- `tests/e2e/motion.spec.ts`

**Post-tuning verification:**
- Unit tests: **109/109 passed**
- Chromium transition tests: **6/6 passed**
- Full Chromium E2E suite: **114/114 passed** (45.6s, 8 workers, 2026-11-10).
- Reduced-motion, pause, no-JavaScript, and no-replay behavior: verified in transition tests

The original full-suite result of 114/114 and bundle measurements remain historical pre-tuning evidence, not claims of post-tuning verification.

**Owner ruling:** Preserve the approved 18px / 500ms / 100ms configuration unless the owner explicitly authorizes further changes.

### Debugging trail (for the record, findings kept)

- The transitions E2E animation sampler originally accumulated the legitimate initial entrance across page phases; fixed with an explicit `__resetHeroObservations` reset hook used by the navigation test before its return-leg assertions.
- Two test-premise bugs were corrected after root-cause debugging rather than weakened: (a) the original "client navigation never replays" test drove a brand-link click that is in fact a full document reload (probe above); rewritten as hash-navigation; (b) the original layout-shift assertion compared pre-hydration vs post-entrance boxes, conflating webfont reflow with the entrance; rewritten as post-entrance stability.
- A real controller race was found and fixed during debugging: on remount after a Resume, the controller previously rewrote `played` over the decisive `skipped` state; the `pending`-only overwrite and the `heroEntranceAnimated` flag now preserve the skip. (An intermediate test run executed against `dist/` built before the fix — same stale-build hazard as CP3; final verification is against a fresh build.)
- A temporary debug spec (`tests/e2e/zz-cp4-debug.spec.ts`) used MutationObserver attribute traces to root-cause the above; it was deleted before final verification (full suite output above contains no trace of it).

## PageStarfieldBackground retention (owner-approved 2026-11-10)

`PageStarfieldBackground.tsx` was not listed in 01-04-PLAN `files_modified`, being an additional page-level ambient layer beside the two hero effects. The owner has approved its retention subject to the existing accessibility and performance requirements. Retention record:

- `aria-hidden` decorative layer with `pointer-events: none`, fixed inset, z-index 0 beneath `.site-main`, and `overflow: hidden`; zero keyboard or AT surface, no content occlusion path (`data-page-starfield-mode` keeps SVG/static fallback before hydration and on failure).
- Consumes the shared motion policy: pauses through `registerMotionAnimationControl`, honors reduced preference and paused storage by static fallback, freezes on document visibility loss, and throttles idle cadence.
- Covered by the ambient E2E group (fallback activation, dual-layer independence, scroll-coupled repaint cadence, idle throttle, pause/resume, reduced motion, hidden tab, context failure).

## Full-suite failures previously reported at CP2 verification

The two reported failures (constellation scrolling repaint cadence; project media honest fallback) **did not reproduce** against the current uncommitted build: isolated targeted runs and the full 108-test parallel suite both pass. Both assertions remain at their original strength. The stale `test-results` trace for the media case indicates a lazy-image `onError` race under full-suite load, not a logic defect; if either recurs, treat it as a scheduling/load issue rather than weakening assertions.

## CP4.5 — Infinite Ascent and Shooting Stars (2026-11-10) — superseded by CP4.5-B below

**Supersession gate:** Source (`heroEntrancePolicy.ts`, `global.css`) and this ledger already carried the owner-approved 18px / 500ms / 100ms before any CP4.5 change; baseline `heroEntrance` unit tests green. No conflict found; CP4 untouched.

**Scope delivered:** pure `src/components/motion/starfieldSky.ts` (ascent + meteor scheduling), wired into `PageStarfieldBackground`'s existing loop. No new rAF loops, observers, dependencies, or `ConstellationBackground` changes.

### Implementation decisions

| Item | Value |
|---|---|
| Ascent speed | `ASCENT_SPEED_PX_PER_MS = 0.006` (~6 px/s), elapsed-time-based, wraps in `[0, pageHeight)` via `wrapPageY` |
| Meteor gap | `METEOR_MIN_GAP_MS = 7000` … `METEOR_MAX_GAP_MS = 13000` |
| Meteor lifetime | 450–800 ms (`METEOR_MAX_LIFETIME_MS = 800`), never overlapping: next spawn scheduled `now + lifetime + gap`, strict refusal while `now < spawnAt + lifetime` |
| Meteor aesthetics | Trail 110–190 px, angle 18–35° from horizontal, mirrored left/right spawn, `METEOR_MAX_ALPHA = 0.55`, 30% edge taper ramp (20% looked abrupt at spawn), single grayscale stroke + 1.2 px head dot — no flashes |
| Progress window | `meteorProgress` is inclusive of the final frame (`since > lifetime` → null), drawing one final dark frame before expiry instead of vanishing early |
| Alpha ramp | 30% ramp (`edge = min(progress, 1 - progress) / 0.3`) |

**Pause/hidden semantics:** meteors run on the loop's accumulated `elapsed` (same reservation as twinkle/drift): a frozen loop sends delta 0 on the resumed frame, so neither ascent nor the meteor clock accrues animation time and no catch-up jump occurs. Pause/visibility/offscreen/reduced-motion policies are untouched (pre-existing `canRun()`/control registration).

**E2E telemetry** (change-detected attribute writes only, no per-frame DOM churn) on `.page-starfield`:
- `data-page-starfield-ascent` — rounded ascent offset
- `data-page-starfield-meteors` — cumulative spawned-meteor count
- `data-page-starfield-meteor` — `'1'` while a meteor is in its flight window, `'0'` otherwise

### Files

| File | Change |
|---|---|
| `src/components/motion/starfieldSky.ts` | **new** — pure/deterministic module: `advanceAscent`, `wrapPageY`, `meteorGapMs`, `meteorLifetimeMs`, `createMeteorClock`, `updateMeteorClock`, `meteorProgress`, `meteorAlpha`, `meteorGeometry` |
| `src/components/motion/PageStarfieldBackground.tsx` | integrates `starfieldSky` into the existing loop: `ascentY` advance + `stepSky()`/meteor draw in the throttled frame path, telemetry via `paintSkyTelemetry(canvasHost)`; `canvasHost` is the null-checked narrowing held at effect setup (hoisted function declarations cannot see call-site narrowing) |
| `tests/motion/starfieldSky.test.ts` | **new** — 13 focused unit tests: time-positivity, frame-independence, no negative/zero-delta accrual, bounded wraparound, gap/lifetime windows, clock initialState, non-overlap refusal, progress inclusivity, alpha taper/ceiling, geometry bounds + mirrored heading |
| `tests/e2e/constellation.spec.ts` | **new tests** (existing assertions untouched): (a) ascent moves 1–30 px over 700 ms of real time at ~6 px/s, attr freezes while hidden and does not jump ≤4 px on resume; (b) meteors appear within 18 s of first gap, sampled lifetimes ≤1 s and non-interleaved windows |
| `tests/e2e/accessibility.spec.ts` | **harness stabilization, no assertion weakened** — see below |

### Accessibility test stabilization (found during CP4.5 full-suite verification)

The file-parallel accessibility run failed `homepage has no WCAG A or AA violations` with a `.button-primary` color-contrast violation (fg `#434343` on bg `#7b7b7b`): those are exactly the page background bleeding through `hero-entrance-rise` at ~48% element opacity — i.e. axe sampled inside the 500 ms + 200 ms stagger entrance window. The behavior is CP4's entrance, exposed by scheduling: single-test runs passed 7/7 while `fullyParallel` file runs failed reproduciably (4/4) in this session, and CP4's post-tuning 114/114 run had passed hours earlier on the same entrance timings. Following the ledger precedent of root-cause fixes over weakened assertions (CP4 debugging trail), `expectNoWcagViolations` now polls for the entrance terminal state (`played`/`settled`/`skipped`, or absent on routes without an entrance) before axe analyzes. The assertion itself (`violations === []`) is unchanged; it now measures the settled page. Post-fix: 8/8 × 3 consecutive file-parallel runs.

### Verification results (all measured 2026-11-10, fresh `npm run build`)

| Check | Result |
|---|---|
| `tests/motion/starfieldSky.test.ts` | 13/13 (RED → implementation → GREEN) |
| New E2E pre-wiring (stale dist) | 2 failed — confirmed RED before integration |
| New E2E (fresh dist, focused) | 2/2 passed |
| Ambient group | 13/13 passed |
| `npm run test` (unit, all) | 122/122 passed (11 files) |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run build` + bundle budget | **initial JS 93.7/95.0 KB gzip; CSS 5.1/8.0 KB; deferred largest 25.3/30.0 KB; total JS 119.0/200.0 KB — all within budget** |
| Full Chromium E2E | run 1: 115/116 + the known pre-existing ambient 'scrolling repaints cadence' parallel-load flake (passed isolated immediately after, matching its ledger record); run 2: **116/116 passed (46.5 s)** |

**Constraints honored:** CP4.5 only; no CP5/CP6, no new dependencies, no commit, no push. Both new E2E tests assert real behavior (movement, freeze, bounded lifetimes, non-overlap) and were verified RED against a pre-wiring dist before GREEN.

---

## CP4.5-B — Visual reconciliation with the reference video (2026-11-10)

CP4.5 passed every automated gate but failed owner **visual** acceptance: under `npm run dev` the effects were imperceptible. The owner supplied `reference video.mp4` (590×368 @30fps, 57s TikTok recording of another portfolio; content ≈4.0–53.0s) as the authoritative visual target for the background only. Frame-level ffmpeg/numpy measurement of that video is recorded below as the diagnosis source.

### Reference measurements (background only)

| Property | Measured in reference |
|---|---|
| Star drift | Effectively static: 96 speck pairs matched 1s apart and 55 pairs 4.5s apart in the page-static hero window (t=0–10s) give dy median 0, mean ≈0.5 CSS px/s |
| Star look/density | Small 1–3px dots plus occasional larger soft-glow dots; dozens per viewport; quick twinkle (~1–2.5s periods) |
| Meteors | Mean gap ≈5s (hero cluster 2–4s), lifetime ~0.9–1.4s, streaks ~260–670 CSS px (0.3–0.5 viewport height), angle 20–35°, consistently descending lower-right (`\`), near-white head at the lower end fading to the tail |
| Scroll | Page-anchored stars, visible in every section |

### Diagnosis of the imperceptibility (parameter-driven; identical in dev and prod)

1. 54 desktop stars spread over the whole `pageHeight` → only ~5–10 visible stars per hero viewport (dominant failure).
2. Ascent 6px/s = 0.2px/frame at the 30fps idle cap — below the point-stimulus motion threshold.
3. Meteors: 110–190px trails, ≤800ms lives, flat 1px stroke at alpha ≤0.55 vs the reference's long comet streaks.
4. Twinkle periods 16–35s — far too slow to register.

### CP4.5-B approved settings (owner, 2026-11-10) and implementation

| Item | Old (CP4.5) | CP4.5-B |
|---|---|---|
| `ASCENT_SPEED_PX_PER_MS` | 0.006 | **0.03** (30px/s); ⚠️ deliberate divergence — the reference video is near-static, the owner explicitly wants a clearly perceptible continuous ascent |
| Meteor gap / lifetime | 7–13s / 450–800ms | **3–7s / 900–1300ms**, max one active |
| Head brightness | flat alpha 0.55 | **`METEOR_HEAD_ALPHA = 0.95`**, tail fades via gradient |
| Trail | 110–190px fixed | **`meteorTrailLengthPx(viewportHeight, roll)`** = clamp(h×(0.32+0.18×roll), 240, 560) |
| Angle / direction | 18–35°, mirrored 50/50 | 18–38°, **~85% descending lower-right** (`METEOR_MIRROR_ROLL_THRESHOLD = 0.15` exact threshold avoids the `1−0.85` float artifact) |
| Envelope / head travel | 30% edge ramp | **`meteorEnvelope`** (rise 0.1 → full burn → pow-1.2 burn-off, ends dark) and **`meteorHeadTravel`** (`clamp01(progress/0.55)`) so the head leads and the streak grows |
| Star density | fixed 54 desktop / 26 mobile per page | **page-area scaled**: `count = clamp(pageArea/16000, 60, 520)` desktop, `clamp(pageArea/9000, 40, 180)` mobile (~80–90 per 945px viewport) |
| Star tiers | single | ~15% **luster tier** (radius 1.2–2.2px + soft halo, brighter `#c9d1dc` core); base 0.7–1.7px |
| Twinkle | 0.00016–0.0004 rad/ms (16–35s) | **0.0025–0.008 rad/ms (≈1–2.5s periods)** |
| Star spawn region | width 15–85%, height 8–42% | width **5–95%**, height **4–66%** |

Meteor draw: one shared path stroked 3× (widths 5/2.5/1 at globalAlpha 0.18/0.45/1) with a linear gradient (0 → alpha 0, 0.55 → 0.35×envelope, 1 → 0.92×envelope) plus a 1.9px near-white head dot — no `shadowBlur`. Single rAF loop, 30/20fps caps, DPR ≤1.5, culling, pause/visibility/reduced-motion/offscreen policies, telemetry attribute names unchanged (values only), `ConstellationBackground`/CP3/CP4 untouched.

### Files changed

| File | Change |
|---|---|
| `src/components/motion/starfieldSky.ts` | rewritten to the approved constants + `meteorEnvelope`/`meteorHeadAlpha`/`meteorHeadTravel`/`meteorTrailLengthPx`/`METEOR_HEAD_ALPHA`/`METEOR_RIGHT_DESCENT_SHARE`; `meteorAlpha`, `METEOR_MAX_ALPHA`, `lengthRoll` removed |
| `src/components/motion/PageStarfieldBackground.tsx` | density formula, luster tier + halo drawing, twinkle speeds, comet-gradient `drawMeteor`, `stepSky` trail length + spawn region |
| `tests/motion/starfieldSky.test.ts` | 13 → **17 tests**: 30px/s constant, gap bounds 3000/7000/5000, lifetime 900/1100/1300, envelope curve, head alpha 0.95 ceiling, head-travel 0.55 landing, trail-length bounds + 400px closeTo geometry, mirror boundary 0.14 left / 0.15 right, angle 18–38° |
| `tests/e2e/constellation.spec.ts` | re-derived allowances only: ascent window now rate-normalized (≈21px over 700ms, lower bound tightened to >duration×0.018), resume allowance ≤4px → page-clock-normalized (replaces fixed <4/<10), meteor lifetime allowance 1000 → 1600ms; comment for the 3–7s gap. **E2E harness stabilization:** `ambient` describe set to `describe.configure({mode:'default'})` (one worker, in order, no failure-skip) because concurrent animation-heavy browsers contend for CPU and stretch Node timers/evaluate RPCs — the three wall-clock tests failed in-file-parallel consistently but passed isolated; their assertions are now normalized by the page's own `performance.now` clock (rate semantics unchanged, no bound weakened) |

### Verification results (all measured 2026-11-10, fresh `npm run build`)

| Check | Result |
|---|---|
| Unit suites (`npx vitest run`) | **126/126** (11 files) |
| `npx tsc --noEmit`, `npx eslint src tests` | clean |
| `npm run build` + bundle budget | **initial JS 94.1/95.0 KB gzip; CSS 5.1/8.0; deferred largest 25.3/30.0; total JS 119.4/200.0 — within budget, not raised** |
| Full Chromium E2E | **116/116 passed** (constellation 13/13, repeated after stabilization) |

### Headed dev verification (`npm run dev`, Chromium headful 1920×1080, scripted)

| Check | Result |
|---|---|
| Ascent motion | Speck tracking across 4 screenshots 500ms apart: dy −17.9 @0.5s, −35.7 @1.0s, −53.0 @1.5s — linear ≈**35.6px/s measured** (residual read/attr latency bias ≈ +2px/s over the module's exact 0.03px/ms constant, verified out-of-page); visual: stars continuously rising |
| Meteors | 3 sightings in a 15s window (gaps ≈5s) — matches the approved 3–7s window; screenshots show the reference comet profile: bright near-white head dot at the lower end, smooth gradient tail toward the upper-left, `\` descent, measured streak ≥300px (visual length extends beyond the PCA estimate into the faint gradient); max one active |
| Density | ≈dozens of stars per hero viewport with occasional larger luster-tier soft dots — matches reference (was ~5–10 before) |
| Scroll sweep | 8 stops to the footer: `data-page-starfield-mode` stays `canvas`, stars visible mid-page at 50% and footer, content readability unaffected |
| Motion policies | reduced-motion → `static`; paused storage (`denver.dev:motion:paused`=true) → `static` |
| Frame times | intervals over 530 frames (idle + meteor window): **p50 34.7ms, p95 35.2ms, p99 35.5ms, max 93.8ms** (single 5-vsync stall during a screenshot); draws hold the ≤30fps cap (2-vsync intervals; p50 slightly above 33.3ms because headful vsync ≈17.3ms) — within the established canvas budget; decorative complexity retained, no reduction needed |

### Flagged divergences and residuals

- The reference video's own star layer is static; the 30px/s ascent is the owner's explicit requirement and diverges from the video (flagged at planning, confirmed by the owner's CP4.5-B settings table).
- Weathered-load test sensitivity is now structural (page-clock normalization + serialized ambient runs); recurrences on other files remain load-pattern items, not logic defects.
- No commit, push, CP5 or CP6 work; stop for owner visual acceptance.


---

## CP4.5-C — Constellation glow & cinematic shooting stars (2026-11-10)

Owner-requested refinements on top of CP4.5-B, superseding only the meteor *kinematics/appearance* and adding a subtle glow; everything else (ascent speed, spawn cadence, star layer, policies) carries over. The owner's manual `ASCENT_SPEED_PX_PER_MS = 0.05` (50px/s) edit is preserved verbatim.

### Changes

| Item | CP4.5-B | CP4.5-C |
|---|---|---|
| Ascent | 0.03 const (owner later hand-set 0.05) | **0.05 preserved** (owner-mandated; unit test updated to assert 0.05, code untouched) |
| Meteor travel | head lands at trail end by p=0.55 then tail burns off in place | **whole comet translates continuously** — `meteorHeadTravel = METEOR_TRAVEL_LENGTH_FACTOR(2.75) × progress`, passes *through* the trail end; head average speed +51% vs CP4.5-B (ratio 2.75÷1.82, inside the approved 40–60% band) — motion never stalls while fading |
| Vertical fade | burn-off `pow 1.2` after landing | **progressive envelope**: rise 0.1 → hold to p=0.6 → fade `pow ≈1.1` to 0 at p=1 — ends dark on the final frame |
| Streak growth | head leads; tail = origin until head passes | **`meteorStreakShare = clamp01(progress/0.25)`** — streak grows in over the first quarter, then holds full length trailing the head (tail never precedes the origin: `min(share, travel)`) |
| Streak thickness | layers 5/2.5/1, head dot 1.9px | **layers ~3.4/1.7/0.7 (−~30%), head dot 1.4px** (approved −25–35% band) |
| Spawn region | startX 5–95%, startY 4–66% | **startX 25–95%, startY 3–55%** — biased so streaks glide toward and through the right edge |
| Cluster lines | single 0.8px stroke @ α0.16 | **two-pass glow**: same path stroked twice — wide 3.2px halo @ α0.08 beneath the crisp 0.8px core (path built once, no shadowBlur) |
| Cluster stars | core fill (+ luster halo) | **soft halo added under every cluster star**: radius ×2.6 @ alpha ×0.16, layered like the existing luster halo; ordinary/luster stars' cores untouched |

New exported constants: `METEOR_TRAVEL_LENGTH_FACTOR = 2.75`, `METEOR_GROW_FRACTION = 0.25`; `METEOR_HEAD_ARRIVE_FRACTION` removed (unused). No new dependencies, timers, observers, or rerenders; culling, DPR ≤1.5, 30/20fps caps, pause/resume, reduced-motion, static fallback and telemetry attribute names all preserved.

### Files changed

| File | Change |
|---|---|
| `src/components/motion/starfieldSky.ts` | `meteorEnvelope` rewritten (hold→progressive fade), `meteorHeadTravel` → continuous travel factor, new `meteorStreakShare`, two new exported constants, dead constant removed; ascent constant preserved |
| `src/components/motion/PageStarfieldBackground.tsx` | `drawMeteor` (comet translates through trail end, tail trails at streak share, thinner layers, 1.4px head), `stepSky` spawn bias, cluster section two-pass line glow + star halos |
| `tests/motion/starfieldSky.test.ts` | 17 → **19 tests**: ascent constant now 0.05 (owner-mandated), envelope hold/fade re-derived, head-travel monotonic to 2.75, new 40–60% speed-band test (ratios 1.4–1.6× over 1.82 lengths/life), new streak-share tests |
| `tests/e2e/constellation.spec.ts` | ascent bounds re-derived for 50px/s (lower `duration×0.028`, upper `duration×0.075+4`) and resume allowance coefficient 0.033→0.055 — same rate-normalization policy, no assertion weakened; serialize + page-clock normalization kept |

### Verification results (2026-11-10, fresh `npm run build`)

| Check | Result |
|---|---|
| Focused unit suite | 19/19 (starfieldSky) |
| Typecheck / lint | `npx tsc --noEmit`, `npx eslint src tests` clean |
| Full unit suites (`npx vitest run`) | **128/128** (11 files) |
| `npm run build` + bundle budget | **initial JS 94.1/95.0 KB gzip (unchanged); CSS 5.1/8.0; deferred largest 25.3/30.0; total JS 119.5/200.0 — within budget, not raised** |
| Full Chromium E2E | **116/116 passed** (constellation 13/13) |

### Headed dev verification (`npm run dev`, Chromium headful 1920×1080, scripted; `.tmp-cp45c/`)

| Check | Result |
|---|---|
| Ascent | ordinal attr deltas ≈30px per ~600ms slot (500ms wait + screenshot latency) — consistent with the constant 0.05px/ms; the page-clock-normalized E2E bound `0.028–0.075 × duration` passed, so 50px/s stands on the authoritative check |
| Meteor trajectory | 4 sightings in an 18s window (≈3–7s gaps, max one active). Head pixel-sampling caught flight #2 head at (1327,510)→(1434,580) over ~100ms (≈0.05 viewport-diag/s — consistent with 2.75×trail/life ≈ 1.1kpx/s) with alpha dropping 0.976→0.874 while still moving; flight #4 head sampled at (1837,858) — bright head near the right edge. Screenshots confirm the thin `\` streak progressing lower-right between successive 200ms frames while visibly dimming (progressive fade during motion), trail exiting the frame edge region with no abrupt clip |
| Glow | constellation lines carry a faint wide halo (screenshots show soft doubled-line look without bloom); cluster stars keep geometry with a delicate halo; contrast with heading/body text unchanged |
| Scroll sweep | 8 stops to footer: mode stays `canvas`; readability intact |
| Motion policies | reduced-motion → `static`; paused storage → `static` |
| Frame times | intervals over 612 frames (idle + meteor flights): **p50 34.7ms, p95 35.0ms, p99 37.5ms, max 147.6ms** — 30fps cap held; the single max spike occurred during screenshot instrumentation (cf. CP4.5-B's 93.8ms stall), no regression in p50/p95 |

### Flagged divergences and residuals

- Owner's 0.05 ascent = 66% faster than CP4.5-B's approved 30px/s; preserved everywhere and asserted by test, not reverted.
- A few flights spawn with head travel ending slightly inside the right edge when trail roll is short (e.g. 240px trail, start 0.25×w → head ends ≈0.59×w); the streak still keeps moving through its fade, and the spawn bias makes right-edge exits the common case — flagged for owner visual judgement.
- No commit, push, CP5 or CP6 work; stop for owner visual acceptance.


---

## CP4.5-D — Visible constellation glow + agile ID physics (2026-11-10)

Owner-requested refinement pair on top of visually-accepted CP4.5-C. Two focused areas only: (1) the constellation glow rendered imperceptibly (root cause found and fixed), (2) the hanging ID felt slow/heavy (physics retuned by measured A/B). Everything else in CP4.5-C is settled and untouched.

### 1. Constellation glow — root cause and fix

**Root cause:** CP4.5-C's cluster lines stroked with `rgba(113,119,128,0.18)` *in addition to* the per-pass `globalAlpha` — the stacked alphas meant the "glow halo" rendered at ≤0.029 effective alpha and the core line at ≤0.058, i.e. effectively invisible regardless of the pass widths. Star halo fills also sat at alpha ×0.16–0.22 (ΔRGB ~17–20 over background).

**Fix (all layered drawing, no blur/filter):**
| Element | CP4.5-C | CP4.5-D |
|---|---|---|
| Line stroke color | `rgba(113,119,128,0.18)` (α stacked onto pass alpha) | full-alpha `#c9d1dc`; brightness controlled per pass via `globalAlpha` only |
| Line passes | 2 (3.2px @0.08 halo + 0.8px core @0.16 → effective ≤0.029/0.058) | **3 passes**: 7px halo @0.10, 3px bloom @0.18, 0.9px core @0.30 (path built once, three strokes) |
| Cluster star halos | one ×2.6 ring @ α×0.16 | **two-ring halo**: ×4.0 @ α×0.14 + ×2.4 @ α×0.30; luster ring ×2.6 @ α×0.30; cores unchanged |
| Ambient starfield / meteor | untouched | untouched (ascent 0.05, meteor model, cadence preserved) |

Measured glow bands (canvas alpha histogram, dev, 3 samples × prey-frames): n02 ≈990–1043 → **1431–1450** (+~40%), n12 ≈725–791 → **887–1038** (+~35%), n30 ≈416–528 → **751–883** (+~66%), n60 ≈183–226 → 152–247 (**no bloom**), maxAlpha 0.855–0.867 → 0.894–0.933. Headed screenshots confirm visible soft halos at normal brightness, desktop and 414px narrow layout, with text contrast unchanged.

### 2. Hanging ID physics — retuned by A/B measurement

Baseline first (`.tmp-cp45d/baseline.json`, probe sweeps constrained inside the 48° cone, pointer sampled at the attachment point so drag targets reproduce the arc exactly; card state read from the inline `transform`, not `boundingBox()` — bbox is rotation-polluted).

| Knob | CP4.5-C | CP4.5-D | Rationale |
|---|---|---|---|
| `gravity` | 1800 | **2400** | swing cadence ∝√(g/L): +15% faster swing, snappier drop recovery |
| `ropeStiffness` | 900 | 900 | unchanged; radial spring stiffness driven by gravity only |
| `ropeDamping` | 7 | **5.5** | springier radial recovery on release/pull |
| `airDamping` | 1.7 | **1.5** | livelier swing retention without a runaway tail (1.35 measured a 5.6s tail → trimmed) |
| `maxSpeed` | 3200 | **4400** | drag chase cap +37.5% — per-frame follow step 53→73px at 60fps |
| `springLength` | `restLength − 1800/900` | `restLength − 2400/900` | same sag formula re-parameterized (sag 2→2.67px) |
| `TILT_VELOCITY` | 0.002 | **0.0026** | tilt visibly responds to swing speed |
| pointer-velocity EMA | 0.65/0.35 | **0.6/0.4** | sharper measured fling launch |
| `LANYARD_RELEASE_SAMPLE_MS` | **120** | **120 — unchanged** | stale-hold release policy preserved |
| `MIN_FLING_SPEED`, capture, touch, bounds, a11y, reduced-motion | — | **unchanged** | all CP3 guarantees verified |

Measured A/B (5 baseline runs, 5 changed runs; transform-sampled): gentle-sweep follow **lag 0 → 0** (cap never binds at 60Hz); fast 8-step sprint lag **58.8–82.3px → 47.6–75.1px** (floor −19%, cap-bound class −27%); fling peak extremum **307 → 341px** (+11%) with swing ratios ~0.4 per half-swing (smooth exponential decay, no jitter) and release tail **4.0s → 5.4s** (livelier natural pendulum; no erratic extrema). Drop entrance re-verified: overshoot, settle <8s, bounded tilt/velocity (unit tests).

### Files changed

| File | Change |
|---|---|
| `src/components/motion/profileCardMotion.ts` | `createLanyardConfig` constants (gravity 2400, ropeDamping 5.5, airDamping 1.5, maxSpeed 4400, sag formula), `TILT_VELOCITY` 0.0026 |
| `src/components/hero/ProfileCard.tsx` | release-momentum EMA weights 0.6/0.4 |
| `src/components/motion/PageStarfieldBackground.tsx` | cluster glow: full-alpha stroke color + 3-pass strokes + two-ring star halos |
| `tests/motion/profileCardMotion.test.ts` | one stale literal updated: `springLength(320)` now asserted config-relative (`320 − gravity/ropeStiffness`) instead of the old-constant `318`; no assertions weakened |

### Verification results (2026-11-10, fresh `npm run build`)

| Check | Result |
|---|---|
| Focused motion tests (`tests/motion/profileCardMotion.test.ts`) | 28/28 |
| Full unit suites (`npx vitest run`) | **128/128** (11 files) |
| Typecheck / lint | `npx tsc --noEmit`, `npx eslint src tests` clean |
| `npm run build` + bundle budget | **initial JS 94.2/95.0 KB gzip (+0.1 KB from CP4.5-D); CSS 5.3/8.0; deferred largest 25.3/30.0; total JS 119.5/200.0 — within budget, not raised** |
| Full Chromium E2E | **116/116 passed** — includes constrained drag follow, stale-hold release, touch drag, reduced motion, pause/resume, pointer cancellation |

### Headed dev verification (`npm run dev`, headful Chromium; artifacts in `.tmp-cp45d/`)

| Check | Result |
|---|---|
| Glow visibility | `glow-desktop.png`, `glow-zoom.png` (640×420 crop), `glow-narrow.png` (414px): constellation stars carry visibly luminous soft halos; connecting lines perceptibly luminous at normal brightness; geometry, grayscale styling and text readability unchanged; unrelated ambient stars unchanged |
| Mouse drag/fling | `drag-mid-swing.png` (card swung to ~24° under fast sweep), `drag-recovery.png`; release momentum live (amps series above); stale hold still releases without fling (probe + E2E) |
| Reduced motion | headful `reducedMotion: reduce` → starfield `static`, portrait `static`, drag `idle` (`reduced-motion.png` + logged state) |
| Pause/resume | UI button pause → `motion: static` verified headful; full resume-no-replay chain covered by E2E (116/116, `pause settles the lanyard and resume never replays the drop`); headful resume click was automation-flaky, not a product defect |
| Touch drag | covered by E2E `coarse-pointer touch drags work and normal touch scrolling survives` (passed) |

### Flagged divergences and residuals

- Release-swing tail is now ~5.4s (was 4.0s): livelier, springier feel; decay is smooth (no jitter), but if the owner prefers a tighter settle, `airDamping` 1.5→1.7 reverts that single dimension.
- Fast-sweep lag improvement measures −13%…−41% depending on the run's rAF frame class (frame-class jitter exists in both builds); the cap-bound theoretical improvement is −27% (chase cap +37.5%). If the owner wants snappier still, `maxSpeed` 4400→5000 is the next single knob.
- Meteor/ascent/entrance constants untouched: `ASCENT_SPEED_PX_PER_MS = 0.05`, CP4.5-C meteor model, CP4 hero entrance 18px/500ms/100ms preserved.
- No commit, push, CP5 or CP6 work; stop for owner visual acceptance.

## CP4.5-E — Capricornus hero constellation (2026-11-10) — owner-requested, awaiting visual acceptance

Owner request: the hero motif still read as a network graph. Replace it with an astronomically recognizable Capricornus (sea-goat) figure with subtle but clearly visible celestial glow (varied star sizes/brightness, thin crisp lines over a luminous underlay), fit behind hero content without obstructing the headline, buttons or hanging ID. No new dependencies, no extra loops, no blur filters; page starfield, meteors, CP3 ID physics and CP4 hero entrance untouched.

### Reference and geometry

**Reference used:** the d3-celestial asterism dataset (derived from Stellarium/HYG), fetched from `https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json` (chain) and `.../data/stars.6.json` (RAR/Dec + magnitudes); local copies preserved in `.tmp-cp45e/`. The IAU Wikimedia SVG (`Capricornus_IAU.svg` via Special:FilePath) was rejected as a parse source (outline-glyph soup, no per-star coordinates). Every chain vertex was matched to a catalog entry by exact RA/Dec cross-check (`stars.6.json`, HIP ids recovered below), and the resulting coordinates were verified against known Bayer positions (δ 21h47m −16.1°, β 20h21m −14.8°, ω 20h52m −26.9°, ζ 21h27m −22.4°, γ 21h40m −16.7°, etc.).

| # | Star (HIP) | Mag | Tier | Raw RA/Dec (deg) → viewBox (600×400) |
|---|---|---|---|---|
| 0 | α Algedi (100027) | 4.3 | faint | −55.588 / −12.51 → (178, 8) |
| 1 | β Dabih (100345) | 3.05 | primary | −54.747 / −14.78 → (191, 43) |
| 2 | ψ Cap (101027) | 4.77 | faint | −52.785 / −17.81 → (219, 90) |
| 3 | HIP 102485 | 4.13 | secondary | −48.476 / −25.27 → (282, 206) |
| 4 | ω Cap (102978) | 4.12 | secondary | −47.045 / −26.92 → (303, 231) |
| 5 | ζ Cap (105881) | 3.77 | secondary | −38.333 / −22.41 → (430, 162) |
| 6 | δ Deneb Algedi (107556) | 2.85 | primary | −33.240 / −16.13 → (504, 64) |
| 7 | γ Nashira (106985) | 3.69 | secondary | −34.977 / −16.66 → (479, 72) |
| 8 | ι Cap (105515) | 4.28 | secondary | −39.438 / −16.83 → (414, 75) |
| 9 | θ Cap (104139) | 4.08 | secondary | −43.513 / −17.23 → (354, 81) |

- Links follow the reference chain exactly, closed back to vertex 0 (the reference draws the loop closure θ→α, the western edge of the classic trapezoid). 10 nodes / 10 links; still within the mobile node budget (18).
- Mapping: 15.5 px/degree, RA compressed by cos δ ≈ 0.94. The figure is **mirrored horizontally** (east-right orientation — a documented composition choice, not a projection error) and lifted inside the viewBox so the bright tail stars (δ/γ/ι/ζ/θ) sit in the free upper-right hero corridor while only the dim head stars (α 4.3, ψ 4.77) fall near the copy; β (the one bright head star) clears the "Building" line. This replaced two intermediate placements: mapping #1 put four medium/bright stars directly over the headline glyphs (screenshot `.tmp-cp45e/`, iteration 1), mirror+lift iteration 2 fixed the bright-star class.
- Every base link is ≤ 196 viewBox units, so drift (±8) + fine-pointer parallax (±14) on both endpoints can never push a rendered link past `CONSTELLATION_MAX_LINK_DISTANCE` (240): no link flicker (worst case 190.6 + 44 = 234.6).

### Render changes (canvas + SVG fallback share the same geometry)

| Layer | Change |
|---|---|
| Lines | One reused `Path2D` per frame, three layered strokes: soft underlay `rgba(138,144,154,0.13)` @ max(3, 3.4·scale)px, luminous body `rgba(148,154,164,0.19)` @ max(1.6, 2·scale)px, crisp core `rgba(176,182,192,0.50)` @ max(0.8, 1·scale)px; round caps. Cost: 3 cheap strokes over one path (no per-link shadow/blur). |
| Stars | Per-node `radius`/`haloWeight` from magnitude tiers (primary 5.4px/halo ×1.0, secondary 4px/×0.55, faint 3px/×0.3): two concentric halo rings (×2.9 @0.10·w, ×1.55 @0.18·w) + core fill `rgba(200,208,218,α)` with tier alpha 0.35+0.6·w, modulated by the existing per-index subtle sine pulse. No gradients, no blur filters; ≤ 31 small fills per frame. |
| SVG fallback | Same nodes/links mirrored: per-link glow line (`.hero-motif-line-glow`, CSS `rgba(138,144,154,0.16)` @3.2px) under the core line; per-node halo circle (`.hero-motif-star-halo`, 0.12) under the core circle scaled by `node.radius`. Reduced-motion static output mirrors the animated figure (verified by headful capture). |
| Idle rate | Desktop hero cadence measured 36–37 frames per 500ms (capped by the 60fps budget ✓), mobile mode `canvas`, node count 10 ≤ 18 mobile budget ✓. |

### Files changed

| File | Change |
|---|---|
| `src/components/motion/constellationGeometry.ts` | Replaced the 10 arbitrary network nodes/links with the Capricornus chain; added `ConstellationStarTier`, per-node `mag`/`tier`/`radius`/`haloWeight`, `constellationStarTier()` tier mapping + `STAR_TIERS`; budgets/drift/pointer/link-distance helpers unchanged |
| `src/components/motion/ConstellationBackground.tsx` | `drawFrame`: Path2D + 3-pass stroke, per-node radius/tier halos and core (was single 0.3-alpha stroke + uniform 4.5px dots); SVG fallback renders glow lines + halo circles |
| `tests/motion/constellation.test.ts` | Reasserts 10-node/10-link chain incl. new: all base links ≤ 196 (no drift flicker), chain-order topology, tier weight rules (primary radius > 5 & halo 1; faint radius < 3.5 & mag ≥ 4.35), ≥2 tiers present |
| `src/styles/global.css` | `.hero-motif line` core 0.35→0.5 alpha, new `.hero-motif-line-glow` and `.hero-motif-star-halo` rules |

### Verification results (2026-11-10, final state)

| Check | Result |
|---|---|
| Focused geometry test | 8/8 (new invariants above) |
| Full unit suites (`npx vitest run`) | **131/131** (11 files) |
| Typecheck / lint | `npx tsc --noEmit`, `npx eslint src tests` clean |
| `npm run build` + bundle budget | **initial JS 94.5/95.0 KB gzip (+0.3 KB vs CP4.5-D tier metadata; budget untouched); CSS 5.3/8.0; deferred largest 25.3/30.0; total JS 119.8/200.0** |
| Full Chromium E2E | **116/116 passed** (three runs: two contentions with a live dev server each tripped one wall-clock test — scroll cadence, then release momentum; both pass isolated 13/13 and in the final clean full run, matching the CP4.5-B "[known load flake]" note in STATE.md session decisions) |
| Headed capture (`npm run dev`, Chromium headful; artifacts `.tmp-cp45e/`) | desktop 1920 + 414px mobile + reduced-motion screenshots; alpha histogram bands on the hero canvas: soft 5886 / underlay 1009 / mid 1175 / core 358 (all four layers present, glow not alpha-suppressed) |
| Headline contrast | White heading glyphs on near-black; motif stars behind the heading block are ≤ mid-glow alpha except β (23px right of "AI.", over empty dark) — no core dot lands on a glyph; intro/buttons clear |
| Reduced motion / pause | `data-constellation-mode` = `static`, SVG fallback figure visible, zero canvas frames (E2E + capture) |

### Flagged divergences and residuals

- The figure is mirrored (east-right) for composition; the reference's astronomical orientation is east-left. Recognized published Capricornus renderings exist in both orientations, but if the owner wants the exact chart orientation, the unmirror requires re-deriving positions (bright tail then falls on the headline) or moving the text block.
- Initial JS +0.3 KB vs CP4.5-D (tier metadata); budget unraised and still 0.5 KB under the cap.
- The `heading overlap` probe reports max alpha 255 inside the heading **bounding box** — that is β/halo glow beside (not on) the glyphs; verified against the actual glyphs in `.tmp-cp45e/desktop-hero.png`.
- Only one "faint"-tier star (ψ 4.77) exists in the chain, so visible size variety comes from the 2 primary + 7 secondary vs 1 faint mix; deliberate, magnitude-faithful.
- No commit, push, CP5 or CP6 work; stop for owner visual acceptance of the Capricornus composition.

## CP5 — Project card interactions (2026-11-10) — pending owner visual acceptance

Scope per owner authorization: CSS-only project-card lift (3px / 180ms / ease-out) with independent keyboard `:focus-within` feedback using the existing gray `--color-border-control`, and a manual (non-autoplay) screenshot crossfade in ProjectMedia. Headline-link underline preserved; no new tokens, no new dependencies, no JS motion runtime involvement.

### Implementation record

| Change | Detail |
|---|---|
| `src/styles/global.css` — card lift | `.project-card` gains `transition: transform 180ms ease-out, border-color 180ms ease-out`. Hover lift is gated by `@media (hover: hover) and (pointer: fine)` only (coarse pointers never move). `.project-card:focus-within` is **ungated** so keyboard feedback works on every pointer class. Lift/border use the approved values verbatim; existing headline-link underline untouched. |
| `src/styles/global.css` — reduced/paused guards | `prefers-reduced-motion: reduce` and `html[data-motion-policy='paused']` collapse both hover and focus-within to `transform: none; transition: none` — border color feedback stays visible, no geometric movement. Matches the CP4 guard pattern. |
| `src/styles/global.css` — crossfade | Outgoing screenshot renders as `.project-media-leaving`, an absolutely positioned layer inside `.project-media-figure` (which became `position: relative`), fading 180ms ease-out `from {opacity:1} to {opacity:0}`, `pointer-events: none`, same border/radius so the stack is visually seamless. Reduced/paused set `animation: none; opacity: 0` — the swap is instant, showing the current image directly. |
| `src/components/projects/ProjectMedia.tsx` | Added a single `leaving` state (the outgoing screenshot). `navigate(delta)` advances `index` and stamps `leaving = current` in the same handler (one state batch, one paint, no timers/loops/rerender cascades). The leaving layer is replaced on rapid navigation — only ever the current + one outgoing image exist, and a new navigation overwrites the stale layer so `animationend`-driven removal can never leave ghost layers. Disabled images never enter `available`, so a crossfade can never show a failed image; counter display preserved. |

### Design findings (root-caused during RED→GREEN, kept in the record)

- **An inserted element never produces a CSS transition.** The first implementation animated the leaving layer with a `transition` + attribute flip; the RED test read `getAnimations()` and found the inserted element had no "from" state, so the fade never ran (`durationMs: NaN`). Redesigned as a one-shot CSS **animation** (`@keyframes project-media-fade-out`, 180ms ease-out, `both`) which fires on insertion, removed on `animationend`. Reduced/paused disable the animation and zero the layer.
- **Fixture dimensions are validated against the real PNG.** The content validator compares declared `width`/`height` with actual image dimensions; the synthetic fixtures declare 1×1 to match the fixture PNG (aspect-ratio stability is still asserted through the layout-stability check).

### Verification results (2026-11-10)

| Check | Result |
|---|---|
| New E2E (Chromium) | **7 tests**: fine-pointer hover lift exact −3px / 180ms / ease-out / gray border; focus lift identical with visible focus ring; coarse-pointer (Pixel 5, touch) never lifts + tap navigation works; reduced-motion border-only (transform `none`, duration 0); paused-skip + resume restores lift; no-JS cards readable and navigable ("Preliminary preview · Evidence pending" intact, native link click works); and a synthetic two-screenshot crossfade test **covering the whole contract: no autoplay over 1.2s → exactly 1 layer; Next click → 2 layers with a measured 180ms fade animation; counter updates; fade completes → 1 layer and the figure box is dimensionally stable; rapid triple-click stays ≤2 layers with no stale layer and correct counter; paused and reduced contexts both do the swap instantly (`opacity: 0`, no faded layer)** |
| RED discipline confirmed | The 5 behavior tests failed pre-implementation against the stale-free pre-CP5 build; the 2 coarse-pointer and no-JS tests pass pre-implementation by design (regression guards). The crossfade RED run caught the inserted-element/no-transition defect above before it shipped. |
| Focused group | **7/7 passed** (11.0s, after root-causing; see debugging trail) |
| Full unit suites (`npx vitest run`) | **131/131** (11 files) |
| Typecheck / lint | `npx tsc --noEmit`, `npx eslint src tests` clean |
| `npm run build` + bundle budget | **initial JS 94.6/95.0 KB gzip (+0.1 KB for the leaving-layer state/`animationend` wiring); CSS 5.5/8.0 (+0.2); deferred largest 25.3/30.0; total JS 119.9/200.0 — no budget raised** |
| Full Chromium E2E | **123/123 passed** (53.8s, against a fresh `npm run build`) |
| Headed `npm run dev` capture (artifacts `.tmp-cp5/`) | hover transform `matrix(1,0,0,1,0,-3)`, focus transform identical, reduced hover `none`; hero entrance `played`/opacity 1, starfield `canvas`, **ascent measured exactly 50px over 1s (CP4.5 behavior preserved)**; rest/hover/focus/hero/reduced screenshots reviewed |

### Debugging trail (for the record, findings kept)

- A test-helper bug (`Number(matrix.at(1))` on the capture group `"1, 0, 0, 1, 0, -3"` returned NaN, making three transition tests time out) was root-caused with a temporary debug spec (`tests/e2e/zz-cp5-debug.spec.ts`, instrumented computed-style diagnostics inside the real test context); fixed as `matrix.at(1)!.split(', ').at(-1)` and the spec deleted before final verification (full-suite output above contains no trace of it).
- Two initial assertion subtleties were corrected, not weakened: computed `transitionTimingFunction` repeats per property (`ease-out, ease-out`), and the resume-restore/focus reads needed `expect.poll` because the lift animates over 180ms.
- A stray background preview server previously occupied port 4173 during the fuzz; killed (PIDs 21704, 8748) before the diagnostic run — the stale-`dist/` hazard again honored: every E2E run followed a fresh `npm run build`.

### Residuals and flagged divergences

- Crossfade exercises only through the synthetic content fixtures: every real project currently has ≤1 declared screenshot (per the owner's evidence-first content policy), so no real two-image card exists yet; when 2+ screenshots are supplied, the same component path runs (validator-checked dims).
- The synthetic fixture media is a 1×1 PNG (declared 1×1 to pass content validation); rendered scale comes from the layout, so visual fidelity of large screenshots is not exercised by the fixture.
- Initial JS +0.1 KB, CSS +0.2 KB vs CP4.5-E; budgets untouched (94.6/95 and 5.5/8).
- No commit, push, or CP6 work; this checkpoint stops here for owner visual acceptance of the card lift and crossfade feel.

---

## CP5-S — Project screenshot integration (2026-11-10)

Owner-accepted CP5 approved this supplement: move the owner-supplied real screenshots into the validated content pipeline in the owner-approved per-slug order, with no schema change, no new dependencies, and no budget raise. Scope decisions (owner-approved): use the latest local files as the source of truth; **move** assets from `public/images/projects/` into `content/media/projects/`; reference the existing `owner-brief` evidence; preserve every accepted CP4/CP4.5/CP5 interaction.

### Asset move

- All 16 PNGs moved (untracked → plain filesystem move) into `content/media/projects/<slug>/1..4.png`; the emptied `public/images/projects` tree and `public/images` were removed; `public/` kept (empty, Vite convention). No file bytes altered — the owner-redacted screenshots (saklolo161 3 re-framed + 4 location/phone scribbles, erp 2/3/4 client-and-project-name redactions) are byte-identical to what the owner approved.
- Final dimensions: saklolo161 3=1920×1080, 2=512×265 (low-res, owner kept), 4=1920×1080, 1=1919×989; app 4×=1920×1080; promo 4×=1919×991–994; erp 2=1600×825, 1=1919×991, 3=1600×827, 4=1600×900.

### Content population (approved order)

| Slug | Approved screenshot order |
|---|---|
| saklolo161 | 3 → 2 → 4 → 1 |
| bistrobuddies-app | 3 → 4 → 2 → 1 |
| bistrobuddies-promo | 1 → 2 → 3 → 4 |
| erp-quotation-migrator | 2 → 1 → 3 → 4 |

Every entry: exact natural dimensions, `caption: null`, `evidenceIds: ['owner-brief']`, concise descriptive alt text (below). Build validation confirms declared dims match the real PNGs and all 17 public media files (16 screenshots + profile) are present.

### Budget compatibility investigation (no schema change)

- Root cause: `src/content/manifest.ts` imports `.generated/public-content.json`, so content JSON is inlined into the initial client bundle (the publication boundary plugin only blocks authoring `content/` paths, by design). The 16 screenshot entries cost ~1.32 KB gzip of the 0.4 KB headroom.
- Moving the manifest into a deferred chunk would be an architecture change (it is imported by the app shell — `AppRoutes`, `SiteLayout`, `staticPaths`) and was **not** done; the accepted CP5 budget was never raised.
- Resolution: concise alt text. Measured data points: verbose alts → 95923 B (fail), shared-vocabulary "v3" phrasing → 95028 B (fail; length beats repetition at this scale), final "v2" concise alts → **94990 B — 10 B margin**. Empirical slope ≈ 0.47 B gzip per raw alt character.
- **Flag for the owner:** any future client-bundle growth (new content or code) needs either content trimming or an owner-approved structural change (deferred manifest / caption-optionality schema change).

### Final alt text (v2, as shipped)

sak: `Mobile home with emergency tiles` / `Dispatcher map with live alerts` / `Dispatch tracker with timeline` / `Dispatcher login screen`; app: `Customer home with coffee cards` / `Product details with size options` / `Login screen with Google sign-in` / `App splash screen`; promo: `Promo hero with phone mockup` / `Promo Browse section` / `Promo film video section` / `Promo download section`; erp: `Quotation details with line items` / `Quotation PDF upload screen` / `Session quotations for Excel` / `Generated Excel workbook`.

### Test updates (RED→GREEN discipline held)

- Old `Screenshots pending` assertions (1 homepage + 4 project E2E tests) confirmed failing against real media, then rewritten: per-slug first-screenshot src/alt/dims + `naturalWidth` decode, real-image crossfade (two-layer bound, counter wrap, keyboard), no-JS prerendered first screenshot, and a new 375px no-crop/no-horizontal-scroll responsive test.
- `tests/content/publishing.test.ts` initial-records test now pins the approved per-slug screenshot order plus `caption: null` / `['owner-brief']` per entry.
- `tests/e2e/foundation.spec.ts` dist allowlist extended with `media/projects/<slug>/[1-4].png`.
- Portrait-fallback test re-scoped (failed portrait leaves no image; the four card images still render) instead of the page-wide zero-img assertion.
- **Fixture crossfade flake root-caused:** under full-suite parallel load the fixture dev page may not be hydrated when the first click lands — the click is silently dropped (failure snapshot showed the counter still `1 of 2` with the button focused). Fixed with the suite's established hydration gate (`[data-startup-indicator]` removed, as in motion.spec) before interacting, plus an in-page `animationstart` recorder so the leaving-layer observation cannot sample too early or after the 180 ms fade. Exact assertion `{layers: 2, durationMs: 180}` unchanged.
- `eslint.config.js`: `.tmp-*/**` added to `globalIgnores` — pre-existing `.tmp-cp45*` scratch verify scripts (untracked CP4/CP4.5 leftovers) produced 76 unrelated `no-undef` errors.

### Verification results (2026-11-10)

| Check | Result |
|---|---|
| `npm run build` + bundle budget | **initial JS 95.0/95.0 KB gzip (94990 B, 10 B margin); CSS 5.5/8.0; deferred largest 25.3/30.0; total JS 120.3/200.0 — all within budget, budget untouched**; 6 HTML docs + 17 public media verified |
| Unit suites (`npx vitest run`) | **131/131** |
| Typecheck / lint / format | `tsc --noEmit`, `eslint . --max-warnings=0`, prettier clean |
| Full Chromium E2E | **124/124 passed** (fresh build; includes the 3 fixes and the hardened crossfade test) |
| Headed dev visual verification (artifacts `.tmp-cp5s/visual/`) | Homepage cards render the four approved first screenshots in order, no cropping; saklolo161 walked through all four screenshots — every image renders at natural ratio (`height: auto`, `object-fit: fill` = no crop/distortion), figure box stable across each fade; mid-fade frame (timeline slowed via CDP `Animation.setPlaybackRate` for observability) shows the leaving layer `object-fit: contain`, opacity ~0.76, fully inside the figure, exactly 2 layers; bistrobuddies app/promo/erp first states verified; 375px viewport renders saklolo161 states 1–2 with `scrollWidth` 360 ≤ 375 |

### Residuals and flagged divergences

- The media figure height follows the current screenshot's aspect ratio between slides (406 px ↔ 374 px ↔ 372 px at 720 px width on saklolo161). This is inherent to the accepted CP4 `height: auto` layout — no cropping, box stable **during** each fade — but the owner should eyeball whether the between-slide height step is acceptable or should become a follow-up (e.g., normalized `aspect-ratio`) — no change made in CP5-S.
- saklolo161 screenshot 2 is 512×265 (upscaled when displayed); owner explicitly kept the low-res asset.
- 10 B initial-JS budget margin (see flag above).
- No commit, push, or CP6 work; this checkpoint stops here for owner visual acceptance of the real screenshots.

## CP5-S.1 — Drag/swipeable auto-advancing slide carousel (2026-11-11) — pending owner visual acceptance (with CP5-S)

Replaces the CP5-S manual crossfade with a drag/swipeable, auto-advancing slide carousel on homepage project cards and project detail pages, executed against the owner-approved plan (`C:\Users\hp\.opencode\plan\cp5-s1-plan.md`, synced to `01-04-SUP-CP5-S.1-PLAN.md`) with the owner's 12 revisions and revised budgets. No commits/pushes; the entire CP2..CP5-S.1 history remains uncommitted work in the tree. Full RED→GREEN ledger: `.superpowers/sdd/cp5-s1-plan/progress.md`.

### What shipped (8 tasks, all complete)

1. **`carouselPolicy.ts`** (pure module + unit tests): `nextIndex` wrap arithmetic, `swipeDecision` (distance fraction ≥ 0.25 of width OR flick velocity ≥ 500 px/s → commit; content-shift direction decides target), `shouldSuppressClick` (10 px intent threshold).
2. **Hydrated carousel structure**: controller-owned `data-carousel-active`, track `translateX(-n×100%)`, per-slide `aria-hidden`, `role="group"` + `aria-roledescription="slide"` labels, dots (`aria-current`), `p[data-carousel-status][aria-live="polite"]` announcing manual navigation only, full teardown/re-attach contract.
3. **Manual navigation**: dots click, ArrowLeft/ArrowRight/Home/End keyboard on the figure, programmatic `goto`.
4. **Pointer drag/swipe**: 1:1 pointer-follow past the 10 px intent, EMA velocity, commit via distance-or-flick branch, snap-back + clamp (no wrap-by-drag), pointercancel/lostpointercapture safe, post-drag click suppressed, native image ghost-drag prevented, `touch-action: pan-y` (vertical swipes always scroll the page).
5. **Silent 5 s autoplay** (`carouselAutoplay.ts`): one module-level IntersectionObserver, license = max intersection ratio with `compareDocumentPosition` tie-break (earlier DOM card wins and holds stably), fresh countdown after every gate release/manual move, gates = hover / focus-within / dragging / reduced-or-paused policy / hidden tab / license loss; blocked fires stop without catch-up bursts; exactly one homepage carousel autoplays.
6. **Seamless wrap (end clone)**: one `data-carousel-clone="true"` copy of slide 1 (permanently `aria-hidden`, `alt=""`, no tabindex); forward wraps animate onto the clone, hold one painted frame, then silently reposition to the real slide 1; multi-slide jumps (End/Home/dot jumps/ArrowLeft wrap) covered-reposition instantly; every gesture finishes an in-flight wrap first.
7. **Motion-policy CSS guards**: `prefers-reduced-motion: reduce` and `html[data-motion-policy='paused']` remove the slide transition (instant swaps) without killing the transform — manual navigation stays fully functional in both contexts (verified in E2E).
8. **Measurement + headed verification** (below).

### Owner's 12 revisions — all implemented

Stable viewport with `object-fit: contain` (no crop, zero between-slide layout shift); 5 s autoplay paused on hover/focus-within/dragging/reduced motion/global pause/hidden tab/offscreen; only ONE homepage carousel autoplays (most visible card, ties by DOM order); manual drag/swipe + keyboard + accessible dots + seamless looping + silent autoplay; trackpad/wheel deferred out of checkpoint (owner called it optional); no-JS = one accessible screenshot; carousel runtime separate from the motion runtime; Tier-1 measurement with revised ceilings (initial 110 KB / deferred largest 35 KB / total 200 KB / CSS 8 KB); no router removal or deferred manifest; CP4/CP4.5/CP5/CP5-S behavior preserved (full suite green); CP5-S stays pending visual acceptance.

### Verification results (2026-11-11)

| Check | Result |
|---|---|
| `npm run build` + bundle budget | **initial JS 95.4/110.0 KB gzip; CSS 5.7/8.0 KB; deferred largest 25.3/35.0 KB (27.9 KB total); total JS 123.3/200.0 KB — all owner ceilings held**; 6 HTML docs + 17 public media verified |
| Unit suites (`npx vitest run`) | **141/141** |
| Typecheck / lint / format | `tsc --noEmit`, `eslint . --max-warnings=0`, prettier clean |
| Full Chromium E2E (fresh build) | **145/145 passed** (141 prior + 4 new carousel test groups: structure/drag/dots/keys fixtures, autoplay lifecycle matrix, seamless-clone wrap, motion-policy matrix) |
| Retained groups confirmed in suite | ambient ascent/meteors, hero entrance transitions, card-lift/focus-within, per-slug content order, 375px responsive/no-scroll, no-JS cards, axe zero WCAG A/AA |
| Headed dev verification (artifacts `.tmp-cp5s1/`) | Slide-region geometry exact at 1280/768/375 (track and slide widths equal the media box; `scrollWidth ≤ innerWidth` everywhere); mid-drag frame shows 1:1 pointer-follow with next slide peeking; mid-wrap frame shows the forward transit onto the end clone, landing on slide 1 (`data-carousel-active` = 0 after End+ArrowRight); reduced-motion context computes `transition-duration: 0s` with instant functional navigation; ascent measured **49.985 px/s over 1 s (spec 50 px/s — unchanged)** |

### Residuals / flagged items for visual acceptance

- **CP5-S remains pending visual acceptance** — this checkpoint (CP5-S.1) is presented together with it; both stop here for owner review.
- Carousel runtime adds ~+0.4 KB initial (95.0 → 95.4 KB) and +1.0 KB deferred vs CP5-S; well inside the revised ceilings.
- Trackpad/wheel horizontal navigation deliberately deferred (recorded decision above).
- Pre-existing test-infra notes (no product impact): autoplay first-advance assertion carries a baseline tolerance for protocol skew under parallel load; the motion.spec portrait-momentum test remains load-sensitive (passes on rerun).
- No commit, push, installs, or CP6 work.

---

## CP5-S.3 — independent homepage carousel autoplay (2026-11-11)

Owner-approved refinement following CP5-S.2 visual acceptance: every visible homepage carousel autoplays independently instead of granting one exclusive license.

**Change (smallest possible, no new abstraction):**
- `carouselAutoplay.ts`: exclusive `relicense()`/`licenseeId` coordinator (most-visible wins, `compareDocumentPosition` tie-break) replaced by a per-carousel visibility gate — `syncVisibility()` flips each registration's gate exactly when `intersectionRatio > 0` changes (routine observer ticks never restart a running countdown). Registry insertion order doubles as a deterministic attach order.
- `carouselPolicy.ts`: new `AUTOPLAY_STAGGER_MS = 350` (unit-pinned). Only the first countdown a carousel actually starts carries `AUTOPLAY_GAP_MS + attachOrder × AUTOPLAY_STAGGER_MS`; every later countdown — including a manual restart during the initial window (`restartCountdown` clears `firstPending`) — is the plain 3800 ms recurring interval. Detail pages / lone carousels land on order 0 (no stagger).
- All other gates (focus-visible, dragging, reduced/paused policy, hidden tab, offscreen ratio 0) and every CP5-S.2 behavior preserved untouched.

**RED → GREEN:**
1. Unit pin `AUTOPLAY_STAGGER_MS === 350` — RED (undefined ≠ 350), GREEN 11/11.
2. `carousel-autoplay.spec.ts` homepage test rewritten from "only the most visible card autoplays" to "every visible homepage carousel advances independently with a deterministic initial stagger": cards 3+4 both advance (RED: card 4 stuck at '0' under the old license), stagger gap measured from page-internal logs ∈ [100, 1400] ms (~350 ms), keyboard-focus pause on card 3 does not pause card 4, blur resumes card 3 fresh, offscreen cards stay '0'. GREEN.

**Verification (fresh build):**
- Focused carousel specs (autoplay + projects + homepage): **49/49**.
- Full Chromium E2E ×3 runs: 146/148 → 138+1F/10 skipped → **147/148**; each failure a different documented load-timing flake (motion portrait momentum 1px sampling boundary ×2, autoplay first-advance baseline ×1), each passing standalone; the carousel surface never failed in any run.
- Unit 141/141 → 11/11 motion policy file; typecheck / lint / prettier clean.
- Bundle budget: **initial JS 95.5/110.0 KB gzip; CSS 5.8/8.0 KB; deferred largest 25.3/35.0 KB (27.9 total); total JS 123.5/200.0 KB — all ceilings held** (carouselClient chunk 5.24 → 5.16 KB gzip).
- No commit, push, installs, or CP6 work. Stopped for owner acceptance.

---

## Owner acceptance (2026-11-11)

The owner explicitly accepted, after visual testing: **CP1–CP5, CP5-S, CP5-S.1, CP5-S.2 and CP5-S.3.** The accepted carousel behavior is recorded as the 16 real project screenshots; independent autoplay for every visible homepage carousel at the 3800 ms recurring interval with the 350 ms deterministic initial stagger; seamless bidirectional infinite looping; mouse dragging, touch swiping and keyboard navigation; centered pagination dots and description-only captions; with accessibility, reduced-motion and performance safeguards intact.

### Known quality concern (nonblocking, recorded at closeout)

The full-suite Chromium E2E regression has **not** been demonstrated clean in a single loaded run. Three full runs at CP5-S.2/S.3 each produced exactly one different failure, every one a standalone-passing load-timing flake:

1. `motion.spec.ts` "release keeps momentum and the card damps back to rest" — momentum displacement boundary off by 1 px under parallel load (`> 101` vs `100` sampling slop); passed standalone twice.
2. `motion.spec.ts` "coarse-pointer touch drags work and normal touch scrolling survives" — failed once in run 1, passed standalone.
3. `carousel-autoplay.spec.ts` "autoplay advances on a fresh countdown…" — the documented first-advance protocol-latency baseline flake; passed standalone and in its full spec run (11/11).

The carousel surface itself never failed in any full run. This is recorded as a load-sensitivity concern (same class as the CP2-era scheduling flakes and the CP5-S ruling above), not a logic defect; no assertion was weakened. Any recurrence should be treated the same way.

### Closeout summary

- Changed-surface since the last accepted commit (`58e0494`, milestone 01-03): 24 tracked files modified (+2412/−146) plus the untracked motion/carousel source, tests, planning records and approved screenshot media — itemized in the proposed checkpoint commit.
- Bundle budgets at acceptance: initial JS 95.5/110.0 KB gzip; CSS 5.8/8.0 KB; deferred largest 25.3/35.0 KB (27.9 total); total JS 123.5/200.0 KB.
- No commit, push, installs, or CP6 work performed in closeout; the owner reviews the proposed checkpoint commit message before anything is committed.
