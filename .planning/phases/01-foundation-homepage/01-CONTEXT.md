# Phase 1 Context

Status: Phase 1 scope approved 2026-11-05; implementation gated on package-audit approval and explicit authorization.

<decisions>

## Locked owner decisions

- **D-01:** Work in the existing `DenverAxelMarbida/portfolio` clone on its existing `main`; preserve remote and history. No implementation until the package audit is approved and 01-01 is explicitly authorized.
- **D-02:** Use React, TypeScript, Vite, Tailwind, Motion for React, Lucide, ESLint and Prettier; no paid services or unjustified dependencies.
- **D-03:** Minimal dark palette: #080808, #15171B, #1D2025, #F4F4F4, #AEB4BD. No red-dominant theme.
- **D-04:** Supplied identity, hero text, project CTA, GitHub and email; Denver.dev is interface branding only.
- **D-05:** Hanging card uses the supplied original `content/media/profile/profile.jpg` unchanged. CSS sizing, positioning and non-destructive cropping are allowed; no regeneration, retouching, recoloring, filters or stock/AI substitute. Unobstructed mobile placement.
- **D-06:** Required loader, constellation, hero/card motion, project transitions and small scroll reveals; reduced motion and mobile efficiency.
- **D-07:** Schema-validated reusable project model; no fabricated evidence; drafts excluded before public build and future indexing.
- **D-08:** Exactly four source entries — Saklolo161, BistroBuddies App, BistroBuddies Promo Website, ERP Quotation Migrator — all owner-authorized preliminary public previews. ReadyMama is removed completely: no record, media, preview, route or navigation.
- **D-09:** All ten requested homepage elements/sections; no invented counts or fake functional chatbot.
- **D-10:** Phase 2 through 5 extension boundaries; no premature integrations.
- **D-11:** Responsive, accessible, SEO-friendly, tested and documented output; verify before completion claims.
- **D-12:** Antislop audit after implementation, per owner selection.

</decisions>

## Proposed engineering choices for approval

JSON + Zod build-time validation; React Router for lightweight project detail routes; static prerender using the same React component tree; public-content projection as the only UI data source; plain React state for navigation and animation preferences; native canvas for the bounded constellation.

## Deferred Ideas

MDX, CMS, remote data adapters, GitHub API, AI chat, databases, hosted inference, full case-study evidence research. No implementation of these in Phase 1.

## Asset and evidence gaps

Approved portrait exists at `content/media/profile/profile.jpg` (JPEG, 1872×1848, 432,925 bytes, SHA-256 `54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a`) and must be verified before 01-03 implementation. No project screenshots exist. Exact project URLs, contributions and technologies remain unverified.
