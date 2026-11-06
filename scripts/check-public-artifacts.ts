import { isDeepStrictEqual, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { containedFile, workspaceRoot } from './content/files.ts';
import { mediaReferences, publicManifest, validateContent } from './content/generate.ts';

async function files(root: string, prefix = ''): Promise<string[]> {
  if ((await lstat(root)).isSymbolicLink()) throw new Error(`Symlink output: ${root}`);
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlink output: ${path}`);
    if (entry.isDirectory()) result.push(...(await files(join(root, entry.name), `${path}/`)));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unexpected output: ${path}`);
  }
  return result.sort();
}

async function comparePublicOnlyBuild(manifestText: string, output: string[]) {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const reference = await mkdtemp(join(parent, 'portfolio-public-reference-'));
  try {
    // Author records and unselected media are never supplied to this reference build.
    for (const path of ['scripts', 'src', 'vite.config.ts', 'package.json'])
      await cp(join(workspaceRoot, path), join(reference, path), { recursive: true });
    await symlink(
      await realpath(join(workspaceRoot, 'node_modules')),
      join(reference, 'node_modules'),
      'junction',
    );
    await mkdir(join(reference, '.generated'), { recursive: true });
    await writeFile(join(reference, '.generated/public-content.json'), manifestText);
    await cp(join(workspaceRoot, '.generated/media'), join(reference, '.generated/media'), {
      recursive: true,
    });
    await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { buildPublicSite } from './scripts/prerender.mjs'; await buildPublicSite();",
      ],
      { cwd: reference, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const expectedOutput = await files(join(reference, 'dist'));
    if (!isDeepStrictEqual(expectedOutput, output))
      throw new Error(
        `Public output inventory differs from public-only reference (possible author/draft leak): expected ${expectedOutput.join(', ')}, got ${output.join(', ')}`,
      );
    for (const path of output) {
      const actual = await readFile(await containedFile(join(workspaceRoot, 'dist'), path));
      const expected = await readFile(await containedFile(join(reference, 'dist'), path));
      if (!actual.equals(expected))
        throw new Error(
          `Public output differs from public-only reference: ${path} (possible author/draft leak)`,
        );
    }
  } finally {
    await rm(reference, { recursive: true, force: true });
  }
}

export async function checkPublicArtifacts() {
  const content = await validateContent();
  const expected = publicManifest(content);
  const generated = join(workspaceRoot, '.generated');
  const dist = join(workspaceRoot, 'dist');
  const manifestText = await readFile(
    await containedFile(generated, 'public-content.json'),
    'utf8',
  );
  if (!isDeepStrictEqual(JSON.parse(manifestText), expected))
    throw new Error('Public manifest differs from validated projection');
  const media = new Set(expected.projects.flatMap(mediaReferences));
  if (expected.profile.image) media.add(expected.profile.image.assetPath);
  const expectedMedia = [...media].sort();
  if (!isDeepStrictEqual(await files(join(generated, 'media')), expectedMedia))
    throw new Error('Generated media differs from public allowlist');
  if (!isDeepStrictEqual(await files(join(dist, 'media')), expectedMedia))
    throw new Error('Deployed media differs from public allowlist');
  for (const path of media) {
    const original = await readFile(
      await containedFile(join(workspaceRoot, 'content'), `media/${path}`),
    );
    for (const base of [generated, dist]) {
      if (!(await readFile(await containedFile(base, `media/${path}`))).equals(original))
        throw new Error(`Changed media bytes: ${path}`);
    }
  }
  const html = new Set([
    'index.html',
    '404.html',
    ...expected.projects.map((project) => `projects/${project.slug}/index.html`),
  ]);
  const output = await files(dist);
  for (const path of html)
    if (!output.includes(path)) throw new Error(`Missing public route: ${path}`);
  for (const path of output) {
    if (
      !html.has(path) &&
      !/^assets\/[\w-]+-[\w-]{8,}\.(js|css|woff2)$/.test(path) &&
      !path.startsWith('media/') &&
      path !== 'licenses/ibm-plex-sans-OFL.txt'
    )
      throw new Error(`Unexpected public output (source maps forbidden): ${path}`);
  }
  if (!output.some((path) => path.endsWith('.js')) || !output.some((path) => path.endsWith('.css')))
    throw new Error('Missing browser assets');
  if (!output.some((path) => path.endsWith('.woff2')))
    throw new Error('Missing self-hosted font assets');
  if (!output.includes('licenses/ibm-plex-sans-OFL.txt')) throw new Error('Missing font license');
  await comparePublicOnlyBuild(`${JSON.stringify(expected, null, 2)}\n`, output);
  console.log(`Verified ${html.size} HTML documents and ${media.size} public media file(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await checkPublicArtifacts();
