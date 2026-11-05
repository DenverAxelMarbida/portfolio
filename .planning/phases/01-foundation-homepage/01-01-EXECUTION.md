# SDD ledger — plan: .planning/phases/01-foundation-homepage/01-01-PLAN.md

Status: Implementation, all three task checks, final whole-implementation review corrections and verification complete. Both findings resolved; owner accepted 01-01 and authorized its local conventional commit on 2026-11-05. The approved transitive graph and dev-only advisory remain unchanged. No push or next-milestone authorization.

## Pre-flight and rulings

- Task 1 → Task 2: exact manifest and JS build surface feed lockfile, type checking, and linting. Install only the audit's 19 pins; `allowJs`/`checkJs` cover build scripts.
- Task 1 → Task 3: production preview and routes feed resilience tests. Ruling: establish Playwright-owned preview lifecycle in Task 1 and use Chromium only, as the detailed handoff requires; no duplicate test server or premature Firefox/WebKit setup. Cost if wrong: earlier configuration than the broad plan's Task 3 wording, with no runtime impact.
- Ruling: use this GSD execution ledger instead of commit-based Superpowers helpers. The repository has unborn `main`, and the owner requires this clone with no commits/worktree. Record tests and file state directly; retain evidence for owner review. Cost if wrong: no commit-range review package until commits are approved.
- Ruling: retain `01-01-SUMMARY.md` for owner acceptance, as the handoff requires; update STATE, ROADMAP and verification evidence now. Cost if wrong: automated summary-based progress remains pending until review.

## Dependency verification

- Observed runtime: Node `v24.21.0`, npm `11.19.0`, Windows x64.
- Initial official registry checks: all 19 exact pins returned HTTP 200, matched stored SHA-512 integrity, and had no deprecation flag. Declared direct peers and engines match the selected foundation/runtime. Later transitive inspection found Babel and jiti are required through other graph edges; see the resolved clarification below.
- Portrait SHA-256 unchanged: `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`.
- Repository remains unborn `main`; origin fetch/push remains `https://github.com/DenverAxelMarbida/portfolio.git`.
- `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/ --engine-strict --strict-peer-deps`: exit 0; no engine/peer conflicts. npm reported 186 audited packages during resolution and 10 moderate vulnerabilities. `node_modules` did not exist at this pre-install gate.
- Lockfile v3 contains 220 package records: 214 separately resolved official-registry tarballs and 6 `inBundle` records within the optional Tailwind WASM artifact. All 214 exact names, versions, tarball URLs, and integrity values independently matched official-registry metadata; no deprecations. All 19 direct pins and their audited integrity values match the manifest and lock. The 6 bundled entries correctly omit independent resolution/integrity; they are not unexpected external sources.
- Registry comparison evidence: `01-01-DEPENDENCY-VERIFICATION.json`. Lockfile SHA-256: `a23ea278ecd876fbe5f7033c250e6eac0ee6b0380312b40a8982e574cf334b43`.
- Only reported install lifecycle: `fsevents@2.3.3`, optional Darwin-only (`node-gyp rebuild`); this package is not applicable on the observed Windows host. No scripts were executed.
- Vite 8.3.6 official release notes reviewed: bug fixes for build CSS dependency collection, plugin shutdown, source maps, server escaping, SSR input, and related dependency updates. No direct version change required by those notes.
- `npm audit --omit=dev --json --registry=https://registry.npmjs.org/`: exit 0, zero vulnerabilities.
- `npm audit --json --registry=https://registry.npmjs.org/`: exit 1, 10 moderate affected-package entries, zero high/critical. One underlying advisory: `GHSA-g3hv-75wg-m249` / `CVE-2026-118764`, minimatch 10.2.6 glob-pattern CPU/memory amplification with optimizationLevel >=2. Affects ESLint/typescript-eslint tooling; not in production dependencies. First patched version 11.0.1 is outside these parents' declared 10.x ranges. npm proposes direct-package downgrades, including the audit-rejected ESLint 9.39.5. No `audit fix`, overrides, or pin changes applied.

### Approval clarification — resolved before installation

The handoff explicitly says not to install Zod in 01-01. Its approved `eslint-plugin-react-hooks@7.1.1` nevertheless declares `zod: ^3.25.0 || ^4.0.0`, resolving `zod@4.6.7` as a dev-only transitive dependency. It also pulls Babel, and `@tailwindcss/node@4.3.4` pulls `jiti@2.7.0`, which the audit described as an uninstalled optional ESLint peer. These graph edges are legitimate upstream dependencies; they do not require adding any direct package or using Zod in the application. Clarification is required under the owner's stop-on-discrepancy instruction before installing this graph. The moderate dev-only advisory is disclosed for the same decision.

Owner response: **Approved Option 1.** Use the reviewed lock unchanged, allow required transitive dependencies, keep Zod application integration deferred, document advisory paths and patched versions, rerun both audits after installation, and stop on high/critical findings or unexpected graph changes. No fixes/overrides/forced upgrades authorized.

