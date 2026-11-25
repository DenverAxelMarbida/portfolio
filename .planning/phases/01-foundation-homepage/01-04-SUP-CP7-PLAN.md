---
phase: 01-foundation-homepage
plan: "04-SUP-CP7"
supersedes: none
type: execute
wave: 4 (supplement to 01-04)
depends_on: ["01-04 CP6-F owner-accepted"]
autonomous: false
estimate:
  tasks: 7
  confidence: medium
---

# CP7 — Premium Motion & Visual Revision (Alfari-inspired interactions)

Owner directive: premium, immersive, physically convincing portfolio inspired by Alfari's
INTERACTIONS, not its branding. Preserve palette (near-black/charcoal/warm-white/signature-red),
IBM Plex Sans, original portrait, four projects, content hierarchy, evidence-based claims,
and every accepted motion safeguard. No commit/push; stop for owner visual acceptance.

## 1. Verified findings

### Reference (alfari.my.id) — observed via REA CDP web-bundle analysis (ev_a428163b…) + Chromium probes + screenshots (.tmp-plan/ref/)

| # | Observation | Evidence type |
|---|---|---|
| R1 | Hero 3D lanyard is a dedicated WebGL canvas section (`lanyard-card-container/-viewport/-canvas`), lazy-loaded as its own 588 kB chunk `assets/Lanyard-*.js`, dynamically imported by the 734 kB app chunk | observed (bundle graph, DOM, screenshot) |
| R2 | Lanyard chunk contains three.js (WebGL extension enumeration) and a **custom** rope/rigid-body simulation — **no Rapier** (0 matches): `rope`×76, `linearVelocity`/`angularVelocity`×8, `quaternion`×45, `gravity`, `mass`, `pivot`, `spring`/`stiffness`/`damping`, `CatmullRomCurve`×4 | observed (fingerprint of served bundle) |
| R3 | Scroll stays native (`overflow: hidden auto`, html `scroll-behavior: smooth`); scroll-linked animation via **GSAP + ScrollTrigger** (scrub ×3, pin ×2); no Lenis | observed (bundle fingerprint, computed styles) |
| R4 | Starfield persists behind every section; shooting stars (meteor streak captured in hero screenshot); full-viewport sections with centered headings; cutout portrait figure rising from the bottom edge (layered depth) | observed (screenshots at 4 scroll depths) |
| R5 | Glass surfaces: pill nav with backdrop blur, translucent cards with fine light borders (visually confirmed; `backdropFilter` ×2 in JS) | observed (screenshots) |
| R6 | Lanyard drag interaction: WebGL-rendered (no DOM 3D transforms); drag mechanics inferred from R2 physics markers, not directly verified headlessly | inference |

### Codebase — verified by inspection

| # | Finding |
|---|---|
| C1 | **Defect E-1 root cause**: `revealPolicy.revealDecision` re-reads `getBoundingClientRect()` at IO-callback execution time (revealPolicy.ts:50-52, used at Reveal.tsx:72). Entry line is 88% viewport height; skip line is 50%. A fast manual scroll covers the 274px band (at 720h) between IO generation and callback → `'skip'` → cards 1–2 (arriving together near the heading) appear static; cards 3–4 arrive later when scroll has slowed and play. |
| C2 | **Defect E-2 root cause**: Reveal.tsx:35 marks still-pending wrappers `'skipped'` whenever the effect re-runs with `paused=true` (paused is in the dep array). A temporary global Pause permanently kills below-viewport waves; only `reduced` should be decisive. |
| C3 | A **2D DOM lanyard already exists**: ProfileCard.tsx (545 ln) + profileCardMotion.ts (389 ln, 120Hz fixed-step sim: gravity, drag, fling, SVG rope path) with 28 unit tests + e2e (reduced-motion static, pause/resume, hidden-tab suspend). This is the fallback layer; 3D replaces the visual experience, not the safeguards. |
| C4 | **C is largely built**: PageStarfieldBackground already has continuous ascent (30 px/s) + meteors every 3–7s (CP4.5-B/C owner-approved); ConstellationBackground is the hero canvas. Extension = scroll responsiveness + depth, not rebuild. |
| C5 | Stack: React 19.3.1, `motion` 14.10.1 (useScroll/useTransform available — no new scroll dep needed), Tailwind 4.3.4, Vite 8.3.6. No three.js yet. |
| C6 | Bundle budgets enforced by tests: initialJs 110 KB, deferredChunk 35 KB, totalJs 200 KB gzip (scripts/check-bundle-budget.ts). three + R3F ≈ 150–170 KB gzip deferred → deferredChunk and totalJs ceilings must be raised deliberately. |
| C7 | Safeguards that must keep passing: no-JS SSR static, reduced-motion static, Pause/hidden-tab settle, focus-settle, hydration skip, deep-jump skip, carousel autoplay independence, geometry-compare gate, axe accessibility suite. |

## 2. Architecture

