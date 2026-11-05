# 01-01 implementation handoff

Status: **EXECUTION AUTHORIZED, 2026-11-05.** The owner authorized 01-01 implementation and its audited dependencies subject to verification and lockfile-first inspection. Preserve the scope below. Commits, pushes, and 01-02 require separate approval; execution evidence goes in `01-01-EXECUTION.md` before owner acceptance.

Implementation agent: use this handoff plus the source documents below. Do not restart requirements gathering or re-plan the product.

## Read first

1. `01-01-PLAN.md` — task authority and threat model.
2. `01-PACKAGE-AUDIT.md` — exact pins, compatibility decisions, install boundary.
3. `01-UI-SPEC.md` — only the tokens and static-visibility rules needed by the tracer.
4. `01-VALIDATION.md` — acceptance commands and failure direction.
5. `docs/superpowers/specs/2026-11-05-phase-1-design.md` — architecture and publication seam.

## Goal and boundary

Prove one real path: **meaningful static HTML → hydration of the same route tree → direct/refresh route behavior → unknown-path 404**. Include the supplied identity and a genuine GitHub link. No project content, no homepage sections, no portrait, no loader, no constellation, no motion.

This milestone must establish the seam that 01-02 extends to project detail URLs. It must work on free static hosting: `dist/index.html`, `dist/404.html`, hashed JS/CSS, and selected assets only.

## Environment and repository

- Repo: `D:\VScode codes\portfolio`
- Remote: `https://github.com/DenverAxelMarbida/portfolio.git`
- Branch: local `main` is currently unborn. Do not initialize another repository, replace the remote, rewrite history, or create a worktree unless the owner authorizes it.
- Node `24.21.0`, npm `11.19.0`. Do not use Node 26.
- Approved original photo (for 01-03, not this milestone): `content/media/profile/profile.jpg`, 1872×1848 JPEG, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`.
- Do not modify or optimize that photo in 01-01.

## Dependencies

Install **only** these after the audit and implementation are approved. Exact pins; no `^`, `latest`, `--force`, or `--legacy-peer-deps`.

Runtime: `react@19.3.1`, `react-dom@19.3.1`, `react-router-dom@7.18.5`.

Development: `vite@8.3.6`, `@vitejs/plugin-react@6.2.1`, `tailwindcss@4.3.4`, `@tailwindcss/vite@4.3.4`, `typescript@5.9.3`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `@types/node@24.19.2`, `eslint@10.14.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.1`, `eslint-plugin-react-hooks@7.1.1`, `eslint-plugin-react-refresh@0.5.7`, `globals@17.14.0`, `prettier@3.9.10`, `@playwright/test@1.64.1`.

Do **not** add direct dependencies/application integrations in 01-01 for `zod`, `vitest`, `motion`, `lucide-react`, `@axe-core/playwright`, or `eslint-plugin-jsx-a11y`. Owner clarification on 2026-11-05 approves required tooling transitives, including Zod/Babel/jiti, while preserving the 19 direct pins; see `01-01-EXECUTION.md`.

Exact install sequence after approval:

```bash
npm install --package-lock-only --ignore-scripts
# inspect package-lock.json: exact pins, registry.npmjs.org URLs, integrity, no unexpected packages
npm ci
npm ls --depth=0
npx playwright install chromium
```

Do not use `npm create vite`. Create the small tree manually.

## Expected tree for this milestone

```text
package.json
package-lock.json
tsconfig.json
vite.config.ts
playwright.config.ts
eslint.config.js
.prettierrc.json
.prettierignore
.gitignore
scripts/
  prerender.mjs
src/
  app/AppRoutes.tsx
  entry-client.tsx
  entry-server.tsx
  styles/global.css
  vite-env.d.ts
tests/
  e2e/foundation.spec.ts
