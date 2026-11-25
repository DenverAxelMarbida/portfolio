import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T4 final visual-parity refinement — regression tests for the
 * owner-reported diffs vs the approved interactive simulation:
 * consecutive starts ~140ms apart, 520ms cubic-bezier(.2, .75, .25, 1)
 * fade/18px rise, smooth overlapping animations, and adjacent-frame
 * arrivals continuing the cascade instead of starting simultaneously.
 *
 * Assertions run on recorded `section-reveal-rise` animationstart events
 * (their timestamps already include the effective delay), on computed
 * styles read from a live mid-animation element (not assigned CSS
 * variables), and on a per-frame sampler that proves delayed blocks stay
 * invisible until their animation actually begins.
 */

const ORIGIN = 'http://127.0.0.1:4173';

/** Stagger window around the 140ms tuning value, absorbing frame jitter. */
const STAGGER_MIN_MS = 80;
const STAGGER_MAX_MS = 260;

interface RevealStart {
  key: string;
  t: number;
  delay: number;
}

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: /Pause animations|Resume animations/ })).toBeVisible();
}

/** Records every section-reveal-rise animationstart with a wave key + delay. */
async function armRevealStartRecorder(page: Page) {
  await page.addInitScript(() => {
    const starts: Array<{ key: string; t: number; delay: number }> = [];
    (window as unknown as Record<string, unknown>).staggerStarts = starts;
    const keyOf = (target: Element, wave: Element | null): string => {
      if (!wave) return 'other';
      if (wave.querySelector('#projects-heading')) return 'projects-heading';
      if (wave.closest('.projects-grid')) {
        const cards = [...wave.closest('.projects-grid')!.children].filter((element) =>
          element.matches('[data-reveal]'),
        );
        return `card:${cards.indexOf(wave)}`;
      }
      if (wave.querySelector('#approach-heading')) return 'approach-heading';
      if (wave.querySelector('.approach-introduction')) return 'approach-intro';
      if (wave.querySelector('.approach-capabilities')) return 'approach-capabilities';
      if (wave.querySelector('#workflow-heading')) return 'workflow-heading';
      if (wave.closest('.site-footer')) {
        if (target.matches('.footer-links')) return 'contact-content';
        if (target.matches('.footer-motion')) return 'contact-motion';
        return 'contact-heading';
      }
      return 'other';
    };
    document.addEventListener(
      'animationstart',
      (event) => {
        if (event.animationName !== 'section-reveal-rise') return;
        const target = event.target as HTMLElement | null;
        const wave = target?.closest('[data-reveal]') ?? null;
        let delay = -1;
        for (const animation of target?.getAnimations() ?? []) {
          if ((animation as CSSAnimation).animationName === 'section-reveal-rise') {
            const timing = animation.effect?.getComputedTiming();
            if (timing) delay = Number(timing.delay);
            break;
          }
        }
        starts.push({ key: keyOf(target as Element, wave), t: event.timeStamp, delay });
      },
      true,
    );
  });
}

/**
 * Per-frame sampler: every reveal wave's state and first item's computed
 * opacity, so "held invisible until the animation begins" is asserted from
 * what the browser actually drew, frame by frame.
 */
