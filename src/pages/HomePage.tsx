import type { PublicManifest } from '../../scripts/content/schema';
import { getPublishedProjects } from '../content/selectors';
import { ProfileCard } from '../components/hero/ProfileCard';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ConstellationBackground } from '../components/motion/ConstellationBackground';
import { PageStarfieldBackground } from '../components/motion/PageStarfieldBackground';
import { HeroEntrance } from '../components/motion/HeroEntrance';

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
          <p className="hero-eyebrow">{profile.title}</p>
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
        <h2 id="projects-heading">Project previews</h2>
        {projects.length === 0 ? (
          <p>Project previews are being prepared.</p>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}
      </section>

      <section
        id="approach"
        className="page-section"
        aria-labelledby="approach-heading"
        tabIndex={-1}
      >
        <div className="approach-overview">
          <h2 id="approach-heading">Software shaped by the problem.</h2>
          <p>
            I build end-to-end software: interface, application logic, data and deployment. The work
            starts from a real need and moves toward a solution that can be used, tested and
            explained.
          </p>
          <p>
            Problem-to-solution thinking keeps scope honest. Evidence and review keep the result
            accountable.
          </p>
        </div>

        <div className="approach-capabilities">
          <h3>Capabilities and technologies</h3>
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

        <div className="approach-workflow">
          <h3>How I Work</h3>
          <ol className="workflow-list">
            {WORKFLOW.map((step) => (
              <li key={step.title}>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </article>
  );
}
