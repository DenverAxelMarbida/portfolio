import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dispose, png, project, run, text, workspace, writeProject } from './fixtures';

let root: string;
afterEach(async () => {
  if (root) {
    await dispose(root);
    root = '';
  }
});

test('tracer renders generated Saklolo161 data through the actual production renderer', async () => {
  root = await workspace();
  await writeProject(root, project());
  await run(root);
  expect(await text(root, 'dist/index.html')).toContain('href="/projects/saklolo161/"');
  expect(await text(root, 'dist/projects/saklolo161/index.html')).toContain(
    'Improving Emergency Reporting and Response Coordination',
  );
  const manifest = await text(root, '.generated/public-content.json');
  expect(manifest).toContain('Owner-provided description');
  for (const privateText of [
    'INTERNAL_IDENTITY_SENTINEL',
    'AUTHOR_NOTES_SENTINEL',
    'PRIVATE_BRIEF_SENTINEL',
    'authorNotes',
    'internalName',
  ])
    expect(manifest).not.toContain(privateText);
});

describe('schema', () => {
  test('accepts honest unknowns and reports filename plus field for bad data', async () => {
    root = await workspace();
    await writeProject(root, project());
    await expect(run(root, 'scripts/content/generate.ts', 'check')).resolves.toBeDefined();
    await writeProject(root, { ...project(), displayOrder: -1 });
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(
      /saklolo161.json.*displayOrder/s,
    );
  });

  test.each([
    ['version', { schemaVersion: 2 }],
    ['unknown key', { surprise: true }],
    ['slug path', { slug: '../escape' }],
    ['filename mismatch', { slug: 'different' }],
    ['order', { displayOrder: 1.5 }],
    ['enum', { projectStatus: 'done' }],
    ['missing status evidence', { projectStatus: 'released' }],
    ['duplicate evidence', { evidence: [project().evidence[0], project().evidence[0]] }],
    ['dangling evidence', { technologies: [{ name: 'Unknown', evidenceIds: ['absent'] }] }],
    ['unsupported technology', { technologies: [{ name: 'Unknown', evidenceIds: [] }] }],
    [
      'unverified outcome',
      { verifiedOutcomes: [{ text: 'A claim', basis: 'proposed', evidenceIds: [] }] },
    ],
    [
      'owner brief cannot verify',
      { verifiedOutcomes: [{ text: 'A claim', basis: 'verified', evidenceIds: ['brief'] }] },
    ],
    [
      'unchecked source cannot verify',
      {
        evidence: [
          {
            id: 'source',
            kind: 'documentation',
            reference: 'https://vite.dev/guide/',
            label: 'Guide',
            checkedAt: null,
          },
        ],
        problem: { text: 'A claim', basis: 'verified', evidenceIds: ['source'] },
      },
    ],
    [
      'unsafe image path',
      {
        screenshots: [
          {
            assetPath: '../secret.png',
            alt: 'Test diagram',
            caption: null,
            width: 1,
            height: 1,
            evidenceIds: ['brief'],
          },
        ],
      },
    ],
    ['invalid evidence date', { evidence: [{ ...project().evidence[0], checkedAt: 'yesterday' }] }],
    [
      'unknown nested key',
      { publication: { status: 'published', readiness: 'preliminary', private: true } },
    ],
  ])('rejects %s', async (_name, change) => {
    root = await workspace();
    await writeProject(root, { ...project(), ...change });
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(
      /content validation/i,
    );
  });

  test.each([
    'javascript:alert(1)',
    'http://github.com/a/b',
    'https://user:pass@github.com/a/b',
    'https://example.com/demo',
    'https://localhost/demo',
    'https://127.0.0.1/demo',
    '#',
    'https://github.com/DenverAxelMarbida',
    'https://github.com/a/b?token=secret',
  ])('rejects repository URL %s', async (url) => {
    root = await workspace();
    await writeProject(root, {
      ...project(),
      repositories: [{ label: 'Source', url, evidenceIds: ['brief'] }],
    });
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(/repositories/);
  });

  test('accepts checked evidence with full claim relationships and copies media byte-for-byte', async () => {
    root = await workspace();
    await mkdir(join(root, 'content/media/projects/test'), { recursive: true });
    await writeFile(join(root, 'content/media/projects/test/diagram.png'), png);
    const claim = { text: 'Synthetic fixture claim', basis: 'verified', evidenceIds: ['source'] };
    const image = {
      assetPath: 'projects/test/diagram.png',
      alt: 'Synthetic diagram',
      caption: 'Test only',
      width: 1,
      height: 1,
      evidenceIds: ['source'],
    };
    await writeProject(root, {
      ...project(),
      problem: claim,
      proposedSolution: { ...claim, basis: 'proposed' },
      intendedOutcomes: [{ ...claim, basis: 'proposed' }],
      verifiedOutcomes: [claim],
      contributions: [claim],
      technologies: [{ name: 'Test only', evidenceIds: ['source'] }],
      projectStatus: 'prototype',
      statusEvidenceIds: ['source'],
      repositories: [
        { label: 'Source', url: 'https://github.com/vitejs/vite', evidenceIds: ['source'] },
      ],
      liveDemos: [{ label: 'Docs', url: 'https://vite.dev/', evidenceIds: ['source'] }],
      apkDownloads: [
        {
          label: 'Artifact',
          url: 'https://github.com/vitejs/vite/releases/download/test/test.apk',
          version: null,
          sha256: null,
          evidenceIds: ['source'],
        },
      ],
      screenshots: [image],
      architecture: {
        summary: claim,
        decisions: [claim],
        diagrams: [image],
        evidenceIds: ['source'],
      },
      evidence: [
        {
          id: 'source',
          kind: 'documentation',
          reference: 'https://vite.dev/guide/',
          label: 'Fixture source',
          checkedAt: '2026-11-05',
        },
        {
          id: 'image',
          kind: 'screenshot',
          reference: 'projects/test/diagram.png',
          label: 'Fixture image',
          checkedAt: null,
        },
      ],
    });
    await run(root, 'scripts/content/generate.ts', 'generate');
    expect(await readFile(join(root, '.generated/media/projects/test/diagram.png'))).toEqual(png);
    await run(root);
    const html = await text(root, 'dist/projects/saklolo161/index.html');
    for (const value of [
      'Synthetic fixture claim',
      'Intended outcomes',
      'Contributions',
      'Technologies',
      'Architecture',
      'Fixture source',
      '/media/projects/test/diagram.png',
    ])
      expect(html).toContain(value);
  });

  test('rejects missing files, incorrect dimensions and media symlink escape', async () => {
    root = await workspace();
    const image = {
      assetPath: 'test.png',
      alt: 'Synthetic test',
      caption: null,
      width: 2,
      height: 1,
      evidenceIds: ['brief'],
    };
    await writeProject(root, { ...project(), screenshots: [image] });
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(/test.png/);
    await writeFile(join(root, 'content/media/test.png'), png);
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(/dimensions/i);
    await symlink(resolve('content/media/profile'), join(root, 'content/media/escape'), 'junction');
    await writeProject(root, {
      ...project(),
      screenshots: [{ ...image, assetPath: 'escape/profile.jpg', width: 1872, height: 1848 }],
    });
    await expect(run(root, 'scripts/content/generate.ts', 'check')).rejects.toThrow(
      /symlink|outside/i,
    );
  });

  test('invalid generation removes the previous manifest rather than retaining stale publication', async () => {
    root = await workspace();
    await writeProject(root, project());
    await run(root, 'scripts/content/generate.ts', 'generate');
    await writeProject(root, { ...project(), schemaVersion: 0 });
    await expect(run(root, 'scripts/content/generate.ts', 'generate')).rejects.toThrow();
    await expect(text(root, '.generated/public-content.json')).rejects.toThrow(/ENOENT/);
  });
});

test('initial records contain exactly the four authorized preliminary publications in order', async () => {
  const slugs = [
    'saklolo161',
    'bistrobuddies-app',
    'bistrobuddies-promo',
    'erp-quotation-migrator',
  ];
  expect((await readdir('content/projects')).sort()).toEqual(
    slugs.map((slug) => `${slug}.json`).sort(),
  );
  for (const [index, slug] of slugs.entries()) {
    const record: unknown = JSON.parse(await readFile(`content/projects/${slug}.json`, 'utf8'));
    expect(record).toMatchObject({
      slug,
      publication: { status: 'published', readiness: 'preliminary' },
      displayOrder: index,
      featured: true,
      projectStatus: 'unknown',
      technologies: [],
      contributions: [],
      verifiedOutcomes: [],
      screenshots: [],
      repositories: [],
      liveDemos: [],
      apkDownloads: [],
      architecture: null,
    });
  }
  await run(resolve('.'), 'scripts/content/generate.ts', 'check');
  const { validateContent, publicManifest } = await import('../../scripts/content/generate');
  expect(publicManifest(await validateContent()).projects.map((record) => record.slug)).toEqual(
    slugs,
  );
});
