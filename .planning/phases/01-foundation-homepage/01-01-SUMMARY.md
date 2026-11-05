---
phase: 01-foundation-homepage
plan: "01"
subsystem: infra
tags: [react, typescript, vite, tailwindcss, react-router, playwright, static-rendering]
requires: []
provides:
  - Supplied-identity static homepage and NotFound with same-tree hydration
  - Strict toolchain and approved dependency lock
  - Vite build, development and contained static-preview entry points
  - Chromium regression coverage for resilience, routes and deployment boundaries
affects: [01-02, 01-03, 01-04, 01-05]
actuals:
  tasks: 3
  commits: 1
tech-stack:
  added: [React 19.3.1, React Router 7.18.5, Vite 8.3.6, TypeScript 5.9.3, Tailwind CSS 4.3.4, Playwright 1.64.1]
  patterns: [shared route tree, static HTML with hydrateRoot, manifest-driven assets, build-only server bundle]
key-files:
  created:
    - package.json
    - package-lock.json
    - scripts/prerender.mjs
    - scripts/html.mjs
    - scripts/serve.mjs
    - src/app/AppRoutes.tsx
    - src/app/staticPaths.ts
    - src/entry-client.tsx
    - src/entry-server.tsx
    - tests/e2e/foundation.spec.ts
    - tests/e2e/development.spec.ts
    - docs/verification/phase-1.md
  modified:
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/01-foundation-homepage/01-VALIDATION.md
key-decisions:
  - Preserve all 19 approved direct pins and the reviewed lockfile
  - Keep server rendering outside dist and hydrate the same route tree
  - Reject noncanonical filesystem aliases and preserve encoded development route components
  - Record acceptance in one owner-authorized local foundation commit; do not push or advance
patterns-established:
  - getStaticPaths and pre-bundle generation are the later publication extension points
  - Native links and readable static content survive absent or failed JavaScript
requirements-completed: [FOUND-01]
coverage:
  - id: D1
    description: Strict foundation tooling with the approved dependency lock
    requirement: FOUND-01
    verification:
      - {kind: other, ref: "npm run typecheck", status: pass}
      - {kind: other, ref: "npm run lint", status: pass}
      - {kind: other, ref: "npm run format:check", status: pass}
      - {kind: other, ref: "npm run build", status: pass}
    human_judgment: false
  - id: D2
    description: Root and NotFound static HTML, hydration, native navigation and failure resilience
    verification:
      - {kind: e2e, ref: "tests/e2e/foundation.spec.ts", status: pass}
    human_judgment: false
  - id: D3
    description: Encoded development paths retain NotFound DOM through live-server hydration
    verification:
      - {kind: e2e, ref: "tests/e2e/development.spec.ts", status: pass}
    human_judgment: false
completed: 2026-11-05
owner-accepted: 2026-11-05
status: complete
---

# 01-01: Foundation and first rendered slice

**The supplied identity renders as static HTML, hydrates through shared React routes, and remains usable without JavaScript.**

## Owner acceptance and commit

The owner accepted 01-01 on 2026-11-05 based on the completed implementation, final code review and passing verification. The owner authorized final acceptance tracking and one conventional local commit, including planning and verification documentation. Pushes and 01-02 execution remain unauthorized.

All three tasks are included in the commit containing this SUMMARY, titled `feat(foundation): complete accepted milestone 01-01`. Earlier task-level commits were intentionally deferred under the owner's original instructions. The commit also preserves the pre-existing approved planning documents and original photograph. The commit SHA is reported from Git after creation rather than embedded recursively in this file.

## Accomplishments

- Shared `AppRoutes`, `StaticRouter`/`renderToString` and `BrowserRouter`/`hydrateRoot` provide deterministic root and NotFound behavior.
- Script-owned HTML and Vite's manifest emit `index.html`, `404.html` and hashed browser JS/CSS. The server bundle stays in non-deployed `.generated/server/`.
- Strict TS, type-aware ESLint and Prettier cover application, scripts, configuration and tests. All 19 direct pins and the reviewed dependency graph are preserved.
- Production-preview tests cover raw HTML, direct loads/refresh, hydration, no-JS/native navigation, blocked scripts, 320px layout/focus, MIME, traversal, escaped text, HEAD and deployment boundaries.

## Verification and review

Pre-commit verification on 2026-11-05:

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`: exit 0.
- `npm run test:e2e -- --project=chromium`: **22 passed (6.0s)**, 20 foundation + 2 development; no failures or skips.
- Earlier retained-DOM mutation testing proved the hydration assertion rejects client-only replacement. Clean/repeat builds and 320/1440px visual observations are retained in the detailed report.
- Important review finding resolved: Windows filename aliases return 404 with NotFound HTML instead of homepage success/hydration errors. The lowercase index redirect remains.
- Minor review finding resolved: encoded `?` and `#` path characters remain encoded for development SSR. Live-development tests verify pre-script content, retained DOM, client routing and absence of hydration errors.
- All six review regressions failed before their fixes and passed afterward. No known in-scope review finding remains open.
- Staged review: 44 intended files, `git diff --cached --check` clean; credential-pattern scan of all 43 text files found no credentials. Generated output, dependencies, environment files and test artifacts are excluded. Staged bytes match the reviewed working tree, and all 36 files outside acceptance/tracking edits match their pre-finalization hashes, including approved plans/specifications, source, lockfile and the original portrait.

## Requirements and implementation rulings

FOUND-01 is completed with the approved lockfile in this commit. FOUND-02 is proven for root/NotFound; its published-detail requirement remains assigned to 01-02. QUAL-07 is proven for the current static output; publication URL validation remains pending. Those cross-milestone requirements stay open in REQUIREMENTS rather than being overstated as complete.

The detailed handoff governed Chromium-only verification and the script-owned template. Recorded rulings use the direct `react-router-dom` StaticRouter export, a separate static-path module for Fast Refresh, Vite 8 `rolldownOptions`, and Vite-owned server lifecycles. The final review added exact filesystem spelling checks and separate encoded/decoded paths. These changes preserve the approved scope.

## Preserved assets and remaining risks

- Reviewed lock SHA-256: `a23ea278ecd876fbe5f7033c250e6eac0ee6b0380312b40a8982e574cf334b43`.
- Original `content/media/profile/profile.jpg`: 432,925 bytes, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`; preserved at its original path, not published by this milestone.
- Recorded audits: zero production vulnerabilities; 10 moderate affected development-package entries for the accepted minimatch advisory `GHSA-g3hv-75wg-m249` / `CVE-2026-118764`. Installed 10.2.6; first patched 11.0.1 is outside current parent ranges. No dependency fix or override was applied.
- Local verification is Windows/Chromium. Actual hosting, broader browser/accessibility/performance checks and final visual acceptance remain deferred. Deployment needs origin-root mounting and real HTTP 404 responses.

## Next milestone readiness

The verified publication extension points are ready for 01-02, but execution requires separate explicit owner authorization. Zod application integration, Vitest, public projection, project records and detail routes remain deferred. The approved future project list and all later plans are preserved without beginning their implementation.

See the [verification report](../../../docs/verification/phase-1.md) and [execution ledger](01-01-EXECUTION.md) for exact dependency versions, commands, advisory paths, regression evidence and implementation rulings.