Affected paths (all development-only):

- `eslint@10.14.0 → minimatch@10.2.6`
- `eslint@10.14.0 → @eslint/config-array@0.23.5 → minimatch@10.2.6`
- `typescript-eslint@8.72.1 → @typescript-eslint/typescript-estree@8.72.1 → minimatch@10.2.6`, also reached through its parser, utilities, type-utils and eslint-plugin dependencies.
- `@eslint/js@10.0.1` is flagged through its ESLint peer.

Patched release reported by GHSA: `minimatch@11.0.1`; affected range `>=7.0.0 <11.0.1`. Current parents require 10.x, so replacing it would need a separately approved dependency change.

Installation and application checks are recorded below.

## Tasks

- Provisioning: `npm ci --registry=https://registry.npmjs.org/ --engine-strict --strict-peer-deps` exit 0, 179 packages added. `npm ls --depth=0` exit 0, all 19 direct pins valid. Lockfile SHA-256 unchanged. Both post-install audits match the approved findings (production 0; full 10 moderate, 0 high/critical).
- Chromium provisioning: `npx --no-install playwright install chromium` exit 0; Chrome for Testing/headless shell 156.0.8078.4, Playwright revision 1248. Installer also supplied FFmpeg 1013 and garbage-collected its unused prior browser cache.
- Task 1 RED: `npm run test:e2e -- tests/e2e/foundation.spec.ts --project=chromium --grep "emits meaningful"` failed because generated HTML was absent (expected supplied name, received empty string).
- Task 1 staged checks: static build passed; HTTP/no-JS tests initially failed before preview middleware existed. After adding middleware, 3/4 passed and hydration test failed specifically on missing client route response. Added `hydrateRoot` with the shared route tree; build passed and all 4 tracer tests passed (4.1s).
- Task 1: complete: production build passed; all four tracer cases passed within the pre-review 16-test suite and the final 22-test suite. Raw HTML, no-JS native navigation, original DOM retention through hydration, and live client route response verified.
- Task 2: complete — `npm run typecheck`, `npm run lint`, and `npm run format:check` all exit 0. The first typecheck found nullable-path capture inside hoisted async declarations; arrow closures preserved narrowing. Initial formatting findings were corrected. The latest expanded suite is included in strict checks.
- Task 3: complete: `npm run build` exit 0; pre-review `npm run test:e2e -- tests/e2e/foundation.spec.ts --project=chromium` **16 passed (3.5s)** after the checks below, zero skipped. Direct refresh, unknown/project-shaped paths, native no-JS home return, blocked scripts, 320px with/without JS, focus/44px target, MIME, missing assets, raw traversal, artifact boundaries, escaped text, redirects and HEAD covered. Final expanded suite: **22 passed (7.5s)**.
- Final review corrections and owner report: complete; see resolution below and `docs/verification/phase-1.md`. Owner subsequently accepted the result; finalization recorded below.

Owner continuation: complete the final 01-01 review, resolve findings within its approved scope, rerun affected checks, update the verification report and provide the completion summary. Stop after reporting; no 01-02, commits or pushes. The existing reviewer was asked to conclude from its collected evidence rather than restart the review.

### Final review resolution (2026-11-05)

- Reviewer verdict: **ready with fixes**; no critical issue. Important finding: Windows aliases `/INDEX.html` and `/index.html/` served homepage HTTP 200 then produced React hydration error #418; `/404.HTML` returned an incorrect 200. Minor finding: development requests `/%3Ffoo` and `/%23foo` decoded URL delimiters before SSR, producing homepage markup under 404.
- RED: six new regressions failed via `npm run test:e2e -- --project=chromium --grep "filesystem alias|encoded delimiter"`. Four aliases (including `/404.html/`) failed expected status; two development cases failed the pre-JS NotFound heading assertion.
- Alias fix in `scripts/serve.mjs`: compare the requested public file spelling with the canonical path from `realpath`; reject aliases with 404, recognizing HTML extensions case-insensitively. Preserve canonical `/index.html` redirect/query and HEAD behavior. Targeted alias/canonical tests: **5 passed (4.0s)**.
- Development fix in `scripts/serve.mjs`: preserve original encoded `routerPath` separately from decoded filesystem `pathname`; use `routerPath` in rendering and HTML transformation. `tests/e2e/development.spec.ts` owns a live Vite server; both cases verify raw 404/NotFound, pre-script visibility, retained original DOM, client routing and no hydration errors. Targeted tests: **2 passed (4.5s)**. This resolves the reviewer's untested live-development-browser effect.
- Final post-fix commands: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all exit 0. Full `npm run test:e2e -- --project=chromium`: **22 passed (7.5s)**, 20 foundation + 2 development, zero failures/skips.
- Final integrity checks: lockfile and original portrait SHA-256 match their recorded values; manifest's 19 direct pins match the reviewed lock root; `npm ls --depth=0` exits 0. No dependency reinstall/change was needed; post-install/pre-review audits remain the recorded evidence. Deployed inventory remains the same four files.
- At review handoff: updated verification report, STATE, ROADMAP and phase validation; acceptance SUMMARY and completed roadmap checkbox were reserved for owner acceptance. Work was then uncommitted on unborn `main`, with origin unchanged. The subsequent acceptance/finalization below supersedes that gate.
- Remaining limitations: aliases verified only on Windows; actual host/deployment unverified; approved moderate tooling advisory retained. Broader accessibility, cross-browser, performance, final design and publication checks remain assigned to later milestones. No second independent review or whole-phase completion is claimed.

