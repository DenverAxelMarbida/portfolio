# Phase 1 verification

Current milestone evidence: [01-02 validated project publishing](01-02.md). 01-02 was owner-accepted on 2026-11-06 after its five Important and two Minor review findings were corrected with regressions. Acceptance records that no second independent review occurred after a provider quota rejection. The 01-01 section below is the historical acceptance record; the owner subsequently reported its push and authorized 01-02 on 2026-11-06.

## 01-01 — foundation implementation (2026-11-05)

Status: **01-01 implementation, final review corrections and verification complete; owner accepted 2026-11-05.** Both confirmed review findings are resolved; no known in-scope code-review finding remains open. This record covers 01-01 only. The owner authorized its local conventional commit with planning and verification documentation. No push is authorized, and 01-02 has not started. Acceptance is recorded in [01-01-SUMMARY.md](../../.planning/phases/01-foundation-homepage/01-01-SUMMARY.md).

### Environment and installed dependencies

Windows x64; Node **24.21.0**; npm **11.19.0**. Chromium/Chrome for Testing **156.0.8078.4**, Playwright revision **1248**; installer also provisioned FFmpeg **1013**. Tests use Playwright's Chromium headless browser.

All 19 approved direct pins remain unchanged:

| Runtime | Version |
|---|---|
| react | 19.3.1 |
| react-dom | 19.3.1 |
| react-router-dom | 7.18.5 |

| Development | Version |
|---|---|
| vite | 8.3.6 |
| @vitejs/plugin-react | 6.2.1 |
| tailwindcss | 4.3.4 |
| @tailwindcss/vite | 4.3.4 |
| typescript | 5.9.3 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |
| @types/node | 24.19.2 |
| eslint | 10.14.0 |
| @eslint/js | 10.0.1 |
| typescript-eslint | 8.72.1 |
| eslint-plugin-react-hooks | 7.1.1 |
| eslint-plugin-react-refresh | 0.5.7 |
| globals | 17.14.0 |
| prettier | 3.9.10 |
| @playwright/test | 1.64.1 |

Required tooling transitives, including Zod/Babel/jiti, were separately approved before installation. No direct Zod dependency or application integration was added. TypeScript 5.9.3 and ESLint 10.14.0 retain the audited compatibility choices.

Reviewed lockfile SHA-256: `a23ea278ecd876fbe5f7033c250e6eac0ee6b0380312b40a8982e574cf334b43`, unchanged after installation and final verification. Its 214 separately resolved artifacts matched official-registry name/version/tarball/integrity metadata; six more entries are bundled within optional Tailwind WASM packaging. See [registry evidence](../../.planning/phases/01-foundation-homepage/01-01-DEPENDENCY-VERIFICATION.json).

### Implementation and files

| Files created | Purpose |
|---|---|
| `package.json`, `package-lock.json` | Exact toolchain/dependency pins, reviewed npm graph and seven scripts |
| `tsconfig.json`, `src/vite-env.d.ts` | Strict application/test/config types and `allowJs`/`checkJs` build-script coverage |
| `eslint.config.js` | Type-aware TS rules, Hooks and Fast Refresh rules; warnings fail |
| `.prettierrc.json`, `.prettierignore`, `.gitignore` | Authored-code formatting, generated/vendor/environment exclusions |
| `vite.config.ts` | React/Tailwind integration; root-mounted client assets, source maps disabled, public directory disabled |
| `scripts/prerender.mjs` | Clean client/server builds, manifest-driven assets, static HTML generation and dev/preview entry points |
| `scripts/html.mjs` | HTML document template and replacement preserving escaped React output |
| `scripts/serve.mjs` | Vite dev rendering and local static-preview routing, status, MIME and filesystem containment |
| `src/app/AppRoutes.tsx` | Shared supplied-identity root and NotFound routes with native links |
| `src/app/staticPaths.ts` | `getStaticPaths(): string[]`, currently `['/']` |
| `src/entry-server.tsx`, `src/entry-client.tsx` | `StaticRouter`/`renderToString` and `BrowserRouter`/`hydrateRoot` using the same route tree |
| `src/styles/global.css` | Minimal dark base, responsive readable text, Tailwind layout, visible focus and 44px link height |
| `playwright.config.ts`, `tests/e2e/foundation.spec.ts` | Owned production-preview lifecycle and 20 Chromium acceptance tests |
| `tests/e2e/development.spec.ts` | Two encoded-path regressions against an owned live Vite development server, including retained-DOM hydration |

