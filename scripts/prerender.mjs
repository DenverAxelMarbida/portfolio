import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, createServer, preview } from 'vite';
import { createDocument } from './html.mjs';
import { developmentPages, staticPreview } from './serve.mjs';

/** @typedef {typeof import('../src/entry-server')} ServerEntry */

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const generated = resolve(root, '.generated');
const configFile = resolve(root, 'vite.config.ts');

async function buildSite() {
  await Promise.all([
    rm(dist, { recursive: true, force: true }),
    rm(generated, { recursive: true, force: true }),
  ]);
  await build({
    root,
    configFile,
    build: { rolldownOptions: { input: resolve(root, 'src/entry-client.tsx') } },
  });
  await build({
    root,
    configFile,
    build: {
      ssr: resolve(root, 'src/entry-server.tsx'),
      outDir: resolve(generated, 'server'),
      manifest: false,
      rolldownOptions: { output: { entryFileNames: 'entry-server.js' } },
    },
  });

  const server = /** @type {ServerEntry} */ (
    await import(pathToFileURL(resolve(generated, 'server/entry-server.js')).href)
  );
  const manifest = /** @type {import('vite').Manifest} */ (
    JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
  );
  const entry = manifest['src/entry-client.tsx'];
  if (!entry) throw new Error('Browser entry is missing from the Vite manifest.');
  const styles = new Set();
  const preloads = new Set();
  const seen = new Set();
  /** @param {import('vite').ManifestChunk} chunk */
  function collectAssets(chunk) {
    if (seen.has(chunk.file)) return;
    seen.add(chunk.file);
    for (const css of chunk.css ?? []) styles.add(css);
    for (const key of chunk.imports ?? []) {
      const dependency = manifest[key];
      if (!dependency) throw new Error(`Missing manifest chunk: ${key}`);
      preloads.add(dependency.file);
      collectAssets(dependency);
    }
  }
  collectAssets(entry);
  const assets = [
    ...[...styles].map((file) => `<link rel="stylesheet" href="/${file}">`),
    ...[...preloads].map((file) => `<link rel="modulepreload" href="/${file}">`),
    `<script type="module" src="/${entry.file}"></script>`,
  ].join('\n    ');

  for (const pathname of server.getStaticPaths()) {
    if (pathname !== '/' && !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(pathname)) {
      throw new Error(`Invalid static route: ${pathname}`);
    }
    const page = server.renderPage(pathname);
    if (page.status !== 200)
      throw new Error(`Static route did not render successfully: ${pathname}`);
    const destination = resolve(dist, `.${pathname}`, 'index.html');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, createDocument(page.html, assets, page.status));
  }
  const notFound = server.renderPage('/404.html');
  await writeFile(resolve(dist, '404.html'), createDocument(notFound.html, assets, 404));
  await rm(resolve(dist, '.vite'), { recursive: true, force: true });
  console.log(`Prerendered ${server.getStaticPaths().length} route(s) and 404.html.`);
}

switch (process.argv[2]) {
  case 'build':
    await buildSite();
    break;
  case 'preview': {
    const server = await preview({ root, configFile, plugins: [staticPreview(dist)] });
    server.printUrls();
    break;
  }
  case 'dev': {
    const server = await createServer({ root, configFile, plugins: [developmentPages()] });
    await server.listen();
    server.printUrls();
    break;
  }
  default:
    throw new Error('Usage: node scripts/prerender.mjs build|dev|preview');
}
