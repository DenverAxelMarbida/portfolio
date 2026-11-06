import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createDocument } from '../../scripts/html.mjs';

test('tracer emits meaningful homepage HTML before JavaScript', async () => {
  const html = existsSync('dist/index.html') ? await readFile('dist/index.html', 'utf8') : '';

  expect(html).toContain('Denver Axel Marbida');
  expect(html).toContain('Agentic Full-Stack Software Developer');
  expect(html).toContain('href="https://github.com/DenverAxelMarbida"');
  expect(html).toMatch(/<main\b/);
  expect(html).toMatch(/<h1\b/);
  expect(html).not.toContain('<!--app-html-->');
});

test('tracer serves the supplied identity in the raw HTTP document', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  const html = await response.text();
  expect(html).toContain('Denver Axel Marbida');
  expect(html).toContain('Agentic Full-Stack Software Developer');
  expect(html).toContain('href="https://github.com/DenverAxelMarbida"');
});

test('tracer identity and native GitHub navigation work without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
    await expect(page.getByText('Agentic Full-Stack Software Developer')).toBeVisible();
    const link = page.getByRole('link', { name: 'View GitHub' });
    await expect(link).toHaveAttribute('href', 'https://github.com/DenverAxelMarbida');
    // Fulfil only the external destination; navigation still uses the real native link.
    await page.route('https://github.com/DenverAxelMarbida', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>External test destination</title>' }),
    );
    await link.click();
    await expect(page).toHaveURL('https://github.com/DenverAxelMarbida');
  } finally {
    await context.close();
  }
});

test('tracer hydrates without errors and responds to client route changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration|did not match/i.test(message.text())) {
      errors.push(message.text());
    }
  });

  let releaseScript: () => void = () => {};
  const scriptGate = new Promise<void>((resolve) => {
    releaseScript = resolve;
  });
  await page.route('**/assets/*.js', async (route) => {
    await scriptGate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
  const originalMain = await page.getByRole('main').elementHandle();
  expect(originalMain).not.toBeNull();
  releaseScript();
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    window.history.pushState(null, '', '/missing-client-route');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(await originalMain?.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('direct homepage refresh preserves content and loads emitted assets', async ({
  page,
  request,
}) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
  const script = await page.locator('script[type="module"]').getAttribute('src');
  const stylesheet = await page.locator('link[rel="stylesheet"]').getAttribute('href');
  expect(script).toMatch(/^\/assets\/.+\.js$/);
  expect(stylesheet).toMatch(/^\/assets\/.+\.css$/);
  for (const [url, type] of [
    [script, 'javascript'],
    [stylesheet, 'text/css'],
  ] as const) {
    const response = await request.get(url ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(type);
  }
});

for (const pathname of ['/missing', '/projects/not-published/']) {
  test(`unknown direct route ${pathname} returns and refreshes a hydrated 404`, async ({
    page,
    request,
  }) => {
    const response = await request.get(pathname);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Page not found');
    const hydrationErrors: string[] = [];
    page.on('pageerror', (error) => hydrationErrors.push(error.message));
    page.on('console', (message) => {
      if (/hydration|did not match|Minified React error/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    expect((await page.goto(pathname))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect((await page.reload())?.status()).toBe(404);
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
    expect(hydrationErrors).toEqual([]);
  });
}

test('unknown routes have a usable native home link with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    expect((await page.goto('http://127.0.0.1:4173/missing'))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('failed client script leaves static content and navigation usable', async ({ page }) => {
  let blockedScripts = 0;
  await page.route('**/assets/*.js', async (route) => {
    blockedScripts += 1;
    await route.abort('failed');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
  await expect(page.getByText('Agentic Full-Stack Software Developer')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/DenverAxelMarbida',
  );
  expect(blockedScripts).toBeGreaterThan(0);
});

for (const javaScriptEnabled of [true, false]) {
  test(`320px layout and keyboard focus work with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 320, height: 640 },
    });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/');
      await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      const main = page.getByRole('main');
      await expect(main).toHaveCSS('padding-left', '20px');
      const link = page.getByRole('link', { name: 'View GitHub' });
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS('outline-style', 'solid');
      await expect(link).toHaveCSS('outline-width', '2px');
      const bounds = await link.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect((bounds?.x ?? 320) + (bounds?.width ?? 1)).toBeLessThanOrEqual(320);
    } finally {
      await context.close();
    }
  });
}

test('missing assets are 404 text responses rather than a successful HTML fallback', async ({
  request,
}) => {
  for (const pathname of ['/assets/missing.js', '/assets/missing.css', '/missing.png']) {
    const response = await request.get(pathname);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(await response.text()).not.toContain('<html');
  }
});

test('raw traversal and private-file requests never expose repository files', async () => {
  for (const pathname of [
    '/../package.json',
    '/%2e%2e%2fpackage.json',
    '/%2e%2e%5cpackage.json',
    '/%252e%252e%252fpackage.json',
    '/.planning/STATE.md',
    '/.env',
    '/content/media/profile/profile.jpg',
    '/%00',
    '/%ZZ',
    '//server/share',
    '/C:/Windows/win.ini',
    '/index.html::$DATA',
    '/.generated/server/entry-server.js',
  ]) {
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest(
        { hostname: '127.0.0.1', port: 4173, path: pathname },
        (incoming) => {
          let body = '';
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk: string) => {
            body += chunk;
          });
          incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, body }));
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect([400, 404], pathname).toContain(response.status);
    expect(response.body, pathname).not.toContain('"packageManager"');
    expect(response.body, pathname).not.toContain('# Project State');
  }
});

test('deployable artifacts contain only approved HTML and hashed browser assets', async () => {
  const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/').replace(/^dist\//, ''),
    );
  expect(files).toContain('index.html');
  expect(files).toContain('404.html');
  expect(files.length).toBeGreaterThanOrEqual(4);
  for (const file of files) {
    expect(file).toMatch(
      /^(?:index\.html|404\.html|projects\/(?:saklolo161|bistrobuddies-app|bistrobuddies-promo|erp-quotation-migrator)\/index\.html|assets\/[\w-]+\.(?:js|css))$/,
    );
  }
});

test('template preserves React-escaped text and literal replacement markers', async ({ page }) => {
  const text = '<script>window.fixtureExecuted = true</script> $& <!--app-html-->';
  const html = createDocument(renderToString(createElement('p', null, text)), '');
  await page.setContent(html);
  await expect(page.locator('#root p')).toHaveText(text);
  await expect(page.locator('#root script')).toHaveCount(0);
});

test('index aliases redirect to the canonical route and HEAD has no response body', async ({
  request,
}) => {
  const redirect = await request.get('/index.html?from=test', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('/?from=test');
  const response = await request.head('/');
  expect(response.status()).toBe(200);
  expect(await response.body()).toHaveLength(0);
  expect(Number(response.headers()['content-length'])).toBeGreaterThan(0);
});

for (const pathname of ['/INDEX.html', '/index.html/', '/404.HTML', '/404.html/']) {
  test(`filesystem alias ${pathname} stays a 404 before and after hydration`, async ({
    page,
    request,
  }) => {
    const response = await request.get(pathname);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toMatch(/<h1\b[^>]*>Page not found<\/h1>/);
    const head = await request.head(pathname);
    expect(head.status()).toBe(404);
    expect(await head.body()).toHaveLength(0);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (/hydration|did not match|Minified React error/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    expect((await page.goto(pathname))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.evaluate(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByRole('heading', { name: 'Denver Axel Marbida' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