Tracking files created: `01-01-EXECUTION.md`, `01-01-DEPENDENCY-VERIFICATION.json`, `01-01-REVIEW-PACKAGE.md` and the owner-accepted `01-01-SUMMARY.md` in `.planning/phases/01-foundation-homepage/`, plus this verification report. GSD STATE/ROADMAP/PROJECT/REQUIREMENTS and validation reflect acceptance and the local-commit authorization; approved plans, handoff and specifications retain their historical instructions.

The browser shows only the supplied name, designation and real GitHub link, or an honest NotFound page. Server output has actual rendered markup; CSS is linked before hydration. Native links work without JavaScript. The publication insertion point is before Vite's builds; 01-02 will generate public data there, extend the shared routes and supply published paths. No publication pipeline or project records have been created.

For local owner review, run `npm run build` then `npm run preview` and open `http://127.0.0.1:4173/`; try `/missing` for NotFound. `npm run dev` serves the development version at `http://127.0.0.1:5173/`. Stop either foreground server with Ctrl+C. The automated test configuration owns its preview process and requires port 4173 to be free.

### Commands and actual results

Commands ran from the repository root. All listed checks were performed on 2026-11-05.

| Command/check | Actual result |
|---|---|
| `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/ --engine-strict --strict-peer-deps` | Exit 0 before installation; strict engine/peer resolution passed |
| Official-registry lockfile verification | 214/214 separately resolved artifacts matched, all 19 direct audited pins/integrities matched |
| `npm ci --registry=https://registry.npmjs.org/ --engine-strict --strict-peer-deps` | Exit 0; 179 packages added using reviewed lock; hash unchanged |
| `npm ls --depth=0` | Exit 0 after install and at final verification; 19 valid direct pins, no invalid/extraneous direct dependencies |
| `npx --no-install playwright install chromium` | Exit 0; browser versions above |
| `npm run typecheck` | Exit 0 after both review fixes; strict TypeScript, including `.mjs` build scripts and both test files |
| `npm run lint` | Exit 0 after both review fixes; zero warnings |
| `npm run format:check` | Exit 0 after both review fixes; all covered files formatted |
| `npm run build` | Exit 0 after both review fixes; one prerendered route, 404 document and hashed JS/CSS; server bundle outside `dist` |
| `npm run test:e2e -- --project=chromium` | **22 passed (7.5s)** after both review fixes and rebuild: 20 foundation + 2 development; zero failures/skips |
| Earlier foundation suite after hydration mutation was restored | **16 passed (3.5s)** before review regressions were added |
| `node scripts/prerender.mjs dev` (entry invoked by `npm run dev`) | Owned smoke passed raw root/404, CSS, hydration/client routing, native home navigation, refresh, no-JS, zero browser errors; process closed |
| Stale-output/repeat-build probe | Both `dist` and `.generated` sentinels removed; all four deployed files and server bundle byte-identical across consecutive builds |
| `npm audit --omit=dev --registry=https://registry.npmjs.org/` | Exit 0, **zero production vulnerabilities**, after installation and at pre-review verification |
| `npm audit --registry=https://registry.npmjs.org/` | Exit 1, **10 moderate affected-package entries**, zero high/critical, after installation and at pre-review verification; same approved advisory |
| Post-review lockfile/portrait hashes, manifest comparison and repository identity | Both original hashes match; all 19 direct pins match reviewed lock root; branch was unborn `main` at review handoff; original origin unchanged |
| Acceptance pre-commit strict checks and build | `typecheck`, `lint`, `format:check`, `build`: exit 0 |
| Acceptance pre-commit `npm run test:e2e -- --project=chromium` | **22 passed (6.0s)**; zero failures/skips |

