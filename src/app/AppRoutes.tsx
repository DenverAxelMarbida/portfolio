import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import { getStaticPaths } from './staticPaths';
import { SiteLayout } from './SiteLayout';
import { manifest } from '../content/manifest';
import { HomePage } from '../pages/HomePage';
import { getProjectBySlug } from '../content/selectors';
import { ProjectMedia } from '../components/projects/ProjectMedia';
import { MotionPreferencesProvider } from '../components/motion/MotionPreferences';
import type { Claim } from '../../scripts/content/schema';

function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>That page is unavailable.</p>
      <a href="/">Back to home</a>
    </>
  );
}

function ClaimText({ claim }: { claim: Claim }) {
  return (
    <p>
      {claim.basis === 'proposed'
        ? 'Intent: '
        : claim.basis === 'owner-provided'
          ? 'Owner-provided: '
          : 'Verified claim: '}
      {claim.text}
    </p>
  );
}

function ProjectDetailPage() {
  const { slug } = useParams();
  const project = getProjectBySlug(manifest, slug ?? '');
  if (!project) return <NotFound />;
  return (
    <article className="project-detail">
      <header>
        <h1>{project.headline}</h1>
        <p>{project.displayName}</p>
        <p>{project.summary}</p>
        <p className="project-card-status">
          {project.publication.readiness === 'preliminary'
            ? 'Preliminary preview · Evidence pending'
            : 'Reviewed project preview'}
        </p>
        <p>
          Project status:{' '}
          {project.projectStatus === 'unknown' ? 'Not established' : project.projectStatus}
        </p>
      </header>
      {project.problem && (
        <section>
          <h2>Problem</h2>
          <ClaimText claim={project.problem} />
        </section>
      )}
      {project.proposedSolution && (
        <section>
          <h2>Proposed solution</h2>
          <ClaimText claim={project.proposedSolution} />
        </section>
      )}
      {(
        [
          ['Intended outcomes', project.intendedOutcomes],
          ['Verified outcomes', project.verifiedOutcomes],
          ['Contributions', project.contributions],
        ] as const
      ).map(
        ([title, claims]) =>
          claims.length > 0 && (
            <section key={title}>
              <h2>{title}</h2>
              {claims.map((claim, index) => (
                <ClaimText key={index} claim={claim} />
              ))}
            </section>
          ),
      )}
      {project.technologies.length > 0 && (
        <section>
          <h2>Technologies</h2>
          <ul>
            {project.technologies.map((technology) => (
              <li key={technology.name}>{technology.name}</li>
            ))}
          </ul>
        </section>
      )}
      <ProjectMedia
        screenshots={project.screenshots}
        label={`${project.displayName} screenshots`}
      />
      {project.architecture && (
        <section>
          <h2>Architecture</h2>
          <ClaimText claim={project.architecture.summary} />
          {project.architecture.decisions.map((claim, index) => (
            <ClaimText key={index} claim={claim} />
          ))}
          {project.architecture.diagrams.length > 0 && (
            <ProjectMedia
              screenshots={project.architecture.diagrams}
              label={`${project.displayName} architecture diagrams`}
            />
          )}
        </section>
      )}
      {(
        [
          ['Repositories', project.repositories],
          ['Live demos', project.liveDemos],
          ['APK downloads', project.apkDownloads],
        ] as const
      ).map(
        ([title, links]) =>
          links.length > 0 && (
            <section key={title}>
              <h2>{title}</h2>
              <ul>
                {links.map((link) => (
                  <li key={link.url}>
                    <a href={link.url}>{link.label}</a>
                    {'version' in link && link.version && <p>Version: {link.version}</p>}
                    {'sha256' in link && link.sha256 && <p>SHA-256: {link.sha256}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      {project.evidence.length > 0 && (
        <section>
          <h2>Sources</h2>
          <ul>
            {project.evidence.map((source) => (
              <li key={source.id}>
                {source.url ? <a href={source.url}>{source.label}</a> : source.label}
                {source.checkedAt && <span> (checked {source.checkedAt})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <a href="/#projects">Back to projects</a>
    </article>
  );
}

function RouteContent() {
  const { pathname } = useLocation();
  if (!getStaticPaths().includes(pathname)) return <NotFound />;
  return (
    <Routes>
      <Route path="/" element={<HomePage manifest={manifest} />} />
      <Route path="/projects/:slug/" element={<ProjectDetailPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function AppRoutes() {
  return (
    <MotionPreferencesProvider>
      <SiteLayout>
        <RouteContent />
      </SiteLayout>
    </MotionPreferencesProvider>
  );
}
