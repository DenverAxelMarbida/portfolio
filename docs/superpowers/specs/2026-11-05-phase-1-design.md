# Phase 1 design and architecture

Status: Phase 1 scope approved 2026-11-05; implementation gated on package-audit approval and explicit authorization. Date: 2026-11-05.

## Intent

Show how Denver Axel Marbida approaches real problems through agentic full-stack development. Visitors should understand his positioning, browse meaningful project previews, distinguish evidence from intent and reach his GitHub or email.

This is a complete project foundation, not a throwaway template. The first release is a homepage and lightweight reusable project-detail pages; full evidence-backed case studies follow in Phase 2.

## Approaches considered

| Approach | Strength | Trade-off | Recommendation |
|---|---|---|---|
| JSON records + Zod + static public projection | Explicit schema, easy future indexing, strong draft boundary, simple edits | Long prose less comfortable than Markdown | Proposed for Phase 1 |
| MDX/frontmatter + validation | Good long-form case-study authoring | Compilation/plugins, executable author content, more validation surfaces | Revisit if Phase 2 prose warrants it |
| CMS + remote APIs | Browser-based editing | Services, networking and operational complexity before a need exists | Excluded for Phase 1 |

Owner has authorized preliminary publication of exactly four projects. The schema, routing and prerender choices were approved in scope on 2026-11-05; implementation still requires package-audit approval and explicit authorization.

## Architecture

```text
content/projects/*.json + content/media + profile/site configuration
                 |
         build-only validation (Zod)
                 |
   published-only, allowlisted public projection
                 |
     .generated/public-content.json + referenced media
                 |
       shared React components + route definitions
          /                             \
 Vite browser build              build-only server render
          \                             /
         dist: static HTML + JS + CSS + selected media
```

The browser never imports authoring JSON, author notes or draft media. Schema validation and content generation run before development and production builds. No runtime backend, database, authentication, remote content fetching or global state library is required.

### Data and publication boundary

- All authoring files live outside `public/` and `src/`.
- Build tools validate every authoring record, select `publication.status === published`, and project an explicit list of public fields.
- `.generated/` is recreated on every invocation and ignored by Git. Draft-only media never enters it.
- A small asset-serving/copying step exposes only generated media in development and copies only those files to `dist/media/` in production. Raw content is never copied wholesale into `public/`.
- UI imports only generated public JSON and inferred types. Build-only schema imports use type-only exports where possible to keep Zod out of the browser bundle.
- Fail the build on invalid content or incomplete generated output; do not silently drop errors.
- No production source maps in the deployed directory. Artifact tests still verify that source maps, when present accidentally, cannot leak authoring data.
- Future indexing consumes this same projection; no indexer is implemented now. Public-repository source visibility is distinct from website publication: drafts in Git are not private secrets.

### Routes and static HTML

| Route | Phase 1 behavior |
|---|---|
| `/` | Full homepage |
| `/projects/:slug/` | Preliminary published project detail page using the shared template |
| Unknown or draft slug | Not-found page; never fallback to the draft |

React Router is justified by shareable project URLs. Build-time React server rendering writes an HTML file for the homepage and every published slug using the same route components and data as client hydration. No SSR service is deployed. Use a small Vite build-time entry with `react-dom/server`, a router server context, and a static render script rather than a new framework or prerender plugin.

The first milestone must prove server rendering and hydration work before expanding the app. Browser APIs, random constellation generation and persistent preferences initialize only after hydration. Render semantic content visibly on the server; animations progressively enhance it. Unknown client routes render NotFound; generate a 404 document for the selected host. Local preview and eventual host direct-link behavior must be tested separately.

Keep standard Vite responsibilities: root `index.html`, `vite.config.ts`, separate client/server entries and a typed prerender script. Use Vite's existing dev/preview servers; at most small middleware hooks for generated assets and local static route/404 behavior. Do not build a custom HTTP server or combine dev/preview/build, HTML templating and app routes into one oversized script to meet an artificial file-count limit. Folder boundaries above take priority over such a limit.

### Component responsibilities

- `AppRoutes`: one shared route definition, no data-fetching logic.
- `SiteLayout`: skip link, responsive navigation, main region, contact footer, ambient-animation control.
- `HomePage`: composition of sections; no embedded project definitions.
- `Hero`, `ProfileCard`, `EngineeringOverview`, `Capabilities`, `AgenticWorkflow`: focused semantic sections.
- `FeaturedProjects`, `ProjectCard`, `ProjectDetailPage`: consume public project data; shared media/evidence presentation primitives.
- `ProjectMedia`: original screenshot display or labeled missing-media state; optional manual image controls only when multiple genuine screenshots exist.
- `StartupIndicator`, `ConstellationBackground`, `Reveal`, `MotionPreferences`: isolated enhancement layer. No animation state in content models.
- `getPublishedProjects`, `getProjectBySlug`: simple pure selectors over already-filtered data, not a premature repository/service abstraction.

### Dependencies and rationale

Runtime: React/React DOM (UI), React Router (project URLs), Motion via `motion/react` (requested motion), Lucide React (requested icons).

Build/development: Vite + React plugin; TypeScript; Tailwind CSS + official Vite plugin; ESLint including React hooks and accessibility rules; Prettier; Zod (schema validation/inferred types); `tsx` if needed for typed Node build scripts. Testing: Vitest for schema/selectors, Playwright for real-browser behavior, `@axe-core/playwright` for automated accessibility scanning. Prefer browser tests over adding a second simulated-DOM stack.

