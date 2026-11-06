import { expect, test } from '@playwright/test';
import { createServer, preview } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { developmentPages, staticPreview } from '../../scripts/serve.mjs';
import { dispose, png, project, run, workspace, writeProject } from '../content/fixtures';

const projects = [
  ['saklolo161', 'Improving Emergency Reporting and Response Coordination'],
  ['bistrobuddies-app', 'Simplifying Coffee Ordering and Business Operations'],
  ['bistrobuddies-promo', 'Making a Mobile Coffee App Easier to Discover'],
  ['erp-quotation-migrator', 'Turning PDF Quotations into Structured, Editable Records'],
] as const;

for (const path of ['/Projects/saklolo161/', '/projects/saklolo161//', '/projects/%73aklolo161/']) {
  test(`R4 alias ${path} remains a 404 through hydration and client navigation`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Page not found');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (/hydration|did not match|Minified React error/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await page.evaluate(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Building Problem-Solving Software with AI.' }),
    ).toBeVisible();
    await page.evaluate((path) => {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    expect(errors).toEqual([]);
  });
}

for (const [slug, headline] of projects) {
  test(`${slug}: static content, refresh, retained-DOM hydration and client routing`, async ({
    page,
    request,
  }) => {
    const path = `/projects/${slug}/`;
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(headline);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || /hydration|did not match/i.test(message.text()))
        errors.push(message.text());
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/assets/*.js', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(path, { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
    const original = await page.getByRole('main').elementHandle();
    release();
    await page.waitForLoadState('load');
    await page.evaluate(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Building Problem-Solving Software with AI.' }),
    ).toBeVisible();
    expect(await original?.evaluate((element) => element.isConnected)).toBe(true);
    // A client route transition proves hydration ran; a fresh document was never requested.
    await page.evaluate((path) => {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
    expect(original).not.toBeNull();
    expect((await page.reload())?.status()).toBe(200);
    await expect(
      page.getByText('Preliminary preview · Evidence pending', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Screenshots pending', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(1);
    await page.getByRole('link', { name: 'Back to projects' }).click();
    await expect(page).toHaveURL('/#projects');
    expect(errors).toEqual([]);
  });

  test(`${slug}: native listing, reading and back link without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/');
      await page.getByRole('link', { name: headline }).click();
      await expect(page).toHaveURL(`http://127.0.0.1:4173/projects/${slug}/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
      await page.getByRole('link', { name: 'Back to projects' }).click();
      await expect(page.getByRole('heading', { name: 'Project previews' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test.describe('isolated publication fixtures', () => {
  test.describe.configure({ mode: 'default' });
  let root = '';
  let server: PreviewServer | ViteDevServer | undefined;
  test.afterEach(async () => {
    if (server && 'close' in server) await server.close();
    else if (server)
      await new Promise<void>((resolve, reject) =>
        server!.httpServer!.close((error) => (error ? reject(error) : resolve())),
      );
    server = undefined;
    if (root) {
      await dispose(root);
      root = '';
    }
  });
  test('empty published set serves usable HTML and draft 404 before and after hydration', async ({
    page,
  }) => {
    root = await workspace();
    await writeProject(
      root,
      { ...project('draft-only'), publication: { status: 'draft', readiness: 'preliminary' } },
      'draft-only',
    );
    await run(root);
    server = await preview({
      root,
      configFile: join(root, 'vite.config.ts'),
      plugins: [staticPreview(join(root, 'dist'))],
      preview: { port: 0 },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing preview address');
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin);
    await expect(page.getByText('Project previews are being prepared.')).toBeVisible();
    expect((await page.goto(`${origin}/projects/draft-only/`))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.evaluate(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByText('Project previews are being prepared.')).toBeVisible();
  });
  test('generated media serves exact bytes in dev and image errors leave an honest fallback', async ({
    page,
    request,
  }) => {
    root = await workspace();
    await writeFile(join(root, 'content/media/probe.png'), png);
    await writeProject(root, {
      ...project(),
      screenshots: [
        {
          assetPath: 'probe.png',
          alt: 'Synthetic test image',
          caption: null,
          width: 1,
          height: 1,
          evidenceIds: ['brief'],
        },
      ],
    });
    await run(root, 'scripts/content/generate.ts', 'generate');
    server = await createServer({
      root,
      configFile: join(root, 'vite.config.ts'),
      plugins: [developmentPages()],
      server: { port: 0 },
      logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing dev address');
    const origin = `http://127.0.0.1:${address.port}`;
    const image = await request.get(`${origin}/media/probe.png`);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    expect(await image.body()).toEqual(png);
    await page.route('**/media/probe.png', (route) => route.abort());
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.getByText('Screenshots pending')).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });
});
