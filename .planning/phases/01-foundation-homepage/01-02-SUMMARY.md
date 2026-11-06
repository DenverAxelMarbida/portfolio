---
phase: 01-foundation-homepage
plan: "02"
subsystem: content
tags: [zod, json, publishing, static-rendering, vitest, playwright]
requires: [01-01]
provides:
  - Validated JSON authoring and inferred public types
  - Pre-bundle public projection and byte-preserved selected media
  - Four preliminary static and hydrated project detail routes
  - Publication artifact, unpublish, cleanup and browser regression checks
affects: [01-03, 01-05]
actuals:
  tasks: 3
  commits: 1
tech-stack:
  added: [Zod 4.6.7, Vitest 5.1.0]
  patterns: [public-only generated manifest, build-only validation, isolated actual-build fixtures]
requirements-demonstrated: [CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05, FOUND-02]
requirements-completed: [CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05]
owner-accepted: 2026-11-06
status: accepted
completed: 2026-11-06
---

# 01-02: Validated project publishing

Four authorized preliminary records travel from strict JSON validation to a public-only manifest, static detail pages and same-tree browser hydration.

## Execution and authority

The owner authorized 01-02 on 2026-11-06 after accepting and pushing foundation commit `a38cafb5416a0f8d5d98a774917b91643c5ed621`. The approved three-task plan was executed inline on the existing `main`. All changes remain uncommitted until the owner-authorized acceptance commit. No push or 01-03 work is authorized. The owner accepted this milestone on 2026-11-06 based on the completed review, correction of all seven findings, regression coverage and passing final verification, and explicitly acknowledged that the corrections did not receive a second independent review because of provider quota limits.

## Files

| Files | Purpose |
|---|---|
| `scripts/content/schema.ts`, `generate.ts`, `files.ts` | Author/profile/public schemas, evidence and URL rules, safe filesystem operations, generation and selected media |
| `scripts/check-public-artifacts.ts` | Exact manifest/media/route checks, copied-byte integrity, source-map and leakage rejection |
| `scripts/prerender.mjs`, `scripts/serve.mjs` | Pre-bundle generation, graph gate, clean builds, final scanner, development file boundary and media MIME |
| `src/content/manifest.ts`, `selectors.ts` | Generated public import and pure sorting/lookup |
| `src/app/AppRoutes.tsx`, `staticPaths.ts` | Shared preliminary listing/details, generated routes, honest missing fields/image fallback |
| `content/projects/{saklolo161,bistrobuddies-app,bistrobuddies-promo,erp-quotation-migrator}.json` | Exactly four approved published/preliminary records, unknown implementation facts |
| `tests/content/fixtures.ts`, `publishing.test.ts`, `publication-artifacts.test.ts`, `review-regressions.test.ts` | Owned temporary builds, schema rejection, positive-control publication/unpublish, contamination and cleanup tests, plus the seven review regressions |
| `tests/e2e/projects.spec.ts`, `development.spec.ts`, `foundation.spec.ts` | Real project routes, hydration/no-JS, empty/draft/media states, source boundary and retained regressions |
| `package.json`, `package-lock.json`, `vitest.config.ts`, `tsconfig.json`, `vite.config.ts` | Two approved direct additions, commands, typed Node scripts, isolated dev cache |
| `docs/project-authoring.md`, `docs/verification/01-02.md`, `docs/verification/phase-1.md` | Authoring workflow and actual verification evidence |
| `.planning/` status, package-audit, validation, execution and summary documents | Authorization, results and acceptance handoff |

## Verification

- Content check: exactly four valid records in approved order.
- Strict typecheck, lint, formatting and production build: pass.
- Vitest: **54 passed**, zero skipped (56.21s final run), including 13 review regressions.
- Chromium: **39 passed**, zero skipped (11.9s final run), including all existing foundation/development regression behaviors.
- Positive control: published fixture text and PNG exist after build one. Status-only unpublishing removes page, data, media and stale JavaScript after build two. Contaminated output/map/manifest/media are rejected.
- Human-facing routes: all four direct URLs, refresh, client transitions, retained original DOM, no-JS listing/back links; unavailable links absent; draft 404 and empty state verified.
- Post-install audits: zero production vulnerabilities, accepted 10 moderate tooling entries, zero high/critical. All 220 prior lock records and 19 prior direct pins preserved.
- Portrait unchanged: 432,925 bytes, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`.

The independent review completed with **five Important and two Minor findings, no Critical**. All seven were corrected and each has a regression observed failing before its fix and passing after. R1 closes `/@id/` exposure; R2/R3 replace selected-value scanning with a public-only reference-build inventory/byte comparison; R4 enforces exact canonical routes; R5 validates complete PNG/JPEG structure plus a pinned-Chromium decode; R6 enforces DNS label limits; R7 rejects future `checkedAt` dates. A focused second review of these corrections could not start because the provider rejected the request on quota, so no second independent review is claimed.

The owner accepted the milestone on 2026-11-06 on the basis of the completed review, the seven corrections, their regression coverage and the passing final verification. The acceptance explicitly acknowledges the outstanding caveat that the corrections were not independently reviewed a second time.

Correction side effects were also fixed: the test-only PNG checksum was corrected, and fixture builds now force `NODE_ENV=production` after Vitest's inherited environment produced development JSX with temporary absolute paths.

## Rulings and handoff

- Current authorization supersedes historical gated wording in the plan. Only direct dev `zod@4.6.7`/`vitest@5.1.0` additions were installed after lock/registry verification.
- Node 24 native TypeScript stripping avoids an extra runner. Runtime application imports schema types only. Generate content before direct type/lint checks on a fresh checkout.
- A public projection explicitly omits author fields. The artifact boundary is enforced by a complete byte/inventory comparison against a public-only reference build, not by matching a hand-maintained private-string list; the browser module gate separately enforces import provenance.
- Vite gets workspace-local generated cache and explicit browser entry scanning, preventing fixture cache collisions/reloads.
- Image attachment checks handle failures that precede hydration, alongside later `onError` handling.
- No source watching or draft preview: restart `npm run dev` after source edits. Deploy only a complete replacement of `dist/`; actual host/CDN behavior remains unverified.
- Final visual/metadata/accessibility/performance work remains in its approved later milestones. No new project facts, images, demos or APK destinations were invented.

See [verification](../../../docs/verification/01-02.md), [authoring](../../../docs/project-authoring.md) and [execution ledger](01-02-EXECUTION.md).
