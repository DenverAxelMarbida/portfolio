import type { PublicProject } from '../../../scripts/content/schema';
import { ProjectMedia } from './ProjectMedia';

export function ProjectCard({ project }: { project: PublicProject }) {
  return (
    <article className="project-card" data-reveal-item="0">
      {/* CP7 T4 rework: every card is item 0 of its own arrival wave. Cards
          sharing a grid row arrive in the same observer batch and share a
          visual-row cascade slot, so a row reveals together without any
          DOM-position delay forced onto the mobile stacked layout. */}
      <h3>
        <a href={`/projects/${project.slug}/`}>{project.headline}</a>
      </h3>
      <p className="project-card-name">{project.displayName}</p>
      <p className="project-card-summary">{project.summary}</p>
      <p className="project-card-status">
        {project.publication.readiness === 'preliminary'
          ? 'Preliminary preview · Evidence pending'
          : 'Reviewed project preview'}
      </p>
      <ProjectMedia
        screenshots={project.screenshots}
        label={`${project.displayName} screenshots`}
      />
    </article>
  );
}