async function armFrameSampler(page: Page) {
  await page.evaluate(() => {
    const frames: Array<{
      waves: Array<{ key: string; state: string | null; opacity: number | null }>;
    }> = [];
    (window as unknown as Record<string, unknown>).staggerFrames = frames;
    const keyOf = (wave: Element): string => {
      if (wave.querySelector('#projects-heading')) return 'projects-heading';
      if (wave.closest('.projects-grid')) {
        const cards = [...wave.closest('.projects-grid')!.children].filter((element) =>
          element.matches('[data-reveal]'),
        );
        return `card:${cards.indexOf(wave)}`;
      }
      if (wave.querySelector('#approach-heading')) return 'approach-heading';
      if (wave.querySelector('.approach-introduction')) return 'approach-intro';
      if (wave.querySelector('.approach-capabilities')) return 'approach-capabilities';
      if (wave.querySelector('#workflow-heading')) return 'workflow-heading';
      if (wave.closest('.site-footer')) return 'contact';
      return 'other';
    };
    const waves = [...document.querySelectorAll('[data-reveal]')];
    const record = () => {
      frames.push({
        waves: waves.map((wave) => {
          const item = wave.querySelector('[data-reveal-item]');
          return {
            key: keyOf(wave),
            state: wave.getAttribute('data-reveal'),
            opacity: item ? Number(getComputedStyle(item).opacity) : null,
          };
        }),
      });
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

const readStarts = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { staggerStarts?: RevealStart[] }).staggerStarts ?? [],
  );

test('same-batch blocks stagger ~140ms apart, left-to-right, heading first (desktop Projects)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await armRevealStartRecorder(page);
  await page.goto(ORIGIN + '/');
  await waitForHydration(page);
  await page.waitForTimeout(1200); // hero entrance settles

  // One 240px step co-batches the projects heading and both row-1 cards in a
  // single viewport-entry batch (the motion.spec reproduction).
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(1500);

  const starts = await readStarts(page);
  const heading = starts.find((start) => start.key === 'projects-heading')!;
  const card0 = starts.find((start) => start.key === 'card:0')!;
  const card1 = starts.find((start) => start.key === 'card:1')!;
  expect(heading, 'heading wave started').toBeDefined();
  expect(card0, 'row-1 first card started').toBeDefined();
  expect(card1, 'row-1 second card started').toBeDefined();

  // The stagger comes from consecutive batch slots: 0 / 140 / 280ms.
  expect(heading.delay, 'heading takes slot 0').toBeLessThan(5);
  expect(Math.abs(card0.delay - 140), 'first card takes stagger slot 1').toBeLessThanOrEqual(5);
  expect(Math.abs(card1.delay - 280), 'second card takes stagger slot 2').toBeLessThanOrEqual(5);

  // And the starts are actually spaced: perceptible (>=80ms) yet subtle
  // (<=260ms) — never simultaneous, never a long blank gap.
  expect(card0.t - heading.t, 'heading → first card gap').toBeGreaterThanOrEqual(STAGGER_MIN_MS);
  expect(card0.t - heading.t, 'heading → first card gap stays subtle').toBeLessThanOrEqual(
    STAGGER_MAX_MS,
  );
  expect(card1.t - card0.t, 'first → second card gap').toBeGreaterThanOrEqual(STAGGER_MIN_MS);
  expect(card1.t - card0.t, 'first → second card gap stays subtle').toBeLessThanOrEqual(
    STAGGER_MAX_MS,
  );
});

test('delayed blocks stay invisible until their animation begins (entry visibility)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await armRevealStartRecorder(page);
  await page.goto(ORIGIN + '/');
  await waitForHydration(page);
  await armFrameSampler(page);
  await page.waitForTimeout(300); // sampler running before any reveal below

  await page.mouse.wheel(0, 240); // co-batch heading + row 1 (delays 0/140/280)
  await page.waitForTimeout(1500);

  const frames = await page.evaluate(
    () =>
      (window as unknown as { staggerFrames?: Array<{ waves: Array<{ key: string; state: string | null; opacity: number | null }> }> })
        .staggerFrames ?? [],
  );

  // Requirement 6: a pending block never paints final-state content, and a
  // block inside its slot delay stays at opacity 0 (backwards fill) — the
  // 280ms second card must have frames where it is 'playing' but still
  // invisible, proving the hold was real and not a painted flash.
  const invisibleHolds = (key: string) =>
    frames.flatMap((frame) =>
      frame.waves.filter(
        (wave) => wave.key === key && wave.state === 'playing' && wave.opacity !== null && wave.opacity <= 0.01,
      ),
    );
  expect(
    invisibleHolds('card:0').length,
    'first card held invisible through its 140ms delay',
  ).toBeGreaterThanOrEqual(2);
  expect(
    invisibleHolds('card:1').length,
    'second card held invisible through its 280ms delay',
  ).toBeGreaterThanOrEqual(2);

  // No frame ever painted a pending wave's content.
  const pendingPaint = frames.flatMap((frame) =>
    frame.waves.filter(
      (wave) => wave.state === 'pending' && wave.opacity !== null && wave.opacity > 0.05,
    ),
  );
  expect(pendingPaint, 'pending waves never painted visible content').toEqual([]);

  // Every wave ended fully readable.
  const lastFrame = frames.at(-1)!;
  for (const key of ['projects-heading', 'card:0', 'card:1']) {
    const wave = lastFrame.waves.find((entry) => entry.key === key)!;
    expect(wave.opacity, `${key} settles fully readable`).toBeGreaterThan(0.95);
  }
});

