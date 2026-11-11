import { expect, test } from '@playwright/test';
import { createServer, preview } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { developmentPages, staticPreview } from '../../scripts/serve.mjs';
import { dispose, png, project, run, workspace, writeProject } from '../content/fixtures';
import {
  carouselFixture,
  installLog,
  probePair,
  readLog,
  stopCarouselFixture,
  type CarouselDebug,
} from './carouselFixture';

const projects = [
  [
    'saklolo161',
    'Improving Emergency Reporting and Response Coordination',
    'Saklolo161',
    {
      src: '/media/projects/saklolo161/3.png',
      alt: 'Mobile home with emergency tiles',
      width: 1920,
      height: 1080,
    },
  ],
  [
    'bistrobuddies-app',
    'Simplifying Coffee Ordering and Business Operations',
    'BistroBuddies App',
    {
      src: '/media/projects/bistrobuddies-app/3.png',
      alt: 'Customer home with coffee cards',
      width: 1920,
      height: 1080,
    },
  ],
  [
    'bistrobuddies-promo',
    'Making a Mobile Coffee App Easier to Discover',
    'BistroBuddies Promo Website',
    {
      src: '/media/projects/bistrobuddies-promo/1.png',
      alt: 'Promo hero with phone mockup',
      width: 1919,
      height: 994,
    },
  ],
  [
    'erp-quotation-migrator',
    'Turning PDF Quotations into Structured, Editable Records',
    'ERP Quotation Migrator',
    {
      src: '/media/projects/erp-quotation-migrator/2.png',
      alt: 'Quotation details with line items',
      width: 1600,
      height: 825,
    },
  ],
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

for (const [slug, headline, displayName, firstMedia] of projects) {
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
    // Real approved media: hydration upgrades the one prerendered screenshot
    // into the full slide track with its exact declared dimensions; manual
    // drag, dot and keyboard operation are covered by the dedicated carousel
    // groups (this loop pins structure and honest decoding per slug).
    await expect(page.getByRole('group', { name: `${displayName} screenshots` })).toHaveCount(1);
    const carousel = page.locator('.project-media[data-carousel-active]');
    await expect(carousel).toHaveCount(1);
    await expect(carousel).toHaveAttribute('data-carousel-count', '4');
    await expect(carousel).toHaveAttribute('data-carousel-active', '0');
    const slides = carousel.locator('.project-media-slide');
    // Four real slides plus the two seamless wrap clones (start and end).
    await expect(slides).toHaveCount(6);
    const realSlides = carousel.locator('.project-media-slide:not([data-carousel-clone])');
    const image = realSlides.first().locator('img');
    await expect(image).toHaveAttribute('src', firstMedia.src);
    await expect(image).toHaveAttribute('alt', firstMedia.alt);
    await expect(image).toHaveAttribute('width', String(firstMedia.width));
    await expect(image).toHaveAttribute('height', String(firstMedia.height));
    await image.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
        timeout: 5_000,
      })
      .toBe(firstMedia.width);
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
      // The prerendered document ships the first approved screenshot natively,
      // with zero hidden carousel content: no pagination and no live region.
      const noJsImage = page.locator('.project-media img');
      await expect(noJsImage).toHaveCount(1);
      await expect(noJsImage).toHaveAttribute('src', firstMedia.src);
      await expect(noJsImage).toHaveAttribute('alt', firstMedia.alt);
      await expect(page.locator('.project-media [data-carousel-dot]')).toHaveCount(0);
      await expect(page.locator('.project-media [data-carousel-track]')).toHaveCount(0);
      await expect(page.locator('.project-media [aria-live]')).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to projects' }).click();
      await expect(page.getByRole('heading', { name: 'Project previews' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('project media fits a 375px viewport without cropping or horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/projects/saklolo161/');
  const media = page.getByRole('group', { name: 'Saklolo161 screenshots' });
  const carousel = page.locator('.project-media[data-carousel-active]');
  await expect(carousel).toHaveAttribute('data-carousel-count', '4');
  // The first real slide's image (clones render outside the a11y/AT tree and
  // mirror the boundary slides, so they must not drive these assertions).
  const image = media.locator('.project-media-slide:not([data-carousel-clone]) img').first();
  await image.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
      timeout: 5_000,
    })
    .toBe(1920);
  // Contained slides letterbox inside the stable viewport: nothing crops and
  // nothing pushes the page wider than the phone viewport.
  expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');
  const figureBox = await page.locator('.project-media-figure').boundingBox();
  expect(figureBox).not.toBeNull();
  expect(figureBox?.width ?? 0).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test.describe('isolated publication fixtures', () => {
  // Each fixture test boots its own Vite dev server; several cold boots in
  // parallel on one machine can outlive the default 30s test timeout, so the
  // fixture group runs serially with a generous per-test budget.
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);
  let root = '';
  let server: PreviewServer | ViteDevServer | undefined;
  // In-process vite preview() sets process.env.NODE_ENV = 'production' for the
  // whole worker (vite always normalizes it), and later dev servers in the same
  // worker would then pre-bundle dependencies with production conditions and
  // resolve import.meta.env.DEV to false. Carousel fixtures live in
  // ./carouselFixture, which pins and restores the environment itself; the
  // plain preview() test below is unaffected because it runs first and only
  // asserts server responses.
  test.afterEach(async () => {
    await stopCarouselFixture();
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

  test('two-screenshot media hydrates into a slide carousel with a stable, uncropped viewport', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    // The controller has attached: the runtime upgrades the single prerendered
    // screenshot into a full slide track.
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await expect(media).toHaveAttribute('data-carousel-count', '2');
    await expect(media).toHaveAttribute('data-carousel-fit', 'contain');
    const track = media.locator('[data-carousel-track]');
    await expect(track).toHaveCount(1);
    // Two real slides plus the seamless wrap clones of slide 1 (end) and
    // slide 2 (start).
    await expect(track.locator('.project-media-slide')).toHaveCount(4);
    await expect(media.locator('img')).toHaveCount(4);
    // No crossfade machinery and no legacy manual controls ever exist again.
    await expect(media.locator('.project-media-leaving')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Next screenshot|Previous screenshot/ }),
    ).toHaveCount(0);
    // Accessible slide structure: the active slide is exposed, offscreen ones
    // are hidden from assistive technology by the controller. The locator
    // excludes the wrap clones, which are permanently aria-hidden.
    const slides = track.locator('.project-media-slide:not([data-carousel-clone])');
    await expect(slides.nth(0)).not.toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(1)).toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(0)).toHaveAttribute('aria-roledescription', 'slide');
    // Dots exist only with a live runtime: one per slide, addressable.
    await expect(media.locator('[data-carousel-dot]')).toHaveCount(2);
    // Navigating via the dev-only hook never moves the media box: the figure
    // keeps one stable aspect ratio and every slide letterboxes with contain.
    const figure = media.locator('.project-media-figure');
    const boxBefore = await figure.boundingBox();
    // The shell hydration gate above does not cover the deferred runtime:
    // wait for the dev-only hook explicitly so the call cannot race the
    // chunk load (a miss would be a silent optional-chain no-op).
    await page.waitForFunction(
      () => typeof (window as unknown as CarouselDebug).__carouselDebugGoto === 'function',
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => {
      (window as unknown as CarouselDebug).__carouselDebugGoto?.(1);
    });
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(slides.nth(0)).toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(1)).not.toHaveAttribute('aria-hidden', 'true');
    const boxAfter = await figure.boundingBox();
    expect(boxBefore).not.toBeNull();
    expect(boxAfter).toEqual(boxBefore);
    const box = boxAfter as { width: number; height: number };
    // Box ratio equals the widest declared slide ratio (1920/1080), so no
    // slide is ever cropped: contain letterboxes inside the stable viewport.
    expect(Math.abs(box.width / box.height - 1920 / 1080)).toBeLessThan(0.02);
    expect(await figure.evaluate((element) => getComputedStyle(element).aspectRatio)).not.toBe(
      'auto',
    );
    expect(
      await media
        .locator('img')
        .first()
        .evaluate((element) => getComputedStyle(element).objectFit),
    ).toBe('contain');
  });

  test('manual navigation: addressable dots, keyboard wrapping, and slide announcements', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    const track = media.locator('[data-carousel-track]');
    const dots = media.locator('[data-carousel-dot]');
    const status = media.locator('[data-carousel-status]');
    const figure = media.locator('.project-media-figure');
    await expect(media).toHaveAttribute('data-carousel-count', '2');

    // The figure is keyboard-reachable exactly while the carousel is live.
    await expect(figure).toHaveAttribute('tabindex', '0');
    // Dots are addressable with 1-based human numbering and the slide alt.
    await expect(dots.nth(0)).toHaveAttribute('aria-label', 'Go to slide 1: Synthetic first image');
    await expect(dots.nth(1)).toHaveAttribute(
      'aria-label',
      'Go to slide 2: Synthetic second image',
    );
    // The controller owns the current dot: slide 1 first, others unmarked.
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(dots.nth(1)).not.toHaveAttribute('aria-current');

    // Nothing is announced before any manual navigation.
    await expect(status).toHaveText('');

    // Clicking a dot navigates to that slide and announces it manually.
    await dots.nth(1).click();
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    expect(await track.evaluate((element) => element.style.transform)).toBe('translateX(-200%)');
    await expect(dots.nth(0)).not.toHaveAttribute('aria-current');
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(status).toHaveText('Slide 2 of 2: Synthetic second image');

    // Keyboard navigation wraps: ArrowRight from the last slide returns to 1.
    await figure.focus();
    await page.keyboard.press('ArrowRight');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await expect(status).toHaveText('Slide 1 of 2: Synthetic first image');
    // ArrowLeft from the first slide wraps backwards to the last.
    await page.keyboard.press('ArrowLeft');
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    // Home and End jump directly to the first and last slides.
    await page.keyboard.press('Home');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await page.keyboard.press('End');
    await expect(media).toHaveAttribute('data-carousel-active', '1');
  });

  test('pagination dots are centered and the visible caption carries only the screenshot description', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    const dots = media.locator('.project-media-dots');
    const caption = media.locator('.project-media-caption');
    const status = media.locator('[data-carousel-status]');
    await expect(media).toHaveAttribute('data-carousel-count', '2');
    // Hold the autoplay focus gate so no silent advance races the assertions;
    // the dot click below runs in page-land and never moves focus.
    await media.locator('.project-media-figure').focus();

    // Sequence 7 (desktop): the dot row is centered.
    expect(await dots.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(
      'center',
    );

    // Sequence 8: the visible caption carries only the screenshot description
    // — no "Slide X of Y" prefix — and it starts on the first slide.
    await expect(caption).toHaveText('Synthetic first image');
    await expect(caption).not.toContainText('Slide ');

    // The live region keeps the slide position for screen readers but occupies
    // no visible space, while the caption is genuinely visible.
    const statusBox = await status.boundingBox();
    expect((statusBox?.width ?? 0) * (statusBox?.height ?? 0)).toBeLessThanOrEqual(2);
    const captionBox = await caption.boundingBox();
    expect(captionBox?.height ?? 0).toBeGreaterThan(8);

    // Manual navigation moves both the caption and the announcement.
    await page.evaluate(() => {
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="1"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
    });
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(caption).toHaveText('Synthetic second image');
    await expect(status).toHaveText('Slide 2 of 2: Synthetic second image');

    // Sequence 7 (mobile): the dot row is still centered at a phone width.
    await page.setViewportSize({ width: 393, height: 720 });
    expect(await dots.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(
      'center',
    );
  });

  test('the hydrated track carries seamless wrap clones that never hold focus or AT attention', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    await expect(media).toHaveAttribute('data-carousel-count', '2');
    const track = media.locator('[data-carousel-track]');
    // One clone before the first slide (start) and one after the last (end).
    await expect(track.locator('[data-carousel-slide]')).toHaveCount(4);
    const clones = track.locator('[data-carousel-clone="true"]');
    await expect(clones).toHaveCount(2);
    // Both clones are permanently outside the accessibility tree.
    await expect(clones.first()).toHaveAttribute('aria-hidden', 'true');
    await expect(clones.last()).toHaveAttribute('aria-hidden', 'true');
    // Dots still map 1:1 to the real slides: no dot for either clone.
    await expect(media.locator('[data-carousel-dot]')).toHaveCount(2);
    // Tabbing through the whole control set never lands inside either clone.
    const figure = media.locator('.project-media-figure');
    await figure.focus();
    for (let tab = 0; tab < 4; tab += 1) {
      await page.keyboard.press('Tab');
      const insideClone = await page.evaluate(() => {
        return !!document.activeElement?.closest('[data-carousel-clone]');
      });
      expect(insideClone).toBe(false);
    }
  });

  test('multi-slide keyboard jumps reposition instantly instead of transiting every slide', async ({
    page,
  }) => {
    const fourShots = [
      { file: 'probe-a.png', alt: 'Synthetic first image', width: 1920, height: 1080 },
      { file: 'probe-b.png', alt: 'Synthetic second image', width: 1920, height: 1080 },
      { file: 'probe-c.png', alt: 'Synthetic third image', width: 1920, height: 1080 },
      { file: 'probe-d.png', alt: 'Synthetic fourth image', width: 1920, height: 1080 },
    ];
    const origin = await carouselFixture(fourShots);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    await media.scrollIntoViewIfNeeded();
    // Hold the autoplay focus gate so the countdown cannot advance mid-sampling.
    const figure = media.locator('.project-media-figure');
    await figure.focus();

    // Sample the computed track transform every animation frame across each
    // jump: a covered reposition shows at most the start and end values, while
    // a long transit across the intermediate slides would show many.
    const installSampler = async () => {
      await page.evaluate(() => {
        const track = document.querySelector<HTMLElement>('[data-carousel-track]');
        if (!track) throw new Error('track missing');
        const seen: string[] = [];
        const state = window as unknown as { __jumpSeen?: string[]; __jumpRaf?: number };
        state.__jumpSeen = seen;
        const push = () => {
          const matrix = getComputedStyle(track).transform;
          if (seen[seen.length - 1] !== matrix) seen.push(matrix);
        };
        push();
        state.__jumpRaf = requestAnimationFrame(function loop() {
          push();
          (window as unknown as { __jumpRaf?: number }).__jumpRaf = requestAnimationFrame(loop);
        });
      });
    };
    const stopSampler = async (): Promise<string[]> => {
      return page.evaluate(() => {
        const state = window as unknown as { __jumpRaf?: number; __jumpSeen?: string[] };
        if (state.__jumpRaf !== undefined) cancelAnimationFrame(state.__jumpRaf);
        return state.__jumpSeen ?? [];
      });
    };

    await figure.focus();
    await installSampler();
    await page.keyboard.press('End');
    await expect(media).toHaveAttribute('data-carousel-active', '3');
    await page.waitForTimeout(600);
    const seen = await stopSampler();
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.length).toBeLessThanOrEqual(2);

    await installSampler();
    await page.keyboard.press('Home');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await page.waitForTimeout(600);
    const seenHome = await stopSampler();
    expect(seenHome.length).toBeGreaterThan(1);
    expect(seenHome.length).toBeLessThanOrEqual(2);
  });

  test('a dot click during the clone landing phase never double-advances', async ({ page }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    await media.scrollIntoViewIfNeeded();
    // Hold the autoplay focus gate: the wrap below must be driven by the debug
    // hook alone, not by a racing autoplay advance. The dot click below runs
    // in page-land, so it never moves focus away from the figure.
    await media.locator('.project-media-figure').focus();
    await installLog(media, 'main');

    // Walk to the last slide, then trigger the forward wrap and click the
    // destination dot within the same task, so the click lands mid-clone-phase.
    await page.evaluate(() => {
      const hook = (window as unknown as CarouselDebug).__carouselDebugGoto;
      if (!hook) throw new Error('debug hook missing');
      hook(1);
    });
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await page.evaluate(() => {
      const hook = (window as unknown as CarouselDebug).__carouselDebugGoto;
      if (!hook) throw new Error('debug hook missing');
      hook(1, 1);
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="0"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
    });
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    // Let any misbehaving second advance (or a late clone reposition) show up.
    await page.waitForTimeout(900);
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    const log = await readLog(page, 'main');
    // The wrap passes through the clone position exactly once, then lands on
    // slide 1 exactly once — no double advance.
    expect(log.map((change) => change.v)).toEqual(['0', '1', '2', '0']);
  });

  test('pointer drag commits, wraps both directions, snaps back, cancels, and suppresses the post-drag click', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    const track = media.locator('[data-carousel-track]');
    const status = media.locator('[data-carousel-status]');
    await expect(media).toHaveAttribute('data-carousel-count', '2');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    // Pointer coordinates are viewport-relative: bring the media into view
    // before measuring the drag box.
    await media.scrollIntoViewIfNeeded();
    // Instrument clicks on the track: a real click must always arrive; a drag
    // must never synthesize one.
    await page.evaluate(() => {
      const trackElement = document.querySelector('[data-carousel-track]');
      if (!trackElement) throw new Error('track missing');
      (window as unknown as { __clicks?: number }).__clicks = 0;
      trackElement.addEventListener('click', () => {
        const clicks = window as unknown as { __clicks?: number };
        clicks.__clicks = (clicks.__clicks ?? 0) + 1;
      });
    });
    const clicks = () => page.evaluate(() => (window as unknown as { __clicks?: number }).__clicks);

    // Helpers. Fast drags cross the distance commit fraction; slow drags stay
    // under the velocity threshold so only the distance branch can matter.
    const figureBox = async () => {
      const box = await media.locator('.project-media-figure').boundingBox();
      if (!box) throw new Error('figure box missing');
      return box;
    };
    const fastDrag = async (dx: number) => {
      const box = await figureBox();
      const x = box.x + box.width * 0.5;
      const y = box.y + box.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y, { steps: 3 });
      await page.mouse.up();
    };
    const slowDrag = async (fraction: number) => {
      const box = await figureBox();
      const startX = box.x + box.width * 0.5;
      const y = box.y + box.height * 0.5;
      const endX = startX - box.width * fraction;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      for (let segment = 1; segment <= 5; segment += 1) {
        await page.waitForTimeout(140);
        await page.mouse.move(startX + ((endX - startX) * segment) / 5, y);
      }
      await page.mouse.up();
    };

    // (c) A same-point press/release is a real click: it fires, and no slide
    // changes.
    {
      const box = await figureBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.up();
      expect(await clicks()).toBe(1);
      await expect(media).toHaveAttribute('data-carousel-active', '0');
    }

    // (a) A 0.30-width drag left commits to the next slide and announces it.
    await fastDrag(-0.3 * (await figureBox()).width);
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(status).toHaveText('Slide 2 of 2: Synthetic second image');
    expect(await clicks()).toBe(1);

    // Back to the first slide for the remaining cases.
    await page.evaluate(() => {
      (window as unknown as CarouselDebug).__carouselDebugGoto?.(0);
    });
    await expect(media).toHaveAttribute('data-carousel-active', '0');

    // (a) A 0.10-width slow drag is under both commit thresholds: snap back,
    // no slide change, no announcement, and the release click is suppressed.
    await slowDrag(0.1);
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await expect(status).toHaveText('Slide 1 of 2: Synthetic first image');
    expect(await clicks()).toBe(1);

    // (b) A drag right on the first slide has no previous real neighbor: it
    // wraps seamlessly to the last slide instead of clamping.
    await fastDrag(0.35 * (await figureBox()).width);
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // (e) Press inside, release outside the figure: pointer capture routes the
    // release to the track, so behavior matches the in-figure commit.
    await page.evaluate(() => {
      (window as unknown as CarouselDebug).__carouselDebugGoto?.(0);
    });
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    {
      const box = await figureBox();
      const x = box.x + box.width * 0.5;
      const y = box.y + box.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(box.x - 40, y, { steps: 4 });
      await page.mouse.up();
    }
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // (f) A pointercancel mid-drag snaps back with no slide change.
    await page.evaluate(() => {
      (window as unknown as CarouselDebug).__carouselDebugGoto?.(0);
    });
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    {
      const box = await figureBox();
      const x = box.x + box.width * 0.5;
      const y = box.y + box.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - box.width * 0.2, y, { steps: 3 });
      await page.evaluate(() => {
        document
          .querySelector('[data-carousel-track]')
          ?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
      });
      await page.mouse.up();
      await expect(media).toHaveAttribute('data-carousel-active', '0');
      expect(await track.evaluate((element) => element.style.transform)).toBe('translateX(-100%)');
    }

    // (g) Native image dragging is prevented so it can never fight the gesture.
    expect(
      await page.evaluate(() => {
        const image = document.querySelector('.project-media-slide img');
        if (!image) throw new Error('slide image missing');
        const event = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
        image.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
  });

  test('drags and keyboard wrap seamlessly through the start and end clones', async ({ page }) => {
    const fourShots = [
      { file: 'probe-a.png', alt: 'Synthetic first image', width: 1920, height: 1080 },
      { file: 'probe-b.png', alt: 'Synthetic second image', width: 1920, height: 1080 },
      { file: 'probe-c.png', alt: 'Synthetic third image', width: 1920, height: 1080 },
      { file: 'probe-d.png', alt: 'Synthetic fourth image', width: 1920, height: 1080 },
    ];
    const origin = await carouselFixture(fourShots);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    await media.scrollIntoViewIfNeeded();
    // Hold the autoplay focus gate so no advance can race the sampled wraps.
    const figure = media.locator('.project-media-figure');
    await figure.focus();
    const box = await figure.boundingBox();
    if (!box) throw new Error('figure box missing');

    const installSampler = async () => {
      await page.evaluate(() => {
        const track = document.querySelector<HTMLElement>('[data-carousel-track]');
        if (!track) throw new Error('track missing');
        const frames: Array<{ v: string; active: string; anims: number }> = [];
        const state = window as unknown as { __wrapFrames?: typeof frames; __wrapRaf?: number };
        state.__wrapFrames = frames;
        const sample = () => {
          frames.push({
            v: track.style.transform,
            active:
              document.querySelector('.project-media')?.getAttribute('data-carousel-active') ?? '',
            anims: track.getAnimations().length,
          });
        };
        sample();
        state.__wrapRaf = requestAnimationFrame(function loop() {
          sample();
          (window as unknown as { __wrapRaf?: number }).__wrapRaf = requestAnimationFrame(loop);
        });
      });
    };
    const stopSampler = async () => {
      await page.evaluate(() => {
        const state = window as unknown as { __wrapRaf?: number };
        if (state.__wrapRaf !== undefined) cancelAnimationFrame(state.__wrapRaf);
      });
      await page.waitForTimeout(400);
      return page.evaluate<Array<{ v: string; active: string; anims: number }>>(
        () =>
          (
            window as unknown as {
              __wrapFrames?: Array<{ v: string; active: string; anims: number }>;
            }
          ).__wrapFrames ?? [],
      );
    };
    const assertLandingFrame = (
      frames: Array<{ v: string; active: string; anims: number }>,
      active: string,
      transform: string,
    ) => {
      expect(
        frames.some(
          (frame) => frame.active === active && frame.v === transform && frame.anims === 0,
        ),
      ).toBe(true);
    };
    const activesOf = (frames: Array<{ active: string }>) => frames.map((frame) => frame.active);
    /** Resting/clone/land transforms must be exact; a drag-follow gesture may
     * legitimately record calc() follow values, but nothing else may appear. */
    const assertAllowedTransforms = (
      frames: Array<{ v: string }>,
      plainAllowed: string[],
    ): string[] => {
      const unique = [...new Set(frames.map((frame) => frame.v))];
      expect(unique.length).toBeGreaterThan(0);
      for (const value of unique) {
        expect(
          plainAllowed.includes(value) || value.includes('calc('),
          `unexpected track transform: ${value}`,
        ).toBe(true);
      }
      return unique;
    };

    // Backward: drag right from slide 1 — the track animates onto the start
    // clone (which looks like slide 4), then lands on the real slide 4.
    await installSampler();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '3');
    const backward = await stopSampler();
    const backwardTransforms = assertAllowedTransforms(backward, [
      'translateX(-100%)',
      'translateX(0%)',
      'translateX(-400%)',
    ]);
    expect(backwardTransforms).toContain('translateX(0%)');
    const backwardActives = activesOf(backward);
    expect(backwardActives).toContain('-1');
    expect(backwardActives.indexOf('-1')).toBeLessThan(backwardActives.lastIndexOf('3'));
    assertLandingFrame(backward, '-1', 'translateX(0%)');

    // Forward: drag left from slide 4 — the track animates onto the end clone
    // (which looks like slide 1), then lands on the real slide 1.
    await installSampler();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    const forward = await stopSampler();
    const forwardTransforms = assertAllowedTransforms(forward, [
      'translateX(-100%)',
      'translateX(-400%)',
      'translateX(-500%)',
    ]);
    expect(forwardTransforms).toContain('translateX(-500%)');
    const forwardActives = activesOf(forward);
    expect(forwardActives).toContain('4');
    expect(forwardActives.indexOf('4')).toBeLessThan(forwardActives.lastIndexOf('0'));
    assertLandingFrame(forward, '4', 'translateX(-500%)');

    // Keyboard: ArrowLeft from slide 1 wraps the same visual way — through the
    // start clone, never a big reverse transit across the intermediate slides.
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await installSampler();
    await page.keyboard.press('ArrowLeft');
    await expect(media).toHaveAttribute('data-carousel-active', '3');
    const keyboard = await stopSampler();
    const keyboardTransforms = [...new Set(keyboard.map((frame) => frame.v))];
    for (const value of keyboardTransforms) {
      expect(['translateX(-100%)', 'translateX(0%)', 'translateX(-400%)']).toContain(value);
    }
    expect(keyboardTransforms).toContain('translateX(0%)');
    expect(activesOf(keyboard)).toContain('-1');
  });

  test('a rapid flick commits through the velocity branch alone', async ({ page }) => {
    const origin = await carouselFixture([...probePair]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const media = page.locator('.project-media');
    await expect(media).toHaveAttribute('data-carousel-count', '2');
    await media.scrollIntoViewIfNeeded();
    const box = await media.locator('.project-media-figure').boundingBox();
    if (!box) throw new Error('figure box missing');
    // 0.20 width is below the 0.25 distance commit fraction; only a high
    // release velocity can commit this gesture.
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - box.width * 0.2, y, { steps: 2 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '1');
  });

  test.describe('coarse-pointer touch gestures', () => {
    test.use({ hasTouch: true, viewport: { width: 393, height: 720 } });

    test('a horizontal touch swipe commits and a vertical swipe scrolls the page', async ({
      page,
    }) => {
      const origin = await carouselFixture([...probePair]);
      await page.goto(`${origin}/projects/saklolo161/`);
      await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
      const media = page.locator('.project-media');
      await expect(media).toHaveAttribute('data-carousel-count', '2');
      await expect(media).toHaveAttribute('data-carousel-active', '0');
      await media.scrollIntoViewIfNeeded();
      const cdp = await page.context().newCDPSession(page);

      // Horizontal swipe left of 0.35 widths: commits to the next slide.
      {
        const box = await media.locator('.project-media-figure').boundingBox();
        if (!box) throw new Error('figure box missing');
        const x = box.x + box.width * 0.5;
        const y = box.y + box.height * 0.5;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 4; step += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x - (box.width * 0.35 * step) / 4, y }],
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await expect(media).toHaveAttribute('data-carousel-active', '1');

      // Vertical swipe: the browser owns vertical panning (touch-action:
      // pan-y), so the page scrolls, the gesture never commits, and the
      // carousel snaps back to the slide it was on.
      await page.evaluate(() => {
        (window as unknown as CarouselDebug).__carouselDebugGoto?.(0);
      });
      await expect(media).toHaveAttribute('data-carousel-active', '0');
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40),
      ).toBe(true);
      {
        const box = await media.locator('.project-media-figure').boundingBox();
        if (!box) throw new Error('figure box missing');
        const x = box.x + box.width * 0.5;
        const y = box.y + box.height * 0.5;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        // Finger up scrolls the page down (content moves up).
        for (let step = 1; step <= 4; step += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: y - (280 * step) / 4 }],
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await expect(media).toHaveAttribute('data-carousel-active', '0');
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });
  });

  test('a carousel runtime that fails to load keeps one honest screenshot and no dead controls', async ({
    page,
  }) => {
    const origin = await carouselFixture([...probePair]);
    await page.route('**/carouselClient*', (route) => route.abort());
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    // Give the rejected import a beat to settle its promise.
    await page.waitForTimeout(500);
    const media = page.locator('.project-media');
    await expect(media.locator('img')).toHaveCount(1);
    await expect(media.locator('img')).toHaveAttribute('src', '/media/probe-a.png');
    await expect(media.locator('img')).toHaveAttribute('alt', 'Synthetic first image');
    await expect(page.getByText('Screenshots pending')).toHaveCount(0);
    // Nothing dead is rendered: no track, no dots, no buttons, no live region.
    await expect(media.locator('[data-carousel-track]')).toHaveCount(0);
    await expect(media.locator('[data-carousel-dot]')).toHaveCount(0);
    await expect(media.locator('button')).toHaveCount(0);
    await expect(media.locator('[aria-live]')).toHaveCount(0);
    await expect
      .poll(() => media.evaluate((element) => element.hasAttribute('data-carousel-active')))
      .toBe(false);
  });

  test('a single-screenshot project never renders carousel chrome, even after the runtime loads', async ({
    page,
  }) => {
    const origin = await carouselFixture([
      { file: 'probe-a.png', alt: 'Only approved screenshot', width: 1920, height: 1080 },
    ]);
    await page.goto(`${origin}/projects/saklolo161/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(800);
    const media = page.locator('.project-media');
    await expect(media.locator('img')).toHaveCount(1);
    await expect(media.locator('img')).toHaveAttribute('src', '/media/probe-a.png');
    await expect(media.locator('img')).toHaveAttribute('alt', 'Only approved screenshot');
    await expect(page.getByText('Screenshots pending')).toHaveCount(0);
    await expect(media.locator('[data-carousel-track]')).toHaveCount(0);
    await expect(media.locator('[data-carousel-dot]')).toHaveCount(0);
    await expect(media.locator('button')).toHaveCount(0);
    await expect(media.locator('[aria-live]')).toHaveCount(0);
    await expect
      .poll(() => media.evaluate((element) => element.hasAttribute('data-carousel-count')))
      .toBe(false);
  });
});
