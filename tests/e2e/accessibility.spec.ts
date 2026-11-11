import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const detailRoutes = [
  '/projects/saklolo161/',
  '/projects/bistrobuddies-app/',
  '/projects/bistrobuddies-promo/',
  '/projects/erp-quotation-migrator/',
] as const;

function describeViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  if (violations.length === 0) return 'No violations';
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')}\n  ${node.failureSummary}`)
          .join('\n')}`,
    )
    .join('\n\n');
}

async function expectNoWcagViolations(page: Page) {
  // The hero entrance is a one-shot staggered fade; axe must sample the
  // settled page, not an in-flight ~48%-opacity frame (previously produced a
  // spurious `.button-primary` color-contrast violation under parallel load).
  // Routes without an entrance have no attribute and resolve immediately.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const phase = document
          .querySelector('[data-hero-entrance]')
          ?.getAttribute('data-hero-entrance');
        if (!(
          phase === undefined ||
          phase === 'played' ||
          phase === 'settled' ||
          phase === 'skipped'
        ))
          return false;
        // Axe must sample the hydrated carousels: every media root that
        // declared slides must have its controller attached by now. Routes
        // without media (404) resolve immediately.
        const media = Array.from(document.querySelectorAll('.project-media'));
        const hydratable = media.filter((element) => element.hasAttribute('data-carousel-count'));
        return (
          media.length === 0 ||
          hydratable.every((element) => element.hasAttribute('data-carousel-active'))
        );
      }),
    )
    .toBe(true);
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations, describeViolations(results.violations)).toEqual([]);
}

test('the axe harness detects a known violation', async ({ page }) => {
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>Control</title></head><body><main><img src="/control.png"></main></body></html>',
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toContain('image-alt');
});

test('homepage has no WCAG A or AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoWcagViolations(page);
});

for (const route of detailRoutes) {
  test(`${route} has no WCAG A or AA violations`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoWcagViolations(page);
  });
}

test('the 404 route has no WCAG A or AA violations', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expectNoWcagViolations(page);
});

test('the open mobile navigation has no WCAG A or AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expectNoWcagViolations(page);
});