### Owner acceptance and local commit finalization (2026-11-05)

- Owner explicitly accepted 01-01 based on implementation, final review and passing verification, and authorized a meaningful conventional commit with relevant planning and verification documents. No push, force-push, history rewrite, unrelated modification or 01-02 execution is authorized.
- Created `01-01-SUMMARY.md`; completed the 01-01 roadmap checkbox and FOUND-01 requirement; updated STATE, PROJECT, REQUIREMENTS, phase validation and verification status. FOUND-02/QUAL-07 remain partially fulfilled across milestones; no later plan is marked complete.
- Fresh pre-commit `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`: exit 0. `npm run test:e2e -- --project=chromium`: **22 passed (6.0s)**, zero failures/skips.
- Commit arrangement: all three completed tasks and their documentation in the containing commit `feat(foundation): complete accepted milestone 01-01`. Earlier instructions deferred task commits, so no history is rewritten or task-level commit hashes fabricated.
- Staged-content review: 44 intended files (43 text and original portrait); no forbidden generated/dependency/environment paths, no credential-pattern findings, and `git diff --cached --check` passed. All staged bytes match their working files; the 36 files outside acceptance/tracking edits match their pre-finalization aggregate SHA-256, preserving approved plans/specifications, source, lockfile and photograph.
- Post-commit identity checks are reported with the Git SHA after commit creation. Stop after that report; 01-02 requires explicit new authorization.

### Additional verification

- Hydration assertion mutation check: temporarily replaced `hydrateRoot` with `createRoot(...).render(...)`, rebuilt, and ran the hydration case. It failed on the original `<main>` becoming disconnected (expected true, received false), even though client routing worked. Restored `hydrateRoot`, rebuilt, and passed all 16 tests. No mutation remains.
- Development entry smoke (`node scripts/prerender.mjs dev`, the exact command behind `npm run dev`): raw root 200 and NotFound 404, CSS, client hydration/routing, home navigation, refresh, no-JS identity and zero browser errors passed. The owned process exited. Initial smoke harness startup detection timed out on ANSI-colored output; stripping terminal control codes corrected the harness without changing application code.
- Clean/repeat build probe: wrote test-only stale sentinels into `dist` and `.generated`, invoked the build entry, and verified both were removed. All four deployed files and the server bundle were byte-identical to the preceding build (SHA-256 comparison). A first probe had a shell-escaping syntax error before execution; the corrected probe passed.
- Current artifact bytes: `index.html` 607; `404.html` 574; `assets/entry-client-B4Tx4OJP.js` 257,598; `assets/entry-client-CBxfn7uw.css` 5,050. Non-deployed server bundle: 1,463 bytes. Node `gzipSync` default measurement: JS 80,978 bytes, CSS 1,726 bytes.

## Implementation rulings

- Ruling: import `StaticRouter` from the audited direct `react-router-dom` package. Its installed export was verified as a function; this avoids relying on a transitive import or adding a twentieth dependency. Cost if wrong: an upstream re-export change would fail type/build checks.
- Ruling: place `getStaticPaths(): string[]` in `src/app/staticPaths.ts`, re-exported by the server entry. Keep `AppRoutes.tsx` a Fast Refresh component boundary. Cost if wrong: one additional source file; route output remains the approved `['/']` seam.
- Ruling: use the detailed handoff's script-owned HTML template and explicit client/server builds, while retaining the architecture spec's Vite-owned dev/preview server lifecycle. Small middleware lives in `scripts/serve.mjs` and template handling in `scripts/html.mjs`; no custom HTTP server or production backend. Cost if wrong: three small build files instead of one, and the earlier spec's root index.html convention is superseded by the handoff.
- Ruling: use Vite 8's `rolldownOptions` spelling for explicit build input/output rather than the legacy `rollupOptions` alias; retain the required manifest-based asset injection. Cost if wrong: config/build validation fails on an unsupported Vite API; the installed 8.3.6 build has passed.
- Ruling: reject noncanonical filesystem aliases with 404 rather than accepting alternate HTML paths; preserve encoded path components for development routing. Cost if wrong: noncanonical file spellings are unavailable and the real host needs a consistent policy. Six regression cases confirm the reviewed Windows/dev defects are resolved; the lowercase index redirect remains.
