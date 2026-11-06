import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import { getStaticPaths } from './staticPaths';
import { useState } from 'react';
import { manifest } from '../content/manifest';
import { getProjectBySlug, getPublishedProjects } from '../content/selectors';
import type { Claim, PublicProject } from '../../scripts/content/schema';

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

function ProjectImage({ image }: { image: PublicProject['screenshots'][number] }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p>Screenshots pending</p>;
  return (
    <figure>
      <img
        src={`/media/${image.assetPath}`}
        alt={image.alt}
        width={image.width}
        height={image.height}
        className="h-auto max-w-full"
        ref={(element) => {
          if (element?.complete && element.naturalWidth === 0) setFailed(true);
        }}
        onError={() => setFailed(true)}
      />
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>
  );
}

function ProjectDetailPage() {
  const { slug } = useParams();
  const project = getProjectBySlug(manifest, slug ?? '');
  if (!project) return <NotFound />;
  return (
    <article className="space-y-6">
      <header>
        <h1>{project.headline}</h1>
        <p>{project.displayName}</p>
        <p>{project.summary}</p>
        <p>
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
      <section aria-label="Screenshots">
        {project.screenshots.length ? (
          project.screenshots.map((image) => <ProjectImage key={image.assetPath} image={image} />)
        ) : (
          <p>Screenshots pending</p>
        )}
      </section>
      {project.architecture && (
        <section>
          <h2>Architecture</h2>
          <ClaimText claim={project.architecture.summary} />
          {project.architecture.decisions.map((claim, index) => (
            <ClaimText key={index} claim={claim} />
          ))}
          {project.architecture.diagrams.map((image) => (
            <ProjectImage key={image.assetPath} image={image} />
          ))}
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

function HomePage() {
  const projects = getPublishedProjects(manifest);
  return (
    <>
      <h1>{manifest.profile.name}</h1>
      <p>{manifest.profile.title}</p>
      <a href={manifest.profile.github}>View GitHub</a>
      <section id="projects" className="mt-12 space-y-8" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Project previews</h2>
        {projects.length === 0 ? (
          <p>Project previews are being prepared.</p>
        ) : (
          projects.map((project) => (
            <article key={project.slug}>
              <h3>
                <a href={`/projects/${project.slug}/`}>{project.headline}</a>
              </h3>
              <p>{project.displayName}</p>
              <p>{project.summary}</p>
              <p>
                {project.publication.readiness === 'preliminary'
                  ? 'Preliminary preview · Evidence pending'
                  : 'Reviewed project preview'}
              </p>
            </article>
          ))
        )}
      </section>
    </>
  );
}

export function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      {getStaticPaths().includes(pathname) ? (
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects/:slug/" element={<ProjectDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      ) : (
        <NotFound />
      )}
    </main>
  );
}