- **A (3D lanyard)**: `three` + `@react-three/fiber` v9 (React 19 compatible). **No Rapier, no drei, no GSAP** — the reference itself uses a custom simulation (R2); a pure-TS verlet rope + rigid card solver is smaller, deterministic, unit-testable, and matches observed behavior. Rope drawn as `TubeGeometry` along `CatmullRomCurve3`; card is a rounded plane textured from the **existing identity-card design** (portrait + name + role drawn to a CanvasTexture). Loaded as a lazy `src/lanyard3d.ts` dynamic chunk (mirrors R1, matches our motionClient deferral pattern). ProfileCard keeps the existing DOM lanyard as fallback for reduced-motion / no-WebGL / unsupported; mode exposed as `data-profile-card-mode="3d|dom"`.
- **B (continuous ascent)**: existing `motion` dependency — `useScroll` + `useTransform` for layered parallax (backgrounds slower, mid layers, content normal; per-section depth offsets). Native scroll, anchors, and keyboard behavior untouched.
- **C (starfield + meteors)**: extend existing two canvases with scroll-linked layer offsets and subtle scroll-velocity influence; meteors and ascent cadence unchanged (owner-approved CP4.5-B/C).
- **D (glass)**: pure CSS in global.css — translucent charcoal tokens, `backdrop-filter: blur+saturate`, 1px gradient borders, top-edge highlight, `@supports` static fallback; applied to nav, project cards, approach panels, ProfileCard shell.
- **E (defects)**: two-point fix — decide reveal by the IO entry's snapshot rect (fixes fast-scroll skip), and make Pause non-decisive for pending wrappers (fixes permanent skip after resume).

## 3. Execution sequence

### T0 — Prep (gates, not features)
- Add exact deps: `three` (^0.182), `@react-three/fiber` (^9), `@types/three` (dev, matching minor).
- Raise budgets in scripts/check-bundle-budget.ts with a comment recording the owner directive: `deferredChunk: 35_000 → 260_000`, `totalJs: 200_000 → 420_000` (initialJs/initialCss unchanged — first paint untouched). Update the budget.test.ts fixture expectations that assert current constants.
- Gate: `tsc`, `eslint`, prettier, `vitest run`, `npx playwright test --project=chromium` all clean.

### T1 — Defect fixes (E) — RED first, no weakening
- `revealPolicy.ts`: add `revealDecisionFromEntry(rect: {top:number}, viewportHeight)` — same threshold, but documented as judged on the **observation-time** snapshot. `Reveal.tsx` onEntries: use `entry.boundingClientRect` instead of a fresh `target.getBoundingClientRect()`.
- `Reveal.tsx:35`: decisive skip only when `reduced`; when `paused`, leave pending wrappers untouched (playing waves still settle via animation controls; effect re-arms the observer on resume).
- New tests: (a) unit — decision from a snapshot top below the skip line plays even if a "current" rect would skip; (b) e2e — fast scroll arrival (single large wheel jump landing the card above mid-viewport after the entry crossing) still animates cards 1–2 on screen; (c) e2e — pause → resume → scroll: below-viewport pending wave still plays on arrival; consumed wave still never replays.
- Gate: focused reveals suite green, then full suites.

### T2 — 3D lanyard physics module (pure, prototype-first)
- Create `src/components/motion/lanyard3dPhysics.ts`: N-segment verlet rope (fixed 120 Hz substeps, gravity, 2–4 constraint iterations, velocity clamp), rigid card body coupled at the rope's free end (quaternion integration from rope-end tangential motion + angular damping), pointer-drag target with critically-damped follow, release momentum carry-over, settle detector (reuse `isLanyardSettled` semantics).
- Unit tests (extend profileCardMotion.test.ts pattern, new `lanyard3dPhysics.test.ts`): rope segment lengths preserved within ε under gravity; total kinetic energy decays monotonically after release (no explosion); drag displaces card and rope follows; release settles to rest within bounded time; determinism (same seed inputs → same trajectory).

### T3 — R3F scene + ProfileCard integration (prototype milestone)
- Create `src/components/motion/LanyardScene.tsx`: PerspectiveCamera, ambient + key light, card mesh + strap tube, `useFrame` fixed-step accumulator (reuse the 120 Hz pattern from ProfileCard), pointer handlers on the canvas only (page scroll unaffected elsewhere), DPR clamp (reuse `clampConstellationDpr`), `frameloop='never'` when paused/hidden (wired through registerMotionAnimationControl), full dispose on unmount.
- Create `src/lanyard3d.ts` lazy entry: exports mount/unmount for the scene; ProfileCard dynamically imports it only when WebGL is available AND motion allowed AND not reduced — else stays on the DOM lanyard. Add `data-profile-card-mode` for tests.
- Card texture: draw the existing identity-card content (portrait img, name, role, existing card styling) into a canvas → `CanvasTexture`; reuse the original portrait asset file — no new identity assets.
- e2e: mode attribute correct per environment (3d on desktop WebGL, dom on reduced-motion); pause freezes rendering (rAF observation); pointer drag changes exposed card pose (`data-lanyard-pose` attr written from the physics state for testability); geometry-compare: hero layout identical to accepted baseline except the card region where 3D replaces DOM strap.
- **Stop for owner prototype acceptance (headed dev server) before visual integration work proceeds.**

