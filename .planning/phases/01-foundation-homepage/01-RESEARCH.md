# Phase 1 inspection and research

Date: 2026-11-05. Research supports an approved-in-scope plan; implementation is gated on package-audit approval and explicit authorization.

## Repository evidence

- Directory listing contained `.git` only.
- `git status --short --branch`: `No commits yet on main...origin/main [gone]`.
- `git remote -v`: fetch/push both `https://github.com/DenverAxelMarbida/portfolio.git`.
- Remote symbolic HEAD/main query completed with no advertised refs. Local origin/HEAD is absent, consistent with an empty clone.
- Therefore no existing source patterns, project screenshots, package manager file or tests could be inspected. The approved portrait was later supplied at `content/media/profile/profile.jpg`.

## Installed capabilities inspected

- Superpowers brainstorming and builder-check instructions loaded. Existing `using-superpowers` content was already supplied and not reloaded.
- GSD new-project/plan-phase skills, workflow spines and project/requirements templates inspected. Actual MCP hub supports `query init.new-project`; runtime-aware local CLI is `node C:/Users/hp/.config/opencode/gsd-core/bin/gsd-tools.cjs` with `GSD_RUNTIME=opencode`.
- The first MCP result used Claude runtime and incorrectly reported missing agents. Explicit OpenCode runtime returned `agents_installed: true`, no missing agents, at `C:/Users/hp/.config/opencode/agents`. No installation needed.
- UI-UX Pro Max script: `C:/Users/hp/.config/opencode/skills/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max/scripts/search.py`.
- Python 3.14.7, Node 24.21.0, npm 11.19.0 observed.
- User requested planning only and unchanged history; GSD automatic commits, scaffolding and execution are gated off for this session.

## UI research

Queries run locally:

1. `developer portfolio minimal dark --design-system`: OLED style relevant, but FAQ/documentation structure inappropriate.
2. `personal portfolio --design-system`: portfolio context but brutalism, handwritten fonts and light palette conflict with brief. Retry did not yield a verified full-system match; use owner direction rather than database defaults.
3. `prefers reduced motion --domain ux`: relevant guidance to respect OS preference, avoid excessive motion and retain final readable content.
4. `animation effect cleanup --stack react`: relevant cleanup of subscriptions/timers and correct effect dependencies.

Contrast independently calculated using sRGB luminance and WCAG ratio. Primary text against the three selected backgrounds: 18.21, 16.32, 14.85. Secondary: 9.60, 8.60, 7.83. Control boundary #717780: 4.44, 3.98, 3.62 (suitable for non-text control boundaries, not a body-text token).

## Official technical sources

Reviewed 2026-11-05:

- https://vite.dev/guide/ : React TS templates, static build and environment requirements. Retrieved documentation identified Vite 8.3.6 and Node minimum 20.19+/22.12+. Verify chosen versions again when installing after approval.
- https://tailwindcss.com/docs/installation/using-vite : official `@tailwindcss/vite` integration and CSS import; no legacy v3 configuration assumption. Retrieved docs identified v4.3.
- https://motion.dev/docs/react-installation : install `motion`, import `motion/react`, React >=18.2; works with Vite.
- https://motion.dev/docs/react-accessibility : MotionConfig and useReducedMotion; automatic reduction does not eliminate custom canvas or CSS loops. Older import examples on this page are superseded by the installation page.
- https://zod.dev/ : schema validation and inferred types, strict TypeScript, stable Zod 4; retrieved docs identified 4.6. Schema validates shape, not truth of claims.

No project repository internals were researched in this phase. User descriptions are the only current project-specific factual source; exact project URLs and technical details remain unknown.

## Package legitimacy audit

Completed separately at [`01-PACKAGE-AUDIT.md`](01-PACKAGE-AUDIT.md) using the official npm registry. It records exact pins, compatibility decisions (TypeScript 5.9.3, ESLint 10.14.0, no `eslint-plugin-jsx-a11y`), integrity values, and the installation boundary. Nothing has been installed; owner approval of that audit is required.

## Recommendations

Use JSON + Zod, explicit public manifest generation before Vite, same-tree prerender/hydration, semantic static-first UI, bounded canvas decoration, no extra animation engine. Check the SSR/render seam early. Version numbers above are research observations, not installed dependencies or a promise to use the newest release regardless of compatibility.

## Validation Architecture

Vitest covers schema/publication/selector logic. Playwright covers real-browser navigation, mobile menu, motion preferences, readable HTML without JS and deep links. Axe provides automated accessibility checks supplemented by keyboard and screen-reader smoke tests. Production artifact checks scan forbidden draft/author-note sentinels and verify stale media removal after unpublishing. See `01-VALIDATION.md` for acceptance commands and failure criteria.
