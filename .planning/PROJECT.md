# Denver.dev portfolio

Status: Phase 1 planning approved with the final four-project scope. The owner accepted the verified 01-01 implementation and authorized its local conventional commit on 2026-11-05, including planning and verification documentation. Pushes and later milestone execution require separate approval.

## What This Is

A long-term personal portfolio for Denver Axel Marbida, Agentic Full-Stack Software Developer. It explains the problems his projects address, the engineering behind them, and the evidence available for those claims. The proposed audience is prospective employers, collaborators, and clients evaluating his work.

## Core Value

Help visitors understand how Denver aligns software with people's and organizations' needs, with a clear distinction between intended benefits and demonstrated results.

## Requirements

### Validated

01-01's supplied-identity static HTML, same-tree hydration, local root/NotFound behavior and strict toolchain passed local verification and were accepted by the owner on 2026-11-05. Full homepage and publication requirements remain active below. Evidence: `docs/verification/phase-1.md` and `.planning/phases/01-foundation-homepage/01-01-SUMMARY.md`.

### Active

- [ ] Accessible, responsive dark homepage with restrained, purposeful animation.
- [ ] Hanging card using the supplied original photograph, never a substitute.
- [ ] Schema-validated project content, reusable previews and detail-page template.
- [ ] Build-time exclusion of drafts and author-only information.
- [ ] Clear capabilities, agentic workflow, GitHub and email contact paths.
- [ ] Static HTML, quality checks, and maintainable authoring documentation.

### Out of Scope for Phase 1

Full case studies and verified project research belong to Phase 2. GitHub API enrichment belongs to Phase 3; retrieval and AI chat to Phase 4; final production hardening and deployment verification to Phase 5. Basic accessibility, security, and performance start in Phase 1.

## Context

- Repository: https://github.com/DenverAxelMarbida/portfolio.git
- Existing clone: `D:\VScode codes\portfolio`.
- Initial inspection found only `.git`. The approved portrait and planning documents were added later; 01-01 now supplies the locally verified application foundation.
- At initial inspection, local `main` was unborn and `git ls-remote --symref origin HEAD refs/heads/main` returned no refs. The user designates `main` as the default branch. The accepted 01-01 foundation is the authorized initial local commit; no existing history is rewritten.
- Approved original portrait is present at `content/media/profile/profile.jpg` (JPEG, 1872×1848, 432,925 bytes, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`). It must be used unchanged; no regeneration, retouching, recoloring, filters, or AI substitute.
- No project screenshots are present.
- GitHub: https://github.com/DenverAxelMarbida
- Email: denver0504.marbida@gmail.com
- Denver.dev is interface branding, not an owned-domain assertion.

## Constraints

- Work inside this clone. Preserve its remote, branch identity, and history.
- Finalize only accepted milestone 01-01 in the explicitly authorized local commit. Keep the verified audited dependencies and lockfile. No push or later milestone execution without separate approval.
- React, TypeScript, Vite, Tailwind CSS, Motion for React, Lucide React, ESLint, Prettier. React Router justified by public project detail URLs.
- Free, established open-source dependencies; static hosting on a free tier.
- No invented achievements, dates, roles, technologies, metrics, repository URLs, or product screenshots.
- Preserve supplied original photograph bytes and appearance. No retouching, generative replacement, or filters.

## Key Decisions

| Decision | Rationale | Authority |
|---|---|---|
| Minimal dark palette and restrained constellation/ID motif | Owner's approved visual direction | User requirement |
| Exactly four preliminary public projects; ReadyMama removed entirely | Approved Phase 1 scope with no unverified fifth record | Owner approval, 2026-11-05 |
| Supplied `profile.jpg` is the only approved portrait | Original appearance must be preserved | Owner instruction, 2026-11-05 |
| Exact dependency pins after a pre-install audit | Verify identity, versions, compatibility, and necessity before installing | Owner instruction, 2026-11-05 |
| Antislop audit after implementation | Owner selected audit timing | User clarification, 2026-11-05 |
| JSON authoring plus Zod and inferred TS types | Easy validation and pre-bundle publication filtering | Approved 2026-11-05 |
| Static prerendered homepage and preliminary detail routes | Indexable, shareable content and usable no-JS fallback | Approved 2026-11-05 |
| Sequential milestones with quality gates | Small, reviewable changes in the existing clone | Approved 2026-11-05 |

## Evolution

At each phase transition, update requirement status only with verification evidence. Revisit assumptions, record new decisions, and review scope against the core value. At milestones, review the full document and future roadmap.

## Planning index

- [Requirements](REQUIREMENTS.md)
- [Roadmap](ROADMAP.md)
- [State and approval gate](STATE.md)
- [Design and architecture](../docs/superpowers/specs/2026-11-05-phase-1-design.md)
- [Package legitimacy audit](phases/01-foundation-homepage/01-PACKAGE-AUDIT.md)
- [01-01 implementation handoff](phases/01-foundation-homepage/01-01-HANDOFF.md)
- [Project content schema](phases/01-foundation-homepage/01-CONTENT-SCHEMA.md)
- [UI design specification](phases/01-foundation-homepage/01-UI-SPEC.md)
- [Research and inspection](phases/01-foundation-homepage/01-RESEARCH.md)
- [Validation strategy](phases/01-foundation-homepage/01-VALIDATION.md)
