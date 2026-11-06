import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ProjectSchema, ProfileSchema, PublicManifestSchema } from './schema.ts';
import type { Project, Profile, PublicManifest, PublicProject } from './schema.ts';
import { cleanOutput, containedFile, readImage, workspaceRoot } from './files.ts';

const suppliedProfile: Profile = {
  name: 'Denver Axel Marbida',
  title: 'Agentic Full-Stack Software Developer',
  headline: null,
  introduction: null,
  github: 'https://github.com/DenverAxelMarbida',
  email: 'denver0504.marbida@gmail.com',
  image: null,
};

export function mediaReferences(project: Project | PublicProject): string[] {
  const refs = [...project.screenshots, ...(project.architecture?.diagrams ?? [])].map(
    (image) => image.assetPath,
  );
  for (const evidence of project.evidence) {
    if (
      'reference' in evidence &&
      evidence.kind !== 'owner-brief' &&
      !evidence.reference.startsWith('https://')
    )
      refs.push(evidence.reference);
    if ('url' in evidence && evidence.url?.startsWith('/media/'))
      refs.push(evidence.url.slice('/media/'.length));
  }
  return [...new Set(refs)].sort();
}

export async function validateContent({ contentRoot = join(workspaceRoot, 'content') } = {}) {
  const projects: Project[] = [];
  const errors: string[] = [];
  let profile = suppliedProfile;
  try {
    await lstat(join(contentRoot, 'profile.json'));
    profile = ProfileSchema.parse(
      JSON.parse(await readFile(await containedFile(contentRoot, 'profile.json'), 'utf8')),
    );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      errors.push(`profile.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const projectRoot = join(contentRoot, 'projects');
  if ((await lstat(projectRoot)).isSymbolicLink())
    throw new Error('Content validation failed: symlink projects directory');
  for (const filename of (await readdir(projectRoot)).sort()) {
    try {
      if (!filename.endsWith('.json'))
        throw new Error('Project directory must contain only JSON records');
      const record = ProjectSchema.parse(
        JSON.parse(
          await readFile(await containedFile(contentRoot, `projects/${filename}`), 'utf8'),
        ),
      );
      if (`${record.slug}.json` !== filename) throw new Error('slug must match filename');
      if (projects.some((project) => project.slug === record.slug))
        throw new Error('Duplicate slug');
      projects.push(record);
      const mediaRoot = join(contentRoot, 'media');
      for (const path of mediaReferences(record)) {
        await containedFile(contentRoot, `media/${path}`);
        if (/\.(png|jpe?g)$/.test(path)) await readImage(mediaRoot, path);
      }
      for (const image of [...record.screenshots, ...(record.architecture?.diagrams ?? [])])
        await readImage(mediaRoot, image.assetPath, image);
    } catch (error) {
      errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (profile.image) {
    try {
      await containedFile(contentRoot, `media/${profile.image.assetPath}`);
      await readImage(join(contentRoot, 'media'), profile.image.assetPath, profile.image);
    } catch (error) {
      errors.push(`profile.json image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length) throw new Error(`Content validation failed:\n${errors.join('\n')}`);
  return {
    projects: projects.sort(
      (a, b) => a.displayOrder - b.displayOrder || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    ),
    profile,
  };
}

export function projectPublic(project: Project): PublicProject {
  return {
    schemaVersion: project.schemaVersion,
    slug: project.slug,
    displayName: project.displayName,
    headline: project.headline,
    headlineKind: project.headlineKind,
    summary: project.summary,
    problem: project.problem,
    proposedSolution: project.proposedSolution,
    intendedOutcomes: project.intendedOutcomes,
    verifiedOutcomes: project.verifiedOutcomes,
    contributions: project.contributions,
    technologies: project.technologies,
    projectStatus: project.projectStatus,
    statusEvidenceIds: project.statusEvidenceIds,
    repositories: project.repositories,
    liveDemos: project.liveDemos,
    apkDownloads: project.apkDownloads,
    screenshots: project.screenshots,
    architecture: project.architecture,
    featured: project.featured,
    displayOrder: project.displayOrder,
    publication: { status: 'published', readiness: project.publication.readiness },
    evidence: project.evidence.map((source) => ({
      id: source.id,
      kind: source.kind,
      label: source.kind === 'owner-brief' ? 'Owner-provided description' : source.label,
      url:
        source.kind === 'owner-brief'
          ? null
          : source.reference.startsWith('https://')
            ? source.reference
            : `/media/${source.reference}`,
      checkedAt: source.kind === 'owner-brief' ? null : source.checkedAt,
    })),
  };
}

export function publicManifest(
  content: Awaited<ReturnType<typeof validateContent>>,
): PublicManifest {
  return PublicManifestSchema.parse({
    schemaVersion: 1,
    profile: content.profile,
    projects: content.projects
      .filter((project) => project.publication.status === 'published')
      .map(projectPublic),
  });
}

export async function generatePublicContent({
  contentRoot = join(workspaceRoot, 'content'),
  outputRoot = join(workspaceRoot, '.generated'),
} = {}) {
  if (
    resolve(contentRoot) !== join(workspaceRoot, 'content') ||
    resolve(outputRoot) !== join(workspaceRoot, '.generated')
  )
    throw new Error('Generation roots must belong to this build workspace');
  await cleanOutput(outputRoot);
  const content = await validateContent({ contentRoot });
  const manifest = publicManifest(content);
  const media = new Set(manifest.projects.flatMap(mediaReferences));
  if (manifest.profile.image) media.add(manifest.profile.image.assetPath);
  await mkdir(join(outputRoot, 'media'), { recursive: true });
  try {
    for (const path of [...media].sort()) {
      const target = join(outputRoot, 'media', path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(await containedFile(contentRoot, `media/${path}`), target);
    }
    await writeFile(
      join(outputRoot, 'public-content.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return manifest;
  } catch (error) {
    await cleanOutput(outputRoot);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'check') {
      const content = await validateContent();
      console.log(`Validated ${content.projects.length} project record(s).`);
    } else if (process.argv[2] === 'generate') {
      const manifest = await generatePublicContent();
      console.log(`Generated ${manifest.projects.length} published project(s).`);
    } else throw new Error('Usage: node scripts/content/generate.ts check|generate');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
