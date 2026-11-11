import { devices, expect, test, type Page } from '@playwright/test';

const PAUSE_STORAGE_KEY = 'denver.dev:motion:paused';
const ORIGIN = 'http://127.0.0.1:4173';
const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

function trackMotionScripts(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() !== 'script') return;
    const pathname = new URL(request.url()).pathname;
    if (/motion/i.test(pathname)) requests.push(pathname);
  });
  return requests;
}

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: PAUSE_BUTTON })).toBeVisible();
}

async function expectRuntimeReady(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.motionRuntime))
    .toBe('ready');
}

async function openWithPausedPreference(page: Page, paused: boolean) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    PAUSE_STORAGE_KEY,
    String(paused),
  ] as const);
}

/** Matrix decomposition of a plain translateY: returns the f component in CSS px. */
async function translateYOf(card: import('@playwright/test').Locator): Promise<number> {
  const transform = await card.evaluate((element) => getComputedStyle(element).transform);
  const matrix = transform.match(/^matrix\((.*)\)$/);
  return matrix ? Number(matrix.at(1)!.split(', ').at(-1)!) : NaN;
}

test.describe('preferences', () => {
  test('static content stays readable while hydration adds the pause control', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectRuntimeReady(page);

    expect(
      errors.filter((message) => /hydrat|did not match|server rendered/i.test(message)),
    ).toEqual([]);
  });

  test('pause toggle persists across reload and suppresses the runtime', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Pause animations' }).click();
    await expect(page.getByRole('button', { name: 'Resume animations' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await page.evaluate((key) => window.localStorage.getItem(key), PAUSE_STORAGE_KEY)).toBe(
      'true',
    );

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: 'Resume animations' })).toBeVisible();
  });

  test('initially paused storage never requests the deferred motion runtime', async ({ page }) => {
    const motionRequests = trackMotionScripts(page);
    await openWithPausedPreference(page, true);
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: 'Resume animations' })).toBeVisible();
    await page.waitForTimeout(500);

    expect(motionRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.dataset.motionRuntime),
    ).toBeUndefined();
  });

  test('reduced motion wins over a stored resume choice and never loads motion', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const motionRequests = trackMotionScripts(page);
      await openWithPausedPreference(page, false);
      await page.goto('/');
      await waitForHydration(page);

      const control = page.getByRole('button', { name: 'Reduced motion on' });
      await expect(control).toBeVisible();
      await expect(control).toBeDisabled();
      await expect(page.locator('#motion-status')).toContainText('system');
      await page.waitForTimeout(500);

      expect(motionRequests).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.dataset.motionRuntime),
      ).toBeUndefined();
    } finally {
      await context.close();
    }
  });

  test('live reduced-motion changes update policy and can enable the runtime', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await waitForHydration(page);
      await expect(page.getByRole('button', { name: 'Reduced motion on' })).toBeDisabled();

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(page.getByRole('button', { name: 'Pause animations' })).toBeEnabled();
      await expectRuntimeReady(page);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.getByRole('button', { name: 'Reduced motion on' })).toBeDisabled();
    } finally {
      await context.close();
    }
  });

  test('malformed storage hydrates without enabling pause', async ({ page }) => {
    await page.addInitScript(
      (key) => window.localStorage.setItem(key, 'not-a-boolean'),
      PAUSE_STORAGE_KEY,
    );
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: 'Pause animations' })).toBeVisible();
  });

  test('denied storage hydrates and the pause control still works in memory', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      });
    });

    await page.goto('/');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Pause animations' }).click();
    await expect(page.getByRole('button', { name: 'Resume animations' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('startup', () => {
  test('prerendered HTML exposes readable content and a nonfocusable indicator', async ({
    request,
  }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain('<h1');
    expect(html).toContain('mailto:denver0504.marbida@gmail.com');
    expect(html).toMatch(/data-startup-indicator[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/data-startup-indicator[^>]*tabindex/i);
  });

  test('the indicator clears on the first usable hydrated render without a minimum delay', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 1_500 });
    await waitForHydration(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });

  test('no-JavaScript loads keep native navigation and dismiss the indicator by CSS', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const indicator = page.locator('[data-startup-indicator]');
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveCSS('pointer-events', 'none');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Projects' })
        .click();
      await expect(page).toHaveURL(/#projects$/);

      await expect(indicator).toBeHidden({ timeout: 4_000 });
    } finally {
      await context.close();
    }
  });

  test('failed JavaScript leaves content usable and the indicator fail-safe bounded', async ({
    page,
  }) => {
    await page.route('**/*.js', (route) => route.abort());
    await page.goto(ORIGIN + '/');
    const indicator = page.locator('[data-startup-indicator]');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(indicator).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Projects' })
      .click();
    await expect(page).toHaveURL(/#projects$/);

    await expect(indicator).toBeHidden({ timeout: 4_000 });
  });
});

const PORTRAIT = '.profile-card-shell';
const CARD = '.profile-card';
const STRAP = '.profile-card-strap';
const ANCHOR = '.profile-card-lanyard';
const MAX_ANGLE_DEG = 48;

interface PortraitGeometry {
  anchorX: number;
  anchorY: number;
  restLength: number;
}

/**
 * Reads the rendered strap geometry in document coordinates. The card's own
 * transform is subtracted so the rest length is measured from the natural
 * (untransformed) card position, which is valid during any animation phase.
 */
async function measurePortraitGeometry(page: Page): Promise<PortraitGeometry> {
  return page.evaluate(
    ({ anchorSelector, cardSelector }: { anchorSelector: string; cardSelector: string }) => {
      const anchor = document.querySelector(anchorSelector);
      const card = document.querySelector(cardSelector);
      if (!(anchor instanceof HTMLElement) || !(card instanceof HTMLElement)) {
        throw new Error('portrait lanyard is not mounted');
      }
      function documentTop(element: HTMLElement): number {
        let top = 0;
        let node: HTMLElement | null = element;

        while (node) {
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }

        return top;
      }
      const anchorRect = anchor.getBoundingClientRect();
      const scrollY = window.scrollY;
      const anchorY = anchorRect.top + scrollY;

      return {
        anchorX: anchorRect.left + (window.scrollX ?? 0),
        anchorY,
        restLength: documentTop(card) - documentTop(anchor),
      };
    },
    { anchorSelector: ANCHOR, cardSelector: CARD },
  );
}

/** The rope's rest pose is the straight version of its slack rendering. */
function expectedRestPath(restLength: number): string {
  return `M 0 0 Q 0.00 ${(restLength / 2).toFixed(2)} 0.00 ${restLength.toFixed(2)}`;
}

interface CardPose {
  x: number;
  y: number;
  rotation: number;
  path: string;
  anchorX: number;
  anchorY: number;
}

async function readCardPose(page: Page, geometry: PortraitGeometry): Promise<CardPose> {
  return page.evaluate(
    ({ cardSelector, strapSelector, anchorSelector, restLength }) => {
      const card = document.querySelector(cardSelector) as HTMLElement;
      const strap = document.querySelector(strapSelector);
      const anchor = document.querySelector(anchorSelector) as HTMLElement;
      const path = strap?.getAttribute('d') ?? '';
      const transform = getComputedStyle(card).transform;
      let x = 0;
      let y = restLength;
      let rotation = 0;
      if (transform && transform !== 'none') {
        const match = transform.match(/matrix3?d?\(([^)]+)\)/);
        const values = match?.[1]?.split(',').map(Number) ?? null;
        if (values && values.length >= 6) {
          if (transform.startsWith('matrix3d')) {
            x = values[12] as number;
            y = (values[13] as number) + restLength;
            rotation = (Math.atan2(values[1] as number, values[0] as number) * 180) / Math.PI;
          } else {
            x = values[4] as number;
            y = (values[5] as number) + restLength;
            rotation = (Math.atan2(values[1] as number, values[0] as number) * 180) / Math.PI;
          }
        }
      }
      const anchorRect = anchor.getBoundingClientRect();
      const scrollY = window.scrollY;
      return {
        x,
        y,
        rotation,
        path,
        anchorX: anchorRect.left + (window.scrollX ?? 0),
        anchorY: anchorRect.top + scrollY,
      };
    },
    {
      cardSelector: CARD,
      strapSelector: STRAP,
      anchorSelector: ANCHOR,
      restLength: geometry.restLength,
    },
  );
}

function pathPoints(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function pathEndpoint(path: string): { x: number; y: number } {
  const values = pathPoints(path);
  return { x: values[4] ?? Number.NaN, y: values[5] ?? Number.NaN };
}

async function countPortraitStyleWrites(page: Page, durationMs: number): Promise<number> {
  return page.evaluate(
    async ({ selector, duration }) => {
      const element = document.querySelector(selector);
      if (!element) return 0;
      let writes = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) if (record.attributeName === 'style') writes += 1;
      });
      observer.observe(element, { attributes: true, attributeFilter: ['style'] });
      await new Promise((resolve) => setTimeout(resolve, duration));
      observer.disconnect();
      return writes;
    },
    { selector: CARD, duration: durationMs },
  );
}