Use npm and one lockfile. At implementation, verify stable compatible versions and record exact resolutions. Current machine has Node 24.21.0/npm 11.19.0; pin a compatible Node 24 release. Do not copy stale setup from older Tailwind or Motion examples.

## Proposed folder structure

Paths below describe future implementation; only planning documents exist today.

```text
.planning/
  PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json
  phases/01-foundation-homepage/
content/
  profile.json
  projects/{slug}.json
  media/profile/profile.jpg
  media/projects/{slug}/
scripts/
  content/schema.ts
  content/generate.ts
  prerender.ts
  check-public-artifacts.ts
.generated/                  # ignored, public-only data and media
src/
  app/{AppRoutes,SiteLayout}.tsx
  pages/{HomePage,ProjectDetailPage,NotFoundPage}.tsx
  components/layout/
  components/hero/
  components/projects/
  components/motion/
  sections/{EngineeringOverview,FeaturedProjects,Capabilities,AgenticWorkflow}.tsx
  content/{types,selectors}.ts
  styles/{tokens,global}.css
  entry-client.tsx
  entry-server.tsx
tests/
  content/
  e2e/
  fixtures/
public/                      # only intentionally public fixed assets
docs/
  adding-projects.md
  verification/phase-1.md
  superpowers/specs/2026-11-05-phase-1-design.md
index.html
vite.config.ts
tsconfig*.json
eslint.config.js
.prettierrc.json
package.json, package-lock.json
README.md, CONTRIBUTING.md
```

## Homepage composition

Desktop:

```text
Denver.dev                         Projects  Approach  Contact
Professional designation
Building Problem-Solving          Hanging ID card
Software with AI.                 Supplied profile.jpg
Introduction
Explore My Projects | View GitHub

Compact engineering overview
Featured projects: problem headlines, summaries, evidence state
Capabilities and technologies
Agentic development workflow
Email + GitHub                     Pause animations
```

Mobile keeps this reading order, with portrait below hero copy and actions. Navigation expands in normal document flow. No fixed-height hero that clips long text. Visual details and animation timings are specified in `01-UI-SPEC.md`.

## Content and claim policy

Use the owner's exact hero headline and introduction. Preliminary project titles describe editorial problem/intent, never achieved results. Detail shells show available summaries and a concise evidence-pending note, not walls of empty fake content. Contributions, technologies, architecture and outcomes render only when supported; unavailable evidence is acknowledged in one place.

Capabilities can describe the owner's supplied full-stack/agentic positioning. Label stack names as `Built for this portfolio` once implemented; never infer every prior project used React or AI agents. Workflow copy is proposed: understand needs → define acceptance criteria → plan → assisted implementation → review and verify → document evidence. Avoid asserting particular AI vendors or tools were used on prior projects.

## Extension points

- Phase 2 enriches the same records and detail template; optional Markdown is a later authoring decision.
- Phase 3 adds a separate GitHub adapter keyed by validated repository references. Presentational components receive data, not API tokens or transport concerns.
- Phase 4 indexes only published public content and cited evidence. Retrieval/model code belongs outside the static frontend; no empty backend layers are created now.
- Phase 5 applies final host-specific controls, measurement and release checks. Earlier milestones already include essential accessibility and validation.

## Risks, assumptions and dependencies

| Item | Impact | Plan |
|---|---|---|
| Supplied portrait must stay authentic | Hero must show Denver's actual appearance, not a substitute | Use `content/media/profile/profile.jpg` unchanged; CSS sizing/positioning and non-destructive cropping only; verify path and hash before 01-03 |
| Missing project evidence | Full case studies would be speculative | Exactly four authorized preliminary previews; ReadyMama removed; empty evidence arrays |
| Original portrait may be large | Could dominate transfer/LCP | Measure bytes, preserve original and appearance; ask separately before any optimization requiring transformation |
| Loader + static HTML | A splash can delay already usable content | Boot-only nonblocking indicator; zero minimum duration; no full-page masking |
| Ambient motion | Distraction, battery use, motion sensitivity | Bounded canvas, paused offscreen/hidden, reduced-motion and explicit pause control |
| Draft filtering after import | Draft strings/media could enter bundles | Build-time allowlist before bundling; negative fixture artifact tests |
| Prerender/hydration mismatch | Broken interactivity or visual flash | First milestone proof, deterministic HTML, client-only effects |
| Unknown host/origin | Canonical URLs or route handling could be wrong | Configure actual URL later; never use Denver.dev as canonical automatically |
| Empty remote main | No starting commit exists | Keep current clone; first commit only under approved workflow; recheck remote before publishing |
| Future free-tier AI limits | Later assistant may not fit free hosting | Separate Phase 4 feasibility and architecture approval |

Proposed defaults: English-only, fixed dark theme, no analytics, no form backend, mailto contact, no custom domain assumed, latest stable Chrome/Firefox/Safari/Edge with explicit test coverage reported. These defaults may be revised during plan approval.

## Approval and verification

Approve this design together with requirements, content schema, UI spec and milestone plans. Approval authorizes Phase 1 only. Verification targets are defined in `01-VALIDATION.md`; none has been executed against an application yet. After approval, apply Superpowers implementation planning/TDD where useful, execute small milestones, review changes, and record actual checks before completion or commits.