Test-first evidence: the initial tracer failed on absent static HTML, HTTP/no-JS checks failed before preview handling, and the hydration case failed before client hydration existed. The expanded 16-test suite passed against the completed tracer. A deliberate temporary change to client-only `createRoot(...).render(...)` failed the retained-original-DOM assertion, proving that working client routing alone cannot pass this hydration test. Restoring `hydrateRoot` and rebuilding passed the suite.

The first strict typecheck caught nullable-path capture in hoisted handlers; local arrow closures fixed it. Initial formatting findings were corrected. Two one-off verification probes needed harness-only corrections (ANSI startup detection and shell escaping); the corrected probes passed. None is an unresolved application failure.

### Final code review and resolution

The completed read-only review found no critical issue, one important defect and one related minor defect. Its verdict was **ready with fixes**. Both fixes below were then implemented and verified by the executor; no second independent review is claimed.

| Finding | Correction | Regression evidence and disposition |
|---|---|---|
| **Important:** Windows filesystem aliases could serve homepage HTML with HTTP 200 at `/INDEX.html` or `/index.html/`, followed by React hydration error #418. `/404.HTML` also incorrectly returned 200. | `scripts/serve.mjs:94-102` compares the requested public file path to its canonical `realpath` spelling and rejects aliases with 404. HTML-extension classification is case-insensitive, so these responses contain NotFound HTML. The canonical `/index.html` redirect remains. | Four cases in `tests/e2e/foundation.spec.ts:277-306` cover `/INDEX.html`, `/index.html/`, `/404.HTML`, `/404.html/`: GET/HEAD 404, empty HEAD body, static NotFound, client routing and no hydration errors. **Resolved.** |
| **Minor:** Development SSR decoded `/%3Ffoo` and `/%23foo` before routing, turning path characters into query/fragment syntax and serving homepage markup under HTTP 404. | `scripts/serve.mjs:9-21,153-167` keeps the original encoded `routerPath` separate from the decoded filesystem `pathname`; SSR and HTML transformation receive `routerPath`. | Both cases in `tests/e2e/development.spec.ts` pass against a live Vite server: raw NotFound markup/404, visible heading while scripts are delayed, original DOM retained, client navigation works, and no hydration errors. **Resolved.** |

Regression sequence:

1. `npm run test:e2e -- --project=chromium --grep "filesystem alias|encoded delimiter"`: **6 failed** before fixes. Four alias cases failed the 404 assertion; both development cases failed the pre-JS NotFound heading assertion.
2. After alias correction, `npm run test:e2e -- tests/e2e/foundation.spec.ts --project=chromium --grep "filesystem alias|index aliases"`: **5 passed (4.0s)**, including the existing canonical redirect/HEAD case.
3. After encoded-path correction, `npm run test:e2e -- tests/e2e/development.spec.ts --project=chromium`: **2 passed (4.5s)**.
4. Formatting, strict type/lint/format checks and production rebuild passed; the final combined run passed **22/22 (7.5s)** with no skipped checks.

The review's live-development-browser uncertainty is resolved by the new browser tests. Filesystem alias verification remains Windows-only; other operating systems and actual deployment are unverified. Final changes are limited to serving code, regression tests and reporting. Dependencies were neither reinstalled nor changed; the previously recorded audit remains the accepted dependency evidence, with the reviewed lock digest reconfirmed after the fixes.

### Browser and resilience coverage

