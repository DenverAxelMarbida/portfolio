import type { PublicManifest } from '../../scripts/content/schema';

export function getPublishedProjects(manifest: PublicManifest, { featuredOnly = false } = {}) {
  return manifest.projects
    .filter((project) => !featuredOnly || project.featured)
    .sort(
      (a, b) => a.displayOrder - b.displayOrder || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
}

export function getProjectBySlug(manifest: PublicManifest, slug: string) {
  return manifest.projects.find((project) => project.slug === slug);
}
