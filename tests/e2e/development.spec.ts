import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { developmentPages } from '../../scripts/serve.mjs';

test.describe('development URL handling', () => {
  test.describe.configure({ mode: 'default' });
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    server = await createServer({
      configFile: resolve('vite.config.ts'),
      plugins: [developmentPages()],
      server: { port: 0 },
      logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing dev server address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test('author sources, originals and server bundles are inaccessible through Vite file routes', async ({
    request,
  }) => {
    for (const path of [
      'content/projects/saklolo161.json',
      'content/media/profile/profile.jpg',
      '.planning/STATE.md',
      'scripts/content/schema.ts',
      '.generated/server/entry-server.js',
      'package.json',
    ]) {
      for (const url of [
        `/${path}`,
        `/${path}?raw`,
        `/@fs/${resolve(path).replaceAll('\\', '/')}`,
        `/@fs/${resolve(path).replaceAll('\\', '/')}?import`,
        `/@id//${path}?import`,
        `/@id//${path}?raw`,
        `/@id/%2F${path}?raw`,
      ]) {
        const response = await request.get(`${origin}${url}`);
        expect([400, 404], url).toContain(response.status());
        expect(await response.text()).not.toContain('authorNotes');
      }
    }
  });

  for (const pathname of [
    '/%3Ffoo',
    '/%23foo',
    '/Projects/saklolo161/',
    '/projects/saklolo161//',
    '/projects/saklolo161',
  ]) {
    test(`encoded delimiter ${pathname} renders and hydrates NotFound`, async ({
      page,
      request,
    }) => {
      const response = await request.get(`${origin}${pathname}`);
      expect(response.status()).toBe(404);
      expect(await response.text()).toMatch(/<h1\b[^>]*>Page not found<\/h1>/);

      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (/hydration|did not match|Minified React error/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      let releaseScripts: () => void = () => {};
      const scriptGate = new Promise<void>((resolve) => {
        releaseScripts = resolve;
      });
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'script') await scriptGate;
        await route.continue();
      });
      expect((await page.goto(`${origin}${pathname}`, { waitUntil: 'commit' }))?.status()).toBe(
        404,
      );
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      const originalMain = await page.getByRole('main').elementHandle();
      releaseScripts();
      await page.waitForLoadState('load');
      await page.evaluate(() => {
        window.history.pushState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
      expect(await originalMain?.evaluate((element) => element.isConnected)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