- Raw generated/HTTP HTML contains the exact supplied identity and GitHub URL before JS.
- JavaScript-disabled root supports native GitHub navigation; the external destination is locally fulfilled in the test, so the test proves navigation, not live GitHub availability.
- Delayed-script hydration retains the original `<main>`, responds to a client history change, and reports zero page/console hydration errors.
- Root direct load and refresh return 200; `/missing` and `/projects/not-published/` return static NotFound with 404, refresh correctly, and have usable native home links.
- Aborted client JS leaves the supplied identity and native GitHub destination visible. No-JS NotFound can return home.
- At 320px with JS enabled and disabled: no horizontal overflow, Tailwind padding is active, keyboard focus is visible, and link height is at least 44px.
- Emitted JS/CSS return successful responses with correct MIME; missing assets return text 404 rather than HTML success.
- Raw traversal, encoded traversal, private-source paths, malformed encodings, Windows drive/ADS forms and double-leading-slash requests return 400/404 without repository contents.
- Deployment inventory contains only the intended HTML and hashed JS/CSS; no source maps, server bundle, raw content, credentials or frontend environment configuration were added.
- React-escaped script-like text and literal replacement markers remain text.
- `/index.html?from=test` redirects to `/?from=test`; HEAD returns correct metadata with no response body.
- Four noncanonical Windows HTML aliases return static/hydrated NotFound with HTTP 404, including HEAD, without hydration errors.
- Live development requests containing encoded `?` or `#` retain NotFound DOM through hydration and respond to client routing.

Additional Chromium visual checks at **320×640** and **1440×900**, with/without JS, found no horizontal overflow and identical main/heading geometry across static/hydrated states. Keyboard focus and narrow NotFound were visually inspected. Screenshots were captured under ignored `test-results/01-01-visual/`; subsequent Playwright runs can clear them, so retained screenshot files are not claimed. These historical visual observations precede the serving-only fixes; the final suite reran the automated 320px checks. This is basic foundation review, not the deferred antislop audit.

Firefox, WebKit, physical mobile/Safari, screen-reader testing, axe, full zoom/reflow matrix, Lighthouse and field performance were not performed in 01-01. Their phase-wide checks remain assigned to later milestones.

### Production artifacts and measured bytes

Exact deployment file list:

```text
dist/index.html
dist/404.html
dist/assets/entry-client-B4Tx4OJP.js
dist/assets/entry-client-CBxfn7uw.css
```

| Artifact | Bytes | Gzip bytes (Node `gzipSync`, defaults) |
|---|---:|---:|
| `index.html` | 607 | 389 |
| `404.html` | 574 | 377 |
| `entry-client-B4Tx4OJP.js` | 257,598 | 80,978 |
| `entry-client-CBxfn7uw.css` | 5,050 | 1,726 |

JS is approximately **79.08 KiB gzip**, CSS **1.69 KiB gzip**, within the planned 200/30 KiB budgets for this small tracer. These are build-artifact measurements, not final homepage or network-transfer scores. Vite's own build summary reports roughly 81.85 kB JS gzip and 1.73 kB CSS gzip; the table explicitly uses Node gzip defaults.

`.generated/server/entry-server.js` is 1,463 bytes and is not deployable. The intermediate Vite manifest is removed after HTML generation.

### Accepted dependency advisory

**Moderate:** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), **CVE-2026-118764**. Installed `minimatch@10.2.6` can amplify attacker-controlled glob patterns during preprocessing at `optimizationLevel >= 2`, causing CPU/memory exhaustion. The reported affected range is `>=7.0.0 <11.0.1`; the advisory's first patched release is **11.0.1**.

Development-only paths:

- `eslint@10.14.0 → minimatch@10.2.6`
- `eslint@10.14.0 → @eslint/config-array@0.23.5 → minimatch@10.2.6`
- `typescript-eslint@8.72.1 → @typescript-eslint/typescript-estree@8.72.1 → minimatch@10.2.6`, also through parser, eslint-plugin, utils and type-utils paths.
- `@eslint/js@10.0.1` is affected through its ESLint peer.

