import { gzipSync } from 'node:zlib';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  BUNDLE_BUDGET,
  assertBundleBudget,
  collectBundleFiles,
  measureBundle,
  measureOutputBundle,
  type BundleMeasurement,
  type BundleManifest,
} from '../../scripts/check-bundle-budget';

const manifest: BundleManifest = {
  'src/entry-client.tsx': {
    file: 'assets/entry.js',
    imports: ['vendor'],
    dynamicImports: ['src/motion.ts'],
    css: ['assets/entry.css'],
  },
  vendor: { file: 'assets/vendor.js', imports: ['shared'] },
  shared: { file: 'assets/shared.js' },
  'src/motion.ts': { file: 'assets/motion.js', imports: ['motion-core', 'shared'] },
  'motion-core': { file: 'assets/motion-core.js' },
};

const sizes: Record<string, number> = {
  'assets/entry.js': 1_000,
  'assets/vendor.js': 2_000,
  'assets/shared.js': 300,
  'assets/motion.js': 25_000,
  'assets/motion-core.js': 500,
  'assets/entry.css': 700,
};

let root = '';
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = '';
  }
});

test('separates initial chunks from deferred chunks and follows static imports', () => {
  expect(collectBundleFiles(manifest, 'src/entry-client.tsx')).toEqual({
    initialJs: ['assets/entry.js', 'assets/vendor.js', 'assets/shared.js'],
    initialCss: ['assets/entry.css'],
    deferredJs: ['assets/motion.js', 'assets/motion-core.js'],
    allJs: [
      'assets/entry.js',
      'assets/vendor.js',
      'assets/shared.js',
      'assets/motion.js',
      'assets/motion-core.js',
    ],
  });
});

test('rejects a manifest with a missing entry or missing imported chunk', () => {
  expect(() => collectBundleFiles(manifest, 'src/missing.tsx')).toThrow(/entry chunk/);
  expect(() =>
    collectBundleFiles(
      { 'src/entry-client.tsx': { file: 'assets/entry.js', imports: ['missing'] } },
      'src/entry-client.tsx',
    ),
  ).toThrow(/missing/);
});

test('measures gzip bytes for each budget without double counting shared chunks', () => {
  expect(
    measureBundle(manifest, 'src/entry-client.tsx', (file) => {
      const size = sizes[file];
      if (size === undefined) throw new Error(`Unexpected file: ${file}`);
      return size;
    }),
  ).toEqual({
    initialJs: 3_300,
    initialCss: 700,
    deferredJs: 25_500,
    largestDeferredJs: { file: 'assets/motion.js', bytes: 25_000 },
    totalJs: 28_800,
  });
});

test('accepts measurements exactly at every budget limit', () => {
  const atLimit: BundleMeasurement = {
    initialJs: BUNDLE_BUDGET.initialJs,
    initialCss: BUNDLE_BUDGET.initialCss,
    deferredJs: BUNDLE_BUDGET.deferredChunk,
    largestDeferredJs: { file: 'assets/motion.js', bytes: BUNDLE_BUDGET.deferredChunk },
    totalJs: BUNDLE_BUDGET.totalJs,
  };
  expect(() => assertBundleBudget(atLimit)).not.toThrow();
});

test('fails closed when any budget is exceeded', () => {
  const baseline: BundleMeasurement = {
    initialJs: 1,
    initialCss: 1,
    deferredJs: 1,
    largestDeferredJs: { file: 'assets/motion.js', bytes: 1 },
    totalJs: 1,
  };
  expect(() => assertBundleBudget({ ...baseline, initialJs: BUNDLE_BUDGET.initialJs + 1 })).toThrow(
    /initial JS/,
  );
  expect(() =>
    assertBundleBudget({
      ...baseline,
      deferredJs: BUNDLE_BUDGET.deferredChunk + 1,
      largestDeferredJs: { file: 'assets/motion.js', bytes: BUNDLE_BUDGET.deferredChunk + 1 },
    }),
  ).toThrow(/deferred/);
  expect(() =>
    assertBundleBudget({ ...baseline, initialCss: BUNDLE_BUDGET.initialCss + 1 }),
  ).toThrow(/CSS/);
  expect(() => assertBundleBudget({ ...baseline, totalJs: BUNDLE_BUDGET.totalJs + 1 })).toThrow(
    /total JS/,
  );
});

test('reads and gzip-measures real output files', async () => {
  root = await mkdtemp(join(tmpdir(), 'bundle-budget-'));
  const assets = join(root, 'assets');
  await mkdir(assets, { recursive: true });
  const contents: Record<string, string> = {
    'entry.js': 'console.log("entry");'.repeat(20),
    'motion.js': 'export const animate = () => {};'.repeat(40),
    'entry.css': '.hero{display:block}'.repeat(10),
  };
  for (const [file, content] of Object.entries(contents)) {
    await writeFile(join(assets, file), content);
  }
  const outputManifest: BundleManifest = {
    'src/entry-client.tsx': {
      file: 'assets/entry.js',
      dynamicImports: ['src/motion.ts'],
      css: ['assets/entry.css'],
    },
    'src/motion.ts': { file: 'assets/motion.js' },
  };

  expect(await measureOutputBundle(outputManifest, root, 'src/entry-client.tsx')).toEqual({
    initialJs: gzipSync(contents['entry.js']!).length,
    initialCss: gzipSync(contents['entry.css']!).length,
    deferredJs: gzipSync(contents['motion.js']!).length,
    largestDeferredJs: {
      file: 'assets/motion.js',
      bytes: gzipSync(contents['motion.js']!).length,
    },
    totalJs: gzipSync(contents['entry.js']!).length + gzipSync(contents['motion.js']!).length,
  });
});
