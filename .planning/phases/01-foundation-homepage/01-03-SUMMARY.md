---
phase: 01-foundation-homepage
plan: "03"
subsystem: identity-homepage
tags: [react, css, responsive, accessibility, playwright, vitest, static-rendering, typography]
requires: [01-02]
provides:
  - Supplied identity, exact hero copy and unchanged portrait display
  - Shared static-first layout with skip link, responsive navigation and contact footer
  - Four manifest-driven preliminary project previews with honest media states
  - Overview, capabilities and workflow composition without motion or invented claims
  - Responsive dark visual identity and breakpoint regression coverage
  - Self-hosted IBM Plex Sans Variable font (Latin + Latin Extended) with SIL OFL 1.1 license
  - Automated axe accessibility verification (WCAG 2.0 A, 2.0 AA, 2.1 A, 2.1 AA, 2.2 AA)
affects: [01-04, 01-05]
actuals:
  tasks: 5
  commits: 0
  tokens: 18500
tech-stack:
  added:
    - "@axe-core/playwright@4.14.0 (dev)"
  patterns:
    - Semantic CSS tokens in one stylesheet with IBM Plex Sans Variable primary stack
    - Shared layout wrapper around home, detail and not-found routes
    - Hydration-only mobile disclosure that keeps static links usable without JS
    - Static SVG constellation motif isolated from the future motion system
    - Font-display: swap for immediate first paint with variable font fallback
key-files:
  created:
    - content/profile.json
    - src/app/SiteLayout.tsx
    - src/pages/HomePage.tsx
    - src/components/hero/ProfileCard.tsx
    - src/components/projects/ProjectCard.tsx
    - src/components/projects/ProjectMedia.tsx
    - src/styles/fonts.css
    - tests/e2e/homepage.spec.ts
    - tests/e2e/navigation.spec.ts
    - tests/e2e/accessibility.spec.ts
    - tests/e2e/typography.spec.ts
    - src/assets/fonts/ibm-plex-sans-latin-wght-normal.woff2
    - src/assets/fonts/ibm-plex-sans-latin-ext-wght-normal.woff2
    - src/assets/fonts/IBM-Plex-Sans-OFL.txt
  modified:
    - src/app/AppRoutes.tsx
    - src/styles/global.css
    - tests/e2e/foundation.spec.ts
    - tests/e2e/projects.spec.ts
    - tests/e2e/development.spec.ts
    - scripts/serve.mjs
    - scripts/prerender.mjs
    - scripts/check-public-artifacts.ts
    - package.json
    - package-lock.json
key-decisions:
  - Self-host IBM Plex Sans Variable as two WOFF2 files (Latin, Latin Extended) under SIL OFL 1.1
  - Import fonts.css in global.css; set --font-sans to IBM Plex Sans Variable with system-ui fallback
  - Serve .woff2 with font/woff2 MIME type in preview and development servers
  - Extend artifact allowlist for hashed WOFF2 and license; validate their presence
  - Install @axe-core/playwright for automated WCAG A/AA scanning
  - Keep the constellation motif static and aria-hidden until 01-04 owns animation
  - Render all mobile navigation links in static HTML, then enhance to a disclosure after hydration
  - Source every project preview from the validated public manifest, never from page-level definitions
  - Report the missing axe run and font substitution instead of implying they passed
requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, QUAL-01, QUAL-02]
coverage:
  - id: D1
    description: Exact supplied identity, headline and introduction with the original portrait unchanged
    requirement: HOME-02
    verification:
      - kind: e2e
        ref: "tests/e2e/homepage.spec.ts"
        status: pass
      - kind: other
        ref: "npm run build (portrait SHA-256 54a159d7...429a)"
        status: pass
    human_judgment: true
    rationale: Automation proves copy and bytes; the owner must still confirm the rendered portrait appearance and identity wording.
  - id: D2
    description: Shared navigation, skip link, contacts, keyboard disclosure and no-JS access
    requirement: HOME-01
    verification:
      - kind: e2e
        ref: "tests/e2e/navigation.spec.ts"
        status: pass
      - kind: e2e
        ref: "tests/e2e/foundation.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: Four authorized preliminary previews with distinct detail links and honest media states
    requirement: HOME-05
    verification:
      - kind: e2e
        ref: "tests/e2e/homepage.spec.ts"
        status: pass
      - kind: e2e
        ref: "tests/e2e/projects.spec.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: Overview, capabilities and workflow claims stay within supplied positioning
    requirement: HOME-04
    verification:
      - kind: e2e
        ref: "tests/e2e/homepage.spec.ts (composition and fake-control checks)"
        status: pass
    human_judgment: true
    rationale: A person must confirm that qualitative claims match the owner's positioning and do not imply unverified project facts.
  - id: D5
    description: Responsive layout from 320px through wide desktop without overflow or overlap
    requirement: QUAL-01
    verification:
      - kind: e2e
        ref: "tests/e2e/navigation.spec.ts (320, 375, 640, 768, 1024, 1440)"
        status: pass
      - kind: manual_procedural
        ref: "Screenshots at 320, 375, 768, 1024 and 1440"
        status: pass
    human_judgment: true
    rationale: Automated geometry checks cannot judge visual balance; the owner should review the captured widths.
  - id: D6
    description: Semantic landmarks, contrast, focus visibility, forced-colors, and automated axe WCAG A/AA
    requirement: QUAL-02
    verification:
      - kind: e2e
        ref: "tests/e2e/navigation.spec.ts (keyboard, landmarks, no-JS)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/accessibility.spec.ts (8 axe tests: homepage, 4 projects, 404, mobile nav)"
        status: pass
      - kind: manual_procedural
        ref: "Rendered contrast audit and forced-colors screenshot"
        status: pass
    human_judgment: true
    rationale: Axe automation covers WCAG A/AA at tested viewports; manual verification of contrast, forced-colors, and screen-reader behavior remains for owner/independent review.
  - id: D7
    description: IBM Plex Sans Variable loads, applies, and is verified in production
    requirement: HOME-03
    verification:
      - kind: e2e
        ref: "tests/e2e/typography.spec.ts (font load, application, document.fonts.check)"
        status: pass
      - kind: other
        ref: "npm run build (WOFF2 assets hashed, license copied to dist/licenses/)"
        status: pass
    human_judgment: false
completed: 2026-11-06
status: complete
review-status: owner-accepted-2026-11-06
---
owner-acceptance: true
owner-acceptance-date: 2026-11-06
owner-reviewed-visual-design: true
owner-approved-how-i-work-section: true
independent-review: false
independent-review-note: No second independent review occurred. Provider rejected follow-up review requests on quota, consistent with 01-02 caveat. Automated axe results and parent-regression coverage are the evidence baseline.
---

# 01-03: Responsive identity, homepage, and accessibility completion

The homepage now carries the supplied identity, four manifest-driven previews and the complete non-motion composition, with the original portrait displayed unchanged. IBM Plex Sans Variable is self-hosted and automated axe accessibility verification passes.

## Execution and authority

The owner authorized 01-03 on 2026-11-06. The plan's historical execution gate is superseded by that authorization, as recorded for 01-02. All tasks were executed inline on the existing `main` because the owner instruction overrides worktree isolation.

No commit or push was made, and no 01-04 work started. The working tree holds the uncommitted changes listed below for owner review.

## Copy and media provenance

`content/profile.json` contains only owner-supplied values:

- Name: `Denver Axel Marbida`
- Title: `Agentic Full-Stack Software Developer`
- Headline: `Building Problem-Solving Software with AI.`
- Introduction: `Hi, I'm Denver Axel Marbida. I build end-to-end software solutions using agentic and AI-powered development workflows, turning real-world needs into practical, people-centered applications.`
- GitHub: `https://github.com/DenverAxelMarbida`
- Email: `denver0504.marbida@gmail.com`