test('independent arrivals never inherit a stale accumulated delay (bounded coordination only)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await armRevealStartRecorder(page);
  await page.goto(ORIGIN + '/');
  await waitForHydration(page);
  await page.waitForTimeout(1200);

  // Slow reader pace: each wave enters on its own viewport entry. A wave
  // may join the ongoing cascade within the bounded coordination window
  // (the owner's adjacent-frame requirement), but never inherits a delay
  // that grows with page position: every first-item delay must stay within
  // the window — deep-DOM position supplies nothing extra (CP7 T4
  // requirement 5 / owner requirement 3, "do NOT delay an element that
  // enters much later because earlier elements existed").
  for (let step = 0; step < 60; step += 1) {
    const contactStarted = (await readStarts(page)).some(
      (start) => start.key === 'contact-heading',
    );
    if (contactStarted) break;
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(1200);

  const starts = await readStarts(page);
  const windowBound = 200 + 25; // window + frame jitter absorbed
  for (const key of ['projects-heading', 'approach-heading', 'approach-intro', 'workflow-heading', 'contact-heading']) {
    const entry = starts.find((start) => start.key === key);
    expect(entry, `${key} started`).toBeDefined();
    expect(
      entry!.delay,
      `${key} delay stays within the bounded coordination window, never accumulated`,
    ).toBeLessThanOrEqual(windowBound);
  }
});

