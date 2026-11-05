# Phase 1 validation strategy

Status: 01-01 foundation implementation, final review corrections and verification passed locally and were owner-accepted on 2026-11-05. Pre-commit strict checks/build passed; the full Chromium suite passed 22/22 (6.0s). Local commit authorized; later milestone execution and pushes remain gated. Actual results: [`docs/verification/phase-1.md`](../../../docs/verification/phase-1.md); acceptance: [`01-01-SUMMARY.md`](01-01-SUMMARY.md).

## Phase-wide commands and ownership

| Command | Purpose | Fails when |
|---|---|---|
| `npm run content:check` | Validate source records and references | Invalid record/reference/path, duplicate slug or verified claim lacks evidence |
| `npm run lint` | ESLint, React hooks, accessibility rules | Nonzero exit or any warning treated as an error |
| `npm run format:check` | Prettier verification | Any checked file differs from required formatting |
| `npm run typecheck` | Strict TS checking, application and build scripts | Any type error |
| `npm run test` | Vitest non-watch schema/publication tests | Failed tests or zero tests collected |
| `npm run build` | Clean content generation, browser build, prerender, media output and artifact verification | Any failed step; missing readable HTML or draft leakage |
| `npm run test:e2e` | Playwright against production preview, including axe | Failed/skipped required checks, browser errors or missing accessible behavior |

01-01 provides `dev`, `build`, `preview`, `lint`, `format:check`, `typecheck`, and `test:e2e`; all corresponding foundation checks passed. Current build emits root/404 and browser assets; `npm run test:e2e -- --project=chromium` passed all 22 checks (20 production-foundation + 2 live-development regressions), without axe or skips. Four Windows filesystem-alias cases and two encoded-delimiter cases verify the resolved final-review findings. ESLint checks Hooks/Fast Refresh and TS rules; manual keyboard checks cover the foundation. `content:check`, `test`, and aggregate `check` are still deferred. `npm run check` will later aggregate content, lint, formatting, type checking and unit tests. Production build and browser tests follow it. Browser provisioning followed owner approval; versions and evidence are in the verification report.

## Milestone checks

1. Foundation: static root HTML with one real link; hydration without mismatch; responsive base and correct 404 route; lint/types/build operational. Early proof must establish the prerender seam.
2. Content: exactly four entries validate; all four authorized preliminary entries publish; ReadyMama is absent by construction; sentinel draft/author notes in test-only fixtures are excluded from all output; stale published fixture removed when changed to draft; valid detail direct links and draft/unknown NotFound behavior.
3. Homepage: all requested sections, exact identity, supplied `profile.jpg` displayed unchanged with meaningful alt text, real nav/contact/CTA links, logical headings and keyboard order at narrow and wide widths.
4. Motion: no minimum loader delay, OS preference and pause behavior including live changes; no offscreen/hidden RAF activity; no pointer dependency; screenshot transition tested with synthetic test-only images clearly separate from real project assets.
5. Release candidate: aggregate checks/build/e2e, accessibility smoke, metadata, bundle/asset measurement and authoring guide walkthrough.

## Browser acceptance matrix

- Layout at 320, 375, 768, 1024, 1440px and a wide desktop check. Test 200% zoom and 400% reflow equivalent; no horizontal content scroll.
- Automated Chromium coverage; Firefox and WebKit smoke for layout, routes, menu and reduced motion. Report real Safari/mobile-device verification as not performed unless actually performed.
- Tab/Shift+Tab follows visual order; skip link reaches main; menu toggles with keyboard, Escape closes and focus remains sensible; no hidden focusable links.
- Hero project CTA reaches `#projects`; GitHub and email contain correct destinations. Do not send an email or perform external account actions during tests.
- Every preliminary project link opens its own detail page; refresh/direct URL works; home/back links work.
- No-JS: published HTML remains readable; desktop/mobile navigation links remain available through static progressive enhancement; no loader overlay or hidden text.
- Reduced motion before load and toggled at runtime: no pendulum/pointer/canvas/scroll translation; preference wins over local resume.
- Pause control halts ambient motion and persists safely when storage is available; denied storage does not break UI.
- A missing or failed real profile image shows a visible honest fallback; the supplied original bytes are never transformed; screenshots show an honest pending state; canvas-unavailable path keeps content working.
- Axe scan each page template/menu state; zero serious/critical findings, investigate all other findings. Automated checks do not prove complete WCAG conformance.
- Manual screen-reader smoke with available tooling: landmarks, page title, menu state, link labels, image alt text and no decorative announcements. Record if unavailable rather than inventing a pass.

## Performance targets, not achieved statistics

- Target initial homepage JS <=200 KiB gzip and CSS <=30 KiB gzip; measure actual output. If exceeded, document causes and fix or obtain a conscious budget change.
- Target mobile lab LCP <=2.5s, CLS <=0.1 and Lighthouse performance/accessibility >=90 on production preview with recorded throttling/tool version. No promise of field scores before real usage.
- INP target <=200ms when field data becomes available; use browser traces for interaction latency now, not an invented field INP.
- No decorative network dependency on first render; fonts use swap, images reserve dimensions, below-fold screenshots lazy-load. Preserve original portrait even if its byte size requires revisiting the performance budget.
- Verify canvas bounds and offscreen cleanup via a development trace; no forced synchronous layout in animation frames.

## SEO and host checks

View actual generated HTML to confirm content, titles/descriptions, supplied identity, appropriate links and no draft text. Build-time metadata uses actual configured site origin. If no origin is supplied, omit canonical/og:url/sitemap absolute URLs and clearly report deployment configuration pending; do not substitute Denver.dev or a localhost canonical. Generate the final sitemap only with a real public HTTPS origin.

Use a documented free static-host configuration supporting generated directories and 404 responses; final live-host verification remains Phase 5. Local preview success does not prove deployed status codes or redirects.

## Evidence record

After implementation, write `docs/verification/phase-1.md` with command results, tool versions, test counts, browser/device matrix, interactions checked, measured asset budgets, accessibility findings and remaining issues. Review diffs before approved conventional commits. Antislop audit happens after implementation per owner choice; report actual findings rather than claiming a design/build pass during planning.