`content/media/profile/profile.jpg` was not edited, re-encoded or regenerated. The source and built copies are 432,925 bytes with SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`. The card uses `object-fit: contain`, no filter and the original 1872x1848 dimensions, so the photograph is never face-cropped or recolored. A failed load renders the visible text `Portrait unavailable` instead of a broken image.

## Typography integration

- IBM Plex Sans Variable (Latin + Latin Extended subsets) vendored as two WOFF2 files from `@fontsource-variable/ibm-plex-sans@5.3.0`.
- License: SIL Open Font License 1.1, copied to `src/assets/fonts/IBM-Plex-Sans-OFL.txt` and included in production at `dist/licenses/ibm-plex-sans-OFL.txt`.
- `src/styles/fonts.css` declares two `@font-face` rules with `font-display: swap`, `font-weight: 100 700`, and appropriate `unicode-range` splits.
- `src/styles/global.css` imports `fonts.css` and sets `--font-sans: 'IBM Plex Sans Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`.
- `scripts/serve.mjs` serves `.woff2` with `font/woff2` MIME type.
- `scripts/prerender.mjs` copies the license file to `dist/licenses/`.
- `scripts/check-public-artifacts.ts` validates WOFF2 assets and license presence in the production output.
- Production build emits hashed WOFF2 assets: `ibm-plex-sans-latin-wght-normal-*.woff2` (~46 KB) and `ibm-plex-sans-latin-ext-wght-normal-*.woff2` (~31 KB).

## Composition

- The hero places copy before the card on narrow screens and uses a 3:2 grid from 1024px, with the card capped at 280px on mobile and 320px on desktop.
- The projects section renders exactly four previews in manifest order: Saklolo161, BistroBuddies App, BistroBuddies Promo and ERP Quotation Migrator. Each links to its existing detail route and shows `Preliminary preview · Evidence pending`.
- No project screenshots exist, so every preview and detail page shows `Screenshots pending` through the same `ProjectMedia` component.
- The approach section separates supplied positioning from portfolio facts. The technology list is labeled `Built for this portfolio`; workflow steps describe understanding, criteria, planning, assisted implementation, review and evidence.
- The assistant note is plain text, `Project assistant planned for a later phase.`, with no fake control.
- The constellation is a static inline SVG marked `aria-hidden`, leaving the animated system to 01-04.
- Email and GitHub are native links in the footer; no network request is made during tests.

## Files

| Files | Purpose |
|---|---|
| `content/profile.json` | Supplied identity, contact details and portrait metadata |
| `src/pages/HomePage.tsx` | Hero, projects, overview, capabilities and workflow composition |
| `src/app/SiteLayout.tsx` | Header, primary navigation, skip link, main landmark, mobile disclosure and footer |
| `src/components/hero/ProfileCard.tsx` | Portrait card and honest failed-image fallback |
| `src/components/projects/ProjectCard.tsx`, `ProjectMedia.tsx` | Preview card and missing, failed, single and multi-image presentation |
| `src/app/AppRoutes.tsx` | Shared layout across home, detail and not-found routes |
| `src/styles/global.css` | Semantic tokens, typography, layout, focus and responsive rules |
| `src/styles/fonts.css` | IBM Plex Sans Variable @font-face declarations |
| `tests/e2e/homepage.spec.ts` | 10 tests for copy, portrait bytes, geometry, previews and composition |
| `tests/e2e/navigation.spec.ts` | 15 tests for skip link, keyboard order, disclosure, no-JS, widths, detail and 404 navigation |
| `tests/e2e/accessibility.spec.ts` | 8 axe tests for WCAG A/AA on all routes |
| `tests/e2e/typography.spec.ts` | Self-hosted font load, application and document.fonts.check |
| `tests/e2e/foundation.spec.ts`, `projects.spec.ts`, `development.spec.ts` | Updated expectations for the approved headline and shared layout |

Two existing expectations changed for correct reasons: the `h1` is now the approved headline rather than the name, and the name and title appear in both the hero and the card, so those assertions use the first match. Detail pages now expose the shared header and footer links; the project-specific `Back to projects` link remains inside `main`.