async function waitForPortraitMode(page: Page, mode: 'active' | 'static') {
  await expect.poll(() => page.locator(PORTRAIT).getAttribute('data-profile-motion')).toBe(mode);
}

async function waitForPortraitPhase(page: Page, phase: string, timeout = 10_000) {
  await expect
    .poll(() => page.locator(PORTRAIT).getAttribute('data-profile-phase'), { timeout })
    .toBe(phase);
}

async function scrollToHero(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  });
}

interface PoseSample {
  x: number;
  y: number;
  anchored: boolean;
}

async function sampleCardPose(
  page: Page,
  durationMs: number,
  geometry: PortraitGeometry,
): Promise<PoseSample[]> {
  return page.evaluate(
    async ({ cardSelector, strapSelector, restLength, duration }) => {
      const card = document.querySelector(cardSelector) as HTMLElement;
      const strap = document.querySelector(strapSelector);
      if (!card || !strap) return [] as PoseSample[];
      const read = (): PoseSample => {
        const transform = getComputedStyle(card).transform;
        let x = 0;
        let y = restLength;
        if (transform && transform !== 'none') {
          const match = transform.match(/matrix3?d?\(([^)]+)\)/);
          const values = match?.[1]?.split(',').map(Number) ?? null;
          if (values && values.length >= 6) {
            if (transform.startsWith('matrix3d')) {
              x = values[12] as number;
              y = (values[13] as number) + restLength;
            } else {
              x = values[4] as number;
              y = (values[5] as number) + restLength;
            }
          }
        }
        const path = strap.getAttribute('d') ?? '';
        return { x, y, anchored: path.startsWith('M 0 0 ') };
      };
      const samples: PoseSample[] = [];
      await new Promise<void>((resolve) => {
        const start = performance.now();
        function step(now: number) {
          samples.push(read());
          if (now - start < duration) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
      return samples;
    },
    {
      cardSelector: CARD,
      strapSelector: STRAP,
      restLength: geometry.restLength,
      duration: durationMs,
    },
  );
}

async function cardGrabPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(CARD).boundingBox();
  if (!box) throw new Error('profile card is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  finish: 'touchEnd' | 'touchCancel' = 'touchEnd',
) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / 8,
            y: from.y + ((to.y - from.y) * step) / 8,
            id: 1,
          },
        ],
      });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(180);
    await session.send('Input.dispatchTouchEvent', {
      type: finish,
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

test.describe('portrait', () => {
  test('drops in once, stays anchored, overshoots and settles without jitter', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'entrance');
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-entrance-runs', '1');

    const geometry = await measurePortraitGeometry(page);
    const maxLateral = geometry.restLength * 1.16 * Math.sin((MAX_ANGLE_DEG * Math.PI) / 180);
    const shellHeight = await page.evaluate(
      (selector) => (document.querySelector(selector) as HTMLElement).offsetHeight,
      PORTRAIT,
    );
    const samples = await sampleCardPose(page, 3000, geometry);
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.every((sample) => sample.anchored)).toBe(true);
    const heights = samples.map((sample) => sample.y);
    expect(Math.max(...heights)).toBeGreaterThan(geometry.restLength + 1);
    expect(Math.max(...heights)).toBeLessThanOrEqual(
      maxLateral / Math.sin((MAX_ANGLE_DEG * Math.PI) / 180) + 1,
    );
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(4);

    await waitForPortraitPhase(page, 'idle');
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-entrance-runs', '1');
    const pose = await readCardPose(page, geometry);
    expect(Math.abs(pose.x)).toBeLessThan(0.5);
    expect(Math.abs(pose.y - geometry.restLength)).toBeLessThan(0.5);
    expect(pose.path).toBe(expectedRestPath(geometry.restLength));
    expect(pose.rotation).toBeCloseTo(0, 5);
    expect(await countPortraitStyleWrites(page, 400)).toBe(0);
    expect(
      await page.evaluate(
        (selector) => (document.querySelector(selector) as HTMLElement).offsetHeight,
        PORTRAIT,
      ),
    ).toBe(shellHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );

    // The strap remains attached to the fixed anchor while the card is at rest.
    expect(pathEndpoint(pose.path).x).toBeCloseTo(pose.x, 1);
    expect(pathEndpoint(pose.path).y).toBeCloseTo(pose.y, 1);
  });

  test('dragging follows the pointer, stays anchored and stays inside the safe bounds', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);
    const maxLateral = geometry.restLength * 1.16 * Math.sin((MAX_ANGLE_DEG * Math.PI) / 180);
    const rest = await readCardPose(page, geometry);
    const grab = await cardGrabPoint(page);

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 80, grab.y + 60, { steps: 12 });
    await page.waitForTimeout(220);
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'dragging');
    const dragged = await readCardPose(page, geometry);
    expect(dragged.x).toBeGreaterThan(40);
    expect(dragged.y).toBeGreaterThan(geometry.restLength);
    expect(Math.abs(dragged.rotation)).toBeLessThanOrEqual(14.5);
    expect(dragged.anchorX).toBeCloseTo(rest.anchorX, 5);
    expect(dragged.anchorY).toBeCloseTo(rest.anchorY, 5);
    expect(pathEndpoint(dragged.path).x).toBeCloseTo(dragged.x, 0);
    expect(pathEndpoint(dragged.path).y).toBeCloseTo(dragged.y, 0);

    // Far beyond the cone: every value remains inside the approved limits.
    await page.mouse.move(await page.evaluate(() => window.innerWidth - 2), 40, { steps: 12 });
    await page.waitForTimeout(180);
    const bounded = await readCardPose(page, geometry);
    expect(Math.abs(bounded.x)).toBeLessThanOrEqual(maxLateral + 1);
    expect(Math.abs(bounded.rotation)).toBeLessThanOrEqual(14.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );

    await page.mouse.up();
    await waitForPortraitPhase(page, 'idle');
    const settled = await readCardPose(page, geometry);
    expect(Math.abs(settled.x)).toBeLessThan(0.6);
    expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(0.6);
    expect(settled.path).toBe(expectedRestPath(geometry.restLength));
    expect(await countPortraitStyleWrites(page, 300)).toBe(0);
  });

  test('release keeps momentum and the card damps back to rest', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    const grab = await cardGrabPoint(page);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    // Fling upward and rightward (matching the unit test trajectory) so the
    // card has room to swing past the release point before gravity pulls it down.
    await page.mouse.move(grab.x + 60, grab.y - 50, { steps: 8 });
    await page.mouse.move(grab.x + 100, grab.y - 70, { steps: 6 });
    await page.mouse.up();
    const released = await readCardPose(page, geometry);

    const afterRelease = await sampleCardPose(page, 1500, geometry);
    expect(afterRelease.length).toBeGreaterThan(5);
    expect(Math.max(...afterRelease.map((sample) => sample.x))).toBeGreaterThan(released.x + 1);

    await waitForPortraitPhase(page, 'idle');
    const settled = await readCardPose(page, geometry);
    expect(Math.abs(settled.x)).toBeLessThan(0.6);
    expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(0.6);
  });

  test('a stationary hold does not launch the card at release', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    const grab = await cardGrabPoint(page);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    // Build real gesture speed, then hold the pointer motionless so the
    // pointer is at rest when the drag ends.
    await page.mouse.move(grab.x + 100, grab.y - 70, { steps: 8 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    const released = await readCardPose(page, geometry);

    const afterRelease = await sampleCardPose(page, 600, geometry);
    expect(afterRelease.length).toBeGreaterThan(5);
    expect(Math.max(...afterRelease.map((sample) => sample.x))).toBeLessThanOrEqual(
      Math.max(released.x, 0) + 2,
    );

    await waitForPortraitPhase(page, 'idle');
    const settled = await readCardPose(page, geometry);
    expect(Math.abs(settled.x)).toBeLessThan(2);
    expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(2);
  });

  test('anchors the strap at the document top behind the header on wide layouts', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    expect(await page.locator(PORTRAIT).getAttribute('data-profile-anchor')).toBe('document');
    // The strap root sits at the very top of the document: inside the header
    // area, so the strap appears to enter from behind the navigation.
    expect(geometry.anchorY).toBeCloseTo(0, 1);
    const headerBottom = await page.evaluate(
      () => document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? Number.NaN,
    );
    expect(Number.isFinite(headerBottom)).toBe(true);
    expect(headerBottom).toBeGreaterThan(0);

    // The rope spans the full measured distance, well past the header, and the
    // card stays at its reserved resting position rather than moving up.
    const shellTop = await page.evaluate(
      () =>
        (document.querySelector('.profile-card-shell') as HTMLElement).getBoundingClientRect().top +
        window.scrollY,
    );
    expect(geometry.restLength).toBeCloseTo(shellTop + 150, 1);
    const pose = await readCardPose(page, geometry);
    expect(pathEndpoint(pose.path)).toEqual({ x: 0, y: geometry.restLength });

    // The opaque header must paint above the main content so the strap tip is
    // genuinely hidden behind the navigation.
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.site-header') as HTMLElement).backgroundColor,
      ),
    ).not.toBe('rgba(0, 0, 0, 0)');
    expect(
      await page.evaluate(() =>
        Number(getComputedStyle(document.querySelector('.site-header') as HTMLElement).zIndex),
      ),
    ).toBeGreaterThan(
      await page.evaluate(() =>
        Number(getComputedStyle(document.querySelector('.site-main') as HTMLElement).zIndex),
      ),
    );
  });

  test('keeps the strap shell-local and clear of the hero copy on stacked layouts', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 900, height: 900 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');

    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-anchor', 'shell');
    const geometry = await measurePortraitGeometry(page);
    // The shell-local strap measures the reserved gap above the card.
    expect(geometry.restLength).toBeCloseTo(150, 1);
    const shellTop = await page.evaluate(
      () =>
        (document.querySelector('.profile-card-shell') as HTMLElement).getBoundingClientRect().top +
        window.scrollY,
    );
    expect(geometry.anchorY).toBeCloseTo(shellTop, 1);

    // The strap lives inside the shell box, below the copy that sits above it,
    // so the vertical strap never crosses the stacked headline text.
    const copyBottom = await page.evaluate(
      () =>
        (document.querySelector('.hero-copy') as HTMLElement).getBoundingClientRect().bottom +
        window.scrollY,
    );
    expect(copyBottom).toBeLessThanOrEqual(geometry.anchorY + 1);
  });

  test('the strap scrolls with the document and follows resized layouts', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const wideGeometry = await measurePortraitGeometry(page);

    // Scrolling must not pin the strap: it moves with the page content.
    await page.evaluate(() => window.scrollTo(0, 240));
    await page.waitForTimeout(120);
    expect(
      await page.evaluate(
        () =>
          (document.querySelector('.profile-card-lanyard') as HTMLElement).getBoundingClientRect()
            .top,
      ),
    ).toBeCloseTo(-240, 1);
    const scrolledGeometry = await measurePortraitGeometry(page);
    expect(scrolledGeometry.anchorY).toBeCloseTo(wideGeometry.anchorY, 1);
    expect(scrolledGeometry.restLength).toBeCloseTo(wideGeometry.restLength, 1);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);

    // Crossing the wide/stacked breakpoint re-derives the whole strap.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-anchor', 'shell');
    const stackedGeometry = await measurePortraitGeometry(page);
    expect(stackedGeometry.anchorY).toBeGreaterThan(0);
    expect(stackedGeometry.restLength).toBeCloseTo(150, 1);
    const stackedPose = await readCardPose(page, stackedGeometry);
    expect(pathEndpoint(stackedPose.path)).toEqual({ x: 0, y: stackedGeometry.restLength });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-anchor', 'document');
    const restoredGeometry = await measurePortraitGeometry(page);
    expect(restoredGeometry.restLength).toBeCloseTo(wideGeometry.restLength, 1);
    const restoredPose = await readCardPose(page, restoredGeometry);
    expect(restoredPose.path).toBe(expectedRestPath(restoredGeometry.restLength));
    expect(Math.abs(restoredPose.x)).toBeLessThan(0.6);
    expect(Math.abs(restoredPose.y - restoredGeometry.restLength)).toBeLessThan(0.6);
  });

  test('reduced motion renders a fully visible, static lanyard', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await waitForHydration(page);
      await waitForPortraitMode(page, 'static');
      await waitForPortraitPhase(page, 'static');
      const geometry = await measurePortraitGeometry(page);

      await expect(page.locator(PORTRAIT)).not.toHaveAttribute('data-profile-entrance-runs', /.*/);
      await expect(page.locator(CARD)).toHaveCSS('transform', 'none');
      expect(await page.locator('.profile-card-photo img').isVisible()).toBe(true);
      const pose = await readCardPose(page, geometry);
      expect(pose.path).toBe(expectedRestPath(geometry.restLength));
      expect(pathEndpoint(pose.path)).toEqual({ x: 0, y: geometry.restLength });
      await page.waitForTimeout(400);
      expect(await countPortraitStyleWrites(page, 400)).toBe(0);

      // No drag handlers are attached while motion is reduced.
      const grab = await cardGrabPoint(page);
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + 40, grab.y + 40, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'idle');
      expect(await countPortraitStyleWrites(page, 300)).toBe(0);
    } finally {
      await context.close();
    }
  });

  test('pause settles the lanyard and resume never replays the drop', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-entrance-runs', '1');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    await page.getByRole('button', { name: 'Pause animations' }).click();
    await scrollToHero(page);
    await waitForPortraitMode(page, 'static');
    await waitForPortraitPhase(page, 'static');
    await expect(page.locator(CARD)).toHaveCSS('transform', 'none');
    expect(await readCardPose(page, geometry).then((pose) => pose.path)).toBe(
      expectedRestPath(geometry.restLength),
    );
    await page.waitForTimeout(150);
    expect(await countPortraitStyleWrites(page, 400)).toBe(0);
    expect(await readCardPose(page, geometry).then((pose) => pose.y)).toBe(geometry.restLength);

    await page.getByRole('button', { name: 'Resume animations' }).click();
    await scrollToHero(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-entrance-runs', '1');

    const resumed = await sampleCardPose(page, 600, geometry);
    expect(resumed.length).toBeGreaterThan(10);
    expect(Math.max(...resumed.map((sample) => sample.y))).toBeLessThan(geometry.restLength + 0.6);
    expect(Math.min(...resumed.map((sample) => sample.y))).toBeGreaterThan(
      geometry.restLength - 0.6,
    );
    expect(await countPortraitStyleWrites(page, 300)).toBe(0);
  });

  test('hidden tabs and an offscreen hero suspend the lanyard', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForPortraitMode(page, 'static');
    await waitForPortraitPhase(page, 'static');
    await page.waitForTimeout(100);
    expect(await countPortraitStyleWrites(page, 400)).toBe(0);

    await page.evaluate(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    expect(await countPortraitStyleWrites(page, 300)).toBe(0);

    // Hiding during an active drag ends the gesture cleanly.
    const grab = await cardGrabPoint(page);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 50, grab.y + 30, { steps: 8 });
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'dragging');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForPortraitPhase(page, 'static');
    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'idle');
    await expect(page.locator(CARD)).toHaveCSS('transform', 'none');
    await page.evaluate(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.mouse.up();

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await waitForPortraitMode(page, 'static');
    await waitForPortraitPhase(page, 'static');
    await page.waitForTimeout(100);
    expect(await countPortraitStyleWrites(page, 400)).toBe(0);

    await scrollToHero(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    expect(await readCardPose(page, geometry).then((pose) => pose.path)).toBe(
      expectedRestPath(geometry.restLength),
    );
  });

  test('coarse-pointer touch drags work and normal touch scrolling survives', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await waitForHydration(page);
      await waitForPortraitMode(page, 'active');
      await waitForPortraitPhase(page, 'idle');
      // Stacked layout: the strap stays mounted at the top of the shell.
      await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-anchor', 'shell');
      const geometry = await measurePortraitGeometry(page);

      // Touch still scrolls the page when the gesture starts off the card.
      const copy1 = await page.locator('.hero-copy').boundingBox();
      if (!copy1) throw new Error('hero copy is not visible');
      const start1 = { x: Math.round(copy1.x + 24), y: Math.round(copy1.y + 24) };
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const swipe = await context.newCDPSession(page);
      try {
        await swipe.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: start1.x, y: start1.y, id: 1 }],
        });
        for (let step = 1; step <= 8; step += 1) {
          await swipe.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: start1.x, y: start1.y - step * 40, id: 1 }],
          });
          await page.waitForTimeout(16);
        }
        await swipe.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await swipe.detach();
      }
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      // Fresh load so the card drag is measured from a clean viewport.
      await page.goto('/');
      await waitForHydration(page);
      await waitForPortraitMode(page, 'active');
      await page.locator(CARD).scrollIntoViewIfNeeded();
      await waitForPortraitPhase(page, 'idle');

      expect(await page.locator(CARD).evaluate((card) => getComputedStyle(card).touchAction)).toBe(
        'none',
      );
      expect(await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)).toBe(false);

      const grab = await cardGrabPoint(page);
      await touchDrag(page, grab, { x: grab.x + 60, y: grab.y - 20 });
      await waitForPortraitPhase(page, 'idle');
      const settled = await readCardPose(page, geometry);
      expect(Math.abs(settled.x)).toBeLessThan(1.2);
      expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(1.2);

      // Touch still scrolls the page when the gesture starts off the card.
      await scrollToHero(page);
      await page.waitForTimeout(100);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const copy2 = await page.locator('.hero-copy').boundingBox();
      if (!copy2) throw new Error('hero copy is not visible');
      const start2 = { x: Math.round(copy2.x + 24), y: Math.round(copy2.y + 24) };
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const session = await context.newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: start2.x, y: start2.y, id: 1 }],
        });
        for (let step = 1; step <= 8; step += 1) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: start2.x, y: start2.y - step * 40, id: 1 }],
          });
          await page.waitForTimeout(16);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await session.detach();
      }
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('pointer cancellation ends a drag without leaving the card stuck', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await waitForHydration(page);
      await waitForPortraitMode(page, 'active');
      await page.locator(CARD).scrollIntoViewIfNeeded();
      await waitForPortraitPhase(page, 'idle');
      const geometry = await measurePortraitGeometry(page);

      const grab = await cardGrabPoint(page);
      const session = await context.newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: grab.x, y: grab.y, id: 1 }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grab.x + 55, y: grab.y + 35, id: 1 }],
        });
        await page.waitForTimeout(200);
        await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'dragging');
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      } finally {
        await session.detach();
      }

      await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-drag', 'idle');
      await waitForPortraitPhase(page, 'idle');
      const settled = await readCardPose(page, geometry);
      expect(Math.abs(settled.x)).toBeLessThan(1.2);
      expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(1.2);
    } finally {
      await context.close();
    }
  });
});
test.describe('runtime', () => {
  test('motion is a deferred chunk, not an initial modulepreload', async ({ page, request }) => {
    const html = await (await request.get('/')).text();
    expect(html).not.toMatch(/<link rel="modulepreload"[^>]*motion/i);

    const motionRequests = trackMotionScripts(page);
    await page.goto('/');
    await waitForHydration(page);
    await expectRuntimeReady(page);

    expect(motionRequests.length).toBeGreaterThan(0);
  });
});

