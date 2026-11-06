import { afterEach, expect, test } from 'vitest';
import { appendFile, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dispose, png, project, run, text, workspace, writeProject } from './fixtures';
import { getProjectBySlug, getPublishedProjects } from '../../src/content/selectors';
import { publicManifest } from '../../scripts/content/generate';
import { ProjectSchema, ProfileSchema } from '../../scripts/content/schema';

let root = '';
afterEach(async () => {
  if (root) {
    await dispose(root);
    root = '';
  }
});

test('two actual builds remove formerly published text, routes, media and hashed assets', async () => {
  root = await workspace();
  const record = {
    ...project('publication-probe'),
    headline: 'PUBLICATION_PROBE_84391',
    screenshots: [
      {
        assetPath: 'probe.png',
        alt: 'Synthetic publication probe',
        caption: null,
        width: 1,
        height: 1,
        evidenceIds: ['brief'],
      },
    ],
  };
  await writeProject(root, record, record.slug);
  await writeFile(join(root, 'content/media/probe.png'), png);
  await run(root);
  expect(await text(root, 'dist/projects/publication-probe/index.html')).toContain(record.headline);
  expect(await readFile(join(root, 'dist/media/probe.png'))).toEqual(png);
  const firstAssets = await readdir(join(root, 'dist/assets'));
  await writeProject(
    root,
    { ...record, publication: { status: 'draft', readiness: 'preliminary' } },
    record.slug,
  );
  await run(root);
  expect(await text(root, 'dist/index.html')).toContain('Project previews are being prepared.');
  await expect(text(root, 'dist/projects/publication-probe/index.html')).rejects.toThrow(/ENOENT/);
  await expect(text(root, 'dist/media/probe.png')).rejects.toThrow(/ENOENT/);
  const secondAssets = await readdir(join(root, 'dist/assets'));
  expect(secondAssets.filter((file) => file.endsWith('.js'))).not.toEqual(
    firstAssets.filter((file) => file.endsWith('.js')),
  );
  for (const file of secondAssets)
    expect(await text(root, `dist/assets/${file}`)).not.toContain(record.headline);
  expect(await text(root, '.generated/public-content.json')).not.toContain('publication-probe');
  await run(root, 'scripts/check-public-artifacts.ts');
});

test('scanner rejects contaminated HTML, source maps, manifest fields and unexpected media', async () => {
  root = await workspace();
  await writeProject(root, project());
  await run(root);
  const html = await text(root, 'dist/index.html');
  await appendFile(join(root, 'dist/index.html'), project().authorNotes);
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(/leak/i);
  await writeFile(join(root, 'dist/index.html'), html);
  const map = join(root, 'dist/assets/entry-leak.js.map');
  await writeFile(map, JSON.stringify({ sourcesContent: [project().authorNotes] }));
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(/map|unexpected/i);
  const { rm } = await import('node:fs/promises');
  await rm(map);
  const manifest = await text(root, '.generated/public-content.json');
  await writeFile(
    join(root, '.generated/public-content.json'),
    manifest.replace('"slug":', '"authorNotes": "leaked", "slug":'),
  );
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(/manifest/i);
  await writeFile(join(root, '.generated/public-content.json'), manifest);
  await writeFile(join(root, 'dist/media/unselected.png'), png);
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(/media|unexpected/i);
});

test('draft and published author fields never appear in public files', async () => {
  root = await workspace();
  await writeProject(root, project());
  await writeProject(
    root,
    {
      ...project('hidden-probe'),
      headline: 'DRAFT_ONLY_SENTINEL_93182',
      publication: { status: 'draft', readiness: 'preliminary' },
    },
    'hidden-probe',
  );
  await run(root);
  const files = await readdir(join(root, 'dist'), { recursive: true, withFileTypes: true });
  for (const file of files.filter((file) => file.isFile())) {
    const output = await readFile(join(file.parentPath, file.name), 'utf8');
    for (const secret of [
      'DRAFT_ONLY_SENTINEL_93182',
      'hidden-probe',
      project().authorNotes,
      project().internalName,
      project().evidence[0]!.reference,
    ])
      expect(output).not.toContain(secret);
  }
});

