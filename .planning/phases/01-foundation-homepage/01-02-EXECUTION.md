# SDD ledger: .planning/phases/01-foundation-homepage/01-02-PLAN.md

Status: 01-02 execution authorized 2026-11-06 and owner-accepted the same day. Base: `a38cafb5416a0f8d5d98a774917b91643c5ed621`, accepted 01-01, clean `main` tracking `origin/main`. One local acceptance commit authorized; no push or 01-03 authorization.

## Pre-flight and rulings

- Task 1 -> Task 2: complete strict schema consumes the four approved preliminary records; no unsupported fields are inferred.
- Task 1 -> Task 3: generated manifest/media, selectors and shared renderer feed isolated actual-build and browser checks. Generated data must exist before bundling and typechecking application imports.
- Ruling: the owner's current authorization supersedes the plan's historical execution-gated paragraph and no-new-install threat-register wording. Install only audited `zod@4.6.7` and `vitest@5.1.0` as direct development dependencies, verifying the lock delta first. Cost if wrong: additional dev-only graph; stop on unexpected changes or high/critical findings.
- Ruling: add `test` in 01-02, correcting its interface paragraph's claim that 01-01 declared it. The accepted foundation intentionally deferred Vitest/test. Cost if wrong: none beyond the approved new command.
- Ruling: retain existing `main` and record execution in this GSD ledger, following locked D-01 and owner instructions. No worktree or commit-based task helpers. Cost if wrong: review uses the working-tree diff against the accepted base rather than per-task commits.
- Ruling: use Node 24 native TypeScript stripping for build-only scripts with erasable TS and explicit `.ts` imports; no unapproved runner dependency. Cost if wrong: strict type/runtime checks will fail and require adjustment within the approved toolchain.
- Ruling: reuse the approved static-first dark base for semantic listings/detail pages. No new design system or final homepage styling. Antislop audit remains assigned to 01-05 per owner decision. Cost if wrong: preliminary layout only, as scoped.

## Dependency gate

- Exact registry metadata for Zod 4.6.7 and Vitest 5.1.0 matches the approved SHA-512 values; official repositories, MIT licenses, no deprecation returned. Vitest Node/Vite peers match Node 24.21 and Vite 8.3.6. Zod is already a locked tooling transitive; make it an explicit build dependency.
- Lock delta: 15 Vitest graph records added, all 220 existing package records and 19 pins unchanged; each addition's name/version/tarball/integrity independently matched official registry metadata, no deprecated packages or new install scripts. Lock SHA-256 `bb021167622e8b05a5cb53dd42ae8384824447cfe1ffcd37f80e0ff3306419ed`.
- Strict lock-only resolution and `npm ci` passed (194 installed packages). Audits at the gate: production 0, full 10 moderate affected-package entries for the same minimatch advisory, 0 high/critical. No upgrades or overrides.

## Tasks

- Task 1: tracer/schema slice passed 30 tests (13.69s); initial records intentionally not selected until Task 2. RED tracer showed absent project link in actual production HTML; generator command initially absent. Schema suite caught refined-Zod `.omit()` construction and invalid-URL refinement exceptions; separated field shapes from relational author validation and guarded URL parsing. Safe media validation, public projection and full-field rendering fixture now pass.
- Task 2: 31/31 schema/tracer/initial-record tests passed (13.14s). Four exact preliminary records validate and build into root plus four readable project routes, with 404. No unsupported facts or media added.
- Task 3: 7/7 original artifact checks passed (11.71s), including two real consecutive builds, contamination positive controls, graph exclusion, invalid-before-bundle, cleanup safety, and selectors. Pre-review content suite passed 39/39 (12.73s), including the added profile-copy/tamper assertion. Pre-review Chromium suite passed 33/33 (10.2s), zero skipped, including all 01-01 regressions.
- Implementation corrections: pre-Vite development boundary; generated-media MIME serving; workspace-local optimizer cache with explicit entry scan; prehydration image failure fallback; no ES2023 library requirement. Runtime red failures and their fixes are documented in `docs/verification/01-02.md`.
- Final review: one fresh-context read-only reviewer dispatched against the accepted base plus working-tree/untracked changes. It completed with five Important, two Minor and no Critical findings. All seven were corrected and covered by `tests/content/review-regressions.test.ts`, which failed before each fix and passed after it.
- Correction R1: development previously exempted every `/@id/` request. All `/@id/` paths now return 404 because the app needs no virtual modules.
- Correction R2/R3: replaced the hand-selected private-string scan with a complete `dist` inventory/byte comparison against an isolated public-only reference build. This catches nested draft prose and non-owner evidence without rejecting legitimate UI-text collisions.
- Correction R4: added the exact `getStaticPaths()` gate in `src/app/AppRoutes.tsx`, rejected percent-encoded aliases in preview, and returned 404 for noncanonical aliases in development.
- Correction R5: full PNG CRC/IEND and JPEG frame/scan/EOI validation, 32 MiB/40 MP limits, extension matching and an offline pinned-Chromium decode.
- Correction R6: DNS labels now require 1-63 characters, no boundary hyphens, and a 253-character host maximum.
- Correction R7: `checkedAt` later than the current UTC calendar date is rejected.
- Correction side effects: the test-only PNG had an invalid IDAT checksum and was corrected; fixtures now force `NODE_ENV=production` because Vitest's inherited environment produced development JSX with temporary absolute paths.
- Acceptance re-verification after corrections: 54/54 Vitest (54.44s), 39/39 Chromium (13.3s), typecheck, lint, format, build, artifact checker and production audit (zero vulnerabilities) pass. The focused second review of the corrections could not start because the provider rejected it on quota; no second independent review is claimed. See [verification](../../../docs/verification/01-02.md).
- Owner acceptance: 2026-11-06. Acceptance is based on the completed review, correction of all seven findings, regression coverage and passing verification. It explicitly acknowledges the missing second independent review. One local conventional commit is authorized for this milestone; no push or 01-03 execution.
