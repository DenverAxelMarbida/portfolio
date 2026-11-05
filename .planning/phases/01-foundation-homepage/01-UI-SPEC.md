# Phase 1 UI design specification

Status: Approved design contract; implementation gated on package-audit approval and explicit authorization. Owner's minimal dark direction is authoritative.

## Design read and rationale

A developer portfolio for readers evaluating technical work, with quiet dark surfaces, spacious typography and a personal ID-card motif. Energy 1 / rhythm 2 / motion 2: calm visual intensity, varied content-driven sections, restrained entrance and ambient motion. These are descriptive planning dials, not an antislop audit; that audit is deferred per owner choice.

- Dark neutrals follow the owner's identity, not a new palette recommendation.
- White primary CTA establishes hierarchy without introducing neon or red.
- The original portrait supplies personal identity; the hanging card supports that framing.
- The constellation supplies the requested technical motif; keep it behind open hero space, not behind dense text.
- Use cards for project previews only; overview and capabilities are compact typographic groups, workflow is an ordered text sequence.
- Lucide icons supplement understandable labels (menu, close, external destination, mail, pause/play); no decorative AI sparkle or invented logos.

## Tokens

| Token | Value | Purpose |
|---|---|---|
| `background` | `#080808` | Main page |
| `surface` | `#15171B` | Secondary region |
| `card` | `#1D2025` | Projects / ID card |
| `text` | `#F4F4F4` | Primary text and CTA fill |
| `text-muted` | `#AEB4BD` | Secondary readable text |
| `border-subtle` | `#343840` | Decorative separators only |
| `border-control` | `#717780` | Required control boundaries |
| `focus-ring` | `#F4F4F4` | 2px visible ring, 3px offset |
| `on-primary` | `#080808` | White-button text |

Use CSS semantic variables and Tailwind theme mapping; no repeated raw hex values in components. One dark theme; no theme toggle in Phase 1.

Calculated contrast: primary text/background 18.21:1, primary/card 14.85:1, secondary/background 9.60:1, secondary/card 7.83:1. Required control border/card 3.62:1. Recheck real rendered combinations, opacity, hover/focus and forced-colors modes. Subtle decorative borders do not carry essential control identification.

### Typography

Proposed IBM Plex Sans for headings and body, self-hosted licensed WOFF2 with system sans fallback and `font-display: swap`. Use a small system monospace stack only for technical labels. IBM Plex Sans has a technical character without sacrificing long-form readability; avoid large monospace headlines. Include font license when vendoring after approval.

- Hero: fluid 36–64px, 600/700 weight, 1.08–1.15 line height; no hard-coded desktop line breaks on mobile.
- Section headings: 28–40px, 600 weight.
- Body: 16–18px, 1.6 line height, maximum approximately 65 characters per line.
- Labels: 14px minimum, normal tracking. No tiny uppercase decorative labels.

### Space, shape and layout

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- Page max-width: 1200px; gutters 20px mobile, 32px tablet, 48px desktop.
- Section spacing: 64px mobile, 96px desktop; overview intentionally more compact.
- Corners: 8px controls, 12px cards. No universal pill shape.
- Desktop hero at 1024px+: roughly 60/40 text/card with enough swing clearance.
- Below 1024px: one column; hero copy/actions then card. Card max width 280px mobile, 320px desktop. Reserve image aspect ratio; do not crop the face or image via `object-fit: cover`.
- Featured projects: one column on narrow screens, two at 768px+, equal readable card widths; long headings wrap.
- Header navigation: Projects (`/#projects`), Approach (`/#approach`), Contact (`/#contact`). Brand links home. Mobile menu is a disclosure in normal flow, not a modal.
- Sticky header only if focus and anchor offsets are verified. Use `scroll-margin-top` and visible skip link.

## Component and interaction contract

### Exact owner-supplied hero copy

- Headline: `Building Problem-Solving Software with AI.`
- Introduction: `Hi, I'm Denver Axel Marbida. I build end-to-end software solutions using agentic and AI-powered development workflows, turning real-world needs into practical, people-centered applications.`
- Designation: `Agentic Full-Stack Software Developer`
- Actions: `Explore My Projects` and `View GitHub`.

This wording was supplied in the initial brief. No additional introduction is needed from the owner.

| Element | Content / behavior |
|---|---|
| Hero | Exact supplied headline, introduction, title; real anchor and GitHub links |
| ID card | Name/title, supplied `content/media/profile/profile.jpg` with alt `Denver Axel Marbida`; failed load shows `Portrait unavailable` with no broken image |
| Overview | Qualitative full-stack delivery, problem-to-solution and evidence/review themes; no invented counts |
| Project card | Editorial headline first, project name secondary, supplied summary, `Preliminary preview · Evidence pending`, labeled missing screenshot, real detail link |
| Detail page | Summary, intent when available, concise evidence-pending notice, available evidence and links only; back-to-projects link |
| Capabilities | Owner-stated full-stack and agentic approach; actual portfolio stack labeled separately from unverified project stacks |
| Workflow | Understand needs, define criteria, plan, assisted implementation, review/test, document evidence |
| Footer | Name, visible email mailto, GitHub; optional plain `Project assistant planned for a later phase` note |
| Mobile menu | `aria-expanded`/`aria-controls`, Escape closes, selection closes, focus restored appropriately; closed links not focusable |
| Pause control | Button with explicit accessible label/state; affects all ambient motion; keyboard usable |