/** Records every hero-entrance animation the browser ever observes, per item. */
function trackHeroEntranceAnimations(page: Page) {
  return page.addInitScript(() => {
    const observed: {
      index: string;
      animationName: string;
      delayMs: number;
      durationMs: number;
      iterations: number;
    }[] = [];
    const storage = window as unknown as Record<string, unknown>;
    storage.__heroEntranceObserved = observed;
    const seen = new Set<string>();

    const record = () => {
      for (const element of document.querySelectorAll('[data-hero-entrance-item]')) {
        const index = element.getAttribute('data-hero-entrance-item') ?? '';
        for (const animation of element.getAnimations()) {
          if (!(animation instanceof CSSAnimation)) continue;
          if (!/^hero-entrance/.test(animation.animationName)) continue;
          const timing = animation.effect?.getComputedTiming();
          if (!timing) continue;
          const key = `${index}:${animation.animationName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          observed.push({
            index,
            animationName: animation.animationName,
            delayMs: Number(timing.delay),
            durationMs: Number(timing.duration),
            iterations: Number(timing.iterations),
          });
        }
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);

    // Forget everything recorded so far: used between phases to assert that
    // no further entrance animation ever appears.
    storage.__resetHeroObservations = () => {
      observed.length = 0;
      seen.clear();
    };
  });
}

async function readHeroEntranceObservations(page: Page) {
  const observations = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__heroEntranceObserved as {
        index: string;
        animationName: string;
        delayMs: number;
        durationMs: number;
        iterations: number;
      }[],
  );
  return observations ?? [];
}

/** Item index → [opacity, transform] for every entrance item right now. */
async function readHeroItemStates(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-hero-entrance-item]')].map((element) => {
      const style = getComputedStyle(element);
      return [element.getAttribute('data-hero-entrance-item'), style.opacity, style.transform];
    }),
  );
}

async function expectHeroItemsAtRest(page: Page) {
  await expect
    .poll(async () => {
      const states = await readHeroItemStates(page);
      const animations = await page.evaluate(() =>
        Math.max(
          0,
          ...[...document.querySelectorAll('[data-hero-entrance-item]')].map(
            (element) => element.getAnimations().length,
          ),
        ),
      );
      return { states, animations };
    })
    .toEqual({
      states: expect.arrayContaining([
        ['0', '1', 'none'],
        ['1', '1', 'none'],
        ['2', '1', 'none'],
      ]),
      animations: 0,
    });
}

test.describe('transitions', () => {
  test('the hero copy enters once with staggered rises and ends fully readable', async ({
    page,
  }) => {
    await trackHeroEntranceAnimations(page);
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });

    // Static-first: prerendered hero content is readable before hydration.
    await expect(page.locator('.hero-copy h1')).toBeVisible();

    await waitForHydration(page);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'played');
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance-runs', '1');

    const observations = await readHeroEntranceObservations(page);
    expect(observations.map((item) => item.index).sort()).toEqual(['0', '1', '2']);
    for (const item of observations) {
      expect(item.animationName).toBe('hero-entrance-rise');
      expect(item.durationMs).toBe(500);
      expect(item.iterations).toBe(1);
      expect(item.delayMs).toBe(Number(item.index) * 100);
    }
    // The scheduled entrance must start from the displacement bound, not zero.
    for (const keyframe of await page.evaluate(() => {
      return [...document.querySelectorAll('[data-hero-entrance-item]')].flatMap((element) =>
        element
          .getAnimations()
          .flatMap((animation) =>
            animation.effect instanceof KeyframeEffect
              ? (animation.effect.getKeyframes() as Keyframe[])
              : [],
          ),
      );
    })) {
      if (keyframe.offset === null && keyframe.opacity === 0) {
        expect(keyframe.transform).toBe('translateY(18px)');
      }
    }

    // The entrance ends exactly where the static layout already was: no
    // layout shift. Compared at rest after the entrance (async webfont loads
    // make pre-hydration box positions nondeterministic; the settled position
    // must be stable, so two identical post-entrance reads prove zero shift).
    await expectHeroItemsAtRest(page);
    const headline = page.locator('.hero-copy h1');
    const firstBox = await headline.boundingBox();
    await page.waitForTimeout(500);
    await expectHeroItemsAtRest(page);
    const settledHeadlineBox = await headline.boundingBox();
    expect(settledHeadlineBox).toEqual(firstBox);
  });

  test('reduced motion skips the entrance and keeps the copy instantly readable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await trackHeroEntranceAnimations(page);
      await page.goto('/');
      await waitForHydration(page);

      await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'skipped');
      await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance-runs', '0');
      await expectHeroItemsAtRest(page);
      await page.waitForTimeout(600);
      expect(await readHeroEntranceObservations(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('a paused preference skips the entrance and a resume never replays it', async ({ page }) => {
    await trackHeroEntranceAnimations(page);
    await openWithPausedPreference(page, true);
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'skipped');
    await expectHeroItemsAtRest(page);

    await page.getByRole('button', { name: 'Resume animations' }).click();
    // The skipped document must not later bury already-readable content in motion.
    await page.waitForTimeout(700);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'skipped');
    expect(await readHeroEntranceObservations(page)).toEqual([]);
  });

  test('pausing mid-entrance settles the copy readable and nothing animates while paused', async ({
    page,
  }) => {
    await trackHeroEntranceAnimations(page);
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);

    const pauseButton = page.getByRole('button', { name: 'Pause animations' });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const phase = await page.evaluate(() =>
        document.querySelector('.hero-copy')?.getAttribute('data-hero-entrance'),
      );
      if (phase === 'played') break;
      if (phase === 'playing') break;
      await page.waitForTimeout(8);
    }
    const phaseNow = await page.evaluate(() =>
      document.querySelector('.hero-copy')?.getAttribute('data-hero-entrance'),
    );
    if (phaseNow === 'playing') await pauseButton.click();

    // Either way, pausing must never leave the copy hidden or mid-rise.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const group = document.querySelector('.hero-copy');
            return {
              phase: group?.getAttribute('data-hero-entrance'),
              runs: group?.getAttribute('data-hero-entrance-runs'),
              opaque: [...document.querySelectorAll('[data-hero-entrance-item]')].every(
                (element) => getComputedStyle(element).opacity === '1',
              ),
            };
          }),
        { timeout: 1_000 },
      )
      .toEqual({
        phase: expect.stringMatching(/^(played|settled)$/),
        runs: '1',
        opaque: true,
      });
    await expectHeroItemsAtRest(page);
    await page.waitForTimeout(500);
    await expectHeroItemsAtRest(page);
  });

  test('in-document hash navigation never replays the entrance', async ({ page }) => {
    await trackHeroEntranceAnimations(page);
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'played');
    await expectHeroItemsAtRest(page);

    // Hash navigation (nav links to /#projects and /#approach) is this app's
    // real same-document navigation: hero copy stays mounted, so the entered
    // state must persist with no new animation. Cross-page loads are new
    // documents and fall outside the once-per-document contract by ruling.
    const resetObservations = () =>
      page.evaluate(() => {
        (window as unknown as { __resetHeroObservations?: () => void }).__resetHeroObservations?.();
      });
    const nav = page.getByRole('navigation', { name: 'Primary' });

    await nav.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/#projects$/);
    await resetObservations();
    await page.waitForTimeout(700);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'played');
    await expectHeroItemsAtRest(page);
    expect(await readHeroEntranceObservations(page)).toEqual([]);

    await nav.getByRole('link', { name: 'Approach' }).click();
    await expect(page).toHaveURL(/\/#approach$/);
    await page.waitForTimeout(700);
    await expect(page.locator('.hero-copy')).toHaveAttribute('data-hero-entrance', 'played');
    await expectHeroItemsAtRest(page);
    expect(await readHeroEntranceObservations(page)).toEqual([]);
  });

  test('no-JavaScript loads keep the hero copy readable with no entrance run', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const copy = page.locator('.hero-copy');
      await expect(copy).toBeVisible();
      expect(await copy.getAttribute('data-hero-entrance')).not.toBe('playing');
      await expect(copy).toHaveAttribute('data-hero-entrance-runs', '0');
      const states = await page.evaluate(() =>
        [...document.querySelectorAll('.hero-copy p, .hero-copy h1, .hero-copy .hero-actions')].map(
          (element) => getComputedStyle(element).opacity,
        ),
      );
      for (const opacity of states) expect(opacity).toBe('1');
    } finally {
      await context.close();
    }
  });

  test('hovering a project card on a fine pointer lifts it by the approved band', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);

    const card = page.locator('.project-card').first();
    await expect(card).toBeVisible();
    await card.locator('h3 a').hover();

    await expect
      .poll(async () => {
        // Matrix decomposition of translateY(-3px): e = 0, f = -3.
        return translateYOf(card);
      })
      .toBe(-3);
    expect(
      await card.evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).transitionDuration) * 1000,
      ),
    ).toBe(180);
    expect(
      await card.evaluate((element) => getComputedStyle(element).transitionTimingFunction),
    ).toBe('ease-out, ease-out');
    expect(await card.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(
      'rgb(113, 119, 128)',
    );
  });

  test('keyboard focus on the headline link produces the same lift as hover', async ({ page }) => {
    await page.goto('/#projects');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);

    const card = page.locator('.project-card').first();
    await expect(card).toBeVisible();
    const link = card.locator('h3 a');
    await link.focus();
    // The matching lift animates in over 180ms; poll for the settled state.
    await expect.poll(() => translateYOf(card)).toBe(-3);
    expect(await card.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(
      'rgb(113, 119, 128)',
    );
    expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
  });

  test('coarse-pointer devices never lift the card and touch navigation still works', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'], hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await waitForHydration(page);

      const card = page.locator('.project-card').first();
      await expect(card).toBeVisible();
      await card.locator('h3 a').hover();
      await page.waitForTimeout(250);
      expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

      const href = await card.locator('h3 a').getAttribute('href');
      expect(href).toBeTruthy();
      await card.locator('h3 a').tap();
      await expect(page).toHaveURL(
        new RegExp(`${(href ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      );
    } finally {
      await context.close();
    }
  });

  test('reduced motion keeps cards readable with border feedback only', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const card = page.locator('.project-card').first();
      await expect(card).toBeVisible();
      await card.locator('h3 a').hover();
      // Border feedback continues without any geometric movement.
      expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
      expect(
        await card.evaluate(
          (element) => Number.parseFloat(getComputedStyle(element).transitionDuration) * 1000,
        ),
      ).toBe(0);
      expect(await card.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(
        'rgb(113, 119, 128)',
      );
    } finally {
      await context.close();
    }
  });

  test('a paused preference disables the card lift until animations resume', async ({ page }) => {
    await openWithPausedPreference(page, true);
    await page.goto('/');
    await waitForHydration(page);

    const card = page.locator('.project-card').first();
    await card.locator('h3 a').hover();
    await page.waitForTimeout(250);
    expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
    expect(await card.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(
      'rgb(113, 119, 128)',
    );

    await page.getByRole('button', { name: 'Resume animations' }).click();
    await card.locator('h3 a').hover();
    // The lift now animates back in (180ms), so poll for the settled state.
    await expect.poll(() => translateYOf(card)).toBe(-3);
  });

  test('cards stay readable and navigable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await page.setViewportSize({ width: 1280, height: 720 });

      const card = page.locator('.project-card').first();
      await expect(card.getByText('Preliminary preview · Evidence pending')).toBeVisible();
      const href = await card.locator('h3 a').getAttribute('href');
      expect(href).toBeTruthy();
      await card.locator('h3 a').click();
      await expect(page).toHaveURL(
        new RegExp(`${(href ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      );
    } finally {
      await context.close();
    }
  });
});
