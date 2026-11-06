import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const headline = 'Building Problem-Solving Software with AI.';
const introduction =
  "Hi, I'm Denver Axel Marbida. I build end-to-end software solutions using agentic and AI-powered development workflows, turning real-world needs into practical, people-centered applications.";
const name = 'Denver Axel Marbida';
const title = 'Agentic Full-Stack Software Developer';
const portraitSource = 'content/media/profile/profile.jpg';
const portraitPublicPath = '/media/profile/profile.jpg';
const portraitHash = '54a159d7438dcb74b4be605294b90f6318747d699b1864820292e55cfe87429a';

const previews = [
  ['saklolo161', 'Improving Emergency Reporting and Response Coordination'],
  ['bistrobuddies-app', 'Simplifying Coffee Ordering and Business Operations'],
  ['bistrobuddies-promo', 'Making a Mobile Coffee App Easier to Discover'],
  ['erp-quotation-migrator', 'Turning PDF Quotations into Structured, Editable Records'],
] as const;

test('static homepage contains the exact supplied identity and headline', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(headline);
  expect(html).toContain(name);
  expect(html).toContain(title);
  expect(html).toContain('agentic and AI-powered development workflows');
  expect(html).toContain('turning real-world needs into practical, people-centered applications');
  expect(html).toContain(`href="https://github.com/DenverAxelMarbida"`);
  expect(html).toContain(`href="mailto:denver0504.marbida@gmail.com"`);
  expect(html).toContain(portraitPublicPath);
  expect(html).toMatch(/<h1\b[^>]*>Building Problem-Solving Software with AI\.<\/h1>/);
});

test('the supplied portrait is copied unchanged and displayed without transformation', async ({
  page,
}) => {
  expect(existsSync('dist/media/profile/profile.jpg')).toBe(true);
  const digest = createHash('sha256')
    .update(await readFile('dist/media/profile/profile.jpg'))
    .digest('hex');
  expect(digest).toBe(portraitHash);
  expect(await readFile('dist/media/profile/profile.jpg')).toEqual(await readFile(portraitSource));

  await page.goto('/');
  const image = page.getByRole('img', { name });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', portraitPublicPath);
  await expect(image).toHaveAttribute('width', '1872');
  await expect(image).toHaveAttribute('height', '1848');
  expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1872);
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(image).toHaveCSS('filter', 'none');
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  const ratio = (box?.width ?? 0) / (box?.height ?? 1);
  expect(Math.abs(ratio - 1872 / 1848)).toBeLessThan(0.02);
});

test('a failed portrait load shows the honest fallback without a broken image', async ({
  page,
}) => {
  await page.route(`**${portraitPublicPath}`, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Portrait unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
});

test('hero copy and actions use the exact approved destination and copy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
  await expect(page.getByText(introduction, { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

  const projects = page.getByRole('link', { name: 'Explore My Projects' });
  await expect(projects).toHaveAttribute('href', '#projects');
  const github = page.getByRole('link', { name: 'View GitHub' }).first();
  await expect(github).toHaveAttribute('href', 'https://github.com/DenverAxelMarbida');

  await projects.click();
  await expect(page).toHaveURL(/\/#projects$/);
  await expect(page.locator('#projects')).toBeInViewport();
});

for (const [width, expectedCardWidth] of [
  [320, 280],
  [375, 280],
  [1024, 320],
] as const) {
  test(`hero copy and portrait card do not overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const copy = await page.locator('.hero-copy').boundingBox();
    const card = await page.locator('.profile-card-shell').boundingBox();
    expect(copy).not.toBeNull();
    expect(card).not.toBeNull();
    expect(card?.width ?? 999).toBeLessThanOrEqual(expectedCardWidth + 1);
    const overlaps =
      (copy?.x ?? 0) < (card?.x ?? 0) + (card?.width ?? 0) &&
      (card?.x ?? 0) < (copy?.x ?? 0) + (copy?.width ?? 0) &&
      (copy?.y ?? 0) < (card?.y ?? 0) + (card?.height ?? 0) &&
      (card?.y ?? 0) < (copy?.y ?? 0) + (copy?.height ?? 0);
    expect(overlaps).toBe(false);
    if (width >= 1024) expect(card?.x ?? 0).toBeGreaterThan(copy?.x ?? 0);
    else expect(card?.y ?? 0).toBeGreaterThan(copy?.y ?? 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('exactly four approved preliminary previews render in order from the public manifest', async ({
  page,
}) => {
  await page.goto('/');
  const cards = page.locator('#projects article');
  await expect(cards).toHaveCount(4);
  for (const [index, [slug, projectHeadline]] of previews.entries()) {
    const card = cards.nth(index);
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(projectHeadline);
    await expect(card.getByRole('link', { name: projectHeadline })).toHaveAttribute(
      'href',
      `/projects/${slug}/`,
    );
  }
  await expect(
    page.getByText('Preliminary preview · Evidence pending', { exact: true }),
  ).toHaveCount(4);
  await expect(page.getByText('Screenshots pending', { exact: true })).toHaveCount(4);
  await expect(page.locator('#projects')).not.toContainText('ReadyMama');
});

test('the non-motion composition is semantically ordered and free of fake controls', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Software shaped by the problem.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capabilities and technologies' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How I Work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Understand the Problem' })).toBeVisible();
  await expect(page.getByText('Project assistant planned for a later phase.')).toBeVisible();
  await expect(page.getByRole('button', { name: /assistant|chat/i })).toHaveCount(0);
  await expect(page.getByText('Built for this portfolio', { exact: true })).toBeVisible();
  await expect(page.getByText('React', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true }).first()).toBeVisible();

  const headings = await page
    .locator('main h1, main h2, main h3')
    .evaluateAll((elements) => elements.map((element) => element.tagName));
  expect(headings[0]).toBe('H1');
  expect(headings).toContain('H2');
});

test('every project preview opens its own readable detail page', async ({ page }) => {
  for (const [slug, projectHeadline] of previews) {
    await page.goto('/');
    await page.getByRole('link', { name: projectHeadline }).click();
    await expect(page).toHaveURL(`/projects/${slug}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(projectHeadline);
    await expect(
      page.getByText('Preliminary preview · Evidence pending', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to projects' })).toBeVisible();
  }
});