No controls for nonexistent demos/APKs/chat. Links use native semantics. Open external destinations in the same tab by default; if a new tab is used, communicate it and apply safe link attributes. Focus feedback accompanies hover; touch never requires hover to reveal information.

## Animation plan

| Effect | Proposed implementation and bounds | Reduced / paused behavior |
|---|---|---|
| Startup wordmark | Minimal developer symbol/wordmark during real boot; no minimum duration; remove on first usable render, optional exit opacity up to 160ms | Hidden on fast boot, no animation under reduced motion; never required to access content |
| Hero entrance | Motion, 8–12px translate and opacity, 300–450ms, 50–70ms stagger across headline/intro/actions | Immediate readable final state |
| Profile pendulum | CSS/Motion transform-origin above card, ±1.5° base rotation, 6–8s loop | Static card |
| Pointer card response | Fine pointer only; capped additional ±2°, spring return, no drag/physics engine | Disabled |
| Constellation | Native canvas, hero-only; <=36 nodes desktop / <=18 mobile, DPR capped at 1.5, <=30fps desktop / <=20fps mobile; nearby connections with distance limit | Static sparse drawing or hidden; no RAF loop |
| Card hover | 2–3px lift, 160–200ms; corresponding focus treatment | Border/text feedback only |
| Screenshot change | Manual controls only for 2+ actual screenshots; 150–200ms opacity crossfade | Instant image change |
| Section reveal | Once per section, <=8px slide, 250–350ms; no repeated replay | Final visible state |
| Anchor scroll | Native smooth scrolling when motion allowed | Native immediate scroll |

Use `motion` package imports from `motion/react`, `MotionConfig reducedMotion="user"` and explicit preference handling for canvas/CSS. MotionConfig alone does not stop custom loops. A page-level pause control disables ambient motion even without an OS preference; reduced motion always takes precedence over a local resume choice. Store pause preference locally if storage works; handle denied storage without errors. Respond to preference changes live.

Canvas is decorative (`aria-hidden`, pointer-events none). Sample pointer location at most once per frame; do not attach thousands of DOM listeners or update React state each frame. Freeze while document hidden or hero offscreen; remove listeners and cancel RAF on cleanup. No WebGL, physics engine, GSAP or particle library.

Static HTML starts visible. Client animation must not leave content opacity-zero if JS or Motion fails. Avoid hiding already readable content during hydration just to replay an entrance; entrance can be skipped on that path. Keep card and constellation as the only simultaneous persistent motion in the hero. The pause control satisfies user control over effects continuing beyond five seconds.

### Loading and failure states

The static page remains accessible throughout startup. A small nonblocking boot indicator is an upper hero/header treatment, not a full-screen cover. Do not wait for images, fonts or a fake percentage. On JS-disabled loads, no loader runs and the static content remains readable. On boot failure, static HTML and ordinary links remain usable; use a CSS timeout fail-safe for any boot indicator, never a timeout to impose a minimum load duration.

Local content has no simulated asynchronous fetching: invalid content fails the build. No published projects yields `Project previews are being prepared.` Missing screenshots show `Screenshots pending`; failed real images fall back to the same honest media state. A failed supplied portrait shows `Portrait unavailable`. Unknown routes render NotFound with a home link.

## UI Considerations

All entries below have explicit verification planned; none claims an implemented pass.

- UI-01: 320, 375, 768, 1024 and 1440px layouts have no overflow, text overlap or obstructed card controls.
- UI-02: Keyboard visitor can skip navigation, open/close menu, navigate projects and contact, and pause motion with visible focus.
- UI-03: Reduced-motion visitor sees complete readable content, a static portrait and no ambient animation loop.
- UI-04: No-JS visitor can read homepage and detail pages and follow native links.
- UI-05: Missing media has visible honest labels; unknown data does not become a fabricated screenshot, metric or result.
- UI-06: Pointer effects are optional and disabled for coarse pointers; essential actions remain available without hover.
- UI-07: Page keeps functioning when canvas context, localStorage or optional motion initialization fails.

## Design-source disposition

UI-UX Pro Max `developer portfolio minimal dark --design-system` matched a documentation/FAQ pattern; a narrower `personal portfolio` retry matched brutalism/handwritten typography. Neither complete recommendation fits this brief. Do not persist either as approved direction. This specification derives from the owner's brief and explicit engineering proposals; targeted reduced-motion and React effect-cleanup results were applicable.