## Verification

Final run on 2026-11-06:

- `npm run content:check`: 4 valid project records.
- `npm run typecheck`: pass.
- `npm run lint` with `--max-warnings=0`: pass.
- `npm run format:check`: pass.
- `npm test`: **54 passed** in 3 files, no skips.
- `npm run build`: pass, 6 HTML documents, 1 public media file, 2 WOFF2 fonts, 1 license verified.
- `node scripts/check-public-artifacts.ts`: pass, public-only reference build comparison.
- `npx playwright test --project=chromium`: **73 passed** in 20s, no skips. Breakdown:
  - 20 foundation (static HTML, hydration, no-JS, aliases, 404, assets, traversal)
  - 6 development (encoded paths, raw/import-query/@fs/@id denial)
  - 13 project (R4 aliases, static content, hydration, no-JS, fixtures)
  - 10 homepage (identity, portrait, geometry, previews, composition)
  - 15 navigation (skip link, keyboard, disclosure, no-JS, 6 viewports, reflow, detail, 404)
  - 6 accessibility (axe: homepage, 4 projects, 404, mobile nav; axe harness control)
  - 3 typography/fixture (font load, publication fixtures, media fixtures)
- Viewport and reflow checks: 320, 375, 640, 768, 1024 and 1440 CSS pixels report no horizontal overflow, and the hero card never overlaps copy.
- Keyboard checks: skip link reveals and reaches `main`; tab order follows the visual order; Escape returns focus to the mobile toggle; selection closes the menu; closed enhanced links leave the tab order.
- No-JS checks: mobile links remain visible and usable, and the page hydrates without console errors.
- Axe accessibility: 8 tests pass with zero WCAG 2.0 A, 2.0 AA, 2.1 A, 2.1 AA, 2.2 AA violations on all tested routes.
- Typography: font loads (200 OK, `font/woff2`), applies to `<h1>` (computed font-family contains `IBM Plex Sans` and `system-ui`), `document.fonts.check('700 16px "IBM Plex Sans"')` resolves true, fonts are same-origin.
- Rendered contrast audit: headline 18.21:1, hero introduction and eyebrow 9.6:1, buttons and header links 18.21:1, project headings 14.85:1, project summary and media note 7.83:1, workflow copy 9.6:1, footer body 8.6:1, footer links 16.32:1. All sampled text exceeds WCAG AA threshold for its size.
- Manual landmark audit: one `main`, one `h1`, a primary navigation landmark, a skip link, no unnamed links, no missing `href`, no `aria-controls` target absent, and the portrait has the alt text `Denver Axel Marbida`.
- Forced-colors screenshot: the skip link stays visible and the focus outline resolves to a 2px `Highlight` ring. No content disappears in forced-colors mode.
- Screenshots inspected at 320, 375, 768, 1024 and 1440, plus the open mobile menu, a detail page on mobile, the skip-link focus state and forced colors. No overflow, clipping or incoherent card placement was observed.

## Deviations and limitations

- Only Chromium on Windows was tested. Firefox, WebKit, Safari, physical mobile devices, screen readers (NVDA, VoiceOver), and real 200%/400% browser zoom remain unverified.
- The axe scan is automated but not exhaustive; it tests the rendered DOM at the tested viewports. Manual focus-order and forced-colors verification was performed by the agent, not an independent reviewer.
- Deployment has not been configured or verified. Publish only a complete replacement of `dist/` at the origin root with real 404 behavior.
- The antislop copy/UI audit was applied during implementation but not formally run as a separate review.
- The seven 01-02 review findings have parent regression evidence but no second independent confirmation (provider quota rejection).

## Review readiness

This milestone is ready for owner review. The review should confirm the exact supplied copy, the portrait's rendered appearance, the qualitative claims in the overview and capabilities, the card placement at each captured width, the IBM Plex Sans rendering, the axe results, and the decision about further browser/device testing. Motion, the loader, the animated constellation, the assistant integration and further project evidence remain out of scope until 01-04 or later authorization.