These explain the 10 affected-package entries; they are not 10 independent vulnerabilities. The patched major is outside the current parents' 10.x ranges. npm suggests an ESLint 9.39.5 downgrade, contrary to the approved pins. The owner accepted the current graph for 01-01. No audit fix, override, downgrade or forced upgrade was applied. No high/critical finding or unexpected graph change appeared.

### Static-host contract and remaining risks

Deploy **only `dist/`**. Current paths are origin-root-relative (`/assets/...`, `/`); hosting under `/portfolio/` would require a separately configured/tested base path. The repository URL does not establish a deployment origin.

A selected static host must:

1. Serve the generated `/index.html` at `/`, and later each published directory's `index.html` at its direct URL.
2. Use the generated `404.html` as the body of unknown-page responses with a **real HTTP 404**, preserving the requested URL. A catch-all homepage rewrite with status 200 is unsuitable and can mismatch the hydrated route tree.
3. Return 404 for missing JS/CSS/assets, not an HTML success fallback; serve existing assets with their correct MIME types.
4. Apply the chosen index/trailing-slash redirects consistently with future published routes. Local preview redirects `/index.html` to `/` while preserving the query and rejects noncanonical filesystem aliases with 404.

The local preview implements these behaviors for the current output; it is a verification server, not a deployed backend. Host configuration and live status/refresh checks await the real host. No canonical origin, sitemap origin, deployment or public status-code claim is invented.

The only approved source image remains `content/media/profile/profile.jpg`, 432,925 bytes, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`. It is unchanged, unmoved and absent from this milestone's output.

### Scope, deviations and handoff

01-01 follows the approved architecture with these recorded implementation rulings:

1. Playwright owns preview from Task 1; Chromium-only follows the detailed handoff. Cost if wrong: earlier configuration than the broad task ordering, with no runtime impact.
2. GSD ledger/current-file review replace commit-range helpers because the owner requires the unborn `main` checkout and no commits/worktree. Cost if wrong: no commit-range evidence until commits are authorized.
3. Acceptance SUMMARY and completed roadmap check were deferred until owner approval, then finalized on 2026-11-05. Cost: summary-based automated progress remained pending during review despite verified code.
4. `StaticRouter` comes from the verified direct `react-router-dom` re-export. Cost if wrong: a future re-export change would fail type/build checks.
5. `getStaticPaths` lives in `src/app/staticPaths.ts`, re-exported by the server entry, keeping the route component Fast Refresh-compatible. Cost if wrong: one extra source file.
6. Script-owned HTML uses separate small template/serving modules and Vite-owned dev/preview lifecycle. Cost if wrong: three scripts instead of one; the handoff supersedes the earlier root-template convention.
7. Vite 8 uses `rolldownOptions` rather than the legacy `rollupOptions` spelling. Cost if wrong: an unsupported API would fail config/build validation; installed-version builds passed.
8. Reject filesystem aliases instead of accepting alternate HTML paths, while preserving the canonical index redirect; pass original encoded path components to development SSR. Cost if wrong: callers using noncanonical file spellings receive 404 and the real host must implement a consistent policy. Six regression cases verify the reviewed local defects.

Full [execution ledger](../../.planning/phases/01-foundation-homepage/01-01-EXECUTION.md) and [review package](../../.planning/phases/01-foundation-homepage/01-01-REVIEW-PACKAGE.md) retain context.

The owner has accepted 01-01. 01-02 can build on the verified foundation only after separate explicit execution authorization. It still owns Zod application integration, Vitest, validated public projection, build-before-bundle generation, project records and actual detail routes. Exactly Saklolo161, BistroBuddies App, BistroBuddies Promo Website and ERP Quotation Migrator remain the approved future project scope; ReadyMama is excluded. No project facts or media were fabricated. Detailed homepage/profile card/constellation/loader/cards, GitHub API, assistant and backend remain outside 01-01.
