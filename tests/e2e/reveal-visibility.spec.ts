import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T4 rework — regression tests for the owner-observed reveal-timing
 * defects. The prior data-reveal state tests stayed green while the visitor
 * saw already-painted content reset and re-animate on scroll, so every
 * assertion here samples real computed opacity/geometry during real
 * scrolling (a per-frame in-page sampler) instead of trusting state alone.
 */

const ORIGIN = 'http://127.0.0.1:4173';
const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

/** Waves addressed by their visible content, never by DOM index. */
const PROJECTS_HEADING = '[data-reveal]:has(#projects-heading)';
const CARD_WAVE = '.projects-grid > [data-reveal]';
const APPROACH_WORKFLOW = '[data-reveal]:has(#workflow-heading)';

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: PAUSE_BUTTON })).toBeVisible();
}

/**
 * Per-frame in-page sampler: every reveal wave's state, viewport-relative
 * top and first item's computed opacity, tagged with the scroll position.
 * This is the instrument that catches content painted at its final state
 * while its wave is still pending — the defect the state machine misses.
 */
async function armFrameSampler(page: Page) {
  await page.evaluate(() => {
    const frames: Array<{
      y: number;
      waves: Array<{ state: string | null; top: number; opacity: number | null }>;
    }> = [];
    (window as unknown as Record<string, unknown>).__revealFrames = frames;
    const waves = [...document.querySelectorAll('[data-reveal]')];
    const record = () => {
      frames.push({
        y: Math.round(window.scrollY),
        waves: waves.map((wave) => {
          const item = wave.querySelector('[data-reveal-item]');
          return {
            state: wave.getAttribute('data-reveal'),
            top: Math.round(wave.getBoundingClientRect().top),
            opacity: item ? Number(getComputedStyle(item).opacity) : null,
          };
        }),
      });
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

/** Violations: a pending wave painted on screen at (near) full opacity. */
async function readPendingPaintViolations(page: Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const frames =
      (window as unknown as Record<string, unknown>).__revealFrames as Array<{
        y: number;
        waves: Array<{ state: string | null; top: number; opacity: number | null }>;
      }>;
    return frames.flatMap((frame) =>
      frame.waves
        .filter(
          (wave) =>
            wave.state === 'pending' &&
            wave.top < vh &&
            wave.opacity !== null &&
            wave.opacity > 0.05,
        )
        .map((wave) => ({ y: frame.y, top: wave.top, opacity: wave.opacity })),
    );
  });
}

/**
 * Records every section-reveal-rise animationstart (capture phase, armed
 * before any scrolling) with a content-addressed wave key, the frame
 * timestamp and the animation's effective delay, so reveal order and
 * within-batch cascade can be asserted from what the browser actually drew.
 */
async function armRevealAnimationRecorder(page: Page) {
  await page.addInitScript(() => {
    const starts: Array<{ key: string; t: number; delay: number }> = [];
    (window as unknown as Record<string, unknown>).__revealStarts = starts;
    const keyOf = (target: Element, wave: Element | null): string => {
      if (!wave) return 'other';
      if (wave.querySelector('#projects-heading')) return 'projects-heading';
      if (wave.querySelector('#approach-heading')) return 'approach-heading';
      if (wave.querySelector('.approach-introduction')) return 'approach-intro';
      if (wave.querySelector('.approach-capabilities')) return 'approach-capabilities';
      if (wave.querySelector('#workflow-heading')) return 'workflow-heading';
      const list = wave.closest('.workflow-list');
      if (list) {
        const steps = [...list.querySelectorAll(':scope > li')];
        const li = wave.closest('li');
        return li ? `workflow-step:${steps.indexOf(li)}` : 'other';
      }
      if (wave.closest('.site-footer')) {
        // One contact wave with three cascade items: the animationstart
        // target is the item itself, so the key comes from the target.
        if (target.matches('.footer-links')) return 'contact-content';
        if (target.matches('.footer-motion')) return 'contact-motion';
        return 'contact-heading';
      }
      if (wave.closest('.projects-grid')) {
        const cards = [...wave.closest('.projects-grid')!.children].filter((element) =>
          element.matches('[data-reveal]'),
        );
        return `card:${cards.indexOf(wave)}`;
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

async function readRevealStarts(page: Page) {
  return page.evaluate(() => {
    const starts =
      (window as unknown as Record<string, unknown>).__revealStarts as Array<{
        key: string;
        t: number;
        delay: number;
      }>;
    return starts ?? [];
  });
}

function firstStart(starts: Array<{ key: string; t: number }>, key: string): number {
  const times = starts.filter((start) => start.key === key).map((start) => start.t);
  expect(times.length, `expected reveal animations for ${key}`).toBeGreaterThan(0);
  return Math.min(...times);
}

/** Reader-pace scroll: a glance with pauses, like a person reading. */
async function readerScroll(page: Page, steps: number, px = 30, ms = 100) {
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, px);
    await page.waitForTimeout(ms);
  }
}

test.describe('reveal visibility (CP7 T4 rework)', () => {
  test('no pending wave paints final-state content while entering the viewport (desktop reader scroll)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200); // hero entrance settles

    await armFrameSampler(page);
    // Reader pace through Projects, then on through Approach to the footer.
    await readerScroll(page, 12);
    await readerScroll(page, 60, 60, 70);
    await page.waitForTimeout(800);

    const violations = await readPendingPaintViolations(page);
    expect(
      violations,
      `pending waves painted final-state content while on screen: ${JSON.stringify(violations.slice(0, 8))}`,
    ).toEqual([]);
  });

  test('projects reveal heading, then row 1 staggered left-to-right, then row 2 at a reader pace (desktop)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await readerScroll(page, 30);
    await page.waitForTimeout(900);

    const starts = await readRevealStarts(page);
    const heading = firstStart(starts, 'projects-heading');
    const card0 = firstStart(starts, 'card:0');
    const card1 = firstStart(starts, 'card:1');
    const card2 = firstStart(starts, 'card:2');
    const card3 = firstStart(starts, 'card:3');

    // The owner's required sequence: heading first, then each grid row as it
    // enters view — with the approved subtle left-to-right stagger inside a
    // row (~140ms, CP7 T4 final stagger polish), never simultaneous.
    expect(heading, 'heading reveals before row 1').toBeLessThan(card0);
    expect(card1 - card0, 'row 1 staggers left-to-right').toBeGreaterThanOrEqual(80);
    expect(card1 - card0, 'row 1 stagger stays subtle').toBeLessThanOrEqual(300);
    expect(card0, 'row 2 reveals after row 1').toBeLessThan(card2);
    expect(card3 - card2, 'row 2 staggers left-to-right').toBeGreaterThanOrEqual(80);
    expect(card3 - card2, 'row 2 stagger stays subtle').toBeLessThanOrEqual(300);
  });

  test('a fast continuous scroll still cascades heading then rows in order and never skips them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    // Fling: many continuous wheel steps, each far below the teleport delta,
    // fast enough to batch several waves into one observer callback.
    for (let step = 0; step < 10; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(1200);

    const starts = await readRevealStarts(page);
    const heading = firstStart(starts, 'projects-heading');
    const card0 = firstStart(starts, 'card:0');
    const card2 = firstStart(starts, 'card:2');
    expect(heading).toBeLessThan(card0);
    expect(card0).toBeLessThan(card2);

    // Nothing was lost to the skip decision during the fling.
    for (const key of ['projects-heading', 'card:0', 'card:1', 'card:2', 'card:3']) {
      const states = await page
        .locator(key.startsWith('card:') ? CARD_WAVE : PROJECTS_HEADING)
        .nth(key.startsWith('card:') ? Number(key.split(':')[1]) : 0)
        .getAttribute('data-reveal');
      expect(states === 'played' || states === 'playing', `${key} revealed`).toBe(true);
    }
  });

  test('mobile stacked cards each reveal on their own entry with no forced cascade delay', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await armFrameSampler(page);
    await readerScroll(page, 12);
    await readerScroll(page, 70, 60, 70);
    await page.waitForTimeout(800);

    const violations = await readPendingPaintViolations(page);
    expect(
      violations,
      `pending waves painted final-state content while on screen (mobile): ${JSON.stringify(violations.slice(0, 8))}`,
    ).toEqual([]);

    const starts = await readRevealStarts(page);
    const cards = ['card:0', 'card:1', 'card:2', 'card:3'].map((key) =>
      firstStart(starts, key),
    );
    // Stacked layout: strictly one card at a time, in DOM order — never the
    // desktop row grouping (cards 1–2 and 3–4 together).
    for (let index = 1; index < cards.length; index += 1) {
      expect(
        cards[index - 1],
        `card ${index - 1} reveals before card ${index} on mobile`,
      ).toBeLessThan(cards[index]!);
    }
    // A solo mobile arrival gains no cascade delay; two stacked cards may
    // only stagger if a stalled frame genuinely delivered them together (a
    // single ~140ms stagger step).
    for (const key of ['card:0', 'card:1', 'card:2', 'card:3']) {
      const entry = starts.find((start) => start.key === key);
      expect(entry?.delay ?? -1, `${key} delay on mobile arrival`).toBeLessThan(200);
    }
  });

  test('approach blocks reveal progressively on their own entries (heading, intro, capabilities, workflow)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await readerScroll(page, 60, 60, 70);
    await page.waitForTimeout(900);

    const starts = await readRevealStarts(page);
    const heading = firstStart(starts, 'approach-heading');
    const intro = firstStart(starts, 'approach-intro');
    const capabilities = firstStart(starts, 'approach-capabilities');
    const workflow = firstStart(starts, 'workflow-heading');

    // Heading and capabilities share the first grid row: they enter on the
    // same viewport entry (same top, same batch) and stagger one step apart
    // (~140ms, CP7 T4 final stagger polish); the introduction is the
    // separate wave just below; the workflow heading is a further row down
    // and reveals later, as its own viewport entry — not as part of any
    // section-top cascade.
    expect(heading, 'heading reveals before the introduction').toBeLessThan(intro);
    expect(
      capabilities - heading,
      'first approach row staggers one step',
    ).toBeGreaterThanOrEqual(80);
    expect(capabilities - heading, 'first approach row stagger stays subtle').toBeLessThan(300);
    expect(intro, 'workflow heading reveals after the first row').toBeLessThan(workflow);
  });

  test('anchor navigation lands on readable content without replaying consumed waves', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await page.getByRole('link', { name: 'Approach' }).click();
    await page.waitForTimeout(1500);

    // Every wave in view at arrival is readable (played or skipped), whether
    // the jump was instant (teleport rule → skip) or smoothed (continuous →
    // play): nothing may be left hidden or re-animating from already-seen.
    const unreadable = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll('[data-reveal]')]
        .map((wave) => {
          const item = wave.querySelector('[data-reveal-item]');
          if (!item) return null;
          const top = wave.getBoundingClientRect().top;
          const opacity = Number(getComputedStyle(item).opacity);
          return top < vh && opacity < 0.95 ? { top, opacity } : null;
        })
        .filter(Boolean);
    });
    expect(unreadable, JSON.stringify(unreadable)).toEqual([]);
  });

  test('reload at a restored scroll position leaves visible content readable and still reveals below', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    await page.reload();
    await waitForHydration(page);
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => window.scrollY);
    if (Math.abs(restored - y) > 50) {
      await page.evaluate((target) => window.scrollTo(0, target), y);
    }
    await page.waitForTimeout(900);

    // Content at the restored position is readable (skipped at enhancement
    // time, never re-animated), and content below is still armed-hidden so
    // it reveals on its own entry.
    const visibleWaveStates = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll('[data-reveal]')].map((wave) => {
        const item = wave.querySelector('[data-reveal-item]');
        const rect = wave.getBoundingClientRect();
        return {
          state: wave.getAttribute('data-reveal'),
          onScreen: rect.top < vh && rect.bottom > 0,
          opacity: item ? Number(getComputedStyle(item).opacity) : null,
        };
      });
    });
    for (const wave of visibleWaveStates) {
      if (!wave.onScreen || wave.opacity === null) continue;
      expect(
        wave.opacity,
        `on-screen wave at restored scroll must be readable (state ${wave.state})`,
      ).toBeGreaterThan(0.95);
    }
    const workflowWave = page.locator(APPROACH_WORKFLOW);
    await expect(workflowWave).toHaveCount(1);

    // The addInitScript recorder re-arms on the reloaded document, so the
    // pre-scroll observation must hold no workflow reveal yet.
    const before = await readRevealStarts(page);
    expect(
      before.filter((start) => start.key === 'workflow-heading'),
      'no workflow reveal before scrolling below the restored position',
    ).toEqual([]);
    await readerScroll(page, 40, 60, 70);
    await page.waitForTimeout(900);
    const after = await readRevealStarts(page);
    expect(firstStart(after, 'workflow-heading'), 'workflow reveals after reload').toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
  });

  test('reduced motion keeps every section readable without reveal animations', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(800);

    await readerScroll(page, 60, 60, 70);
    await page.waitForTimeout(600);

    const starts = await readRevealStarts(page);
    expect(starts, 'no reveal animations under reduced motion').toEqual([]);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('[data-reveal-item]')]
        .map((item) => Number(getComputedStyle(item).opacity))
        .filter((opacity) => opacity < 0.95),
    );
    expect(hidden, JSON.stringify(hidden)).toEqual([]);
  });

  test('pause keeps pending waves readable and resume plays only the unconsumed ones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    // Reader scroll until the first card wave is playing.
    const firstCardReveal = page.locator(CARD_WAVE).nth(0);
    for (let step = 0; step < 40; step += 1) {
      if ((await firstCardReveal.getAttribute('data-reveal')) === 'playing') break;
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(700);

    // Pause in place (focus + Enter, like the accepted CP7 E-2 test) so the
    // page never teleports to the footer.
    const pauseButton = page.getByRole('button', { name: 'Pause animations' });
    await pauseButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // While paused, not-yet-revealed waves stay readable — the arming hide
    // must be scoped to the active motion policy, never to a paused session.
    const pausedReadability = await page.evaluate(() =>
      [...document.querySelectorAll('[data-reveal]')]
        .filter((wave) => wave.getAttribute('data-reveal') === 'pending')
        .map((wave) => {
          const item = wave.querySelector('[data-reveal-item]');
          return item ? Number(getComputedStyle(item).opacity) : null;
        })
        .filter((opacity) => opacity !== null),
    );
    expect(pausedReadability.length, 'pending waves exist while paused').toBeGreaterThan(0);
    for (const opacity of pausedReadability) {
      expect(opacity, 'pending wave readable while paused').toBeGreaterThan(0.95);
    }

    // Resume in place, then keep scrolling: the unconsumed waves play.
    const resumeButton = page.getByRole('button', { name: 'Resume animations' });
    await resumeButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    await armFrameSampler(page);
    await readerScroll(page, 40, 60, 70);
    await page.waitForTimeout(800);

    const violations = await readPendingPaintViolations(page);
    expect(violations, JSON.stringify(violations.slice(0, 8))).toEqual([]);
    const starts = await readRevealStarts(page);
    expect(firstStart(starts, 'workflow-heading')).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  test('no-JS keeps every section readable with no reveal machinery', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');

    await readerScroll(page, 40, 60, 70);
    const report = await page.evaluate(() => ({
      armed: document.querySelectorAll('[data-reveal-armed]').length,
      hidden: [...document.querySelectorAll('[data-reveal-item]')]
        .map((item) => Number(getComputedStyle(item).opacity))
        .filter((opacity) => opacity < 0.95),
    }));
    expect(report.armed, 'no arming attribute without JavaScript').toBe(0);
    expect(report.hidden, JSON.stringify(report.hidden)).toEqual([]);
    await context.close();
  });
});
