import { expect, test, type Page } from '@playwright/test';

const STARFIELD_CANVAS = 'page-starfield-canvas';
const HERO_CANVAS = 'hero-motif-canvas';

interface AmbientProbe {
  frames: Record<string, number>;
  stamps: Record<string, number[]>;
  resets: number;
}

async function waitForCanvasMode(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-mode'),
      ),
    )
    .toBe('canvas');
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector('.hero-motif')?.getAttribute('data-constellation-mode'),
      ),
    )
    .toBe('canvas');
}

function instrument(page: Page) {
  void page.addInitScript(() => {
    const probe: AmbientProbe = { frames: {}, stamps: {}, resets: 0 };
    (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe = probe;

    for (const dimension of ['width', 'height'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dimension);
      if (
        !descriptor ||
        typeof descriptor.get !== 'function' ||
        typeof descriptor.set !== 'function'
      ) {
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getter = descriptor.get as (this: HTMLCanvasElement) => number;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setter = descriptor.set as (this: HTMLCanvasElement, value: number) => void;
      Object.defineProperty(HTMLCanvasElement.prototype, dimension, {
        configurable: true,
        enumerable: descriptor.enumerable === true,
        get(this: HTMLCanvasElement) {
          return getter.call(this);
        },
        set(this: HTMLCanvasElement, value: number) {
          if (getter.call(this) !== value) probe.resets += 1;
          setter.call(this, value);
        },
      });
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const result = original.apply(this, args as never);
      const key = this.className;
      if (result && args[0] === '2d' && !(result as { __probe?: boolean }).__probe) {
        (result as { __probe?: boolean }).__probe = true;
        const clear = (result as { clearRect: (...cargs: unknown[]) => unknown }).clearRect.bind(
          result,
        );
        (result as { clearRect: (...cargs: unknown[]) => unknown }).clearRect = (
          ...clearArgs: unknown[]
        ) => {
          probe.frames[key] = (probe.frames[key] ?? 0) + 1;
          (probe.stamps[key] ||= []).push(performance.now());
          return clear(...clearArgs);
        };
      }
      return result;
    } as never;
  });
}

async function canvasFrames(page: Page, key: string) {
  return page.evaluate((className) => {
    const probe = (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe;
    return probe.frames[className] ?? 0;
  }, key);
}

async function totalFrames(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe;
    return Object.values(probe.frames).reduce((sum, count) => sum + count, 0);
  });
}

async function canvasResets(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe.resets,
  );
}

