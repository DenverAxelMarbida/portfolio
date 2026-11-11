import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Decimal byte budgets for the 01-04 Motion slice; CP5-S.1 limits owner-approved 2026-11-10. */
export const BUNDLE_BUDGET = {
  initialJs: 110_000,
  deferredChunk: 35_000,
  initialCss: 8_000,
  totalJs: 200_000,
} as const;

export interface BundleManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

export type BundleManifest = Record<string, BundleManifestChunk>;

export interface BundleFiles {
  initialJs: string[];
  initialCss: string[];
  deferredJs: string[];
  allJs: string[];
}

export interface BundleMeasurement {
  initialJs: number;
  initialCss: number;
  deferredJs: number;
  largestDeferredJs: { file: string; bytes: number } | null;
  totalJs: number;
}

function chunkFor(manifest: BundleManifest, key: string): BundleManifestChunk {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
  return chunk;
}

/**
 * Walks the Vite manifest and separates the chunks loaded for the initial
 * render from chunks reachable only through dynamic imports.
 */
export function collectBundleFiles(
  manifest: BundleManifest,
  entryKey = 'src/entry-client.tsx',
): BundleFiles {
  if (!manifest[entryKey]) throw new Error(`Missing manifest entry chunk: ${entryKey}`);

  const initialJs: string[] = [];
  const initialCss: string[] = [];
  const initialSeen = new Set<string>();

  function visitStatic(key: string) {
    const chunk = chunkFor(manifest, key);
    if (initialSeen.has(chunk.file)) return;
    initialSeen.add(chunk.file);
    initialJs.push(chunk.file);
    for (const css of chunk.css ?? []) {
      if (!initialCss.includes(css)) initialCss.push(css);
    }
    for (const dependency of chunk.imports ?? []) visitStatic(dependency);
  }

  visitStatic(entryKey);

  const deferredJs: string[] = [];
  const deferredSeen = new Set(initialSeen);

  function visitDynamic(key: string) {
    const chunk = chunkFor(manifest, key);
    if (deferredSeen.has(chunk.file)) return;
    deferredSeen.add(chunk.file);
    deferredJs.push(chunk.file);
    for (const dependency of chunk.imports ?? []) visitStaticDeferred(dependency);
    for (const nested of chunk.dynamicImports ?? []) visitDynamic(nested);
  }

  function visitStaticDeferred(key: string) {
    const chunk = chunkFor(manifest, key);
    if (deferredSeen.has(chunk.file)) return;
    deferredSeen.add(chunk.file);
    deferredJs.push(chunk.file);
    for (const dependency of chunk.imports ?? []) visitStaticDeferred(dependency);
    for (const nested of chunk.dynamicImports ?? []) visitDynamic(nested);
  }

  for (const key of chunkFor(manifest, entryKey).dynamicImports ?? []) visitDynamic(key);

  return {
    initialJs,
    initialCss,
    deferredJs,
    allJs: [...initialJs, ...deferredJs],
  };
}

/** Pure measurement over manifest file names and caller-supplied gzip sizes. */
export function measureBundle(
  manifest: BundleManifest,
  entryKey: string,
  gzipSize: (file: string) => number,
): BundleMeasurement {
  const files = collectBundleFiles(manifest, entryKey);
  const sum = (list: string[]) => list.reduce((total, file) => total + gzipSize(file), 0);
  const deferred = files.deferredJs.map((file) => ({ file, bytes: gzipSize(file) }));
  const largestDeferredJs = deferred.reduce<{ file: string; bytes: number } | null>(
    (largest, current) => (largest === null || current.bytes > largest.bytes ? current : largest),
    null,
  );
  return {
    initialJs: sum(files.initialJs),
    initialCss: sum(files.initialCss),
    deferredJs: deferred.reduce((total, chunk) => total + chunk.bytes, 0),
    largestDeferredJs,
    totalJs: sum(files.allJs),
  };
}

/** Reads the built assets and measures their real gzip size. */
export async function measureOutputBundle(
  manifest: BundleManifest,
  outputDirectory: string,
  entryKey = 'src/entry-client.tsx',
): Promise<BundleMeasurement> {
  const files = collectBundleFiles(manifest, entryKey);
  const wanted = [...new Set([...files.allJs, ...files.initialCss])];
  const sizes = new Map(
    await Promise.all(
      wanted.map(async (file) => {
        const bytes = await readFile(join(outputDirectory, file));
        return [file, gzipSync(bytes).length] as const;
      }),
    ),
  );
  return measureBundle(manifest, entryKey, (file) => {
    const size = sizes.get(file);
    if (size === undefined) throw new Error(`Unmeasured bundle file: ${file}`);
    return size;
  });
}

export function assertBundleBudget(measurement: BundleMeasurement): void {
  const failures: string[] = [];
  if (measurement.initialJs > BUNDLE_BUDGET.initialJs) {
    failures.push(
      `initial JS ${measurement.initialJs} B gzip exceeds ${BUNDLE_BUDGET.initialJs} B`,
    );
  }
  const largestDeferred = measurement.largestDeferredJs?.bytes ?? 0;
  if (largestDeferred > BUNDLE_BUDGET.deferredChunk) {
    failures.push(
      `deferred chunk ${measurement.largestDeferredJs!.file} is ${largestDeferred} B gzip, exceeds ${BUNDLE_BUDGET.deferredChunk} B`,
    );
  }
  if (measurement.initialCss > BUNDLE_BUDGET.initialCss) {
    failures.push(
      `initial CSS ${measurement.initialCss} B gzip exceeds ${BUNDLE_BUDGET.initialCss} B`,
    );
  }
  if (measurement.totalJs > BUNDLE_BUDGET.totalJs) {
    failures.push(`total JS ${measurement.totalJs} B gzip exceeds ${BUNDLE_BUDGET.totalJs} B`);
  }
  if (failures.length > 0) {
    throw new Error(`Bundle budget exceeded:\n- ${failures.join('\n- ')}`);
  }
}

const kb = (bytes: number) => (bytes / 1_000).toFixed(1);

/** Fails the build when measured assets exceed the approved budgets. */
export async function enforceBundleBudget(
  manifest: BundleManifest,
  outputDirectory: string,
  entryKey = 'src/entry-client.tsx',
): Promise<BundleMeasurement> {
  const measurement = await measureOutputBundle(manifest, outputDirectory, entryKey);
  assertBundleBudget(measurement);
  console.log(
    `Bundle budget: initial JS ${kb(measurement.initialJs)}/${kb(BUNDLE_BUDGET.initialJs)} KB gzip; ` +
      `CSS ${kb(measurement.initialCss)}/${kb(BUNDLE_BUDGET.initialCss)} KB; ` +
      `deferred largest ${kb(measurement.largestDeferredJs?.bytes ?? 0)}/${kb(BUNDLE_BUDGET.deferredChunk)} KB ` +
      `(${kb(measurement.deferredJs)} KB total); ` +
      `total JS ${kb(measurement.totalJs)}/${kb(BUNDLE_BUDGET.totalJs)} KB.`,
  );
  return measurement;
}
