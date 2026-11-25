import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T4 final refinement — the owner's spacing defect: the Project Previews
 * heading and its first card row (and the approach/final-section headings and
 * their content) become visually closer when scrolling upward and return to
 * proper spacing when scrolling downward.
 *
 * Root cause under test: the heading parallax ramp (`ParallaxHeading`) is a
 * pure function of the heading's viewport position, so once its entry ramp
 * has settled (top reached the viewport top) scrolling back up re-engages the
 * downward offset — the heading visually sinks toward the content below it by
 * up to 40px. After this refinement the ramp is one-shot: once settled, the
 * heading stays at its exact natural state, so the visual gap equals the
 * layout gap on every later frame, in both scroll directions.
 *
 * Every assertion samples real geometry: the heading's untransformed layout
 * box, its inner parallax layer's visual bounding box, the layer's computed
 * transform/opacity, and the gap to the adjacent content block — never
 * eventual animation completion.
 */

const ORIGIN = 'http://127.0.0.1:4173';
const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

/** Heading + adjacent content pairs addressed by visible content, in both the
 * pre-refinement and refined DOM (so RED runs measure the live defect). */
const PAIRS = [
  { name: 'projects-heading', heading: '#projects-heading', content: '.projects-grid > [data-reveal]' },
  { name: 'approach-overview-heading', heading: '#approach-heading', content: '.approach-overview p' },
  { name: 'capabilities-heading', heading: '.approach-capabilities h3', content: '.approach-capabilities p' },
  { name: 'workflow-heading', heading: '.approach-workflow h3', content: '.workflow-list li' },
] as const;

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
 * One sample of one heading pair: the parallax layer's computed transform
 * and opacity, and both the layout-box gap (untransformed heading rect) and
 * the visual bounding-box gap (inner layer rect) to the adjacent content.
 */
function measureExpression(headingSelector: string, contentSelector: string): string {
  return `
(() => {
  const heading = document.querySelector(${JSON.stringify(headingSelector)});
  const content = document.querySelector(${JSON.stringify(contentSelector)});
  if (!heading || !content) return null;
  const layer = heading.querySelector('span');
  const layout = heading.getBoundingClientRect();
  const visual = layer ? layer.getBoundingClientRect() : layout;
  const contentBox = content.getBoundingClientRect();
  return {
    transform: layer ? getComputedStyle(layer).transform : 'none',
    visualOpacity: layer ? getComputedStyle(layer).opacity : '1',
    layoutGap: +(contentBox.top - layout.bottom).toFixed(2),
    visualGap: +(contentBox.top - visual.bottom).toFixed(2),
  };
})()`;
}

async function measure(
  page: Page,
  headingSelector: string,
  contentSelector: string,
): Promise<{ transform: string; visualOpacity: string; layoutGap: number; visualGap: number }> {
  const sample = await page.evaluate<{
    transform: string;
    visualOpacity: string;
    layoutGap: number;
    visualGap: number;
  }>(measureExpression(headingSelector, contentSelector));
  expect(sample, `heading pair must exist: ${headingSelector}`).not.toBeNull();
  return sample;
}

/** translateY of a computed transform string ('none' or a 2D matrix). */
function translateYOf(transform: string): number {
  if (transform === 'none') return 0;
  const match = transform.match(/matrix\(([^)]+)\)/);
  expect(match, `unexpected transform ${transform}`).not.toBeNull();
  const parts = match![1]!.split(',').map(Number);
  return parts[5]!;
}

/** After the entry ramp has settled, the heading must sit at its exact
 * natural state: zero transform, full opacity, visual gap == layout gap. */