### T4 — Continuous ascent (B)
- `useScroll` (window, native) → per-layer `useTransform` offsets: page starfield factor ~0.5×, constellation ~0.7×, section content 1×; per-section heading micro-depth (translateY/opacity ramp within its first viewport). Compositor-only transforms (translate3d), `prefers-reduced-motion` and Pause → offsets pinned to 0.
- e2e: anchors `#projects`/`#approach` land correctly (scroll-margin preserved); keyboard scroll unaffected; no scroll hijack (scrollbar/native wheel untouched — assert document scrollable and wheel moves scrollY).

### T5 — Starfield/constellation scroll response (C)
- Feed scroll offset into the existing canvas loops as a layer translate + subtle velocity-coupled drift/twinkle modulation; meteors unchanged. Reduced-motion/pause/hidden-tab rules unchanged (elapsed-time model already handles this).
- Tests: extend starfieldSky/constellation tests for the new offset input; existing tests untouched.

### T6 — Glassmorphism (D)
- global.css: tokens `--glass-surface`, `--glass-border`, `--glass-highlight`; utility applied to site nav, `.project-card`, approach panels, `.profile-card-shell`: translucent charcoal + backdrop blur + saturate, fine gradient 1px border, subtle top-edge reflection. `@supports not (backdrop-filter: …)` → opaque `--color-card` fallback.
- Gates: axe accessibility suite (contrast AA) green at both viewports; mobile 375 visual check; geometry deltas limited to expected glass layering.

### T7 — Final verification & evidence
- Full unit suite; full Chromium suite; headed reader-pace perceptibility runs (desktop + mobile) for reveals; lanyard interaction evidence (drag → momentum → settle screenshots); scroll-parallax and glass screenshots; bundle report with new ceilings; append CP7 record to 01-04-EXECUTION.md.
- Do not commit or push. Stop for owner visual acceptance.

## 4. Acceptance criteria (desktop 1280 / mobile 375)

1. **Lanyard**: card visibly rotates in 3D while dragging (perspective, not 2D rotate); strap stretches/follows elastically; release carries momentum and damps to rest ≤ ~2s; idle sway present; page never scrolls from dragging the card; mobile touch-drag works without hijacking page scroll.
2. **Fallbacks**: reduced-motion / no-WebGL → static readable DOM card with strap (existing tests keep passing); no-JS SSR unchanged.
3. **Ascent**: sections parallax at distinct rates; native scroll, anchors, keyboard, and scrollbar all intact.
4. **Reveals (E-1)**: fast manual scroll → all four cards visibly animate on screen (new e2e proves it); reader-pace tests unchanged.
5. **Pause (E-2)**: pause→resume leaves below-viewport reveals able to animate; consumed waves never replay; reduced remains decisive.
6. **Glass**: AA contrast maintained (axe suite), fine borders and blur visible, static fallback on unsupported browsers.
7. **Starfield/meteors**: CP4.5-B/C cadence unchanged + subtle scroll response; readable foreground.
8. **Gates**: tsc/eslint/prettier/vitest/Playwright full suite clean; bundle ceilings (new) enforced.

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| three.js size (~150–170 KB gzip) | Deferred dynamic chunk only (mirrors R1); budget ceilings raised explicitly with recorded rationale; initial JS/CSS ceilings untouched |
| WebGL context loss / unsupported devices | Existing DOM lanyard remains the fallback; `data-profile-card-mode` makes the active mode explicit and testable |
| Rope/card solver instability (explosion) | Fixed-step substeps + velocity clamp + constraint iterations; unit tests assert bounded energy and settle time |
| R3F ↔ React 19 compatibility | Fiber v9 supports React 19; exact versions pinned in T0; verified by a mount e2e before visual work |
| Scroll-parallax vs reveal interplay | Parallax on outer wrappers, reveals on inner content; compositor-only transforms; reduced-motion pins offsets to 0 |
| Existing DOM-lanyard e2e assume the 2D strap | Tests scoped by mode attribute; 3d-mode tests assert pose via physics-state attribute, not DOM strap geometry |
| iOS Safari backdrop-filter quirks | 375px pass in T6 + `@supports` opaque fallback |
| Testing WebGL interaction headlessly | Physics stays a pure module (unit-tested headlessly); scene exposes pose attribute; screenshots for visual claims |

## 6. Genuine blockers

None. All reference behaviors required for the plan were observed directly (REA evidence ev_a428163b… + browser probes); only drag feel details are inferred from physics fingerprints (R6), which the prototype milestone (T3 owner stop) resolves before visual integration.
