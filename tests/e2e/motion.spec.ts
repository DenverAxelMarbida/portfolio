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

/**
 * Installs a page-side rAF pose recorder into `window.__poseSamples`.
 * Recording starts at install time and never stops, so a caller can arm it
 * BEFORE an input event (a release fling) and collect afterwards — immune to
 * the protocol latency that made call-time sampling miss early peaks under
 * heavy parallel load.
 */
async function installPoseRecorder(page: Page, geometry: PortraitGeometry): Promise<void> {
  await page.evaluate(
    ({ cardSelector, strapSelector, restLength }) => {
      const card = document.querySelector(cardSelector) as HTMLElement;
      const strap = document.querySelector(strapSelector);
      if (!card || !strap) return;
      const storage = window as unknown as { __poseSamples?: PoseSample[] };
      storage.__poseSamples = [];
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
      const step = () => {
        storage.__poseSamples!.push(read());
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    { cardSelector: CARD, strapSelector: STRAP, restLength: geometry.restLength },
  );
}

/** Collects every sample the armed recorder has gathered so far. */
async function readArmedPoseSamples(page: Page): Promise<PoseSample[]> {
  return page.evaluate(
    () => (window as unknown as { __poseSamples?: PoseSample[] }).__poseSamples ?? [],
  );
}

/** Samples card poses for `durationMs` starting at call time. */
async function sampleCardPose(
  page: Page,
  durationMs: number,
  geometry: PortraitGeometry,
): Promise<PoseSample[]> {
  await installPoseRecorder(page, geometry);
  await page.waitForTimeout(durationMs);
  return readArmedPoseSamples(page);
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
  // These tests verify the DOM lanyard implementation itself. The 3D canvas
  // prototype is the WebGL default since CP7 T3 (SwiftShader detection makes
  // that nondeterministic under parallel workers), so every page here pins
  // the implementation under test with `?lanyard=dom`.
  test('drops in once, stays anchored, overshoots and settles without jitter', async ({ page }) => {
    await page.goto('/?lanyard=dom');
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
    await page.goto('/?lanyard=dom');
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
    await page.goto('/?lanyard=dom');
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
    // Reference pose sampled BEFORE the release: under heavy parallel load the
    // post-release read can lag several frames behind the actual release, and
    // by then the card may already sit at its swing peak, which made the old
    // "max > released.x + 1" comparison flaky. The drag-follow pose is a
    // stable pre-release reference; the post-release swing must exceed it.
    const followPose = await readCardPose(page, geometry);
    // Arm the recorder BEFORE releasing: under load, sampling that starts
    // after mouse.up misses the overshoot peak entirely.
    await installPoseRecorder(page, geometry);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const afterRelease = await readArmedPoseSamples(page);
    expect(afterRelease.length).toBeGreaterThan(5);
    expect(Math.max(...afterRelease.map((sample) => sample.x))).toBeGreaterThan(
      followPose.x + 1,
    );

    await waitForPortraitPhase(page, 'idle');
    const settled = await readCardPose(page, geometry);
    expect(Math.abs(settled.x)).toBeLessThan(0.6);
    expect(Math.abs(settled.y - geometry.restLength)).toBeLessThan(0.6);
  });

  test('a stationary hold does not launch the card at release', async ({ page }) => {
    await page.goto('/?lanyard=dom');
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
    await page.goto('/?lanyard=dom');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const geometry = await measurePortraitGeometry(page);

    expect(await page.locator(PORTRAIT).getAttribute('data-profile-anchor')).toBe('document');
    // The strap root sits at the very top of the document: inside the header
    // area, so the strap appears to enter from behind the navigation.
    // Tolerance is whole pixels: the hero's grid centering can leave the shell
    // at a fractional document Y, and the browser's sub-pixel snapping of the
    // measured rects leaves a harmless ~0.11px residue in anchorRect.top that
    // cancels exactly in the real geometry (anchorTopOffset = -shellDocumentTop).
    expect(geometry.anchorY).toBeCloseTo(0, 0);
    const headerBottom = await page.evaluate(
      () => document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? Number.NaN,
    );
    expect(Number.isFinite(headerBottom)).toBe(true);
    expect(headerBottom).toBeGreaterThan(0);

    // The rope spans the full measured distance, well past the header, and the
    // card stays at its reserved resting position rather than moving up.
    // Tolerance is whole pixels: shellTop comes from getBoundingClientRect()
    // (subpixel) while restLength is summed from integer offsetTop values, so
    // the fractional shell centering leaves the same harmless ~0.11px delta.
    const shellTop = await page.evaluate(
      () =>
        (document.querySelector('.profile-card-shell') as HTMLElement).getBoundingClientRect().top +
        window.scrollY,
    );
    expect(geometry.restLength).toBeCloseTo(shellTop + 120, 0);
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
    await page.goto('/?lanyard=dom');
    await page.setViewportSize({ width: 900, height: 900 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');

    await expect(page.locator(PORTRAIT)).toHaveAttribute('data-profile-anchor', 'shell');
    const geometry = await measurePortraitGeometry(page);
    // The shell-local strap measures the reserved gap above the card.
    expect(geometry.restLength).toBeCloseTo(120, 1);
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
    await page.goto('/?lanyard=dom');
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForHydration(page);
    await waitForPortraitMode(page, 'active');
    await waitForPortraitPhase(page, 'idle');
    const wideGeometry = await measurePortraitGeometry(page);

    // Scrolling must not pin the strap: it moves with the page content.
    // Tolerance is whole pixels for the same sub-pixel reason as the anchor
    // test above: fractional shell centering + browser rect snapping leaves a
    // harmless ~0.11px residue in getBoundingClientRect().top.
    await page.evaluate(() => window.scrollTo(0, 240));
    await page.waitForTimeout(120);
    expect(
      await page.evaluate(
        () =>
          (document.querySelector('.profile-card-lanyard') as HTMLElement).getBoundingClientRect()
            .top,
      ),
    ).toBeCloseTo(-240, 0);
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
    expect(stackedGeometry.restLength).toBeCloseTo(120, 1);
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
      await page.goto('/?lanyard=dom');
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
    await page.goto('/?lanyard=dom');
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
    await page.goto('/?lanyard=dom');
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
    // Full-suite parallel runs (CP7 adds three WebGL canvas tests) push this
    // CDP-driven touch scenario past the default 30 s; triple the budget.
    test.slow();
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    try {
      const page = await context.newPage();
      await page.goto('/?lanyard=dom');
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
      await page.goto('/?lanyard=dom');
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
    // See the touch-drag test above: borderline under full parallel load.
    test.slow();
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    try {
      const page = await context.newPage();
      await page.goto('/?lanyard=dom');
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
    // Per-element identity: two entrance items may share an index (the CP7
    // role label shares index 0 with the headline), so the dedupe key must
    // not be index alone or one element would never be recorded.
    const elementIds = new WeakMap<Element, number>();
    let nextElementId = 1;

    const record = () => {
      for (const element of document.querySelectorAll('[data-hero-entrance-item]')) {
        const index = element.getAttribute('data-hero-entrance-item') ?? '';
        let elementId = elementIds.get(element);
        if (elementId === undefined) {
          elementId = nextElementId;
          nextElementId += 1;
          elementIds.set(element, elementId);
        }
        for (const animation of element.getAnimations()) {
          if (!(animation instanceof CSSAnimation)) continue;
          if (!/^hero-entrance/.test(animation.animationName)) continue;
          const timing = animation.effect?.getComputedTiming();
          if (!timing) continue;
          const key = `${elementId}:${index}:${animation.animationName}`;
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
    // The eyebrow role label joins the cascade sharing index 0 with the
    // headline (CP7 T4), so four items animate on the three-slot schedule.
    expect(observations.map((item) => item.index).sort()).toEqual(['0', '0', '1', '2']);
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
    // When focus lands mid-cascade, the focus-settle safeguard removes the
    // card's reveal animation in the same style recalculation, so the lift
    // applies immediately while the border feedback still fades in over its
    // own 180ms transition — poll both to their settled values.
    await expect.poll(() => translateYOf(card)).toBe(-3);
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).borderTopColor))
      .toBe('rgb(113, 119, 128)');
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
      // Under full-suite parallel load the card's arrival reveal can still be
      // animating after a fixed 250ms wait; poll for the settled coarse-pointer
      // state (no lift) instead of sampling one instant.
      await expect
        .poll(() => card.evaluate((element) => getComputedStyle(element).transform), {
          timeout: 10_000,
        })
        .toBe('none');

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

/**
 * Records every section-reveal item animation the browser ever observes.
 *
 * CP6-F per-arrival-wave structure: each `[data-reveal]` wrapper is its own
 * trigger, so every observation is attributed to its owning wrapper index and
 * carries the item's viewport top at the moment the wrapper flipped to
 * 'playing' (`topAtTrigger`, sampled by a MutationObserver in the same task
 * as the state change). The animation-start top is reported separately — with
 * staggered delays under fast scrolling it may legitimately sit higher in the
 * viewport than the trigger point.
 */
function trackRevealAnimations(page: Page) {
  return page.addInitScript(() => {
    const observed: {
      durationMs: number;
      delayMs: number;
      itemIndex: string;
      iterations: number;
      fromOpacity: number | null;
      fromTransform: string | null;
      wrapper: number;
      topAtStart: number;
      topAtTrigger: number | null;
    }[] = [];
    const storage = window as unknown as Record<string, unknown>;
    storage.__revealObserved = observed;
    const seen = new Set<Element>();
    const triggerTops = new Map<Element, number>();
    const observedWrappers = new WeakSet<Element>();

    const watchWrapper = (wrapper: Element) => {
      observedWrappers.add(wrapper);
      const recordTriggerTop = () => {
        const state = (wrapper as HTMLElement).dataset.reveal;
        if (state !== 'playing') return;
        for (const item of wrapper.querySelectorAll('[data-reveal-item]')) {
          triggerTops.set(item, item.getBoundingClientRect().top);
        }
      };
      recordTriggerTop();
      new MutationObserver(recordTriggerTop).observe(wrapper, {
        attributes: true,
        attributeFilter: ['data-reveal'],
      });
    };

    const record = () => {
      for (const wrapper of document.querySelectorAll('[data-reveal]')) {
        if (!observedWrappers.has(wrapper)) watchWrapper(wrapper);
      }
      for (const element of document.querySelectorAll('[data-reveal-item]')) {
        for (const animation of element.getAnimations()) {
          if (!(animation instanceof CSSAnimation)) continue;
          if (animation.animationName !== 'section-reveal-rise') continue;
          if (seen.has(element)) continue;
          seen.add(element);
          const timing = animation.effect?.getComputedTiming();
          const keyframes =
            animation.effect instanceof KeyframeEffect
              ? (animation.effect.getKeyframes() as Keyframe[])
              : [];
          const from = keyframes.find((keyframe) => keyframe.offset === 0);
          const owningWrapper = element.closest('[data-reveal]');
          observed.push({
            durationMs: timing ? Number(timing.duration) : NaN,
            delayMs: timing ? Number(timing.delay) : NaN,
            itemIndex: (element as HTMLElement).dataset.revealItem ?? '',
            iterations: timing ? Number(timing.iterations) : NaN,
            fromOpacity:
              from && from.opacity != null && from.opacity !== 'auto' ? Number(from.opacity) : null,
            fromTransform: from && typeof from.transform === 'string' ? from.transform : null,
            wrapper: owningWrapper
              ? [...document.querySelectorAll('[data-reveal]')].indexOf(owningWrapper)
              : -1,
            topAtStart: element.getBoundingClientRect().top,
            topAtTrigger: triggerTops.get(element) ?? null,
          });
        }
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);

    storage.__resetRevealObservations = () => {
      observed.length = 0;
      seen.clear();
    };
  });
}

type RevealObservation = {
  durationMs: number;
  delayMs: number;
  itemIndex: string;
  iterations: number;
  fromOpacity: number | null;
  fromTransform: string | null;
  wrapper: number;
  topAtStart: number;
  topAtTrigger: number | null;
};

type CardPerceptibilityRecord = {
  firstVisibleAt: number | null;
  firstVisibleTop: number | null;
  animStartAt: number | null;
  animEndAt: number | null;
  visibleDuringAnim: boolean;
};

type CardPerceptibilityLog = {
  cards: Record<number, CardPerceptibilityRecord>;
  wrappers: Record<number, { state: string | undefined; at: number }[]>;
};

/**
 * CP6-F perceptibility instrumentation: records, for every project card, the
 * first frame the user could actually see it, its animationstart/animationend,
 * and whether any animation frame overlapped an on-screen frame. Also keeps
 * every reveal wrapper's state history. This is the assertion the rejected
 * CP6-E implementation failed: it animated cards minutes of scroll before the
 * user ever saw them.
 */
function trackCardPerceptibility(page: Page) {
  return page.evaluate((): CardPerceptibilityLog => {
    const cards = [...document.querySelectorAll<HTMLElement>('.project-card')];
    const log: CardPerceptibilityLog = { cards: {}, wrappers: {} };
    const records: CardPerceptibilityRecord[] = [];
    (window as unknown as Record<string, unknown>).__cardPercept = log;
    const now = () => Math.round(performance.now());

    cards.forEach((card, index) => {
      const record: CardPerceptibilityRecord = {
        firstVisibleAt: null,
        firstVisibleTop: null,
        animStartAt: null,
        animEndAt: null,
        visibleDuringAnim: false,
      };
      records[index] = record;
      log.cards[index] = record;
      card.addEventListener('animationstart', () => {
        record.animStartAt = now();
      });
      card.addEventListener('animationend', () => {
        record.animEndAt = now();
      });
    });

    document.querySelectorAll('[data-reveal]').forEach((wrapper, index) => {
      const states = [{ state: (wrapper as HTMLElement).dataset.reveal, at: now() }];
      new MutationObserver(() => {
        states.push({ state: (wrapper as HTMLElement).dataset.reveal, at: now() });
      }).observe(wrapper, { attributes: true, attributeFilter: ['data-reveal'] });
      log.wrappers[index] = states;
    });

    const tick = () => {
      const viewportHeight = window.innerHeight;
      cards.forEach((card, index) => {
        const info = records[index];
        if (!info) return;
        const rect = card.getBoundingClientRect();
        const visible = rect.top < viewportHeight && rect.bottom > 0;
        if (visible && info.firstVisibleAt === null) {
          info.firstVisibleAt = now();
          info.firstVisibleTop = Math.round(rect.top);
        }
        if (visible && info.animStartAt !== null && info.animEndAt === null) {
          info.visibleDuringAnim = true;
        }
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return log;
  });
}

type CardPerceptibility = Awaited<ReturnType<typeof trackCardPerceptibility>>;

async function readCardPerceptibility(page: Page) {
  return (await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__cardPercept,
  )) as CardPerceptibility;
}

/**
 * Natural human scrolling: slow glances with pauses, like a person reading as
 * they descend — wheel notches of 100-140px with reader hesitations of
 * 450-950ms between bursts, until the last project card is fully on screen.
 */
async function readerPaceScrollToProjectsEnd(page: Page) {
  for (let burst = 0; burst < 48; burst += 1) {
    const done = await page.evaluate(() => {
      const cards = document.querySelectorAll('.project-card');
      const last = cards[cards.length - 1];
      return last ? last.getBoundingClientRect().bottom < window.innerHeight - 40 : true;
    });
    if (done) break;
    const notches = 1 + (burst % 2);
    for (let notch = 0; notch < notches; notch += 1) {
      await page.mouse.wheel(0, 100 + (notch % 3) * 20);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(450 + (burst % 3) * 250);
  }
}

async function readRevealObservations(page: Page) {
  const observations = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__revealObserved as RevealObservation[],
  );
  return observations ?? [];
}

test.describe('reveals', () => {
  test('each section reveals once near viewport entry and never replays', async ({ page }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    const sections = page.locator('[data-reveal]');
    // Per-arrival waves (CP7 T4 final refinement): the Projects heading, the
    // four project cards each in their own wrapper, the approach heading +
    // introduction + capabilities + workflow heading + six workflow steps
    // (each its own wave), and the contact row as a single three-item
    // cascade wave.
    await expect(sections).toHaveCount(16);
    // Pending sections are server-rendered fully readable before any scroll.
    await expect(sections.nth(0)).toHaveAttribute('data-reveal', 'pending');
    await expect(sections.nth(0).locator('#projects-heading')).toBeVisible();

    // Gentle stepped wheel scrolling: the heading wave must start while it is
    // arriving (top still in the lower half of the viewport), not after a
    // deep jump.
    for (let step = 0; step < 40; step += 1) {
      const state = await sections.nth(0).getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(60);
    }
    await expect(sections.nth(0)).toHaveAttribute('data-reveal', 'played');
    await expect(sections.nth(0).locator('#projects-heading')).toBeVisible();

    // Keep reading until the heading wave and the first card row have started;
    // breaking on 'playing' (not completion) keeps the wheel from scrolling
    // into the second row before the deep-return phase below.
    for (let step = 0; step < 40; step += 1) {
      const firstWavesStarted = await page.evaluate(() => {
        const states = [...document.querySelectorAll('[data-reveal]')].slice(0, 3);
        return states.every((wrapper) => (wrapper as HTMLElement).dataset.reveal !== 'pending');
      });
      if (firstWavesStarted) break;
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(60);
    }
    await expect(sections.nth(2)).toHaveAttribute('data-reveal', 'played');
    await expect(sections.nth(3)).toHaveAttribute('data-reveal', 'pending');

    const observations = await readRevealObservations(page);
    // Three items in trigger order: the heading (own wave, 0ms), then the
    // first-row cards — a 240px step co-batches the heading and both cards
    // in one observer callback, so the cards take consecutive stagger slots
    // (140ms, 280ms) while the heading takes slot 0 (CP7 T4 final stagger
    // polish; every card is item 0, left-to-right within the row).
    expect(
      observations.map((observation) => [
        observation.durationMs,
        observation.delayMs,
        observation.itemIndex,
        observation.iterations,
        observation.fromOpacity,
        observation.fromTransform,
        observation.wrapper,
      ]),
    ).toEqual([
      [520, 0, '0', 1, 0, 'translateY(18px)', 0],
      [520, 140, '0', 1, 0, 'translateY(18px)', 1],
      [520, 280, '0', 1, 0, 'translateY(18px)', 2],
    ]);
    // Fresh arrival: every wave's item was still in the lower part of the
    // viewport at the moment its wrapper triggered (safeguard 2 held at play
    // time). The animation-start top is not bounded — staggered delays under
    // fast scrolling legitimately move the item upward before it starts.
    for (const observation of observations) {
      expect(observation.topAtTrigger).not.toBeNull();
      expect(observation.topAtTrigger!).toBeGreaterThan(0.4 * 720);
    }

    // Scrolling away and back never replays a consumed wave. Returning to
    // #projects is a deep arrival for the first row, which stays static; the
    // second row was still pending and plays as a fresh arrival.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      (
        window as unknown as { __resetRevealObservations?: () => void }
      ).__resetRevealObservations?.(),
    );
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    await expect(sections.nth(1)).toHaveAttribute('data-reveal', 'played');
    await expect(sections.nth(2)).toHaveAttribute('data-reveal', 'played');
    await expect(sections.nth(3)).toHaveAttribute('data-reveal', 'pending');
    await expect(sections.nth(4)).toHaveAttribute('data-reveal', 'pending');
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    await expect(sections.nth(3)).toHaveAttribute('data-reveal', 'played');
    await expect(sections.nth(4)).toHaveAttribute('data-reveal', 'played');
    const replayObservations = await readRevealObservations(page);
    // Only the fresh second-row arrival animated; consumed waves stayed put.
    // The row's two cards arrive in one batch and take consecutive stagger
    // slots (0ms and 140ms, left-to-right; every card is item 0).
    expect(
      replayObservations.map((observation) => [
        observation.delayMs,
        observation.itemIndex,
        observation.wrapper,
        observation.topAtTrigger !== null && observation.topAtTrigger > 0.4 * 720,
      ]),
    ).toEqual([
      [0, '0', 3, true],
      [140, '0', 4, true],
    ]);

    // A fully consumed Projects section replays nothing at all.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      (
        window as unknown as { __resetRevealObservations?: () => void }
      ).__resetRevealObservations?.(),
    );
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    expect(await readRevealObservations(page)).toEqual([]);
    // A played wave never turns invisible again after completing.
    await expect
      .poll(() => sections.nth(0).evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1');
  });

  test('reveal waves cascade at the hero cadence per wrapper and complete only on the final item', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    // In-page cascade recorder armed before any scrolling: point-in-time
    // assertions and Node-side polls can miss the 900ms cascade window
    // entirely under worker load (a single stalled poll outlasts it), so
    // every observation here is frame-driven inside the page. Each wrapper's
    // entry records its state history and each item's animation timing on the
    // first frame the whole cascade is attached, and — for the multi-item
    // approach introduction wave — the no-premature-completion window. Each
    // Projects wrapper has a single item whose completion is that item's own
    // animationend (CP6-F), and each approach block is its own wave (CP7 T4
    // final refinement).
    await page.evaluate(() => {
      type Entry = {
        states: string[];
        timings: Array<[number, number] | null>;
        sawFinalItemRunning: boolean;
      };
      const entries: Entry[] = [];
      (window as unknown as Record<string, unknown>).__cascadeRecord = entries;

      const observeWrapper = (wrapper: HTMLElement, finalSelector: string | null) => {
        const entry: Entry = { states: [], timings: [], sawFinalItemRunning: false };
        entries.push(entry);
        const tick = () => {
          const state = wrapper.dataset.reveal ?? 'pending';
          if (entry.states.at(-1) !== state) entry.states.push(state);
          if (state === 'playing') {
            const items = [...wrapper.querySelectorAll<HTMLElement>('[data-reveal-item]')];
            if (entry.timings.length !== items.length) {
              const timings = items.map((element) => {
                const animation = element
                  .getAnimations()
                  .find(
                    (candidate): candidate is CSSAnimation => candidate instanceof CSSAnimation,
                  );
                const timing = animation?.effect?.getComputedTiming();
                return timing
                  ? ([Number(timing.delay), Number(timing.duration)] as [number, number])
                  : null;
              });
              if (timings.every(Boolean)) entry.timings = timings;
            }
            if (finalSelector) {
              const firstItem = wrapper.querySelector('[data-reveal-item]');
              const finalItem = document.querySelector(finalSelector);
              if (firstItem && finalItem) {
                const firstDone = [...firstItem.getAnimations()].every(
                  (animation) => animation.playState !== 'running',
                );
                const finalRunning = [...finalItem.getAnimations()].some(
                  (animation) =>
                    animation instanceof CSSAnimation && animation.playState === 'running',
                );
                if (firstDone && finalRunning) entry.sawFinalItemRunning = true;
              }
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };

      const wrappers = document.querySelectorAll<HTMLElement>('[data-reveal]');
      wrappers.forEach((wrapper) => {
        observeWrapper(
          wrapper,
          wrapper.querySelector('.approach-introduction')
            ? '.approach-introduction p:last-of-type'
            : null,
        );
      });
    });

    const readEntry = async (index: number) =>
      (await page.evaluate(
        (position) =>
          (window as unknown as { __cascadeRecord?: EntryLike[] }).__cascadeRecord?.[position],
        index,
      ))!;

    type EntryLike = {
      states: string[];
      timings: Array<[number, number] | null>;
      sawFinalItemRunning: boolean;
    };

    const projectsReveal = page.locator('[data-reveal]').nth(0);
    // Small wheel steps keep the heading's arrival solo: a 240px step would
    // co-batch the heading with row 1 and give the cards stagger-slot delays,
    // which is correct behavior for a same-frame batch but not what this
    // test's solo timings assert.
    for (let step = 0; step < 40; step += 1) {
      const state = await projectsReveal.getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(60);
    }

    // The heading wave has fully completed before the record is read: reading
    // mid-cascade would see the item still running.
    await expect(projectsReveal).toHaveAttribute('data-reveal', 'played');
    // The wave genuinely played (a skip would never record 'playing').
    const headingRecord = await readEntry(0);
    expect(headingRecord.states).toContain('playing');
    // Item delays mirror the hero cadence: the heading is its own wave at 0ms.
    expect(headingRecord.timings).toEqual([[0, 520]]);

    // The four card waves each play their own single item. Every card is
    // item 0 (CP7 T4): a row's two cards arrive in the same observer batch
    // and take consecutive stagger slots (CP7 T4 final stagger polish), so
    // the cascade is left-to-right within the row — the first card of each
    // row at 0ms, the second at 140ms. Breaking on the last row starting (not
    // completing) keeps the wheel from scrolling deep past the Approach
    // section's entry line before it is read.
    for (let step = 0; step < 60; step += 1) {
      const lastRowStarted =
        (await page.locator('[data-reveal]').nth(4).getAttribute('data-reveal')) !== 'pending';
      if (lastRowStarted) break;
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(60);
    }
    for (let card = 0; card < 4; card += 1) {
      const cardRecord = await readEntry(card + 1);
      expect(cardRecord.states).toContain('playing');
      expect(cardRecord.timings).toHaveLength(1);
      expect(cardRecord.timings[0]![1], `card ${card} duration (simulation parity)`).toBe(520);
    }
    // Each row's pair keeps the 140ms cadence between its two members; a row
    // that joined an earlier cascade carries only a bounded join offset
    // (≤ 225ms), never an accumulated delay. Row 2 starts after row 1.
    const cardRows: Array<[number, number]> = [
      [1, 2],
      [3, 4],
    ];
    for (const [first, second] of cardRows) {
      const firstRecord = await readEntry(first);
      const secondRecord = await readEntry(second);
      expect(
        secondRecord.timings[0]![0] - firstRecord.timings[0]![0],
        `cards ${first}/${second} one cadence step apart`,
      ).toBeGreaterThanOrEqual(130);
      expect(
        secondRecord.timings[0]![0] - firstRecord.timings[0]![0],
        `cards ${first}/${second} stay one cadence step apart`,
      ).toBeLessThanOrEqual(150);
      expect(firstRecord.timings[0]![0], `card ${first} bounded join delay`).toBeLessThanOrEqual(225);
    }

    // Approach reveals progressively per block (CP7 T4 final refinement):
    // the heading is its own wave (single item, 0ms); the introduction wave
    // cascades its first paragraph (0ms) then its second (140ms);
    // capabilities and the workflow heading are each their own single-item
    // wave at 0ms on their own viewport entries.
    const approachReveal = page.locator('[data-reveal]').nth(5);
    for (let step = 0; step < 40; step += 1) {
      const state = await approachReveal.getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(60);
    }
    // Fully settled before the record is read, for the same reason as above.
    await expect(approachReveal).toHaveAttribute('data-reveal', 'played');
    const approachHeadingRecord = await readEntry(5);
    expect(approachHeadingRecord.states).toContain('playing');
    // CP7 T4 final visual-parity refinement: the heading's duration is the
    // simulation's 520ms. Its delay is either 0 (fresh batch) or a bounded
    // coordination join — an earlier batch's cascade still within the 200ms
    // window (measured root-cause fix); it never exceeds the window.
    expect(approachHeadingRecord.timings).toHaveLength(1);
    expect(approachHeadingRecord.timings[0]![1], 'approach heading duration').toBe(520);
    expect(approachHeadingRecord.timings[0]![0], 'approach heading bounded delay').toBeLessThanOrEqual(
      225,
    );

    // The introduction wave cascades: first paragraph at 0ms, second at
    // 140ms. No premature completion: a frame existed where the first
    // paragraph's animation had finished while the second — the final item —
    // was still running and the wrapper was still 'playing'. If the wrapper
    // ever left 'playing' before that window, the cascade completed
    // prematurely.
    const introReveal = page.locator('[data-reveal]:has(.approach-introduction)');
    for (let step = 0; step < 40; step += 1) {
      const state = await introReveal.getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await expect(introReveal).toHaveAttribute('data-reveal', 'played');
    const introRecord = await readEntry(6);
    expect(introRecord.states).toContain('playing');
    // The two paragraphs stay one cadence step apart (140ms) whether the
    // wave starts fresh or joins an earlier cascade; the join offset itself
    // is bounded by the coordination window.
    expect(introRecord.timings).toHaveLength(2);
    expect(introRecord.timings[0]![1], 'intro first paragraph duration').toBe(520);
    expect(introRecord.timings[1]![1], 'intro second paragraph duration').toBe(520);
    expect(
      introRecord.timings[1]![0] - introRecord.timings[0]![0],
      'intro paragraphs one cadence step apart',
    ).toBeGreaterThanOrEqual(130);
    expect(
      introRecord.timings[1]![0] - introRecord.timings[0]![0],
      'intro paragraphs stay one cadence step apart',
    ).toBeLessThanOrEqual(150);
    expect(introRecord.timings[0]![0], 'intro bounded join delay').toBeLessThanOrEqual(225);
    expect(introRecord.sawFinalItemRunning).toBe(true);

    // Capabilities (row 1) and the workflow heading cascade on their own
    // entries; capabilities shares the heading's top so it typically enters
    // in the same observer frame.
    const capabilitiesReveal = page.locator('[data-reveal]:has(.approach-capabilities)');
    for (let step = 0; step < 40; step += 1) {
      const state = await capabilitiesReveal.getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    const capabilitiesRecord = await readEntry(7);
    expect(capabilitiesRecord.states).toContain('playing');
    // CP7 T4 final visual-parity refinement: capabilities shares the approach
    // heading's grid row, so a co-batched delivery gives it one stagger step
    // (140ms) after the heading; a solo delivery keeps it at 0. Both may sit
    // on top of a bounded coordination join (≤ 200ms) when the row's batch
    // continues an earlier cascade, so the total delay is bounded by
    // window + one stagger step — never unbounded accumulation.
    const capabilitiesDelay = capabilitiesRecord.timings[0]![0];
    expect(capabilitiesRecord.timings[0]![1], 'capabilities duration').toBe(520);
    expect(
      capabilitiesDelay,
      'capabilities bounded by the coordination window plus one stagger step',
    ).toBeLessThanOrEqual(345);

    const workflowHeadingReveal = page.locator('[data-reveal]:has(#workflow-heading)');
    for (let step = 0; step < 40; step += 1) {
      const state = await workflowHeadingReveal.getAttribute('data-reveal');
      if (state === 'playing' || state === 'played') break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    const workflowHeadingRecord = await readEntry(8);
    expect(workflowHeadingRecord.states).toContain('playing');
    expect(workflowHeadingRecord.timings).toHaveLength(1);
    expect(workflowHeadingRecord.timings[0]![1], 'workflow heading duration').toBe(520);
    expect(workflowHeadingRecord.timings[0]![0], 'workflow heading bounded delay').toBeLessThanOrEqual(
      225,
    );
  });

  test('sections already visible at hydration skip their reveal', async ({ page }) => {
    await trackRevealAnimations(page);
    // The hero now fills the initial viewport, so visibility at enhancement
    // time is produced by scrolling during load instead: the document is
    // scrolled while the page is still loading, before enhancement runs. A
    // tall viewport keeps every candidate wave inside the bounds at once.
    await page.setViewportSize({ width: 1280, height: 2000 });
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.scrollTo({ top: 1200, behavior: 'instant' });
      });
    });
    await page.goto('/');
    await waitForHydration(page);

    const sections = page.locator('[data-reveal]');
    // The heading wave and every card wave that is on screen at load are
    // decided as skipped — a per-arrival wave never animates content the user
    // could already see before enhancement was ready.
    for (const index of [0, 1, 2, 3, 4]) {
      await expect(sections.nth(index)).toHaveAttribute('data-reveal', 'skipped');
    }
    await expect(sections.nth(0).locator('#projects-heading')).toBeVisible();
    // Skipped waves are never flashed invisible: they must render at full
    // opacity with no animation running (the reveal starts at opacity 0).
    for (const card of await page.locator('.project-card').all()) {
      await expect
        .poll(() => card.evaluate((element) => getComputedStyle(element).opacity))
        .toBe('1');
    }
    await page.waitForTimeout(500);
    expect(await readRevealObservations(page)).toEqual([]);
  });

  test('a deep jump lands on readable static content without a reveal', async ({ page }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    // Instant jump to the end of the document (explicit behavior, immune to
    // CSS smooth scrolling). CP7 T4 rework: the waves are per-block now, so
    // blocks above the landing viewport stay armed and reveal on their own
    // entry when scrolled back into view. What this test guards is that the
    // landing viewport itself is never left pending: waves deep inside the
    // viewport skip (the teleport rule), while waves that sit in the
    // viewport's lower half at the landing are fresh arrivals near the entry
    // line and play (CP7 E-1) — both are decided states, and both must
    // settle fully readable.
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
    );
    await page.waitForTimeout(500);
    const onScreenStates = () =>
      page.evaluate(() => {
        const vh = window.innerHeight;
        return [...document.querySelectorAll('[data-reveal]')].flatMap((wave) => {
          const rect = wave.getBoundingClientRect();
          if (!(rect.top < vh && rect.bottom > 0)) return [];
          const item = wave.querySelector('[data-reveal-item]');
          return [
            {
              state: wave.getAttribute('data-reveal'),
              opacity: item ? Number(getComputedStyle(item).opacity) : null,
            },
          ];
        });
      });
    const landing = await onScreenStates();
    expect(landing.length, 'waves are on screen at the landing').toBeGreaterThan(0);
    for (const wave of landing) {
      expect(wave.state, 'landing wave is decided, never still pending').not.toBe('pending');
    }
    // After the landing cascade settles, every on-screen wave is readable at
    // its final state — whether it skipped (deep inside the viewport) or
    // played as a fresh lower-half arrival.
    await page.waitForTimeout(1200);
    const settled = await onScreenStates();
    expect(settled.length, 'waves remain on screen at the landing').toBeGreaterThan(0);
    for (const wave of settled) {
      expect(wave.state, 'landing wave is settled').toMatch(/skipped|played/);
      expect(wave.opacity, 'landing wave is readable').toBeGreaterThan(0.95);
    }
    await page.waitForTimeout(500);
    const observations = await readRevealObservations(page);
    // Either it never animated (skipped) or it animated only as a fresh
    // arrival; a jump deep past the entry line must always skip.
    for (const observation of observations) {
      expect(observation.topAtTrigger).toBeGreaterThan(0.4 * 720);
    }
  });

  test('the reveal decision uses the arrival snapshot, not a later position', async ({
    page,
  }) => {
    // CP7 E-1, deterministic reproduction of the owner's headed-browser
    // defect: the callback's position sample happens after arrival, when a
    // fast scroll (or compositor delay) has already carried the wave past
    // the skip line. Every wave wrapper's own getBoundingClientRect is
    // poisoned to report "far above the viewport" — any decision that
    // re-reads the position at callback time skips, while the decision the
    // fix requires (the observer's arrival snapshot) keeps playing. The
    // poison reports non-visible bounds so the initial classification is
    // unaffected; real geometry still drives the IntersectionObserver.
    await page.addInitScript(() => {
      const poison = () => {
        for (const element of document.querySelectorAll('[data-reveal]')) {
          const wrapper = element as HTMLElement & { __revealPoisoned?: boolean };
          if (wrapper.__revealPoisoned) continue;
          wrapper.__revealPoisoned = true;
          const original = wrapper.getBoundingClientRect.bind(wrapper);
          wrapper.getBoundingClientRect = () => {
            const real = original();
            return { ...real, top: -1000, bottom: -999 };
          };
        }
      };
      document.addEventListener('DOMContentLoaded', poison);
    });
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.waitForTimeout(600);
    await trackCardPerceptibility(page);

    // Reader-pace scroll: row 1 and row 2 arrive and must play even though a
    // callback-time re-read would report them deep past the skip line.
    for (let step = 0; step < 48; step += 1) {
      const row2 = await page.locator('[data-reveal]').nth(2).getAttribute('data-reveal');
      if (row2 === 'playing' || row2 === 'played' || row2 === 'skipped') break;
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(900);

    const row1 = page.locator('[data-reveal]').nth(1);
    const row2 = page.locator('[data-reveal]').nth(2);
    await expect(row1).toHaveAttribute('data-reveal', /playing|played/);
    await expect(row2).toHaveAttribute('data-reveal', /playing|played/);

    const observations = await readRevealObservations(page);
    const playedWrappers = new Set(observations.map((observation) => observation.wrapper));
    expect(playedWrappers.has(1), 'card row 1 wave played').toBe(true);
    expect(playedWrappers.has(2), 'card row 2 wave played').toBe(true);
    const report = await readCardPerceptibility(page);
    expect(report.cards[0]?.visibleDuringAnim, 'card 1 animated on screen').toBe(true);
    expect(report.cards[1]?.visibleDuringAnim, 'card 2 animated on screen').toBe(true);
  });

  test('fast continuous flick scrolling still animates the card waves on screen', async ({
    page,
  }) => {
    // Regression guard for the same defect: aggressive but continuous
    // notches (every event a large wheel delta, the traversal never stops)
    // must keep playing the card waves on screen — a continuous gesture is
    // never mistaken for a deep jump, and the cascade starts while the card
    // is visible.
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.waitForTimeout(600);
    await trackCardPerceptibility(page);

    await page.mouse.move(640, 400);
    for (let step = 0; step < 10; step += 1) {
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(1000);

    const row1 = page.locator('[data-reveal]').nth(1);
    const row2 = page.locator('[data-reveal]').nth(2);
    await expect(row1).toHaveAttribute('data-reveal', /playing|played/);
    await expect(row2).toHaveAttribute('data-reveal', /playing|played/);

    const observations = await readRevealObservations(page);
    const playedWrappers = new Set(observations.map((observation) => observation.wrapper));
    expect(playedWrappers.has(1), 'card row 1 wave played').toBe(true);
    expect(playedWrappers.has(2), 'card row 2 wave played').toBe(true);
    const report = await readCardPerceptibility(page);
    expect(report.cards[0]?.visibleDuringAnim, 'card 1 animated on screen').toBe(true);
    expect(report.cards[1]?.visibleDuringAnim, 'card 2 animated on screen').toBe(true);
  });

  test('pause leaves pending waves resumable and they play on arrival after resume', async ({
    page,
  }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.waitForTimeout(600);

    // Scroll until the first card wave is playing.
    const firstCardReveal = page.locator('[data-reveal]').nth(1);
    for (let step = 0; step < 60; step += 1) {
      if ((await firstCardReveal.getAttribute('data-reveal')) === 'playing') break;
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }

    // Pause without scrolling: the pause control sits at the very bottom of
    // the document, so Playwright's click auto-scroll would teleport the page
    // to max scroll and strand every pending wave above the viewport. Focus
    // (without scrolling) plus Enter toggles the preference in place, keeping
    // the later card waves below the viewport exactly as they were.
    const pauseButton = page.getByRole('button', { name: 'Pause animations' });
    await pauseButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // A temporary pause is deliberately not decisive (CP7 E-2): the wave
    // wrappers below the viewport stay pending — nothing was decided while
    // the observer was detached — and their content stays readable. The one
    // exception is the contact wave: the focused pause button lives inside
    // it, and the focus-settle safeguard settles a focused wave readable
    // (focus must never land on invisible content) — focus, not the pause,
    // decided it.
    const belowViewportStates = await page.evaluate(() =>
      [...document.querySelectorAll('[data-reveal]')]
        .slice(3)
        .map((wrapper) => ({
          isContactWave: wrapper.closest('.site-footer') !== null,
          state: (wrapper as HTMLElement).dataset.reveal,
        })),
    );
    for (const wave of belowViewportStates) {
      if (wave.isContactWave) {
        expect(wave.state, 'focused contact wave settled readable by the focus-settle safeguard').toBe(
          'skipped',
        );
      } else {
        expect(
          wave.state,
          `pending waves stayed pending while paused: ${JSON.stringify(belowViewportStates)}`,
        ).toBe('pending');
      }
    }

    // Resume and keep scrolling at a continuous pace: the still-pending
    // card waves play on arrival, and the consumed waves never replay.
    const resumeButton = page.getByRole('button', { name: 'Resume animations' });
    await resumeButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.evaluate(
      () => (window as unknown as { __resetRevealObservations?: () => void }).__resetRevealObservations?.(),
    );

    for (let step = 0; step < 30; step += 1) {
      const row3 = await page.locator('[data-reveal]').nth(3).getAttribute('data-reveal');
      const row4 = await page.locator('[data-reveal]').nth(4).getAttribute('data-reveal');
      if (row3 !== 'pending' && row4 !== 'pending') break;
      await page.mouse.wheel(0, 140);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(900);

    const observations = await readRevealObservations(page);
    const playedWrappers = new Set(observations.map((observation) => observation.wrapper));
    expect(playedWrappers.has(3), 'card row 3 wave played after resume').toBe(true);
    expect(playedWrappers.has(4), 'card row 4 wave played after resume').toBe(true);
    expect(playedWrappers.has(1), 'row 1 wave never replays after resume').toBe(false);
    expect(playedWrappers.has(2), 'row 2 wave never replays after resume').toBe(false);
    await expect(page.locator('[data-reveal]').nth(1)).toHaveAttribute('data-reveal', 'played');
  });

  test('reduced motion and a paused preference never animate reveals', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await trackRevealAnimations(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');
      await waitForHydration(page);

      const sections = page.locator('[data-reveal]');
      await page.evaluate(() =>
        document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant' }),
      );
      await page.evaluate(() =>
        document.querySelector('#approach')?.scrollIntoView({ behavior: 'instant' }),
      );
      // With motion never allowed, every wave — heading, cards, approach — is
      // decided as skipped at hydration.
      const skipped = await page.evaluate(() =>
        [...document.querySelectorAll('[data-reveal]')].every(
          (wrapper) => (wrapper as HTMLElement).dataset.reveal === 'skipped',
        ),
      );
      expect(skipped).toBe(true);
      await expect(sections.nth(0).locator('#projects-heading')).toBeVisible();
      await expect(sections.nth(5).locator('#approach-heading')).toBeVisible();
      await page.waitForTimeout(500);
      expect(await readRevealObservations(page)).toEqual([]);
    } finally {
      await context.close();
    }

    const pausedContext = await browser.newContext();
    try {
      const page = await pausedContext.newPage();
      await openWithPausedPreference(page, true);
      await trackRevealAnimations(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');
      await waitForHydration(page);

      await page.evaluate(() =>
        document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant' }),
      );
      await page.evaluate(() =>
        document.querySelector('#approach')?.scrollIntoView({ behavior: 'instant' }),
      );
      await page.waitForTimeout(500);
      // While paused, nothing ever animates: waves stay pending and fully
      // readable, and a temporary pause never permanently decides them
      // (CP7 E-2) — unlike reduced motion, which is a decisive skip.
      const pausedStates = await page.evaluate(() =>
        [...document.querySelectorAll('[data-reveal]')].map(
          (wrapper) => (wrapper as HTMLElement).dataset.reveal,
        ),
      );
      expect(pausedStates.every((state) => state === 'pending')).toBe(true);
      expect(await readRevealObservations(page)).toEqual([]);
      await expect(page.locator('#projects-heading')).toBeVisible();
      await expect(page.locator('#approach-heading')).toBeVisible();

      // Resume: pending waves become animatable again. Row 1 plays when the
      // reader scrolls back up to it at a continuous pace.
      await page.getByRole('button', { name: 'Resume animations' }).click();
      await page.waitForTimeout(300);
      for (let step = 0; step < 40; step += 1) {
        const row1 = await page.locator('[data-reveal]').nth(1).getAttribute('data-reveal');
        if (row1 === 'playing' || row1 === 'played') break;
        await page.mouse.wheel(0, -140);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(700);
      const resumedObservations = await readRevealObservations(page);
      expect(
        resumedObservations.map((observation) => observation.wrapper),
        'a pending wave played after resume',
      ).toContain(1);
    } finally {
      await pausedContext.close();
    }
  });

  test('pausing mid-reveal settles the section instantly and resume never replays', async ({
    page,
  }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    const firstCardReveal = page.locator('[data-reveal]').nth(1);
    for (let step = 0; step < 60; step += 1) {
      if ((await firstCardReveal.getAttribute('data-reveal')) === 'playing') break;
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }
    // Pause the moment a card wave is observed mid-flight; the shared pause
    // policy must settle it to the readable final state immediately.
    await page.getByRole('button', { name: 'Pause animations' }).click();
    await expect(firstCardReveal).toHaveAttribute('data-reveal', 'played');
    await expect
      .poll(async () =>
        firstCardReveal.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            opacity: style.opacity,
            transform: style.transform,
            animations: element.getAnimations().length,
          };
        }),
      )
      .toEqual({ opacity: '1', transform: 'none', animations: 0 });
    // The staggered items settle to the readable final state too: every
    // reveal item lands at full opacity with no animation left running.
    const cardItems = firstCardReveal.locator('[data-reveal-item]');
    await expect(cardItems).toHaveCount(1);
    await expect
      .poll(async () =>
        Promise.all(
          (await cardItems.all()).map((item) =>
            item.evaluate((element) => ({
              opacity: getComputedStyle(element).opacity,
              animations: element.getAnimations().length,
            })),
          ),
        ),
      )
      .toEqual([{ opacity: '1', animations: 0 }]);

    // Resume never replays the consumed card wave.
    await page.getByRole('button', { name: 'Resume animations' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      (
        window as unknown as { __resetRevealObservations?: () => void }
      ).__resetRevealObservations?.(),
    );
    // Wheel down from the top: row 1 is a deep arrival (no replay).
    for (let step = 0; step < 20; step += 1) {
      const row1State = await page.locator('[data-reveal]').nth(1).getAttribute('data-reveal');
      if (row1State === 'playing') break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    const replayObservations = await readRevealObservations(page);
    // The consumed first-card wave (wrapper 1) must not replay.
    expect(replayObservations.map((observation) => observation.wrapper)).not.toContain(1);
    await expect(firstCardReveal).toHaveAttribute('data-reveal', 'played');
  });

  test('hiding the tab mid-cascade settles the section instantly and resume never replays', async ({
    page,
  }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    const projectsReveal = page.locator('[data-reveal]').nth(0);
    for (let step = 0; step < 60; step += 1) {
      if ((await projectsReveal.getAttribute('data-reveal')) === 'playing') break;
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }

    // Hide the tab from inside the page on the first frame the heading wave is
    // observed running — the established hidden-tab emulation, applied
    // mid-cascade without racing the animation window.
    const hiddenMidCascade = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const wrapper = document.querySelector<HTMLElement>('[data-reveal]');
          if (!wrapper) return resolve(false);
          if (wrapper.dataset.reveal === 'playing') {
            Object.defineProperty(document, 'visibilityState', {
              configurable: true,
              get: () => 'hidden',
            });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
            return resolve(true);
          }
          const tick = () => {
            if (wrapper.dataset.reveal === 'playing') {
              Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                get: () => 'hidden',
              });
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
              document.dispatchEvent(new Event('visibilitychange'));
              return resolve(true);
            }
            if (wrapper.dataset.reveal === 'played' || wrapper.dataset.reveal === 'skipped') {
              return resolve(false);
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(hiddenMidCascade).toBe(true);

    // A mid-cascade hide must settle the wave to the readable final state
    // immediately.
    await expect(projectsReveal).toHaveAttribute('data-reveal', 'played');
    // Scoped to the settled wave's own item — the Approach section has not
    // been triggered. (Row 1 may legitimately already be playing: its entry
    // line sits only ~80px below the heading's.)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const wrapper = document.querySelectorAll('[data-reveal]')[0];
          if (!wrapper) return [];
          return [...wrapper.querySelectorAll('[data-reveal-item]')].map((element) => ({
            opacity: getComputedStyle(element).opacity,
            animations: element.getAnimations().length,
          }));
        }),
      )
      .toEqual([{ opacity: '1', animations: 0 }]);
    expect(await page.locator('[data-reveal]').nth(5).getAttribute('data-reveal')).toBe('pending');

    // Restoring visibility never replays the consumed wave; the pending card
    // waves play as fresh arrivals once the user reads down to them.
    await page.evaluate(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      (
        window as unknown as { __resetRevealObservations?: () => void }
      ).__resetRevealObservations?.(),
    );
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    const replayObservations = await readRevealObservations(page);
    expect(replayObservations.map((observation) => observation.wrapper).sort()).toEqual([3, 4]);
    await expect(projectsReveal).toHaveAttribute('data-reveal', 'played');
  });

  test('focus entering a playing wave settles it instantly and never replays', async ({ page }) => {
    await trackRevealAnimations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    const firstCardReveal = page.locator('[data-reveal]').nth(1);
    for (let step = 0; step < 60; step += 1) {
      if ((await firstCardReveal.getAttribute('data-reveal')) === 'playing') break;
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }

    // Keyboard focus lands on the first card's headline link while that
    // card's wave is running (the card may still be inside its opacity-0
    // delay window). The focus-settle safeguard must settle the wave to the
    // readable final state immediately — no invisible focus target.
    await page.evaluate(() => {
      const firstCardLink = document.querySelector<HTMLElement>(
        '.projects-grid .project-card h3 a',
      );
      firstCardLink?.focus();
    });
    await expect(firstCardReveal).toHaveAttribute('data-reveal', 'played');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const wrapper = document.querySelectorAll('[data-reveal]')[1];
          if (!wrapper) return [];
          return [...wrapper.querySelectorAll('[data-reveal-item]')].map((element) => ({
            opacity: getComputedStyle(element).opacity,
            animations: element.getAnimations().length,
          }));
        }),
      )
      .toEqual([{ opacity: '1', animations: 0 }]);
    // The focused element is genuinely focusable and readable.
    await expect(
      page.locator('.projects-grid .project-card').first().locator('h3 a'),
    ).toBeFocused();

    // Focus-settle is idempotent: re-focusing and scrolling away and back
    // never replays the consumed wave.
    await page.evaluate(() => {
      const secondCardLink = document.querySelectorAll<HTMLElement>(
        '.projects-grid .project-card h3 a',
      )[1];
      secondCardLink?.focus();
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      (
        window as unknown as { __resetRevealObservations?: () => void }
      ).__resetRevealObservations?.(),
    );
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      document.querySelector('#projects')?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    const replayObservations = await readRevealObservations(page);
    // The consumed first-card wave never replays; only the fresh second-row
    // arrival animates.
    expect(replayObservations.map((observation) => observation.wrapper).sort()).toEqual([3, 4]);
    await expect(firstCardReveal).toHaveAttribute('data-reveal', 'played');

    // Hover lift works after completion: the card's transform transition is
    // no longer overridden by a reveal animation.
    const firstCard = page.locator('.projects-grid .project-card').first();
    await firstCard.hover();
    await expect
      .poll(() => firstCard.evaluate((element) => getComputedStyle(element).transform))
      .toBe('matrix(1, 0, 0, 1, 0, -3)');
  });

  test('anchor navigation scrolls smoothly when allowed and immediately when paused', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
      .toBe('smooth');
    await page.locator('.hero-actions a[href="#projects"]').click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.locator('#projects-heading')).toBeInViewport();

    // Paused policy: native immediate scrolling.
    await page.getByRole('button', { name: 'Pause animations' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
      .toBe('auto');
    await page.locator('.hero-actions a[href="#projects"]').click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.locator('#projects-heading')).toBeInViewport();
  });

  test('sections stay readable without JavaScript and no reveal ever runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      const sections = page.locator('[data-reveal]');
      // Per-arrival waves (CP7 T4 final refinement): the Projects heading,
      // the four project cards, the approach heading/introduction/
      // capabilities/workflow-heading/6 workflow steps, and the contact row
      // as a single three-item cascade wave.
      await expect(sections).toHaveCount(16);
      await expect(sections.nth(0)).toHaveAttribute('data-reveal', 'pending');
      await expect(sections.nth(0).locator('#projects-heading')).toBeVisible();
      // Every card wave is pending and fully readable without JavaScript.
      await expect(page.locator('.project-card').first()).toBeVisible();

      await page.evaluate(() =>
        document.querySelector('#approach')?.scrollIntoView({ behavior: 'instant' }),
      );
      await expect(sections.nth(5).locator('#approach-heading')).toBeVisible();
      await expect(sections.nth(5)).toHaveAttribute('data-reveal', 'pending');
    } finally {
      await context.close();
    }
  });

  // CP6-F perceptibility: the owner's core criterion. Every card must
  // genuinely animate while the user can see it during natural reading — the
  // rejected CP6-E single-trigger implementation animated cards 0.6-6+s
  // before they were ever on screen.
  test('desktop reader-pace scrolling: every card animates on screen with coordinated neighbors', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.waitForTimeout(600); // let the hero entrance settle
    await trackCardPerceptibility(page);

    await readerPaceScrollToProjectsEnd(page);
    await page.waitForTimeout(1600); // let the last wave finish

    const report = await readCardPerceptibility(page);
    const cards = [0, 1, 2, 3].map((position) => {
      const record = report.cards[position];
      expect(record, `card ${position} was observed`).toBeDefined();
      return record!;
    });
    cards.forEach((card, index) => {
      expect(card.animStartAt, `card ${index + 1} animation started`).not.toBeNull();
      expect(card.animEndAt, `card ${index + 1} animation ended`).not.toBeNull();
      expect(card.visibleDuringAnim, `card ${index + 1} animated while the user could see it`).toBe(
        true,
      );
      expect(
        card.animStartAt! - card.firstVisibleAt!,
        `card ${index + 1} started animating promptly after first seen`,
      ).toBeLessThanOrEqual(1200);
    });
    // Desktop coordination (CP7 T4 final stagger polish): the two cards of
    // each grid row arrive in the same observer batch and take consecutive
    // stagger slots, so a row rises left-to-right ~140ms apart and the
    // second row starts after the first — the accepted Projects sequence
    // (heading → row 1 → row 2) preserved by DOM order.
    expect(
      cards[1]!.animStartAt! - cards[0]!.animStartAt!,
      'row 1 staggers left-to-right (~140ms)',
    ).toBeGreaterThanOrEqual(80);
    expect(
      cards[1]!.animStartAt! - cards[0]!.animStartAt!,
      'row 1 stagger stays subtle',
    ).toBeLessThanOrEqual(260);
    expect(
      cards[3]!.animStartAt! - cards[2]!.animStartAt!,
      'row 2 staggers left-to-right (~140ms)',
    ).toBeGreaterThanOrEqual(80);
    expect(
      cards[3]!.animStartAt! - cards[2]!.animStartAt!,
      'row 2 stagger stays subtle',
    ).toBeLessThanOrEqual(260);
    expect(cards[2]!.animStartAt!, 'row 2 started after row 1').toBeGreaterThanOrEqual(
      cards[0]!.animStartAt!,
    );
    // Every Projects wave played — none was skipped or left pending.
    for (let index = 0; index < 5; index += 1) {
      const states = report.wrappers[index]!.map((entry) => entry.state);
      expect(states, `wrapper ${index} reached played`).toContain('played');
      expect(states, `wrapper ${index} was never skipped`).not.toContain('skipped');
    }
  });

  test('mobile reader-pace scrolling: every card animates on screen as it arrives', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.waitForTimeout(600); // let the hero entrance settle
    await trackCardPerceptibility(page);

    await readerPaceScrollToProjectsEnd(page);
    await page.waitForTimeout(1600); // let the last wave finish

    const report = await readCardPerceptibility(page);
    const cards = [0, 1, 2, 3].map((position) => {
      const record = report.cards[position];
      expect(record, `card ${position} was observed`).toBeDefined();
      return record!;
    });
    cards.forEach((card, index) => {
      expect(card.animStartAt, `card ${index + 1} animation started`).not.toBeNull();
      expect(card.animEndAt, `card ${index + 1} animation ended`).not.toBeNull();
      expect(card.visibleDuringAnim, `card ${index + 1} animated while the user could see it`).toBe(
        true,
      );
      expect(
        card.animStartAt! - card.firstVisibleAt!,
        `card ${index + 1} started animating promptly after first seen`,
      ).toBeLessThanOrEqual(1200);
    });
    // Mobile: one column, so the waves arrive in DOM order and each card
    // animates as it enters the viewport, in reading order.
    for (let index = 1; index < 4; index += 1) {
      expect(
        cards[index]!.animStartAt!,
        `card ${index + 1} started no earlier than card ${index}`,
      ).toBeGreaterThanOrEqual(cards[index - 1]!.animStartAt!);
    }
    for (let index = 0; index < 5; index += 1) {
      const states = report.wrappers[index]!.map((entry) => entry.state);
      expect(states, `wrapper ${index} reached played`).toContain('played');
      expect(states, `wrapper ${index} was never skipped`).not.toContain('skipped');
    }
  });
});

test.describe('approach layout', () => {
  /**
   * Regression guard for the accepted pre-CP6 Approach grid: at >=768px the
   * overview and capabilities blocks sit side by side in two equal columns and
   * the workflow block spans the full width; below 768px the blocks stack with
   * the section's 48px rhythm. The Reveal wrapper must never become the
   * section's single grid item again.
   */
  test('the approach section keeps the accepted grid structure and responsive rhythm', async ({
    page,
  }) => {
    const measureApproach = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`missing ${selector}`);
          const rect = element.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top + window.scrollY),
            height: Math.round(rect.height),
            width: Math.round(rect.width),
          };
        };
        return {
          overview: box('.approach-overview'),
          capabilities: box('.approach-capabilities'),
          workflow: box('.approach-workflow'),
        };
      });

    const awaitApproachSettled = () =>
      expect
        .poll(() =>
          page.evaluate(() => {
            const approach = document.querySelectorAll('[data-reveal]')[5] as
              HTMLElement | undefined;
            return approach?.dataset.reveal === 'played' || approach?.dataset.reveal === 'skipped';
          }),
        )
        .toBe(true);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForHydration(page);
    await page.evaluate(() =>
      document.querySelector('#approach')?.scrollIntoView({ behavior: 'instant' }),
    );
    // No reveal may be mid-flight while measuring, so transforms never skew boxes.
    await awaitApproachSettled();
    await page.waitForTimeout(100);

    const desktop = await measureApproach();
    expect(desktop.overview).toBeTruthy();
    // Overview and capabilities share a row: same top, distinct columns.
    expect(desktop.overview.top).toBe(desktop.capabilities.top);
    expect(desktop.overview.right).toBeLessThan(desktop.capabilities.left);
    // The workflow block spans both columns.
    expect(desktop.workflow.top).toBeGreaterThan(desktop.overview.top);
    expect(desktop.workflow.width).toBeGreaterThan(desktop.overview.width);
    expect(desktop.workflow.left).toBe(desktop.overview.left);
    expect(desktop.workflow.right).toBe(desktop.capabilities.right);

    await page.setViewportSize({ width: 375, height: 720 });
    await awaitApproachSettled();
    await page.waitForTimeout(100);

    const mobile = await measureApproach();
    expect(mobile.overview).toBeTruthy();
    expect(mobile.capabilities).toBeTruthy();
    // Stacked full-width blocks in reading order.
    expect(mobile.capabilities.top).toBeGreaterThan(mobile.overview.top);
    expect(mobile.capabilities.left).toBe(mobile.overview.left);
    // Separated by the accepted 48px rhythm. The
    // gap is read as one unrounded difference: rounding each box edge
    // separately can shift the composed value by a pixel against the band.
    const mobileGap = await page.evaluate(
      () =>
        document.querySelector('.approach-capabilities')!.getBoundingClientRect().top -
        (document.querySelector('.approach-overview')!.getBoundingClientRect().top +
          document.querySelector('.approach-overview')!.getBoundingClientRect().height),
    );
    expect(mobileGap).toBeGreaterThanOrEqual(46);
    expect(mobileGap).toBeLessThanOrEqual(50);
  });
});