test('reveal animation matches the approved simulation: 520ms cubic-bezier, overlapping fade/rise (desktop)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(ORIGIN + '/');
  await waitForHydration(page);
  await page.waitForTimeout(1200);

  // Co-batch the projects heading and row 1 (delays 0/140/280ms), then
  // sample while the cascade is still running: the heading finishes ~520ms
  // after its start, so at ~280ms at least one item is mid-flight and the
  // delayed cards are still rising — smooth overlap, not back-to-back waits.
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(280);
  const mid = await page.evaluate(() => {
    const items = [
      ...document.querySelectorAll('[data-reveal="playing"] [data-reveal-item]'),
    ];
    return items.map((item) => {
      const style = getComputedStyle(item);
      const animation = item
        .getAnimations()
        .find((candidate) => (candidate as CSSAnimation).animationName === 'section-reveal-rise');
      return {
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
        fill: style.animationFillMode,
        opacity: Number(style.opacity),
        transform: style.transform,
        progress:
          animation === undefined ? null : animation.effect?.getComputedTiming().progress ?? null,
      };
    });
  });
  expect(mid.length, 'the co-batched cascade was captured').toBeGreaterThanOrEqual(3);

  // Parity targets, read from computed styles of a live animation.
  // getComputedTiming().easing misleadingly reports 'linear' for CSS
  // animations in Chromium; the computed animation-timing-function is
  // authoritative.
  for (const sample of mid) {
    expect(sample.duration, 'simulation duration parity (520ms)').toBe('0.52s');
    expect(
      sample.timing.replace(/\s+/g, ''),
      'simulation easing parity cubic-bezier(.2, .75, .25, 1)',
    ).toBe('cubic-bezier(0.2,0.75,0.25,1)');
    expect(sample.fill, 'backwards fill holds pre-start frames invisible').toBe('both');
  }

  // Early/mid overlap: at least one animation is strictly mid-flight.
  const midFlight = mid.filter(
    (sample) =>
      sample.progress !== null &&
      sample.progress > 0.05 &&
      sample.progress < 0.95,
  );
  expect(midFlight.length, 'an animation was captured mid-flight').toBeGreaterThanOrEqual(1);
  // The fade is real: mid-flight opacity sits strictly between the endpoints.
  expect(
    midFlight.some((sample) => sample.opacity > 0.05 && sample.opacity < 0.95),
    'opacity 0 → 1 sampled mid-flight',
  ).toBe(true);
  // The 18px upward rise is real: mid-flight transform is not yet identity.
  expect(
    midFlight.some((sample) => !sample.transform.includes('matrix(1, 0, 0, 1, 0, 0)')),
    'translateY(18px) → 0 sampled mid-flight',
  ).toBe(true);

  // Completed state of the waves that actually revealed this batch (the
  // heading and row 1): fully opaque at translateY(0), no lingering
  // transform. Row 2 stays pending/hidden here by design — it has not
  // entered the viewport yet — so it must not be sampled as "settled".
  await page.waitForTimeout(1400);
  const done = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "[data-reveal='playing'] [data-reveal-item], [data-reveal='played'] [data-reveal-item]",
      ),
    ].map((item) => ({
      opacity: Number(getComputedStyle(item).opacity),
      transform: getComputedStyle(item).transform,
    })),
  );
  expect(done.length).toBeGreaterThanOrEqual(3);
  for (const sample of done) {
    expect(sample.opacity, 'settled fully opaque').toBeGreaterThan(0.99);
    expect(
      sample.transform === 'none' || sample.transform.includes('matrix(1, 0, 0, 1, 0, 0)'),
      'settled at translateY(0)',
    ).toBe(true);
  }
});

test('adjacent-frame arrivals continue the cascade instead of starting simultaneously (desktop approach)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await armRevealStartRecorder(page);
  await page.goto(ORIGIN + '/');
  await waitForHydration(page);
  await page.waitForTimeout(1200);

  // Reader pace into the approach section: the heading + capabilities row
  // arrives first, the introduction one or two observer frames later — the
  // measured desktop-slow scenario that previously violated ordering
  // (the introduction started 51ms before capabilities).
  for (let step = 0; step < 60; step += 1) {
    const started = (await readStarts(page)).some((start) => start.key === 'approach-intro');
    if (started) break;
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(1200);

  const starts = await readStarts(page);
  const heading = starts.find((start) => start.key === 'approach-heading')!;
  const capabilities = starts.find((start) => start.key === 'approach-capabilities')!;
  const intro = starts.find((start) => start.key === 'approach-intro')!;
  expect(heading, 'approach heading started').toBeDefined();
  expect(capabilities, 'capabilities started').toBeDefined();
  expect(intro, 'introduction started').toBeDefined();

  // Ordering is preserved across the adjacent-frame boundary: the row leads,
  // the introduction below follows.
  expect(intro.t, 'introduction never starts before the earlier row').toBeGreaterThan(
    capabilities.t,
  );
  // The coordination window joins the next batch to the ongoing cascade:
  // the joined start sits one cadence step after capabilities (140ms), or —
  // if the batch arrived past the stale next-free slot — a fresh start no
  // later than the window cap. Either way never simultaneous.
  const gap = intro.t - capabilities.t;
  expect(gap, 'adjacent-frame batch continues the cascade').toBeGreaterThanOrEqual(
    STAGGER_MIN_MS,
  );
  expect(gap, 'coordination window keeps the join bounded and subtle').toBeLessThanOrEqual(520);
  expect(capabilities.t - heading.t, 'heading leads its row by one cadence step').toBeLessThan(400);
});
