import { manifest } from '../content/manifest';
import { getPublishedProjects } from '../content/selectors';

export function getStaticPaths(): string[] {
  return ['/', ...getPublishedProjects(manifest).map((project) => `/projects/${project.slug}/`)];
}
