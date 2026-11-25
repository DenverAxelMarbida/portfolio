import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T4 final refinement — the hero fills the initial viewport so no
 * section content (project previews, approach) is visible — or skipped —
 * at page load. Every reveal wave then plays on its actual scroll arrival:
 * the projects heading first, each card on its own entry, the approach
 * section as it enters. The hero copy entrance, parallax depth and native
 * scrolling are untouched (covered by their own suites).
 */

const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: PAUSE_BUTTON })).toBeVisible();
}

/** Load-time geometry and reveal states, read in one pass. */
async function readLoadState(page: Page) {
  return page.evaluate(() => {
    const waveState = (el: Element | null) =>
      el?.closest('[data-reveal]')?.getAttribute('data-reveal') ?? null;
    const rect = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    return {
      viewportHeight: window.innerHeight,
      hero: rect('.hero'),
      projects: rect('#projects'),
      approach: rect('#approach'),
      waveStates: [...document.querySelectorAll('[data-reveal]')].map((el) =>
        el.getAttribute('data-reveal'),
      ),
      headingWave: waveState(document.getElementById('projects-heading')),
    };
  });
}

/** Scroll an element's top to `fraction` of the viewport height, instantly. */
async function scrollToEntryLine(page: Page, selector: string, fraction: number) {
  await page.evaluate(
    ([target, fraction]) => {
      const el = document.querySelector(target as string)!;
      const documentTop = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, documentTop - window.innerHeight * (fraction as number)),
        behavior: 'instant',
      });
    },
    [selector, fraction],
  );
}

const waveOf = (page: Page, selector: string, index = 0) =>
  page.locator(selector).nth(index).locator('xpath=ancestor::*[@data-reveal][1]');

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('no section content is visible or decided at page load, at any desktop height', async ({
    page,
  }) => {
    for (const size of [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      // Tall maximized windows are where the previews used to sit inside the
      // initial viewport and get their reveal skipped at load.
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/');
      await waitForHydration(page);
      const load = await readLoadState(page);

      // The hero occupies the initial viewport: its box reaches the fold.
      expect(load.hero!.bottom).toBeGreaterThanOrEqual(load.viewportHeight);
      // Both sections start entirely below the fold.
      expect(load.projects!.top).toBeGreaterThanOrEqual(load.viewportHeight);
      expect(load.approach!.top).toBeGreaterThanOrEqual(load.viewportHeight);
      // Nothing below the hero was ever on screen, so no wave has been
      // decided — every reveal still waits for its actual scroll arrival.
      expect(load.waveStates).not.toContain('skipped');
      expect(load.waveStates).not.toContain('playing');
      expect(load.waveStates).not.toContain('played');
    }
  });

  test('the projects heading reveals first; each card reveals on its own scroll entry', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHydration(page);

    // Bring the heading just inside the viewport entry line (CP7 T4 rework:
    // the observer fires at real entry, so 0.95 keeps the first card — only
    // ~78px further down — below the fold): its wave plays while the first
    // card is still untouched.
    await scrollToEntryLine(page, '#projects-heading', 0.95);
    await expect(waveOf(page, '#projects-heading')).toHaveAttribute(
      'data-reveal',
      /playing|played/,
    );
    await expect(waveOf(page, '#projects article')).toHaveAttribute('data-reveal', 'pending');
    await expect(page.locator('#projects-heading')).toBeVisible();

    // Scrolling further brings the first card into view; it reveals on its
    // own arrival while the card after it still waits below the fold.
    await scrollToEntryLine(page, '#projects article', 0.6);
    await expect(waveOf(page, '#projects article')).toHaveAttribute(
      'data-reveal',
      /playing|played/,
    );
    await expect(waveOf(page, '#projects article', 2)).toHaveAttribute('data-reveal', 'pending');
  });

  test('the approach section reveals progressively by visual row, heading first', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHydration(page);

    // CP7 T4 final refinement: each approach block is its own wave. Bringing
    // the heading to the entry line plays the heading wave and the
    // capabilities block sharing its grid row, while the introduction (the
    // first paragraph below the heading) is a separate wave on its own entry;
    // the workflow heading — a further row down — keeps waiting.
    await scrollToEntryLine(page, '#approach-heading', 0.95);
    const headingWave = page.locator('[data-reveal]:has(#approach-heading)');
    await expect(headingWave).toHaveAttribute('data-reveal', /playing|played/);
    await expect(page.locator('#approach-heading')).toBeVisible();
    await expect(waveOf(page, '.approach-capabilities')).toHaveAttribute(
      'data-reveal',
      /playing|played/,
    );
    await expect(waveOf(page, '.approach-introduction')).toHaveAttribute(
      'data-reveal',
      'pending',
    );
    // The staggered cascade settles into the readable final state.
    await expect(headingWave).toHaveAttribute('data-reveal', 'played', { timeout: 5000 });
    await expect(waveOf(page, '#workflow-heading')).toHaveAttribute('data-reveal', 'pending');
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sections stay below the fold at load and reveal on scroll arrival', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    const load = await readLoadState(page);

    expect(load.hero!.bottom).toBeGreaterThanOrEqual(load.viewportHeight);
    expect(load.projects!.top).toBeGreaterThanOrEqual(load.viewportHeight);
    expect(load.approach!.top).toBeGreaterThanOrEqual(load.viewportHeight);
    expect(load.waveStates).not.toContain('skipped');

    await scrollToEntryLine(page, '#projects-heading', 0.95);
    await expect(waveOf(page, '#projects-heading')).toHaveAttribute(
      'data-reveal',
      /playing|played/,
    );
    await expect(waveOf(page, '#projects article')).toHaveAttribute('data-reveal', 'pending');

    await scrollToEntryLine(page, '#projects article', 0.6);
    await expect(waveOf(page, '#projects article')).toHaveAttribute(
      'data-reveal',
      /playing|played/,
    );
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('below-fold content stays fully readable without any reveal animation', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForHydration(page);
    const load = await readLoadState(page);
    // The viewport fill is pure layout and holds under reduced motion too.
    expect(load.projects!.top).toBeGreaterThanOrEqual(load.viewportHeight);

    await scrollToEntryLine(page, '#projects-heading', 0.85);
    const heading = page.locator('#projects-heading');
    await expect(heading).toBeVisible();
    // No reveal cascade and no parallax depth layer under reduced motion:
    // the heading sits at its natural, fully opaque position.
    await expect
      .poll(async () => heading.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
  });
});