dist/                  # generated, ignored
.generated/            # generated, ignored
```

`src/pages/`, project components, content records, and motion components belong to later milestones.

## Task 1 — Runnable static-to-hydrated tracer

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `scripts/prerender.mjs`, `src/app/AppRoutes.tsx`, `src/entry-client.tsx`, `src/entry-server.tsx`, `src/styles/global.css`, `src/vite-env.d.ts`, `tests/e2e/foundation.spec.ts`.

1. Create `package.json` with the exact dependency set, `engines.node` `>=24.21.0 <25`, `engines.npm` `>=11.19.0`, `packageManager` `npm@11.19.0`, `private: true`, and scripts:
   ```json
   {
     "dev": "node scripts/prerender.mjs dev",
     "build": "node scripts/prerender.mjs build",
     "preview": "node scripts/prerender.mjs preview",
     "lint": "eslint . --max-warnings=0",
     "format:check": "prettier --check .",
     "typecheck": "tsc --noEmit",
     "test:e2e": "playwright test"
   }
   ```
   Do not add a `test` script yet; 01-02 adds Vitest and its first unit tests.
2. Create strict `tsconfig.json` covering `src`, `scripts`, `tests`, `vite.config.ts`, and `playwright.config.ts`; `allowJs` + `checkJs` for the `.mjs` build script; `jsx: react-jsx`; `moduleResolution: Bundler`; `noEmit`; `strict`; `noUncheckedIndexedAccess`; `exactOptionalPropertyTypes`.
3. Create `vite.config.ts` with `@vitejs/plugin-react` and `@tailwindcss/vite`. Set browser build `outDir: 'dist'`, `sourcemap: false`, `manifest: true`. Do not use a legacy Tailwind PostCSS setup.
4. Create `src/app/AppRoutes.tsx` with one shared route tree:
   - `/` renders the supplied name `Denver Axel Marbida`, designation `Agentic Full-Stack Software Developer`, and a native link to `https://github.com/DenverAxelMarbida`.
   - `*` renders a plain NotFound with a native home link.
   - Export `getStaticPaths(): string[]` returning `['/']` initially.
   - Do not invent introductory prose, projects, dates, roles, or metrics. The exact introduction is a 01-03 concern.
5. Create `src/entry-server.tsx`: `renderToString` with `StaticRouter` from `react-router` and the shared `AppRoutes`. No browser APIs, random values, storage, or effects may affect server output.
6. Create `src/entry-client.tsx`: `hydrateRoot` on `#root` with `BrowserRouter` and the same `AppRoutes`. Use the same initial route/content; do not replace static markup with a client-only render.
7. Create `src/styles/global.css` with only a minimal dark base and readable focus. Full tokens and typography belong to 01-03. Import it through the client entry so Vite emits CSS.
8. Create `scripts/prerender.mjs` with `build`, `dev`, and `preview` modes using Vite's programmatic API:
   - Build the browser entry to `dist` with an explicit `rollupOptions.input` of `src/entry-client.tsx` (there is no `index.html` file; the script owns the template).
   - Build the server entry to `.generated/server` (outside `dist`) and import the emitted module with a file URL.
   - Generate `dist/index.html` and `dist/404.html` from a script-owned HTML template. Inject the emitted entry JS, imported chunks, and CSS from `dist/.vite/manifest.json`.
   - Render each `getStaticPaths()` URL with `StaticRouter`; replace a single `<!--app-html-->` marker with escaped React output.
   - `dev` uses Vite middleware mode + `ssrLoadModule` + `transformIndexHtml`; `preview` serves only `dist` with correct MIME types. Unknown non-asset paths serve `404.html` with status 404. Reject traversal and any path outside `dist`.
   - Clean `dist` and `.generated` on every production build. Never emit source maps or the server bundle into `dist`.
9. Create `playwright.config.ts` with one `chromium` project, `baseURL` `http://127.0.0.1:4173`, and a `webServer` running `npm run preview` on port 4173. Playwright owns preview start/stop.
10. Write the failing test first, then make it pass. `tests/e2e/foundation.spec.ts` must assert:
    - Raw `GET /` HTML contains the exact name, designation, and GitHub URL before JS runs.
    - A JavaScript-disabled context can read the identity and follow the GitHub link.
    - Hydration produces no `pageerror` or console error, and `#root` remains populated.
    - `GET /missing` returns 404 with the NotFound document; the home link returns to `/`.
    - A traversal-shaped request cannot read `package.json` or any path outside `dist`.
    - `dist` contains no `.map`, `.generated`, or server-bundle artifact.
11. Run `npm install --package-lock-only --ignore-scripts`, inspect the lockfile, `npm ci`, `npx playwright install chromium`, `npm run build`, then `npm run test:e2e -- tests/e2e/foundation.spec.ts --project=chromium`.

**Task 1 acceptance:** production preview serves meaningful static HTML for `/`, hydrates without mismatch, returns a real 404 for unknown paths, and keeps the identity/link usable without JS.

## Task 2 — Reproducible checks