test('profile originals and selected project media are preserved, and byte tampering fails verification', async () => {
  root = await workspace();
  await writeProject(root, project());
  await writeFile(join(root, 'content/media/original.png'), png);
  await writeFile(
    join(root, 'content/profile.json'),
    JSON.stringify({
      name: 'Fixture',
      title: 'Test profile',
      headline: null,
      introduction: null,
      github: 'https://github.com/vitejs',
      email: 'fixture@vite.dev',
      image: { assetPath: 'original.png', alt: 'Synthetic original', width: 1, height: 1 },
    }),
  );
  await run(root);
  expect(await readFile(join(root, 'dist/media/original.png'))).toEqual(png);
  await appendFile(join(root, 'dist/media/original.png'), 'changed');
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(
    /Changed media bytes/,
  );
});

test('invalid records remove old output and fail before Vite bundling', async () => {
  root = await workspace();
  await writeProject(root, project());
  await run(root);
  await writeProject(root, { ...project(), slug: '../bad' });
  try {
    await run(root);
    throw new Error('Build unexpectedly succeeded');
  } catch (error) {
    expect(String(error)).toContain('Content validation failed');
    expect((error as { stdout: string }).stdout).not.toContain('building client');
  }
  await expect(readdir(join(root, 'dist'))).rejects.toThrow(/ENOENT/);
  await expect(text(root, '.generated/public-content.json')).rejects.toThrow(/ENOENT/);
});

test('cleanup refuses arbitrary paths and symlink output without touching their contents', async () => {
  root = await workspace();
  await mkdir(join(root, 'keep'));
  await writeFile(join(root, 'keep/sentinel'), 'keep me');
  await writeFile(
    join(root, 'probe.mjs'),
    `import {cleanOutput} from './scripts/content/files.ts'; await cleanOutput(process.argv[2]);`,
  );
  await expect(run(root, 'probe.mjs', join(root, 'keep'))).rejects.toThrow(/Refusing cleanup/);
  await symlink(join(root, 'keep'), join(root, 'dist'), 'junction');
  await expect(run(root, 'probe.mjs', join(root, 'dist'))).rejects.toThrow(/symlink/);
  expect(await text(root, 'keep/sentinel')).toBe('keep me');
});

test('browser build refuses accidental raw-author imports', async () => {
  root = await workspace();
  await writeProject(root, project());
  await appendFile(
    join(root, 'src/entry-client.tsx'),
    '\nimport raw from "../content/projects/saklolo161.json"; console.log(raw);\n',
  );
  await expect(run(root)).rejects.toThrow(/author|publication|leak/i);
});

test('selectors sort without mutation, filter featured and cannot resolve excluded drafts', () => {
  const profile = ProfileSchema.parse({
    name: 'Test',
    title: 'Fixture',
    headline: null,
    introduction: null,
    github: 'https://github.com/vitejs',
    email: 'fixture@vite.dev',
    image: null,
  });
  const manifest = publicManifest({
    profile,
    projects: [
      ProjectSchema.parse({ ...project('z-last'), displayOrder: 2 }),
      ProjectSchema.parse({ ...project('a-first'), displayOrder: 1, featured: false }),
      ProjectSchema.parse({
        ...project('draft-only'),
        publication: { status: 'draft', readiness: 'preliminary' },
      }),
    ],
  });
  expect(getPublishedProjects(manifest).map((item) => item.slug)).toEqual(['a-first', 'z-last']);
  expect(manifest.projects.map((item) => item.slug)).toEqual(['z-last', 'a-first']);
  expect(getPublishedProjects(manifest, { featuredOnly: true }).map((item) => item.slug)).toEqual([
    'z-last',
  ]);
  expect(getProjectBySlug(manifest, 'draft-only')).toBeUndefined();
  expect(getProjectBySlug(manifest, 'absent')).toBeUndefined();
  expect(getProjectBySlug(manifest, 'a-first')?.displayName).toBe('Saklolo161');
});
