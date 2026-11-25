import type { PublicManifest } from '../../scripts/content/schema';
import { getPublishedProjects } from '../content/selectors';
import { ProfileCard } from '../components/hero/ProfileCard';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ConstellationBackground } from '../components/motion/ConstellationBackground';
import { PageStarfieldBackground } from '../components/motion/PageStarfieldBackground';
import { ParallaxHeading } from '../components/motion/ParallaxHeading';
import { HeroEntrance } from '../components/motion/HeroEntrance';
import { Reveal } from '../components/motion/Reveal';

const BUILT_STACK = [
  'React',
  'TypeScript',
  'Vite',
  'Tailwind CSS',
  'React Router',
  'Playwright',
  'Vitest',
  'Node.js',
] as const;

const WORKFLOW = [
  {
    title: 'Understand the Problem',
    body: "I start by understanding who I'm building for, what they need, and the challenges they're facing.",
  },
  {
    title: 'Define Success',
    body: 'I set clear goals and requirements so I know what the solution needs to achieve.',
  },
  {
    title: 'Plan the Build',
    body: 'I break complex projects into smaller, manageable tasks with clear priorities and checkpoints.',
  },
  {
    title: 'Build with AI Assistance',
    body: 'I use AI-powered and agentic workflows to accelerate development while reviewing and guiding the implementation myself.',
  },
  {
    title: 'Test and Improve',
    body: 'I test functionality, review the user experience, and refine the implementation based on what I find.',
  },
  {
    title: 'Document the Work',
    body: "I record important decisions, implementation details, and what I've verified so the project is easier to maintain and improve.",
  },
] as const;

export function HomePage({ manifest }: { manifest: PublicManifest }) {
  const { profile } = manifest;
  const projects = getPublishedProjects(manifest);
  const headline = profile.headline ?? profile.name;

  return (
    <article className="home">
      <PageStarfieldBackground />
      <section className="hero" aria-labelledby="hero-heading">
        <ConstellationBackground />

        <HeroEntrance>
          {/* CP7 T4: the role label joins the approved entrance cascade,
              sharing index 0 with the headline so the accepted 100/200ms
              schedule for the intro and actions is unchanged. */}
          <p className="hero-eyebrow" data-hero-entrance-item="0">
            {profile.title}
          </p>
          <h1 id="hero-heading" data-hero-entrance-item="0">
            {headline}
          </h1>
          {profile.introduction && (
            <p className="hero-intro" data-hero-entrance-item="1">
              {profile.introduction}
            </p>
          )}
          <div className="hero-actions" data-hero-entrance-item="2">
            <a className="button button-primary" href="#projects">
              Explore My Projects
            </a>
            <a className="button button-secondary" href={profile.github}>
              View GitHub
            </a>
          </div>
        </HeroEntrance>
        <ProfileCard profile={profile} />
      </section>

      <section
        id="projects"
        className="page-section"
        aria-labelledby="projects-heading"
        tabIndex={-1}
      >
        {/* CP7 T4 rework, updating CP6-F: the heading is its own reveal wave
            and each card sits in its own wave so a row reveals the moment
            the user actually scrolls it into view. Every card is item 0:
            cards in the same grid row arrive in the same observer batch and
            share a visual-row cascade slot, so they reveal together on
            desktop without any forced DOM-position delay leaking into the
            mobile stacked layout. */}
        <Reveal>
          <ParallaxHeading as="h2" id="projects-heading" data-reveal-item="0">
            Project previews
          </ParallaxHeading>
        </Reveal>
        {projects.length === 0 ? (
          <p>Project previews are being prepared.</p>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <Reveal key={project.slug}>
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* CP7 T4 final refinement: the approach section reveals block by
          block on actual viewport entry — the heading, the introduction,
          the capabilities block, the workflow heading and each workflow
          step are separate waves (a whole-section wave would re-animate
          content that spans multiple viewport heights). The overview and
          workflow containers are plain grid children so the accepted two
          column geometry is unchanged; only the reveal waves inside them
          are finer. Same-top rows still share a batch slot, so a desktop
          workflow row reveals together while each stacked mobile step
          reveals on its own entry. */}
      <section
        id="approach"
        className="page-section"
        aria-labelledby="approach-heading"
        tabIndex={-1}
      >
        <div className="approach-overview">
          <Reveal>
            <ParallaxHeading as="h2" id="approach-heading" data-reveal-item="0">
              Software shaped by the problem.
            </ParallaxHeading>
          </Reveal>
          <Reveal>
            <div className="approach-introduction">
              <p data-reveal-item="0">
                I build end-to-end software: interface, application logic, data and deployment. The
                work starts from a real need and moves toward a solution that can be used, tested and
                explained.
              </p>
              <p data-reveal-item="1">
                Problem-to-solution thinking keeps scope honest. Evidence and review keep the result
                accountable.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="approach-capabilities" data-reveal-item="0">
            <ParallaxHeading as="h3" translateRange={30} opacityStart={0.5}>
              Capabilities and technologies
            </ParallaxHeading>
            <p>
              Full-stack delivery guided by AI-assisted workflows, from early framing through
              implementation, review and documentation.
            </p>
            <p className="stack-label">Built for this portfolio</p>
            <ul className="stack-list">
              {BUILT_STACK.map((technology) => (
                <li key={technology}>{technology}</li>
              ))}
            </ul>
            <p className="approach-note">Project assistant planned for a later phase.</p>
          </div>
        </Reveal>

        <div className="approach-workflow">
          <Reveal>
            <ParallaxHeading
              as="h3"
              id="workflow-heading"
              translateRange={30}
              opacityStart={0.5}
              data-reveal-item="0"
            >
              How I Work
            </ParallaxHeading>
          </Reveal>
          <ol className="workflow-list">
            {WORKFLOW.map((step) => (
              <li key={step.title}>
                <Reveal>
                  <div className="approach-step" data-reveal-item="0">
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </article>
  );
}