**Files:** `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `package-lock.json`.

1. Keep strict TS coverage for app, tests, build, and config surfaces. Add `src/vite-env.d.ts` if Vite client types are missing.
2. Create a flat ESLint config using `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals`.
   - Enable type-aware recommended rules for TS/TSX.
   - `react-refresh/only-export-components` is an error, not a warning, because `--max-warnings=0`.
   - **Do not add `eslint-plugin-jsx-a11y`.** It has no ESLint 10-compatible peer. Accessibility is checked by axe/Playwright in later milestones and manual keyboard review.
   - Ignore `dist`, `.generated`, `node_modules`, `playwright-report`, `test-results`, `content`, `.planning`, and `docs`.
3. Add `.prettierrc.json` and `.prettierignore` (ignore generated/vendor output, lockfile, `.planning`, `docs`, and binary media). Keep authored source, tests, config, and `content/**/*.json` formatted.
4. Add `.gitignore` entries for `node_modules`, `dist`, `.generated`, `playwright-report`, `test-results`, and local env files. Keep `package-lock.json` trackable.
5. Verify the lockfile matches `package.json`; do not hand-author integrity values.
6. Run `npm run typecheck`, `npm run lint`, and `npm run format:check`. All must pass with zero warnings.

**Task 2 acceptance:** a fresh checkout with the reviewed lockfile can run typecheck, lint, and format checks deterministically.

## Task 3 — Direct routes, failure, and narrow layout

**Files:** `vite.config.ts`, `playwright.config.ts`, `src/styles/global.css`, `src/entry-client.tsx`, `tests/e2e/foundation.spec.ts`.

1. Confirm Tailwind v4 is active through `@tailwindcss/vite` and the CSS import; no legacy config file.
2. Add the dark base and visible focus without hiding content pending JS. Reserve layout space so static and hydrated states do not jump.
3. Harden preview path decoding, MIME types, 404 behavior, and containment checks.
4. Add tests for root refresh, unknown URL, disabled JS, failed hydration (static content remains readable), narrow 320px width, and a missing asset returning 404 rather than HTML.
5. Keep Chromium as the fast default. Firefox/WebKit smoke projects are added in 01-05, not here.
6. Re-run:
   ```bash
   npm run typecheck
   npm run lint
   npm run format:check
   npm run build
   npm run test:e2e -- tests/e2e/foundation.spec.ts --project=chromium
   npm ls --depth=0
   npm audit --omit=dev
   ```

**Task 3 acceptance:** the tracer is reviewable in static-only and hydrated modes at 320px and desktop, with no server artifact in `dist`.

## Verification record

Do not claim success without command output. Record for the milestone review:

- Node, npm, and installed direct dependency versions.
- `npm ls --depth=0` result.
- `npm audit` result, including any dev-only findings; do not auto-fix.
- Build output paths and the exact `dist` file list.
- Test counts and pass/fail output.
- Any residual limitation, especially React Router/Vite integration or static-host 404 behavior.

Do **not** create `.planning/phases/01-foundation-homepage/01-01-SUMMARY.md` until the owner approves the execution result. Do not commit without approval.

## Risks and watch items

| Risk | Mitigation |
|---|---|
| React Router v7 static rendering | Use `StaticRouter` from `react-router` and `BrowserRouter` on the client with the same `AppRoutes`; verify rendered markup before/after hydration |
| Vite 8 programmatic SSR API | Use explicit `build.ssr`, explicit client input, and `.vite/manifest.json`; do not assume a CLI-generated `index.html` |
| Hydration mismatch | No browser API, random value, date, or stored preference during render; deterministic initial state |
| Tailwind v4 integration | Use `@tailwindcss/vite` and `@import "tailwindcss"`; no PostCSS/legacy config |
| `checkJs` on `prerender.mjs` | Add JSDoc types or simplify the script boundary; do not disable strict checks silently |
| Preview path traversal | Decode once, resolve, verify the final path starts with `dist` + separator; reject `..`/encoded traversal |
| Playwright browser binary | `npx playwright install chromium` is separate from npm install; record the installed browser version |
| Same-day package releases | Exact pins, reviewed lockfile, registry integrity; see audit residual risks |
| Free-host 404 behavior | Generate `dist/404.html`; document host-specific fallback in 01-05, do not claim deployed status |

## Dependencies on later milestones

- **01-02:** adds `zod`/`vitest`, content schema, public projection, project routes, and the `test` script. Do not create project records or detail pages in 01-01.
- **01-03:** adds the exact homepage, Lucide icons, `content/profile.json`, and the approved `content/media/profile/profile.jpg` with alt text and non-destructive display.
- **01-04:** adds Motion, loader, constellation, pendulum, pause control, and reduced-motion behavior.
- **01-05:** adds axe, metadata, cross-browser checks, performance measurement, docs, and the post-implementation antislop audit.

## Stop condition

After implementing and verifying 01-01, deliver the completion report and stop for owner review. Do not commit, push, or begin 01-02 automatically.
