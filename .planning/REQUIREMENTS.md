# Requirements: Denver.dev

Defined: 2026-11-05. Status: 01-01 foundation owner-accepted and committed. 01-02 owner-accepted 2026-11-06 after independent review and correction of its five Important and two Minor findings. One local acceptance commit is authorized; no push or 01-03 execution.

## Phase 1 requirements

### Foundation

- [x] **FOUND-01**: Maintainer can develop and build the specified React/TypeScript/Vite stack in the existing clone with strict types, ESLint, Prettier, documented Node version and a committed dependency lockfile after approval.
- [ ] **FOUND-02**: Homepage and published preliminary project detail URLs render meaningful static HTML, then hydrate interactively without errors; direct links and unknown routes behave predictably.

### Homepage and identity

- [ ] **HOME-01**: Visitor can use responsive navigation, skip link, and real section anchors with visible keyboard focus.
- [ ] **HOME-02**: Hero presents Denver's name, professional title, supplied headline/introduction, project anchor and GitHub link.
- [ ] **HOME-03**: Hanging ID card displays the supplied original `profile.jpg` unchanged; CSS sizing, positioning and non-destructive cropping are allowed, but no retouching, recoloring, filters, or generated substitute. Mobile placement never overlaps text.
- [ ] **HOME-04**: Engineering overview describes qualitative work areas without invented counts, employment history, or experience claims.
- [ ] **HOME-05**: Featured section shows four owner-authorized preliminary previews with problem-oriented editorial headlines and honest asset/evidence states.
- [ ] **HOME-06**: Capabilities and technologies distinguish stated development approach and this portfolio's stack from project-specific technologies requiring verification.
- [ ] **HOME-07**: Agentic workflow explains understanding, planning, assisted implementation, human review, testing and evidence recording without invented tools or achievements.
- [ ] **HOME-08**: Contact footer exposes working email and GitHub links; any upcoming-assistant note is plain labeled text, not a fake chat control.

### Content architecture

- [x] **CONTENT-01**: Maintainer can add a project through a schema-validated file without changing card or detail components; all requested content fields are supported.
- [x] **CONTENT-02**: Content pipeline rejects invalid slugs, duplicate IDs, invalid links and evidence-free verified outcomes before build output is produced.
- [x] **CONTENT-03**: Draft entries, their media, and author-only fields are absent from generated public data, HTML, JavaScript, source maps, navigation and sitemap; future indexing must consume this same public projection.
- [x] **CONTENT-04**: Exactly four projects have structured source entries — Saklolo161, BistroBuddies App, BistroBuddies Promo Website, ERP Quotation Migrator — all explicitly preliminary; ReadyMama has no record, preview, route or navigation entry; no project completion status or implementation detail is invented.
- [x] **CONTENT-05**: Reusable preliminary project detail pages show available information, intended-outcome labeling and missing-evidence states; unavailable demos/APKs/repositories produce no dead controls.

### Animation

- [ ] **MOTION-01**: Minimal initial wordmark/symbol loader only reflects real startup work, introduces no minimum delay and never traps or obscures usable content indefinitely.
- [ ] **MOTION-02**: Decorative constellation is subtle, bounded, paused offscreen/in background, and efficient on mobile.
- [ ] **MOTION-03**: Hero text/CTA entrance and hanging-card pendulum movement are restrained; pointer response is bounded and optional.
- [ ] **MOTION-04**: Project elevation, supplied-image transitions, anchor navigation and one-time section reveals have meaningful keyboard/touch equivalents.
- [ ] **MOTION-05**: Reduced motion and a visible animation-pause control disable ambient motion; content is readable without animation and with JavaScript disabled.

### Quality and maintainability

- [ ] **QUAL-01**: Layout supports 320px through wide desktop, 200% zoom and reflow testing, with no horizontal overflow or obscured focus; controls target at least 44x44 CSS pixels.
- [ ] **QUAL-02**: Semantic HTML, meaningful image descriptions, accessible menu controls, contrast, keyboard interaction and reduced-motion behavior pass automated and manual checks.
- [ ] **QUAL-03**: Static pages provide accurate title/description, share metadata and structured identity data; canonical/sitemap origin is configured from the real host, never inferred from Denver.dev.
- [ ] **QUAL-04**: Production build is measured against stated performance budgets; decoration is isolated from the critical rendering path and mobile motion cost is recorded.
- [ ] **QUAL-05**: Tests verify content rejection, publication boundaries, mobile navigation, motion controls, direct routes and fallback behavior; lint, formatting, typecheck and production build pass.
- [ ] **QUAL-06**: README, contribution guide and project-authoring guide document setup, checks, evidence requirements, media rules and publication workflow.
- [ ] **QUAL-07**: Static output contains no credentials; no secret is placed in frontend configuration; content renders as escaped text with validated URLs.

## Future requirements

| ID | Phase | Scope |
|---|---|---|
| CASE-01 | 2 | Verified full case studies, contributions, architecture, screenshots, demos/APKs and repository evidence |
| GH-01 | 3 | Repository metadata, commit exploration and pull request history with rate-limit/error states |
| AI-01 | 4 | Evidence-backed hybrid RAG, searchable published knowledge and live GitHub retrieval |
| RELEASE-01 | 5 | Production hardening, optimization, accessibility review and real-host deployment verification |

## Explicit exclusions

No invented outcomes, metrics, screenshots or personal details. No red-dominant theme, excessive gradients, neon, glassmorphism or decorative dashboard. No generated, retouched, recolored, filtered or substituted portrait. No paid services, database, authentication, CMS, live GitHub fetching, vector store or functional chatbot in Phase 1.

## Traceability

Every Phase 1 ID belongs to Phase 1; milestone ownership is below. FOUND-01 is accepted in the committed foundation. The owner accepted 01-02 on 2026-11-06, completing CONTENT-01 through CONTENT-05. Automated evidence includes 54 Vitest checks and 39 Chromium checks; the independent review found five Important and two Minor issues, all corrected with red-to-green regressions. Acceptance records that a focused second review could not start because the provider rejected it on quota. FOUND-02's homepage portion and the remaining QUAL-07 boundaries stay open for later milestones. See `docs/verification/01-02.md`; 01-03 has not started.

| Milestone | Requirements |
|---|---|
| 01-01 Foundation and first rendered slice | FOUND-01, FOUND-02, QUAL-07 |
| 01-02 Validated project publishing | CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05 |
| 01-03 Responsive identity and homepage | HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, QUAL-01, QUAL-02 |
| 01-04 Accessible motion | MOTION-01, MOTION-02, MOTION-03, MOTION-04, MOTION-05 |
| 01-05 Quality gates and documentation | QUAL-03, QUAL-04, QUAL-05, QUAL-06 |

Coverage target: 27 Phase 1 requirements, each assigned to a primary milestone. Cross-cutting quality criteria also apply to earlier milestones.
