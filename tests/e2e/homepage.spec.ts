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
  // The failed portrait leaves no image behind, while the four project-card
  // carousels hydrate into their full slide tracks.
  await expect(page.locator('.profile-card-photo img')).toHaveCount(0);
  await expect(page.locator('.project-media[data-carousel-active]')).toHaveCount(4);
  // Four cards × (four real slides + two seamless wrap clones).
  await expect(page.locator('.project-media img')).toHaveCount(24);
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
    // The bounded swing transform enlarges the axis-aligned box; the approved
    // layout width is the untransformed element width.
    const cardWidth = await page
      .locator('.profile-card-shell')
      .evaluate((element) => (element as HTMLElement).offsetWidth);
    expect(copy).not.toBeNull();
    expect(card).not.toBeNull();
    expect(cardWidth).toBeLessThanOrEqual(expectedCardWidth + 1);
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
  // Real approved screenshots: each card hydrates to a four-slide carousel
  // opening on its first screenshot in the owner-approved order.
  const firstScreenshots = [
    ['/media/projects/saklolo161/3.png', 'Mobile home with emergency tiles'],
    ['/media/projects/bistrobuddies-app/3.png', 'Customer home with coffee cards'],
    ['/media/projects/bistrobuddies-promo/1.png', 'Promo hero with phone mockup'],
    ['/media/projects/erp-quotation-migrator/2.png', 'Quotation details with line items'],
  ] as const;
  for (const [index, [src, alt]] of firstScreenshots.entries()) {
    const carousel = cards.nth(index).locator('.project-media');
    await expect(carousel).toHaveAttribute('data-carousel-active', '0');
    await expect(carousel).toHaveAttribute('data-carousel-count', '4');
    // The first real slide (wrap clones sit outside the real slide order).
    const activeImage = carousel
      .locator('.project-media-slide:not([data-carousel-clone])')
      .first()
      .locator('img');
    await expect(activeImage).toHaveAttribute('src', src);
    await expect(activeImage).toHaveAttribute('alt', alt);
  }
  await expect(page.locator('#projects').getByText('Screenshots pending')).toHaveCount(0);
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

test('a card dot advances its own carousel without navigating the card', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('#projects article').first();
  const carousel = firstCard.locator('.project-media');
  await expect(carousel).toHaveAttribute('data-carousel-count', '4');
  const dots = carousel.locator('[data-carousel-dot]');
  await expect(dots).toHaveCount(4);
  // Dot clicks are manual navigation inside the card: the headline link is
  // never triggered and the page stays on the homepage.
  await dots.nth(2).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(carousel).toHaveAttribute('data-carousel-active', '2');
  await expect(carousel.locator('[data-carousel-status]')).toHaveText(/Slide 3 of 4/);
});

test('dragging a card media never leaves the homepage and commits like the detail carousel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const card = page.locator('#projects article').first();
  await card.scrollIntoViewIfNeeded();
  const media = card.locator('.project-media');
  await expect(media).toHaveAttribute('data-carousel-count', '4');
  await expect(media).toHaveAttribute('data-carousel-active', '0');
  // Instrument the headline link: a card drag must never click through to it.
  const headline = card.getByRole('link', {
    name: 'Improving Emergency Reporting and Response Coordination',
  });
  await page.evaluate(
    (element) => {
      (window as unknown as { __linkClicks?: number }).__linkClicks = 0;
      element.addEventListener('click', () => {
        const clicks = window as unknown as { __linkClicks?: number };
        clicks.__linkClicks = (clicks.__linkClicks ?? 0) + 1;
      });
    },
    await headline.elementHandle(),
  );
  // 0.30-width drag left on the card media commits to the next slide.
  const box = await media.locator('.project-media-figure').boundingBox();
  if (!box) throw new Error('figure box missing');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 0.3, y, { steps: 3 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/$/);
  await expect(media).toHaveAttribute('data-carousel-active', '1');
  expect(
    await page.evaluate(() => (window as unknown as { __linkClicks?: number }).__linkClicks),
  ).toBe(0);
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
