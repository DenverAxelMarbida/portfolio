import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T4 final refinement — progressive block-by-block reveals: every
 * meaningful content block (section headings, the approach introduction, the
 * capabilities block, each workflow step, the contact content) transitions on
 * its own actual viewport entry, never as one whole-section animation, and a
 * solo entry gains no cascade delay. The approved Projects sequence is
 * preserved (heading → row 1 → row 2 on desktop, with an owner-approved
 * subtle left-to-right stagger inside each row; each stacked card on its own
 * entry on mobile), and same-batch blocks start ~140ms apart (CP7 T4 final
 * stagger polish).
 *
 * Assertions run on recorded `section-reveal-rise` animationstart events with
 * content-addressed wave keys plus a per-frame sampler — what the browser
 * actually drew, not eventual completion.
 */

const ORIGIN = 'http://127.0.0.1:4173';
const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: PAUSE_BUTTON })).toBeVisible();
}

/** Reader-pace scroll: a glance with pauses, like a person reading. */
async function readerScroll(page: Page, steps: number, px = 60, ms = 70) {
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, px);
    await page.waitForTimeout(ms);
  }
}

/**
 * Records every section-reveal-rise animationstart (capture phase, armed
 * before any scrolling) with a content-addressed wave key, the frame
 * timestamp and the animation's effective delay. Keys map each wave to its
 * visible content, never to DOM order.
 */
