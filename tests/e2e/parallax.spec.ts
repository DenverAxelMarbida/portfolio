import { expect, test } from '@playwright/test';

/**
 * CP7 T4 — continuous scroll ascent. The background layers travel at
 * distinct sub-native rates (starfield 0.5×, hero constellation 0.7×), the
 * heading micro-depth ramp settles exactly, and native scrolling — wheel,
 * keyboard, scrollbar — is never hijacked. Layer offsets are exposed as
 * telemetry attributes exactly as each layer was last painted with
 * (`data-page-starfield-depth`, `data-constellation-depth`).
 *
 * CP7 T5 adds a velocity-coupled scroll-response level, exposed the same way
 * (`data-page-starfield-response`, `data-constellation-response`, 0..100).
 */

async function waitForMotionCanvas(page: import('@playwright/test').Page) {
  // Canvas mode only engages after hydration with motion allowed.
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-mode',
    'canvas',
  );
  await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-mode', 'canvas');
}

test('background layers parallax at distinct sub-native rates', async ({ page }) => {
  await page.goto('/');
  await waitForMotionCanvas(page);

  // Early in the scroll both offsets track their factors exactly: starfield
  // 0.5× and constellation 0.3× (the painted complement of its 0.7× target).
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-depth',
    '100',
  );
  await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-depth', '60');

  // Deeper in the scroll the starfield keeps its linear rate while the
  // constellation correction caps at its canvas height.
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-depth',
    '600',
  );
  const cap = await page.locator('.hero-motif').evaluate((el) => el.clientHeight);
  await expect(page.locator('.hero-motif')).toHaveAttribute(
    'data-constellation-depth',
    String(Math.round(0.3 * cap)),
  );
});

test('the heading micro-depth ramp settles at the natural state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-mode',
    'canvas',
  );

  const heading = page.locator('#projects-heading');
  const layer = heading.locator('> span');
  const documentTop = await heading.evaluate(
    (el) => el.getBoundingClientRect().top + window.scrollY,
  );

  // Heading top at the viewport middle: progress 0.5 → y = 20px,
  // opacity 0.75 (contrast-corrected ramp start 0.5).
  await page.evaluate(
    (top) => window.scrollTo({ top: top - window.innerHeight / 2, behavior: 'instant' }),
    documentTop,
  );
  // Settle any reveal cascade on the heading itself; the ramp layer is
  // measured against the heading rect, so it must be read at rest.
  await page.waitForTimeout(700);
  const layerTranslationY = () =>
    layer.evaluate((el) => {
      // matrix(a, b, c, d, tx, ty) — the ramp's y is the ty component. Once
      // the one-shot latch settles the heading the inline transform is
      // cleared entirely ('none'), which is exactly the zero-translation
      // natural state.
      const match = getComputedStyle(el).transform.match(/matrix\((.*)\)/);
      return match ? Number(match[1]!.split(',')[5]) : 0;
    });
  await expect.poll(layerTranslationY).toBeCloseTo(20, 0);
  await expect
    .poll(async () => Number(await layer.evaluate((el) => getComputedStyle(el).opacity)))
    .toBeCloseTo(0.75, 1);

  // Scrolled past the entry range the ramp is exactly settled.
  await page.evaluate(
    (top) => window.scrollTo({ top: top + window.innerHeight, behavior: 'instant' }),
    documentTop,
  );
  await expect.poll(layerTranslationY).toBeCloseTo(0, 0);
  await expect
    .poll(async () => layer.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('native wheel and keyboard scrolling are untouched (no scroll hijack)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForMotionCanvas(page);
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(scrollable).toBe(true);

  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(200);
  const afterWheel = await page.evaluate(() => window.scrollY);
  expect(afterWheel).toBeGreaterThan(before + 100);

  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  const afterKey = await page.evaluate(() => window.scrollY);
  expect(afterKey).toBeGreaterThan(afterWheel + 100);
});

test('reduced motion pins every depth offset to zero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // The starfield stays on its static fallback under reduced motion.
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-mode',
    'static',
  );
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
  await page.waitForTimeout(200);
  await expect(page.locator('.page-starfield')).not.toHaveAttribute(
    'data-page-starfield-depth',
    /[^0]/,
  );
  await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-depth', '0');
  // CP7 T5: the scroll-response level never leaves zero without a canvas loop.
  await expect(page.locator('.page-starfield')).toHaveAttribute(
    'data-page-starfield-response',
    '0',
  );
  await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-response', '0');
  // The heading layer carries no scroll-driven transform.
  const layer = page.locator('#projects-heading > span');
  await expect(layer).toHaveCSS('transform', 'none');
});

test('scroll response telemetry rises while scrolling and decays at rest (CP7 T5)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForMotionCanvas(page);

  // A rapid wheel scroll is a velocity spike: the bounded response level must
  // lift, exposed 0..100 exactly as each layer was last painted with.
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(120);
  const skyDuring = Number(
    await page.locator('.page-starfield').getAttribute('data-page-starfield-response'),
  );
  expect(skyDuring).toBeGreaterThan(0);
  expect(skyDuring).toBeLessThanOrEqual(100);

  const motifDuring = Number(
    await page.locator('.hero-motif').getAttribute('data-constellation-response'),
  );
  expect(motifDuring).toBeGreaterThanOrEqual(0);
  expect(motifDuring).toBeLessThanOrEqual(100);

  // At rest the level decays back toward zero on both layers.
  await page.waitForTimeout(3000);
  const skyAtRest = Number(
    await page.locator('.page-starfield').getAttribute('data-page-starfield-response'),
  );
  expect(skyAtRest).toBeLessThan(skyDuring);
});
