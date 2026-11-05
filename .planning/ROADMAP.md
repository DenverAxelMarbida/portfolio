# Roadmap: Denver.dev

Status: Phase 1 scope approved; 01-01 implementation, final review corrections and verification complete (22 Chromium checks passed). Owner accepted 01-01 and authorized its local commit on 2026-11-05. Pushes and later milestone execution await separate authorization. Preserve the owner's five-phase scope.

## Phases

- [ ] **Phase 1: Foundation and homepage**: Establish architecture, content publishing, visual system, accessible motion and an evidence-aware homepage.
- [ ] **Phase 2: Verified case studies**: Complete case studies, demos, APK links and engineering evidence.
- [ ] **Phase 3: GitHub integration**: Add repository metadata, commits and pull request exploration.
- [ ] **Phase 4: Evidence-backed assistant**: Add published-content search, hybrid RAG and live GitHub retrieval.
- [ ] **Phase 5: Production readiness**: Harden, optimize, audit and verify deployment.

## Phase Details

### Phase 1: Foundation and homepage

**Goal:** Visitors can understand Denver's positioning, inspect honest preliminary projects and contact him through a fast, accessible, animated portfolio.
**Depends on:** 01-01 authorization recorded in STATE; exact dependency and lockfile verification before installation; owner review between milestones.
**UI hint:** yes
**Requirements:** FOUND-01, FOUND-02, HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05, MOTION-01, MOTION-02, MOTION-03, MOTION-04, MOTION-05, QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07

**Success Criteria:**
1. Homepage communicates the supplied identity and supports keyboard, mobile and reduced-motion use.
2. Exactly four preliminary project previews and detail shells render from validated content; ReadyMama does not appear anywhere in public build output.
3. The supplied `profile.jpg` is displayed unchanged; no technical or outcome claims are fabricated.
4. Loader and ambient animation never prevent reading or interaction; published pages contain readable HTML before JavaScript.
5. Checks, build, browser validation and authoring documentation provide reproducible evidence.

**Plans:** Five sequential milestones, exact task plans in `phases/01-foundation-homepage/`.

- [x] 01-01-PLAN.md: Foundation and first rendered slice: locally verified, both review findings resolved, owner accepted 2026-11-05. See [acceptance SUMMARY](phases/01-foundation-homepage/01-01-SUMMARY.md), [execution](phases/01-foundation-homepage/01-01-EXECUTION.md) and [verification](../docs/verification/phase-1.md). Local commit authorized; no push or automatic advancement.
- [ ] 01-02-PLAN.md: Validated project publishing
- [ ] 01-03-PLAN.md: Responsive identity and homepage
- [ ] 01-04-PLAN.md: Accessible motion
- [ ] 01-05-PLAN.md: Quality gates and documentation

**Dependency order:** 01-01 → 01-02 → 01-03 → 01-04 → 01-05. Each milestone delivers a verifiable slice and is reviewed before the next begins.

### Phase 2: Verified case studies

**Goal:** Visitors can inspect supported problems, solutions, contributions and outcomes with source links.
**Depends on:** Phase 1 and owner-provided/verified project evidence.
**Requirements:** CASE-01
**Success Criteria:** Full published case studies cite evidence; valid demos/APKs are reachable; unverified claims remain absent; drafts remain excluded.

### Phase 3: GitHub integration

**Goal:** Visitors can explore repository metadata, relevant commits and pull requests.
**Depends on:** Phase 2 and confirmed repository mappings.
**Requirements:** GH-01
**Success Criteria:** Sources and freshness are visible; rate-limit, unavailable and error states work; credentials stay server-side when needed; baseline content survives API failure.

### Phase 4: Evidence-backed assistant

**Goal:** Visitors can search published knowledge and receive source-backed answers.
**Depends on:** Phases 2 and 3, a separate architecture/evaluation plan and free-tier feasibility review.
**Requirements:** AI-01
**Success Criteria:** Retrieval indexes only approved published content; responses cite evidence and acknowledge unknowns; live retrieval has boundaries, evaluation and abuse controls.

### Phase 5: Production readiness

**Goal:** Verify the deployed site meets release requirements on its real host.
**Depends on:** Completed agreed product scope and confirmed hosting origin.
**Requirements:** RELEASE-01
**Success Criteria:** Real-host routes, headers, accessibility, performance and failure handling are measured; release and rollback instructions are verified.