function expectNatural(
  sample: { transform: string; visualOpacity: string; layoutGap: number; visualGap: number },
  label: string,
) {
  expect(translateYOf(sample.transform), `${label}: parallax layer translateY`).toBe(0);
  expect(Number(sample.visualOpacity), `${label}: parallax layer opacity`).toBe(1);
  expect(
    Math.abs(sample.visualGap - sample.layoutGap),
    `${label}: visual gap must equal the layout gap (layout ${sample.layoutGap}, visual ${sample.visualGap})`,
  ).toBeLessThanOrEqual(1);
}

/** Scroll a heading to the middle of the viewport (instant jump from its
 * current position; all waves are already consumed at this point). */
async function centerHeading(page: Page, headingSelector: string) {
  await page.evaluate((selector) => {
    const heading = document.querySelector(selector)!;
    const top = heading.getBoundingClientRect().top;
    window.scrollTo({ top: window.scrollY + top - 300, behavior: 'instant' });
  }, headingSelector);
  // One rAF-scheduled parallax update runs on the scroll event; wait past it.
  await page.waitForTimeout(350);
}

test.describe('heading spacing stability in both scroll directions (CP7 T4 final refinement)', () => {
  for (const pair of PAIRS) {
    test(`${pair.name}: natural spacing at the same positions scrolling down and up after entry`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(ORIGIN + '/');
      await waitForHydration(page);
      await page.waitForTimeout(1200); // hero entrance settles

      // Traverse the whole page downward at a reader pace so every reveal
      // wave completes and every heading's entry ramp has settled.
      await readerScroll(page, 60);
      await page.waitForTimeout(900);

      // Jump back up to a mid-viewport position for this heading (a single
      // instant jump — all reveals are consumed, nothing re-animates).
      await centerHeading(page, pair.heading);
      expectNatural(await measure(page, pair.heading, pair.content), 'jumped up from below');

      // Slow upward scroll: spacing must stay at the natural state.
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(250);
      expectNatural(await measure(page, pair.heading, pair.content), 'slow up');

      // Slow downward scroll back: the same natural state.
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(250);
      expectNatural(await measure(page, pair.heading, pair.content), 'slow down');

      // Fast upward fling: spacing must still hold the natural state.
      await page.mouse.wheel(0, -480);
      await page.mouse.wheel(0, -480);
      await page.mouse.wheel(0, -480);
      await page.waitForTimeout(400);
      expectNatural(await measure(page, pair.heading, pair.content), 'fast up');
    });
  }

  test('the final section (contact) heading keeps constant spacing in both directions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);
    await readerScroll(page, 60);
    await page.waitForTimeout(900);

    const gapAt = async () => {
      await page.evaluate(() => {
        const h2 = document.querySelector('.site-footer h2')!;
        const top = h2.getBoundingClientRect().top;
        window.scrollTo({ top: window.scrollY + top - 300, behavior: 'instant' });
      });
      await page.waitForTimeout(350);
      return page.evaluate(() => {
        const h2 = document.querySelector('.site-footer h2')!.getBoundingClientRect();
        const links = document.querySelector('.site-footer .footer-links')!.getBoundingClientRect();
        return +(links.top - h2.bottom).toFixed(2);
      });
    };
    const landing = await gapAt();
    const up = await gapAt();
    const down = await gapAt();
    expect(Math.abs(up - landing), 'contact spacing stable scrolling up').toBeLessThanOrEqual(1);
    expect(Math.abs(down - landing), 'contact spacing stable scrolling down').toBeLessThanOrEqual(1);
  });

  test('anchor navigation lands with direction-stable spacing (no ramp re-engagement on later up-scroll)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Projects' })
      .click();
    await page.waitForTimeout(1200);
    // Nudge past the entry line so the heading's ramp settles, then verify
    // the spacing holds identically upward and downward around this area.
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);

    const gapAt = () =>
      page.evaluate(() => {
        const heading = document.querySelector('#projects-heading')!;
        const layer = heading.querySelector('span');
        if (!layer) throw new Error('missing parallax layer');
        const layout = heading.getBoundingClientRect();
        const visual = layer.getBoundingClientRect();
        const card = document.querySelector('.projects-grid > [data-reveal]')!.getBoundingClientRect();
        return {
          ty: Number(getComputedStyle(layer).transform.match(/matrix\(([^)]+)\)/)?.[1]?.split(',')[5] ?? 0),
          drift: +(card.top - visual.bottom - (card.top - layout.bottom)).toFixed(2),
        };
      });

    const landed = await gapAt();
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    const afterUp = await gapAt();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
    const afterDown = await gapAt();

    expect(Math.abs(afterUp.drift), 'spacing drift scrolling up after anchor landing').toBeLessThanOrEqual(1);
    expect(Math.abs(afterDown.drift), 'spacing drift scrolling down after anchor landing').toBeLessThanOrEqual(1);
    // The upward move must not re-engage the ramp at the new position.
    expect(afterUp.ty, 'parallax layer stays settled scrolling up').toBeLessThanOrEqual(1);
    expect(landed.ty, 'parallax layer settles once entry completes').toBeLessThanOrEqual(2);
  });

  test('reduced motion keeps every heading at its natural state in both directions', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(800);

    await readerScroll(page, 60);
    await page.waitForTimeout(600);
    for (const pair of PAIRS) {
      await centerHeading(page, pair.heading);
      const sample = await measure(page, pair.heading, pair.content);
      expect(sample.transform, `${pair.name}: no parallax transform under reduced motion`).toBe('none');
      expect(
        Math.abs(sample.visualGap - sample.layoutGap),
        `${pair.name}: visual gap equals layout gap`,
      ).toBeLessThanOrEqual(1);
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(250);
      const afterUp = await measure(page, pair.heading, pair.content);
      expect(afterUp.transform, `${pair.name}: no transform scrolling up`).toBe('none');
      expect(
        Math.abs(afterUp.visualGap - afterUp.layoutGap),
        `${pair.name}: visual gap equals layout gap scrolling up`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('a paused session keeps every heading at its natural state scrolling up', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');
    await waitForHydration(page);
    await page.waitForTimeout(1200);
    await readerScroll(page, 60);
    await page.waitForTimeout(900);

    // Pause in place at the footer (focus + Enter, like the accepted CP7 E-2 test).
    const pauseButton = page.getByRole('button', { name: 'Pause animations' });
    await pauseButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    for (const pair of PAIRS) {
      await centerHeading(page, pair.heading);
      const sample = await measure(page, pair.heading, pair.content);
      expect(translateYOf(sample.transform), `${pair.name}: no ramp while paused`).toBe(0);
      expect(
        Math.abs(sample.visualGap - sample.layoutGap),
        `${pair.name}: visual gap equals layout gap while paused`,
      ).toBeLessThanOrEqual(1);
    }

    // Resume; spacing must stay natural too (the latch survives the pause).
    const resumeButton = page.getByRole('button', { name: 'Resume animations' });
    await resumeButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    for (const pair of PAIRS) {
      const sample = await measure(page, pair.heading, pair.content);
      expect(
        Math.abs(sample.visualGap - sample.layoutGap),
        `${pair.name}: visual gap equals layout gap after resume`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('no-JS renders every heading at its natural state with no parallax machinery', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ORIGIN + '/');

    await readerScroll(page, 60);
    for (const pair of PAIRS) {
      await centerHeading(page, pair.heading);
      const sample = await measure(page, pair.heading, pair.content);
      expect(sample.transform, `${pair.name}: no transform without JavaScript`).toBe('none');
      expect(
        Math.abs(sample.visualGap - sample.layoutGap),
        `${pair.name}: visual gap equals layout gap without JavaScript`,
      ).toBeLessThanOrEqual(1);
    }
    const armed = await page.evaluate(
      () => document.querySelectorAll('[data-reveal-armed]').length,
    );
    expect(armed, 'no arming attribute without JavaScript').toBe(0);
    await context.close();
  });
});
