import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  carouselFixture,
  installLog,
  logEntry,
  probePair,
  readLog,
  stopCarouselFixture,
} from './carouselFixture';

/**
 * Carousel autoplay lifecycle: a silent 3.8s advance chain, gated by keyboard
 * focus, dragging, motion preferences, tab visibility and viewport presence;
 * every visible homepage carousel advances independently with a small
 * deterministic initial stagger. The cursor is deliberately absent from the
 * gate list: a parked pointer must never hold the chain, so hover, drag
 * releases and dot clicks all resume on a fresh countdown. The countdown
 * contract is 3500–4800ms between consecutive advances and a fresh countdown
 * after every gate release or manual navigation; the assertions allow small
 * timer/observer slop around that window but catch skipped, doubled or
 * catch-up firings.
 */

const MOTION_PAUSE_STORAGE_KEY = 'denver.dev:motion:paused';
const COUNTDOWN_MIN_MS = 3500;
const COUNTDOWN_MAX_MS = 4800;
/**
 * The first advance is measured against a baseline sampled across several
 * Playwright protocol roundtrips (hydration polls, log install), so the real
 * attach moment can sit up to ~1s earlier than the baseline under parallel
 * load. Spacing assertions between page-internal timestamps stay strict.
 */
const FIRST_ADVANCE_MIN_MS = 2800;
/** Conservative wait that must observe the next advance inside the window. */
const NEXT_ADVANCE_TIMEOUT = 6_800;
/** Waiting this long without an advance proves the countdown did not restart early. */
const NO_EARLY_ADVANCE_MS = 3_200;

