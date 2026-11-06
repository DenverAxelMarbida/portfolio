import { expect, test } from '@playwright/test';

type FontResponse = { url: string; status: number; contentType: string };

test('self-hosted IBM Plex Sans loads and is applied with a system fallback', async ({ page }) => {
  const fontResponses: FontResponse[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.woff2')) {
      fontResponses.push({
        url: response.url(),
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
      });
    }
  });

  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  const family = await page
    .getByRole('heading', { level: 1 })
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(family).toContain('IBM Plex Sans');
  expect(family).toContain('system-ui');

  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 16px "IBM Plex Sans"')))
    .toBe(true);

  expect(fontResponses.length).toBeGreaterThan(0);
  const pageOrigin = new URL(page.url()).origin;
  for (const response of fontResponses) {
    expect(response.status).toBe(200);
    expect(response.contentType).toContain('font/woff2');
    expect(new URL(response.url).origin).toBe(pageOrigin);
  }
});