async function armRevealAnimationRecorder(page: Page) {
  await page.addInitScript(() => {
    const starts: Array<{ key: string; t: number; delay: number }> = [];
    (window as unknown as Record<string, unknown>).__revealStarts = starts;
    const keyOf = (target: Element, wave: Element | null): string => {
      if (!wave) return 'other';
      if (wave.querySelector('#projects-heading')) return 'projects-heading';
      if (wave.closest('.projects-grid')) {
        const cards = [
          ...(wave.closest('.projects-grid') as HTMLElement).querySelectorAll('[data-reveal]'),
        ];
        return `card:${cards.indexOf(wave)}`;
      }
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
  return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

/**
 * Per-frame in-page sampler: every reveal wave's state, viewport-relative top
 * and first item's computed opacity, tagged with the scroll position.
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

test.describe('progressive block reveals (CP7 T4 final refinement)', () => {
  test('desktop: approach blocks reveal on their own viewport entries in entry order', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await armFrameSampler(page);
    await readerScroll(page, 60);
    await page.waitForTimeout(900);

    // The whole multi-viewport approach section must never animate at once:
    // blocks reveal in their actual viewport-entry order. The heading and
    // the capabilities block share the first grid row (same top — same entry,
    // DOM-order cascade within the batch), the introduction enters just below
    // the heading, and the workflow heading — a further row down — plays on
    // its own later entry.
    const starts = await readRevealStarts(page);
    const heading = firstStart(starts, 'approach-heading');
    const intro = firstStart(starts, 'approach-intro');
    const capabilities = firstStart(starts, 'approach-capabilities');
    const workflowHeading = firstStart(starts, 'workflow-heading');

    expect(heading, 'approach heading wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(intro, 'approach introduction wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(capabilities, 'capabilities wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(workflowHeading, 'workflow heading wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(heading, 'heading reveals before the introduction').toBeLessThan(intro);
    // Same grid row, same viewport-entry batch: the two waves start
    // consecutive stagger slots apart (~140ms, CP7 T4 final stagger polish).
    expect(
      capabilities - heading,
      'same-row entry, one stagger step',
    ).toBeGreaterThanOrEqual(80);
    expect(capabilities - heading, 'same-row stagger stays subtle').toBeLessThanOrEqual(300);
    expect(intro, 'workflow heading reveals after the first row').toBeLessThan(workflowHeading);
  });

  test('desktop: each workflow step reveals on its own viewport entry, row by row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await readerScroll(page, 60, 40, 90);
    await page.waitForTimeout(900);

    const starts = await readRevealStarts(page);
    const steps = [0, 1, 2, 3, 4, 5].map((index) => firstStart(starts, `workflow-step:${index}`));
    for (let index = 0; index < steps.length; index += 1) {
      expect(
        steps[index]!,
        `workflow step ${index} revealed on its own entry`,
      ).toBeLessThan(Number.POSITIVE_INFINITY);
    }
    // Desktop 2-column list: each row pair arrives in one viewport-entry
    // batch and staggers left-to-right (~140ms, CP7 T4 final stagger
    // polish); rows stay in order.
    expect(
      steps[1]! - steps[0]!,
      'steps row 1 staggers left-to-right',
    ).toBeGreaterThanOrEqual(80);
    expect(
      steps[3]! - steps[2]!,
      'steps row 2 staggers left-to-right',
    ).toBeGreaterThanOrEqual(80);
    expect(
      steps[5]! - steps[4]!,
      'steps row 3 staggers left-to-right',
    ).toBeGreaterThanOrEqual(80);
    expect(steps[1]! - steps[0]!, 'row stagger stays subtle').toBeLessThanOrEqual(300);
    expect(steps[3]! - steps[2]!, 'row stagger stays subtle').toBeLessThanOrEqual(300);
    expect(steps[5]! - steps[4]!, 'row stagger stays subtle').toBeLessThanOrEqual(300);
    expect(steps[0]!, 'row 2 after row 1').toBeLessThan(steps[2]!);
    expect(steps[2]!, 'row 3 after row 2').toBeLessThan(steps[4]!);
  });

  test('desktop: the contact section reveals progressively (heading, then content blocks)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await readerScroll(page, 60);
    await page.waitForTimeout(900);

    const starts = await readRevealStarts(page);
    const heading = firstStart(starts, 'contact-heading');
    const content = firstStart(starts, 'contact-content');
    const motion = firstStart(starts, 'contact-motion');
    expect(heading, 'contact heading wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(content, 'contact content wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    expect(motion, 'motion-control wave exists').toBeLessThan(Number.POSITIVE_INFINITY);
    // One-by-one at the owner-directed cadence (CP7 T4 final stagger
    // polish): heading, then the links column, then the motion control —
    // three cascade items in a single wave, ~140ms apart, not a simultaneous
    // flash.
    expect(heading, 'heading leads the contact cascade').toBeLessThan(content);
    expect(content, 'links column follows the heading').toBeLessThan(motion);
    expect(content - heading, 'one cadence step between heading and content').toBeGreaterThanOrEqual(
      50,
    );
    expect(motion - content, 'one cadence step between content and motion').toBeGreaterThanOrEqual(
      50,
    );
    expect(content - heading, 'cascade steps stay subtle').toBeLessThan(350);
    expect(motion - content, 'cascade steps stay subtle').toBeLessThan(350);
    // The delays come from the item indexes (0/140/280ms), not the batch:
    // a solo footer arrival takes slot 0.
    const headingDelay = starts.find((start) => start.key === 'contact-heading')!.delay;
    const contentDelay = starts.find((start) => start.key === 'contact-content')!.delay;
    const motionDelay = starts.find((start) => start.key === 'contact-motion')!.delay;
    expect(headingDelay, 'heading item delay').toBeLessThan(5);
    expect(Math.abs(contentDelay - 140), 'links item delay').toBeLessThanOrEqual(5);
    expect(Math.abs(motionDelay - 280), 'motion item delay').toBeLessThanOrEqual(5);
  });

  test('a solo viewport entry gains no cascade delay (workflow heading, slow reader pace)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    // Walk down in small steps so each wave arrives alone; the workflow
    // heading must play with zero slot delay (a solo arrival, slot 0).
    await readerScroll(page, 80, 30, 120);
    await page.waitForTimeout(900);

    const starts = await readRevealStarts(page);
    const headingStarts = starts.filter((start) => start.key === 'workflow-heading');
    expect(headingStarts.length, 'workflow heading revealed').toBeGreaterThan(0);
    expect(headingStarts[0]!.delay, 'solo entry takes slot 0 (no cascade delay)').toBeLessThan(5);
  });

  test('no pending block paints final-state content while entering (desktop reader scroll)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await armFrameSampler(page);
    await readerScroll(page, 60);
    await page.waitForTimeout(800);

    const violations = await readPendingPaintViolations(page);
    expect(
      violations,
      `pending waves painted final-state content while on screen: ${JSON.stringify(violations.slice(0, 8))}`,
    ).toEqual([]);
  });

  test('mobile: stacked blocks each reveal on their own entry, in DOM order, with no forced delay', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await armRevealAnimationRecorder(page);
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await armFrameSampler(page);
    await readerScroll(page, 12);
    await readerScroll(page, 90, 60, 70);
    await page.waitForTimeout(800);

    const violations = await readPendingPaintViolations(page);
    expect(violations, `pending waves painted on screen (mobile): ${JSON.stringify(violations.slice(0, 8))}`).toEqual(
      [],
    );

    const starts = await readRevealStarts(page);
    // Each stacked project card on its own entry, in order.
    const cards = ['card:0', 'card:1', 'card:2', 'card:3'].map((key) => firstStart(starts, key));
    for (let index = 1; index < cards.length; index += 1) {
      expect(cards[index - 1]!, `card ${index - 1} before card ${index} on mobile`).toBeLessThan(
        cards[index]!,
      );
    }
    // The single-column workflow list: each step on its own entry, in order.
    const steps = [0, 1, 2, 3, 4, 5].map((index) => firstStart(starts, `workflow-step:${index}`));
    for (let index = 1; index < steps.length; index += 1) {
      expect(
        steps[index - 1]!,
        `workflow step ${index - 1} before step ${index} on mobile`,
      ).toBeLessThan(steps[index]!);
    }
    // Solo stacked arrivals gain no cascade delay.
    for (const key of [...['card:0', 'card:1', 'card:2', 'card:3'], ...[0, 1, 2, 3, 4, 5].map((index) => `workflow-step:${index}`)]) {
      const entry = starts.find((start) => start.key === key);
      expect(entry?.delay ?? -1, `${key} delay on mobile arrival`).toBeLessThan(200);
    }
  });
});