/** Hydrates the isolated fixture detail page and returns the media root. */
async function hydrateDetail(page: Page, origin: string, count = 2): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${origin}/projects/saklolo161/`);
  await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
  const media = page.locator('.project-media');
  await expect(media).toHaveAttribute('data-carousel-count', String(count));
  return media;
}

test.describe('carousel autoplay lifecycle and homepage independence', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await stopCarouselFixture();
  });

  test('autoplay advances on a fresh countdown, and manual navigation restarts it', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);
    await installLog(media, 'main');
    const attachTime = await page.evaluate(() => performance.now());

    // First advance: 3.5–4.8s after the controller attached, not before. The
    // log opens with the installed baseline value, so the advance is entry 1.
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    let log = await readLog(page, 'main');
    expect(log.map((change) => change.v)).toEqual(['0', '1']);
    expect(logEntry(log, 1).t - attachTime).toBeGreaterThanOrEqual(FIRST_ADVANCE_MIN_MS);
    expect(logEntry(log, 1).t - attachTime).toBeLessThanOrEqual(COUNTDOWN_MAX_MS);
    // The visible caption follows silent autoplay advances too, without ever
    // carrying the slide-position prefix.
    await expect(media.locator('.project-media-caption')).toHaveText('Synthetic second image');

    // Second and third advances. Count = 2, so the second advance wraps
    // 1→0 through the end clone: the wrap start ('2') fires on the countdown
    // clock, the clone landing ('0') follows a beat later (one transition +
    // a double-rAF reposition), and the third advance ('1') fires a fresh
    // 3.5–4.8s after the second fire — scheduled from the fire, not the landing.
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    log = await readLog(page, 'main');
    expect(log.map((change) => change.v)).toEqual(['0', '1', '2', '0', '1']);
    expect(logEntry(log, 2).t - logEntry(log, 1).t).toBeGreaterThanOrEqual(COUNTDOWN_MIN_MS);
    expect(logEntry(log, 2).t - logEntry(log, 1).t).toBeLessThanOrEqual(COUNTDOWN_MAX_MS);
    expect(logEntry(log, 3).t - logEntry(log, 2).t).toBeLessThan(COUNTDOWN_MIN_MS);
    expect(logEntry(log, 4).t - logEntry(log, 2).t).toBeGreaterThanOrEqual(COUNTDOWN_MIN_MS);
    expect(logEntry(log, 4).t - logEntry(log, 2).t).toBeLessThanOrEqual(COUNTDOWN_MAX_MS);

    // Manual navigation (a programmatic dot click, so no pointer gate is in
    // play) restarts the countdown: the next autoplay fire is a full 3.5–4.8s
    // later.
    await page.evaluate(() => {
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="0"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
    });
    const clickLog = await readLog(page, 'main');
    const clickEntry = logEntry(clickLog, clickLog.length - 1);
    expect(clickEntry.v).toBe('0');
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    log = await readLog(page, 'main');
    const fire = logEntry(log, log.length - 1);
    expect(fire.t - clickEntry.t).toBeGreaterThanOrEqual(COUNTDOWN_MIN_MS);
    expect(fire.t - clickEntry.t).toBeLessThanOrEqual(COUNTDOWN_MAX_MS);
  });

  test('autoplay wraps from the last slide through the end clone straight to the first', async ({
    page,
  }) => {
    const fourShots = [
      { file: 'probe-a.png', alt: 'Synthetic first image', width: 1920, height: 1080 },
      { file: 'probe-b.png', alt: 'Synthetic second image', width: 1920, height: 1080 },
      { file: 'probe-c.png', alt: 'Synthetic third image', width: 1920, height: 1080 },
      { file: 'probe-d.png', alt: 'Synthetic fourth image', width: 1920, height: 1080 },
    ];
    const origin = await carouselFixture(fourShots);
    const media = await hydrateDetail(page, origin, 4);

    // Ride the autoplay chain to the last slide (three advances).
    await expect(media).toHaveAttribute('data-carousel-active', '3', { timeout: 22_000 });

    const figureBox = await media.locator('.project-media-figure').boundingBox();
    if (!figureBox) throw new Error('figure box missing');

    // Sample every animation frame across the wrap: the inline transform may
    // only hold the last position, the clone position and slide 1 (a reverse
    // multi-slide transit would show intermediate values), the root attribute
    // must pass through the clone position, and the clone landing frame must
    // carry no running transition.
    await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('[data-carousel-track]');
      const root = document.querySelector<HTMLElement>('.project-media');
      if (!track || !root) throw new Error('carousel missing');
      const frames: Array<{ v: string; active: string; anims: number }> = [];
      const state = window as unknown as { __wrapFrames?: typeof frames; __wrapRaf?: number };
      state.__wrapFrames = frames;
      const sample = () => {
        frames.push({
          v: track.style.transform,
          active: root.getAttribute('data-carousel-active') ?? '',
          anims: track.getAnimations().length,
        });
      };
      sample();
      state.__wrapRaf = requestAnimationFrame(function loop() {
        sample();
        (window as unknown as { __wrapRaf?: number }).__wrapRaf = requestAnimationFrame(loop);
      });
    });
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    // Give the landing and reposition a beat to be fully sampled.
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const state = window as unknown as { __wrapRaf?: number };
      if (state.__wrapRaf !== undefined) cancelAnimationFrame(state.__wrapRaf);
    });
    const frames = await page.evaluate<Array<{ v: string; active: string; anims: number }>>(
      () =>
        (
          window as unknown as {
            __wrapFrames?: Array<{ v: string; active: string; anims: number }>;
          }
        ).__wrapFrames ?? [],
    );
    const transforms = [...new Set(frames.map((frame) => frame.v))];
    expect(transforms.length).toBeGreaterThan(0);
    for (const value of transforms) {
      expect(['translateX(-400%)', 'translateX(-500%)', 'translateX(-100%)']).toContain(value);
    }
    // The wrap moves forward onto the clone before landing on slide 1.
    expect(transforms).toContain('translateX(-500%)');
    const actives = frames.map((frame) => frame.active);
    const lastClone = actives.lastIndexOf('4');
    expect(lastClone).toBeGreaterThan(-1);
    const firstZeroAfter = actives.findIndex(
      (value, position) => position > lastClone && value === '0',
    );
    expect(firstZeroAfter).toBeGreaterThan(lastClone);
    // The clone landing frame: parked on the clone, no running transition.
    expect(
      frames.some(
        (frame) => frame.active === '4' && frame.v === 'translateX(-500%)' && frame.anims === 0,
      ),
    ).toBe(true);
    // Between-slide box dimensions stay stable through the wrap.
    const figureBoxAfter = await media.locator('.project-media-figure').boundingBox();
    expect(figureBoxAfter).toEqual(figureBox);
  });

  test('the cursor never pauses autoplay; keyboard focus still holds a fresh-release pause', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);
    await media.scrollIntoViewIfNeeded();
    const figure = media.locator('.project-media-figure');
    const box = await figure.boundingBox();
    if (!box) throw new Error('figure box missing');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Sequence 1: a committed drag ends with the cursor parked over the media.
    // The release restarts a fresh countdown and autoplay must advance — the
    // parked cursor must not hold the chain.
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - box.width * 0.3, centerY, { steps: 3 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Keyboard focus gate: a programmatic focus (:focus-visible) inside the
    // media holds the pause — no unexpected autoplay while a keyboard user
    // operates the controls.
    await figure.focus();
    await page.waitForTimeout(5_000);
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    // Release: the countdown restarts fresh — nothing for ~3.2s, then one
    // advance through the wrap (active goes 0→1 via the clone).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Sequence 2: a real mouse click on a dot leaves no :focus-visible behind,
    // so with the cursor parked on the dot autoplay still advances after the
    // manual navigation's fresh countdown.
    await media.locator('[data-carousel-dot="0"]').click();
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Sequence 6 (keyboard leg): Tab from that dot moves real keyboard focus
    // (:focus-visible) into the control set — the chain must hold, not fire.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(5_000);
    await expect(media).toHaveAttribute('data-carousel-active', '1');
  });

  test.describe('touch gestures', () => {
    test.use({ hasTouch: true, viewport: { width: 393, height: 720 } });

    test('a touch swipe release does not stall the chain', async ({ page }) => {
      const origin = await carouselFixture(probePair);
      await page.goto(`${origin}/projects/saklolo161/`);
      await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
      const media = page.locator('.project-media');
      await expect(media).toHaveAttribute('data-carousel-count', '2');
      await media.scrollIntoViewIfNeeded();
      const cdp = await page.context().newCDPSession(page);

      // Sequence 3: a committed horizontal touch swipe, then the finger is
      // gone — autoplay must resume on a fresh countdown.
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
      await expect(media).toHaveAttribute('data-carousel-active', '1');
      await expect(media).toHaveAttribute('data-carousel-active', '0', {
        timeout: NEXT_ADVANCE_TIMEOUT,
      });
    });
  });

  test('reduced motion disables autoplay while manual navigation keeps working', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);
    const status = media.locator('[data-carousel-status]');

    // No autoplay at all, well past the first countdown.
    await page.waitForTimeout(7_000);
    await expect(media).toHaveAttribute('data-carousel-active', '0');

    // Manual navigation is untouched: dots announce, keys navigate, drag commits.
    await page.evaluate(() => {
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="1"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
    });
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(status).toHaveText('Slide 2 of 2: Synthetic second image');
    const figure = media.locator('.project-media-figure');
    await figure.focus();
    await page.keyboard.press('ArrowRight');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    await media.scrollIntoViewIfNeeded();
    const box = await figure.boundingBox();
    if (!box) throw new Error('figure box missing');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - box.width * 0.3, y, { steps: 3 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '1');
  });

  test('motion policies swap slides instantly while manual navigation stays fully functional', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const track = page.locator('[data-carousel-track]');
    const figure = page.locator('.project-media-figure');

    // Both policies must remove the slide transition (instant swaps), leave
    // no keyframe artifacts on the track, and keep vertical page panning.
    const assertPolicyGuards = async () => {
      await expect
        .poll(() => track.evaluate((el) => getComputedStyle(el).transitionDuration))
        .toBe('0s');
      await expect
        .poll(() => track.evaluate((el) => getComputedStyle(el).animationName))
        .toBe('none');
      await expect
        .poll(() => figure.evaluate((el) => getComputedStyle(el).touchAction))
        .toBe('pan-y');
    };

    // Reduced-motion context: the media query is active from page load.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const media = await hydrateDetail(page, origin);
    await media.scrollIntoViewIfNeeded();
    await assertPolicyGuards();

    // Instant movement: the dot click moves the inline transform in the same
    // synchronous task, with no transition to wait out. With the start clone,
    // slide 2 rests one clone-shifted slot further: -200%.
    const dotTransform = await page.evaluate(() => {
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="1"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
      const trackEl = document.querySelector<HTMLElement>('[data-carousel-track]');
      return trackEl?.style.transform ?? '';
    });
    expect(dotTransform).toBe('translateX(-200%)');
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    // Keyboard navigation still fully functions.
    await figure.focus();
    await page.keyboard.press('ArrowRight');
    await expect(media).toHaveAttribute('data-carousel-active', '0');
    // A committed drag still changes slides.
    const box = await figure.boundingBox();
    if (!box) throw new Error('figure box missing');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - box.width * 0.3, y, { steps: 3 });
    await page.mouse.up();
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // Global pause context: the preference is stored before the page loads,
    // with the reduced-motion query off so the contexts stay isolated.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'true');
    }, MOTION_PAUSE_STORAGE_KEY);
    const pausedMedia = await hydrateDetail(page, origin);
    await pausedMedia.scrollIntoViewIfNeeded();
    await assertPolicyGuards();
    const pausedTransform = await page.evaluate(() => {
      const dot = document.querySelector<HTMLButtonElement>('[data-carousel-dot="1"]');
      if (!dot) throw new Error('dot missing');
      dot.click();
      const trackEl = document.querySelector<HTMLElement>('[data-carousel-track]');
      return trackEl?.style.transform ?? '';
    });
    expect(pausedTransform).toBe('translateX(-200%)');
    await expect(pausedMedia).toHaveAttribute('data-carousel-active', '1');
  });

  test('the global pause halts autoplay mid-run; resume starts a fresh countdown', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);
    await installLog(media, 'main');

    // Get the chain running first.
    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Engage the global pause the same way the preferences toggle does in a
    // single tab: persist the value, then fire the storage event the listener
    // subscribes to (a same-tab setItem alone fires no storage event).
    await page.evaluate((key) => {
      localStorage.setItem(key, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key }));
    }, MOTION_PAUSE_STORAGE_KEY);

    // Held: no further advance for longer than a full countdown.
    await page.waitForTimeout(7_000);
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // Resume: a fresh countdown — nothing for ~4.2s, then an advance.
    await page.evaluate((key) => {
      localStorage.setItem(key, 'false');
      window.dispatchEvent(new StorageEvent('storage', { key }));
    }, MOTION_PAUSE_STORAGE_KEY);
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    const log = await readLog(page, 'main');
    // Baseline entry plus the single pre-pause advance.
    expect(log.map((change) => change.v)).toEqual(['0', '1']);
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    const after = await readLog(page, 'main');
    // The resume advance wraps 1→0 through the end clone ('2' then '0').
    expect(after.map((change) => change.v)).toEqual(['0', '1', '2', '0']);
    // The resume fire comes a full fresh countdown after the held advance.
    expect(logEntry(after, 2).t - logEntry(after, 1).t).toBeGreaterThanOrEqual(NO_EARLY_ADVANCE_MS);
  });

  test('a hidden tab halts autoplay and return starts a fresh countdown without catch-up', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);

    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // The page cannot be truly backgrounded mid-test, so declare the hidden
    // state the same way the browser would: override the visibility probes and
    // dispatch the same visibilitychange event.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden',
        configurable: true,
      });
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(7_000);
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // Return: a fresh countdown, and no catch-up burst for the hidden time.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true,
      });
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
  });

  test('an offscreen carousel stops advancing; returning restarts a fresh countdown', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    const media = await hydrateDetail(page, origin);
    await media.scrollIntoViewIfNeeded();

    await expect(media).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Offscreen: the carousel is the only media root, so its license ratio
    // drops to 0 and the chain must stop for longer than a full countdown.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(7_000);
    await expect(media).toHaveAttribute('data-carousel-active', '1');

    // Back in view: a fresh countdown — nothing for ~4.2s, then an advance.
    await media.scrollIntoViewIfNeeded();
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(media).toHaveAttribute('data-carousel-active', '1');
    await expect(media).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
  });

  test('every visible homepage carousel advances independently with a deterministic initial stagger', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 720 });
    await page.goto('/');
    const cards = page.locator('#projects article');
    // All four preview carousels must be hydrated before visibility means
    // anything.
    for (let i = 0; i < 4; i += 1) {
      await expect(cards.nth(i).locator('.project-media')).toHaveAttribute(
        'data-carousel-active',
        '0',
        { timeout: 60_000 },
      );
    }

    const rowTop = async (index: number) =>
      cards.nth(index).evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    const third = cards.nth(2).locator('.project-media');
    const fourth = cards.nth(3).locator('.project-media');

    // Install the page-internal logs BEFORE scrolling so both cards' first
    // autoplay fires are timestamped inside the page.
    await installLog(third, 'stagger-third');
    await installLog(fourth, 'stagger-fourth');

    // Scroll the second row flush with the viewport top: cards 3 and 4 are
    // fully visible, row 1 is entirely above the fold.
    await page.evaluate((y) => window.scrollTo(0, y), await rowTop(2));

    // Independence: both visible cards advance on their own chains — no
    // exclusive license decides a single winner.
    await expect(third).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    await expect(fourth).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // One carousel's pause must not touch the others: keyboard-focusing card
    // 3's dot (programmatic focus matches :focus-visible) holds card 3, while
    // card 4 keeps advancing on its own chain.
    await third.locator('[data-carousel-dot="0"]').focus();
    await page.waitForTimeout(5_400);
    await expect(third).toHaveAttribute('data-carousel-active', '1');
    await expect(fourth).toHaveAttribute('data-carousel-active', '2', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Release: card 3's countdown restarts fresh — nothing for ~3.2s, then one
    // advance.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(NO_EARLY_ADVANCE_MS);
    await expect(third).toHaveAttribute('data-carousel-active', '1');
    await expect(third).toHaveAttribute('data-carousel-active', '2', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });

    // Offscreen cards stay suspended the whole time.
    for (const i of [0, 1]) {
      await expect(cards.nth(i).locator('.project-media')).toHaveAttribute(
        'data-carousel-active',
        '0',
      );
    }

    // Deterministic initial stagger: card 3 (attach order 2) starts its first
    // countdown 700ms after the base gap, card 4 (order 3) 1050ms — the first
    // fires sit ~350ms apart, measured between page-internal timestamps.
    const thirdLog = await readLog(page, 'stagger-third');
    const fourthLog = await readLog(page, 'stagger-fourth');
    const gap = logEntry(fourthLog, 1).t - logEntry(thirdLog, 1).t;
    expect(gap, 'initial stagger between the two visible chains').toBeGreaterThanOrEqual(100);
    expect(gap, 'initial stagger between the two visible chains').toBeLessThanOrEqual(1400);
  });

  test('client-side navigation remounts keep exactly one autoplay loop per carousel', async ({
    page,
  }) => {
    const origin = await carouselFixture(probePair);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/`);
    await expect(page.locator('[data-startup-indicator]')).toHaveCount(0, { timeout: 60_000 });
    const card = page.locator('#projects article').first();
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.project-media')).toHaveAttribute('data-carousel-count', '2');

    // Navigate to the detail page and back: ProjectMedia tears down and
    // remounts inside the same document, which is where a leaked timer or a
    // double-bound loop would show up.
    await card.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/projects\/saklolo161\//);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    const remounted = page.locator('#projects article').first().locator('.project-media');
    await remounted.scrollIntoViewIfNeeded();
    await expect(remounted).toHaveAttribute('data-carousel-active', '0');
    await installLog(remounted, 'remount');

    // Exactly one chain: two consecutive advances, each a fresh 5–6s apart.
    await expect(remounted).toHaveAttribute('data-carousel-active', '1', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    await expect(remounted).toHaveAttribute('data-carousel-active', '0', {
      timeout: NEXT_ADVANCE_TIMEOUT,
    });
    const log = await readLog(page, 'remount');
    // Second advance wraps 1→0 through the end clone ('2' then '0').
    expect(log.map((change) => change.v)).toEqual(['0', '1', '2', '0']);
    expect(logEntry(log, 2).t - logEntry(log, 1).t).toBeGreaterThanOrEqual(COUNTDOWN_MIN_MS);
    expect(logEntry(log, 2).t - logEntry(log, 1).t).toBeLessThanOrEqual(COUNTDOWN_MAX_MS);
  });
});
