import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exec = promisify(execFile);
const owned = new Set<string>();

export function project(slug = 'saklolo161') {
  return {
    schemaVersion: 1,
    slug,
    internalName: 'INTERNAL_IDENTITY_SENTINEL_4829',
    displayName: 'Saklolo161',
    headline: 'Improving Emergency Reporting and Response Coordination',
    headlineKind: 'intended-outcome',
    summary: 'Emergency response and incident coordination platform.',
    problem: null,
    proposedSolution: null,
    intendedOutcomes: [],
    verifiedOutcomes: [],
    contributions: [],
    technologies: [],
    projectStatus: 'unknown',
    statusEvidenceIds: [],
    repositories: [],
    liveDemos: [],
    apkDownloads: [],
    screenshots: [],
    architecture: null,
    featured: true,
    displayOrder: 0,
    publication: { status: 'published', readiness: 'preliminary' },
    evidence: [
      {
        id: 'brief',
        kind: 'owner-brief',
        reference: 'PRIVATE_BRIEF_SENTINEL_9274',
        label: 'Internal briefing',
        checkedAt: null,
      },
    ],
    authorNotes: 'AUTHOR_NOTES_SENTINEL_1893',
  };
}

export async function workspace() {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'portfolio-publishing-'));
  owned.add(root);
  for (const path of ['scripts', 'src', 'vite.config.ts', 'package.json']) {
    await cp(resolve(path), join(root, path), { recursive: true });
  }
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'junction');
  await mkdir(join(root, 'content/projects'), { recursive: true });
  await mkdir(join(root, 'content/media'), { recursive: true });
  return root;
}

export async function dispose(root: string) {
  if (!owned.delete(root)) throw new Error('Not an owned fixture workspace');
  await rm(root, { recursive: true, force: true });
}

export async function writeProject(root: string, record: object, filename = 'saklolo161') {
  await writeFile(join(root, `content/projects/${filename}.json`), JSON.stringify(record));
}

export async function run(root: string, script = 'scripts/prerender.mjs', command = 'build') {
  return exec(process.execPath, [script, command], {
    cwd: root,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export async function text(root: string, path: string) {
  return readFile(join(root, path), 'utf8');
}

// A synthetic 1x1 PNG used only in owned test workspaces.
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
