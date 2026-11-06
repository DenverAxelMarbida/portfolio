import { afterEach, expect, test, vi } from 'vitest';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { HttpsUrl, ProjectSchema } from '../../scripts/content/schema';
import { readImage } from '../../scripts/content/files';
import { dispose, png, project, run, text, workspace, writeProject } from './fixtures';

let root = '';
afterEach(async () => {
  vi.useRealTimers();
  if (root) {
    await dispose(root);
    root = '';
  }
});

test.each([
  '-foo.com',
  'foo-.com',
  `${'a'.repeat(64)}.com`,
  `${'a'.repeat(63)}.`.repeat(4) + 'com',
])('R6 rejects invalid DNS hostname %s', (host) =>
  expect(HttpsUrl.safeParse(`https://${host}/`).success).toBe(false),
);

test('R6 permits valid boundary labels and internationalized HTTPS hosts', () => {
  for (const host of ['a-b.com', `${'a'.repeat(63)}.com`, 'bücher.de'])
    expect(HttpsUrl.safeParse(`https://${host}/`).success, host).toBe(true);
});

test('R7 checked dates cannot be later than the current UTC date, including verified evidence', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T23:59:59Z'));
  for (const [date, valid] of [
    [null, true],
    ['2026-11-05', true],
    ['2026-11-06', true],
    ['2026-11-07', false],
    ['2999-01-01', false],
  ] as const) {
    const record = {
      ...project(),
      evidence: [
        {
          id: 'source',
          kind: 'documentation',
          label: 'Guide',
          reference: 'https://vite.dev/guide/',
          checkedAt: date,
        },
      ],
      problem: date ? { text: 'Fixture claim', basis: 'verified', evidenceIds: ['source'] } : null,
    };
    expect(ProjectSchema.safeParse(record).success, String(date)).toBe(valid);
  }
  vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));
  expect(
    ProjectSchema.safeParse({
      ...project(),
      evidence: [{ ...project().evidence[0], checkedAt: '2026-11-07' }],
    }).success,
  ).toBe(true);
});

test('R5 valid PNG and the original JPEG decode without altering their bytes', async () => {
  root = await workspace();
  await writeFile(join(root, 'content/media/valid.png'), png);
  expect(
    await readImage(join(root, 'content/media'), 'valid.png', { width: 1, height: 1 }),
  ).toEqual(png);
  const original = await readFile('content/media/profile/profile.jpg');
  expect(
    await readImage('content/media', 'profile/profile.jpg', { width: 1872, height: 1848 }),
  ).toEqual(original);
});

test.each([
  'png-header',
  'png-truncated',
  'png-corrupt',
  'png-invalid-pixels',
  'jpeg-header',
  'jpeg-truncated',
])('R5 rejects %s before bundling or publishing media', async (kind) => {
  root = await workspace();
  const jpeg = kind.startsWith('jpeg');
  const path = jpeg ? 'broken.jpg' : 'broken.png';
  let bytes: Buffer;
  if (kind === 'png-header') {
    bytes = Buffer.alloc(33);
    png.copy(bytes, 0, 0, 33);
  } else if (kind === 'png-truncated') bytes = png.subarray(0, png.length - 12);
  else if (kind === 'png-corrupt' || kind === 'png-invalid-pixels') {
    bytes = Buffer.from(png);
    bytes[45] = bytes[45]! ^ 0xff;
    if (kind === 'png-invalid-pixels') bytes.writeUInt32BE(crc32(bytes.subarray(37, 52)), 52);
  } else if (kind === 'jpeg-truncated') {
    const original = await readFile('content/media/profile/profile.jpg');
    bytes = original.subarray(0, original.length - 2);
  } else
    bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xd9]);
  await writeFile(join(root, 'content/media', path), bytes);
  await writeProject(root, {
    ...project(),
    screenshots: [
      {
        assetPath: path,
        alt: 'Broken fixture',
        caption: null,
        width: kind === 'jpeg-truncated' ? 1872 : 1,
        height: kind === 'jpeg-truncated' ? 1848 : 1,
        evidenceIds: ['brief'],
      },
    ],
  });
  for (const command of ['check', 'generate'])
    await expect(run(root, 'scripts/content/generate.ts', command)).rejects.toThrow(
      /malformed|decode|incomplete/i,
    );
  try {
    await run(root);
    throw new Error('Malformed media was published');
  } catch (error) {
    expect(String(error)).toMatch(/malformed|decode|incomplete/i);
    expect((error as { stdout: string }).stdout).not.toContain('building client');
  }
  await expect(readdir(join(root, 'dist'))).rejects.toThrow(/ENOENT/);
  await expect(text(root, '.generated/public-content.json')).rejects.toThrow(/ENOENT/);
});

test('R2 nested draft prose and evidence cannot contaminate HTML or JavaScript', async () => {
  root = await workspace();
  await writeProject(root, project());
  const summary = 'PRIVATE_ARCHITECTURE_48271';
  const label = 'PRIVATE_DOCUMENT_LABEL_48271';
  const reference = 'https://vite.dev/private-draft-48271';
  const alt = 'PRIVATE_ALT_48271';
  const caption = 'PRIVATE_CAPTION_48271';
  await writeFile(join(root, 'content/media/draft.png'), png);
  await writeProject(
    root,
    {
      ...project('hidden-probe'),
      publication: { status: 'draft', readiness: 'preliminary' },
      architecture: {
        summary: { text: summary, basis: 'proposed', evidenceIds: [] },
        decisions: [],
        diagrams: [],
        evidenceIds: ['brief'],
      },
      screenshots: [
        { assetPath: 'draft.png', alt, caption, width: 1, height: 1, evidenceIds: ['brief'] },
      ],
      evidence: [
        ...project().evidence,
        { id: 'docs', kind: 'documentation', label, reference, checkedAt: null },
      ],
    },
    'hidden-probe',
  );
  await run(root);
  const js = (await readdir(join(root, 'dist/assets'))).find((path) => path.endsWith('.js'))!;
  for (const path of ['dist/index.html', `dist/assets/${js}`]) {
    const original = await text(root, path);
    for (const value of [summary, label, reference, alt, caption]) {
      await writeFile(join(root, path), original + `\n/* ${value} */`);
      await expect(
        run(root, 'scripts/check-public-artifacts.ts'),
        `${path}: ${value}`,
      ).rejects.toThrow(/leak|differs/i);
      await writeFile(join(root, path), original);
    }
  }
});

test('R3 private values matching legitimate UI or library text do not invalidate clean output', async () => {
  root = await workspace();
  await writeProject(root, project());
  await run(root);
  for (const value of ['Evidence pending', 'Page not found', 'function', 'a']) {
    await writeProject(root, { ...project(), authorNotes: value, internalName: value });
    await expect(run(root, 'scripts/check-public-artifacts.ts')).resolves.toBeDefined();
  }
  await run(root);
  const original = await text(root, 'dist/index.html');
  await writeFile(join(root, 'dist/index.html'), original + 'Evidence pending');
  await expect(run(root, 'scripts/check-public-artifacts.ts')).rejects.toThrow(/leak|differs/i);
});