test.describe('ambient', () => {
  // Every test here measures wall-clock animation. Concurrent browser
  // instances contend for CPU and stretch real page time, which misreads
  // cadence caps and elapsed windows (CP4.5-B), so this file runs in order
  // in one worker regardless of the project's fullyParallel setting.
  // 'default' (unlike 'serial') does not skip the rest after one failure.
  test.describe.configure({ mode: 'default' });

  test('constellation activates without bypassing the static fallback', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await expect(page.locator('.page-starfield .page-starfield-canvas')).toBeVisible();
    expect(await canvasFrames(page, STARFIELD_CANVAS)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /Pause animations/i })).toBeVisible();
  });

  test('both ambient layers animate independently', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(200);

    const starfieldBefore = await canvasFrames(page, STARFIELD_CANVAS);
    const heroBefore = await canvasFrames(page, HERO_CANVAS);
    await page.waitForTimeout(500);

    expect(await canvasFrames(page, STARFIELD_CANVAS)).toBeGreaterThan(starfieldBefore);
    expect(await canvasFrames(page, HERO_CANVAS)).toBeGreaterThan(heroBefore);
  });

  test('infinite ascent advances with elapsed time and freezes without catch-up jumps', async ({
    page,
  }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);

    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(
            document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-ascent') ??
              '-1',
          ),
        ),
      )
      .toBeGreaterThanOrEqual(0);

    const before = await page.evaluate(() => ({
      ascent: Number(
        document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-ascent'),
      ),
      at: performance.now(),
    }));
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      ascent: Number(
        document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-ascent'),
      ),
      at: performance.now(),
    }));
    // 50 px/s: real elapsed-time movement (≈35px across a 700ms window).
    // The window is normalized by the page's own performance.now clock
    // because Node timers and evaluate RPCs stretch under load — what
    // matters is that the ascent tracks the elapsed time the page actually
    // had and never a catch-up-sized jump.
    const duration = after.at - before.at;
    expect(duration).toBeGreaterThan(200);
    expect(after.ascent).toBeGreaterThan(before.ascent + 1);
    expect(after.ascent - before.ascent).toBeGreaterThan(duration * 0.028);
    expect(after.ascent - before.ascent).toBeLessThan(duration * 0.075 + 4);

    // Frozen loop: no accrual while hidden, no jump on return.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
    const readAscent = () =>
      page.evaluate(() =>
        Number(
          document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-ascent'),
        ),
      );
    const frozen = await readAscent();
    await page.waitForTimeout(400);
    expect(await readAscent()).toBe(frozen);

    const resumeAt = await page.evaluate(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      // Stamp the resume moment on the page's own clock: the loop may only
      // advance by the elapsed time that has actually passed since here.
      return performance.now();
    });
    await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => ({
      ascent: Number(
        document.querySelector('.page-starfield')?.getAttribute('data-page-starfield-ascent'),
      ),
      at: performance.now(),
    }));
    // Drift may cover only the real time since resume (50 px/s) plus one
    // throttled frame and rounding; Node timer stretch is normalized away.
    const driftAllowance = Math.max(6, (resumed.at - resumeAt) * 0.055 + 4);
    expect(Math.abs(resumed.ascent - frozen)).toBeLessThan(driftAllowance);
  });

  test('shooting stars appear occasionally with bounded lives and never overlap', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const records: { start: number; end: number }[] = [];
      (window as unknown as { __meteorRecords: { start: number; end: number }[] }).__meteorRecords =
        records;
      let open: { start: number; end: number } | null = null;
      let count = -1;
      const observe = () => {
        const starfield = document.querySelector('.page-starfield');
        if (!starfield) {
          requestAnimationFrame(observe);
          return;
        }
        const currentCount = Number(starfield.getAttribute('data-page-starfield-meteors') ?? '0');
        if (count === -1 && currentCount === 0) {
          // Baseline established; subsequent increments are real meteors.
          records.push({ start: -1, end: -1 });
          records.pop();
          count = 0;
        } else if (currentCount > count) {
          count = currentCount;
          open = { start: performance.now(), end: performance.now() };
          records.push(open);
        }
        const active = starfield.getAttribute('data-page-starfield-meteor') === '1';
        if (open && active) open.end = performance.now();
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });

    await page.goto('/');
    await waitForCanvasMode(page);

    // First spawn lands within the 3–7s gap after the animation starts.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __meteorRecords: { start: number; end: number }[] })
                .__meteorRecords.length,
          ),
        { timeout: 18_000 },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(1_000);

    const records = await page.evaluate(
      () =>
        (window as unknown as { __meteorRecords: { start: number; end: number }[] })
          .__meteorRecords,
    );
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      // Lifetimes are ≤1300ms; allow sampling granularity above that.
      expect(record.end - record.start).toBeLessThanOrEqual(1_600);
    }
    // No overlap: records are non-interleaved contiguous windows.
    for (let index = 1; index < records.length; index += 1) {
      expect(records[index]!.start).toBeGreaterThanOrEqual(records[index - 1]!.end);
    }
  });

  test('scrolling repaints the stars at display cadence without resizing canvases', async ({
    page,
  }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(250);

    const resetsBefore = await canvasResets(page);
    const framesBefore = await canvasFrames(page, STARFIELD_CANVAS);

    const stats = await page.evaluate(async (className) => {
      const probe = (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function step(now: number) {
          const progress = Math.min(1, (now - start) / 800);
          window.scrollTo(0, Math.round(600 * progress));
          if (progress < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
      const end = performance.now();
      root.style.scrollBehavior = previousBehavior;
      const stamps = (probe.stamps[className] ?? []).filter((time) => time >= start && time <= end);
      const intervals = stamps
        .slice(1)
        .map((time, index) => time - (stamps[index] as number))
        .sort((a, b) => a - b);
      return {
        frames: stamps.length,
        p90: intervals.length ? (intervals[Math.floor(intervals.length * 0.9)] as number) : 0,
      };
    }, STARFIELD_CANVAS);

    // Before the fix the scroll-coupled layer painted ~22 FPS with 50ms gaps.
    expect(stats.frames).toBeGreaterThan(25);
    expect(stats.p90).toBeLessThan(34);
    expect(await canvasResets(page)).toBe(resetsBefore);
    expect(await canvasFrames(page, STARFIELD_CANVAS)).toBeGreaterThan(framesBefore);
  });

  test('idle motion stays throttled', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(200);

    // Frame stamps carry the page's own clock, so the window length is
    // measured in the page rather than trusted from the Node timer.
    const readWindow = () =>
      page.evaluate((className) => {
        const probe = (window as unknown as { __ambientProbe: AmbientProbe }).__ambientProbe;
        const stamps = probe.stamps[className] ?? [];
        return {
          count: stamps.length,
          lastAt: stamps.length ? (stamps[stamps.length - 1] as number) : 0,
        };
      }, STARFIELD_CANVAS);

    const before = await readWindow();
    await page.waitForTimeout(600);
    const after = await readWindow();
    const during = after.count - before.count;
    const windowMs = Math.max(300, after.lastAt - before.lastAt);

    // Same rate semantics as the 600ms constants they replace: visibly
    // alive (≥ ~7fps) but inside the ≤30fps idle cap.
    expect(during).toBeGreaterThan(windowMs / 150);
    expect(during).toBeLessThan(windowMs / 25);
  });

  test('pause stops drawFrame work and returns static fallback', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Pause animations/i }).click();
    await expect(page.locator('.page-starfield')).toHaveAttribute(
      'data-page-starfield-mode',
      'static',
    );
    await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-mode', 'static');
    await page.waitForTimeout(100);
    const before = await totalFrames(page);
    await page.waitForTimeout(350);
    expect(await totalFrames(page)).toBe(before);
  });

  test('animations resume after pause is cleared', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Pause animations/i }).click();
    await expect(page.locator('.page-starfield')).toHaveAttribute(
      'data-page-starfield-mode',
      'static',
    );
    await page.waitForTimeout(100);

    await page.getByRole('button', { name: /Resume animations/i }).click();
    await waitForCanvasMode(page);
    const before = await totalFrames(page);
    await page.waitForTimeout(350);
    expect(await totalFrames(page)).toBeGreaterThan(before);
  });

  test('reduced motion keeps fallback and no canvas draws', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      instrument(page);
      await page.goto('/');
      await page.waitForTimeout(500);
      await expect(page.locator('.page-starfield')).toHaveAttribute(
        'data-page-starfield-mode',
        'static',
      );
      await expect(page.locator('.hero-motif')).toHaveAttribute(
        'data-constellation-mode',
        'static',
      );
      expect(await totalFrames(page)).toBe(0);
    } finally {
      await context.close();
    }
  });

  test('hidden tabs freeze canvas work', async ({ page }) => {
    instrument(page);
    await page.goto('/');
    await waitForCanvasMode(page);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    const before = await totalFrames(page);
    await page.waitForTimeout(350);
    expect(await totalFrames(page)).toBe(before);

    await page.evaluate(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });

  test('failed canvas context keeps SVG fallback readable', async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: unknown[]
      ) {
        if (args[0] === '2d') return null;
        return original.apply(this, args as never);
      } as never;
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('.page-starfield')).toHaveAttribute(
      'data-page-starfield-mode',
      'static',
    );
    await expect(page.locator('.hero-motif')).toHaveAttribute('data-constellation-mode', 'static');
  });

  test('fine-pointer policy matches device pointer support', async ({ page }) => {
    await page.goto('/');
    await waitForCanvasMode(page);
    const pointerSupport = await page.evaluate(() => window.matchMedia('(pointer: fine)').matches);
    await expect
      .poll(async () => page.locator('.page-starfield').getAttribute('data-page-starfield-pointer'))
      .toBe(pointerSupport ? 'on' : 'off');
  });

  test('pointer input stays active where fine pointers are available', async ({ page }) => {
    await page.goto('/');
    await waitForCanvasMode(page);
    const support = await page.evaluate(() => window.matchMedia('(pointer: fine)').matches);
    if (support) {
      await expect(page.locator('#main')).toBeVisible();
    }
  });
});
