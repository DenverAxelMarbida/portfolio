import { expect, test, type Page } from '@playwright/test';

/**
 * CP7 T3 — lazy 3D lanyard prototype (`?lanyard=3d`, WebGL default).
 *
 * The 3D prototype mounts only after hydration: the mode decision runs once,
 * the `lanyard3d` chunk is imported dynamically, and the R3F canvas then owns
 * the identity card while the DOM card stays hidden-but-measurable. The hit
 * proxy carries drag gestures; `data-lanyard-pose` on the host exposes the
 * simulated pose for deterministic assertions.
 */

const PAUSE_BUTTON = /Pause animations|Resume animations|Reduced motion on/;

declare global {
  interface Window {
    __poseRec: { samples: Array<{ t: number; pose: string }> };
  }
}

/** Injects an in-page recorder for every `data-lanyard-pose` change. */
async function installPoseRecorder(page: Page) {
  await page.evaluate(() => {
    window.__poseRec = { samples: [] };
    const host = document.querySelector('.profile-card-lanyard3d');
    if (!(host instanceof HTMLElement)) throw new Error('lanyard host missing');
    const observer = new MutationObserver(() => {
      window.__poseRec.samples.push({
        t: performance.now(),
        pose: host.getAttribute('data-lanyard-pose') ?? '',
      });
    });
    observer.observe(host, { attributeFilter: ['data-lanyard-pose'] });
  });
}

async function waitForHydration(page: Page) {
  await expect(page.getByRole('button', { name: PAUSE_BUTTON })).toBeVisible();
}

/** Waits for the 3D mode decision, canvas mount, and entrance settle. */
async function waitFor3dReady(page: Page) {
  await expect(page.locator('.profile-card-shell')).toHaveAttribute(
    'data-profile-card-mode',
    '3d',
  );
  await expect(page.locator('.profile-card-lanyard3d canvas')).toHaveCount(1);
  // The attribute is `null` until the lazy chunk paints its first pose, so the
  // poll must assert truthiness — `not.toBe('')` would pass on `null` and race
  // the first paint under parallel load.
  await expect
    .poll(async () => page.locator('.profile-card-lanyard3d').getAttribute('data-lanyard-pose'))
    .toBeTruthy();
}

test.describe('mode decision', () => {
  test('desktop WebGL defaults to 3d mode with a hidden DOM card', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);

    // The DOM card stays in the layout (measurable for the card texture) but
    // is invisible; the accessible identity moves to the sr-only block.
    await expect(page.locator('.profile-card')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('.profile-card .sr-only')).toHaveCount(0);
    await expect(page.locator('.profile-card-shell .sr-only')).toBeVisible();
    expect(
      errors.filter((message) => /hydrat|did not match|webgl/i.test(message)),
    ).toEqual([]);
  });

  test('forced dom mode keeps the DOM card visible and mounts no canvas', async ({ page }) => {
    await page.goto('/?lanyard=dom');
    await waitForHydration(page);
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-card-mode',
      'dom',
    );
    await expect(page.locator('.profile-card')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.profile-card-lanyard3d canvas')).toHaveCount(0);
  });

  test('reduced motion keeps the DOM lanyard', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await waitForHydration(page);
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-card-mode',
      'dom',
    );
    await expect(page.locator('.profile-card')).toHaveCSS('visibility', 'visible');
    await context.close();
  });
});

test.describe('drag and pause', () => {
  test('drag moves the card pose through the hit proxy', async ({ page }) => {
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);
    // Grab at rest: grabbing mid-entrance-swing pollutes the displacement
    // measurement with the swing's own momentum and tilt reorientation (the
    // card center's offset from the clip rotates as the tilt decays), so the
    // proxy can stall a few px from its grab-time position even though the
    // drag target is being followed. Every drag gesture below waits for the
    // entrance to settle first; this one now does too.
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-phase',
      'idle',
      { timeout: 20_000 },
    );

    const host = page.locator('.profile-card-lanyard3d');
    const restPose = await host.getAttribute('data-lanyard-pose');
    expect(restPose).toBeTruthy();

    const hit = page.locator('.profile-card-3d-hit');
    const hitBox = await hit.boundingBox();
    expect(hitBox).not.toBeNull();

    await page.mouse.move(hitBox!.x + hitBox!.width / 2, hitBox!.y + hitBox!.height / 2);
    await page.mouse.down();
    // Drag right and up. At rest the strap is already taut at full length,
    // so dragging down from the hang line cannot move the card (the strap
    // would have to stretch) — the old down-right gesture only passed
    // because the pre-refinement grab bug stretched the strap downward with
    // a half-card target bias. Within reach, both axes displace the card.
    await page.mouse.move(hitBox!.x + hitBox!.width / 2 + 40, hitBox!.y + hitBox!.height / 2 - 40, {
      steps: 8,
    });

    const shell = page.locator('.profile-card-shell');
    await expect(shell).toHaveAttribute('data-profile-drag', 'dragging');
    await expect
      .poll(() => host.getAttribute('data-lanyard-pose'), { timeout: 5_000 })
      .not.toBe(restPose);

    // The proxy tracks the projected card, so it follows the drag. Under load
    // the pose poll can pass on the first displaced frame — a few pixels —
    // long before the projected rect visibly moved. The card also now swings
    // live under the drag (it used to stick near the hang line), so a fresh
    // boundingBox sampled after the poll would race the pendulum and read a
    // smaller transient displacement. Assert both axes inside the poll: the
    // reported value is the smaller of the two, so passing means both moved.
    // The clip now chases only the honest pointer delta (40 px) instead of
    // the old half-card-biased target, and the fixed-step solver advances at
    // most 33 ms of sim time per frame — under parallel SwiftShader load the
    // wall-clock catch-up is slow, so the poll needs headroom beyond 5 s.
    await expect
      .poll(
        async () => {
          const box = await hit.boundingBox();
          if (!box) return 0;
          return Math.min(Math.abs(box.x - hitBox!.x), Math.abs(box.y - hitBox!.y));
        },
        { timeout: 12_000 },
      )
      .toBeGreaterThan(10);

    // Release: momentum settles and the drag state clears.
    await page.mouse.up();
    await expect(shell).toHaveAttribute('data-profile-drag', 'idle');
  });

  test('pausing settles to rest, freezes it, and resumes dragging', async ({ page }) => {
    // Settle waits + pause/resume round-trips are tight under full parallel
    // load (SwiftShader WebGL shares CPU with every other worker).
    test.slow();
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);

    const host = page.locator('.profile-card-lanyard3d');
    const shell = page.locator('.profile-card-shell');

    // Wait for the entrance to settle so the rest pose is known.
    await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 15_000 });
    const restPose = await host.getAttribute('data-lanyard-pose');
    expect(restPose).toBeTruthy();

    // Drag to a displaced pose.
    const hit = page.locator('.profile-card-3d-hit');
    const hitBox = (await hit.boundingBox())!;
    await page.mouse.move(hitBox.x + hitBox.width / 2, hitBox.y + hitBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hitBox.x + hitBox.width / 2 + 60, hitBox.y + hitBox.height / 2, {
      steps: 10,
    });
    await expect
      .poll(() => host.getAttribute('data-lanyard-pose'), { timeout: 5_000 })
      .not.toBe(restPose);

    // Pause in place (the control sits at the document bottom; clicking would
    // scroll it into view and disturb the drag geometry). Pausing stops the
    // loop and settles the presentation back to the exact rest pose.
    const pauseButton = page.getByRole('button', { name: 'Pause animations' });
    await pauseButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Resume animations' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(shell).toHaveAttribute('data-profile-phase', 'static');
    expect(await host.getAttribute('data-lanyard-pose')).toBe(restPose);

    // While paused, pointer movement must not step the simulation.
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.move(hitBox.x + hitBox.width / 2 + 60, hitBox.y + hitBox.height / 2 + step * 12);
      await page.waitForTimeout(150);
      expect(await host.getAttribute('data-lanyard-pose')).toBe(restPose);
    }

    // Resume releases the simulation; a fresh drag moves the pose again.
    const resumeButton = page.getByRole('button', { name: 'Resume animations' });
    await resumeButton.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.mouse.down();
    await page.mouse.move(hitBox.x + hitBox.width / 2 - 60, hitBox.y + hitBox.height / 2, {
      steps: 10,
    });
    await expect
      .poll(() => host.getAttribute('data-lanyard-pose'), { timeout: 5_000 })
      .not.toBe(restPose);
    await page.mouse.up();
  });
});

test.describe('drag and release transitions (CP7 correction)', () => {
  test.slow();
  // The release decay is paced by rendered frames; under 2-worker parallel
  // load with software WebGL the whole transition can stretch well past the
  // default timeout.
  test.setTimeout(120_000);

  /**
   * CP7 correction: the pre-fix drag teleported the clip at up to
   * `maxSpeed` (~7× the pendulum wrap threshold), so a violent drag released
   * into an over-the-top wrap — the card inverted, launched above the
   * anchor, and staggered for many seconds (owner evidence video). The
   * capped exponential follow keeps the release transition natural: a
   * strong swing, decreasing amplitude, settling to the rest pose.
   *
   * These browser-level assertions complement the deterministic unit tests
   * by exercising the real pointer → target → solver integration.
   */

  /** Fast sustained orbit drag (`orbitCount` revolutions), releasing at speed. */
  async function violentOrbitDrag(page: Page, radiusPx: number, orbitCount: number) {
    const hit = page.locator('.profile-card-3d-hit');
    const box = (await hit.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.6;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = 14;
    for (let orbit = 0; orbit < orbitCount; orbit += 1) {
      for (let step = 0; step <= steps; step += 1) {
        const angle = (((orbit * steps + step) / (2 * steps)) * 2 * Math.PI) - Math.PI / 2;
        await page.mouse.move(
          cx + radiusPx * Math.cos(angle),
          cy + radiusPx * Math.sin(angle),
          { steps: 1 },
        );
      }
    }
    await page.mouse.up();
    // Sample timestamps come from the page clock, not Node's.
    return page.evaluate(() => performance.now());
  }

  /** True once the pose has held tilt < 2° continuously for ~1s: the last
   * sample is below threshold and no sample crossed it recently. (Checking
   * the contiguous tail matters — early release-phase samples legitimately
   * exceed the threshold while the swing decays.) */
  async function settledAfterRelease(page: Page, sinceMs: number) {
    return page.evaluate(
      ([since]) => {
        const parseTilt = (pose: string) => Number(pose.split(',')[2]) || 0;
        const samples = window.__poseRec.samples.filter((sample) => sample.t >= since);
        if (samples.length === 0) return false;
        let lastAbove: number | null = null;
        for (const sample of samples) {
          if (parseTilt(sample.pose) >= 2) lastAbove = sample.t;
        }
        if (parseTilt(samples[samples.length - 1]!.pose) >= 2) return false;
        const now = performance.now();
        return lastAbove === null || now - lastAbove > 1_000;
      },
      [sinceMs] as const,
    );
  }

  /** Release-phase extremes from the recorded trace. */
  async function releaseStats(page: Page, sinceMs: number) {
    return page.evaluate(
      ([since]) => {
        const parsePose = (pose: string) => {
          const parts = pose.split(',').map(Number);
          return { cy: parts[1] ?? 0, tilt: parts[2] ?? 0 };
        };
        const samples = window.__poseRec.samples.filter((sample) => sample.t >= since);
        let maxTilt = 0;
        let maxCy = -Infinity;
        for (const sample of samples) {
          const { cy, tilt } = parsePose(sample.pose);
          maxTilt = Math.max(maxTilt, tilt);
          maxCy = Math.max(maxCy, cy);
        }
        const last = samples[samples.length - 1];
        return {
          sampleCount: samples.length,
          maxTilt,
          maxCy,
          finalTilt: last ? parsePose(last.pose).tilt : 90,
        };
      },
      [sinceMs] as const,
    );
  }

  test('a violent drag releases into a bounded swing that settles (desktop)', async ({ page }) => {
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-phase',
      'idle',
      { timeout: 20_000 },
    );

    await installPoseRecorder(page);
    const host = page.locator('.profile-card-lanyard3d');
    const restPose = (await host.getAttribute('data-lanyard-pose'))!;

    const releaseT = await violentOrbitDrag(page, 170, 6);

    // The drag itself must not wind the assembly sideways or above the
    // anchor (the wrap threshold is ~90° tilt / cy > 0).
    await expect
      .poll(
        async () => {
          const stats = await releaseStats(page, releaseT);
          return stats.maxTilt;
        },
        { timeout: 20_000 },
      )
      .toBeLessThan(60);
    const stats = await releaseStats(page, releaseT);
    // The card center stays below the anchor (cy=0) throughout the release.
    expect(stats.maxCy).toBeLessThan(0);
    // Momentum is real but bounded: the released card swings away from rest
    // before settling. (Under 2-worker parallel load the drag lands few
    // simulation frames, so the floor is deliberately modest; the
    // deterministic unit tests pin the exact momentum bounds.)
    expect(stats.maxTilt).toBeGreaterThan(2.5);

    // Decreasing-amplitude swing to rest, well inside the recording window
    // (the pre-fix staggered decay ran 6–9s in the owner's video; software
    // WebGL under parallel load paces the simulation slower, so the budget
    // is generous).
    await expect
      .poll(() => settledAfterRelease(page, releaseT), { timeout: 30_000, intervals: [250] })
      .toBe(true);
    const settled = await releaseStats(page, releaseT);
    expect(settled.finalTilt).toBeLessThan(2);

    // The drag state clears and the pose returns to the rest pose.
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-drag',
      'idle',
      { timeout: 10_000 },
    );
    await expect
      .poll(() => host.getAttribute('data-lanyard-pose'), { timeout: 15_000 })
      .toBe(restPose);
  });

  test('a violent drag stays stable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);
    // The card sits below the fold on mobile; drag events outside the
    // viewport never engage the proxy.
    await page.locator('.profile-card-3d-hit').scrollIntoViewIfNeeded();
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-phase',
      'idle',
      { timeout: 20_000 },
    );

    await installPoseRecorder(page);
    const releaseT = await violentOrbitDrag(page, 100, 6);

    await expect
      .poll(
        async () => {
          const stats = await releaseStats(page, releaseT);
          return stats.maxTilt;
        },
        { timeout: 20_000 },
      )
      .toBeLessThan(60);
    const stats = await releaseStats(page, releaseT);
    expect(stats.maxCy).toBeLessThan(0);

    await expect
      .poll(() => settledAfterRelease(page, releaseT), { timeout: 30_000, intervals: [250] })
      .toBe(true);
    expect((await releaseStats(page, releaseT)).finalTilt).toBeLessThan(2);
  });
});

test.describe('drag responsiveness (CP7 refinement)', () => {
  test.slow();

  /**
   * CP7 refinement: `grab` was measured against the card *center* but the
   * drag target drives the rope *clip*, half a card higher. Every drag target
   * therefore carried a half-card downward bias — dragging the card up left
   * it ~0.36 world units (well over 100 px) below the pointer, permanently,
   * and vertical drags had roughly half their intended effect ("heavy
   * dragging" in the owner review). With the grab anchored to the clip, the
   * assembly follows the pointer delta like the accepted DOM lanyard.
   */
  test('dragging the card upward raises the card with the pointer', async ({ page }) => {
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);
    await expect(page.locator('.profile-card-shell')).toHaveAttribute(
      'data-profile-phase',
      'idle',
      { timeout: 20_000 },
    );

    const host = page.locator('.profile-card-lanyard3d');
    const restPose = (await host.getAttribute('data-lanyard-pose'))!;
    const restCy = Number(restPose.split(',')[1]);

    // World units are card heights, so the pointer delta converts through the
    // measured card height in CSS px.
    const cardPx = await page.evaluate(
      () => document.querySelector<HTMLElement>('.profile-card')?.offsetHeight ?? 0,
    );
    expect(cardPx).toBeGreaterThan(40);

    const hit = page.locator('.profile-card-3d-hit');
    const box = (await hit.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.55;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Raise the pointer 120 px over several steps, then hold: the clip
    // converges on the target and the card settles hanging below it.
    await page.mouse.move(cx, cy - 120, { steps: 10 });
    await page.waitForTimeout(900);

    const pose = (await host.getAttribute('data-lanyard-pose'))!;
    const cyNow = Number(pose.split(',')[1]);
    const riseWorld = cyNow - restCy;
    // Post-fix the card tracks the pointer delta (asserted at half the delta
    // to leave room for pendulum residue under parallel load); pre-fix the
    // rise measured ≈ 0 — the card stayed glued to its hang line.
    expect(riseWorld).toBeGreaterThan((120 / cardPx) * 0.5);
    await page.mouse.up();
  });
});

test.describe('remeasure after viewport resize', () => {
  /**
   * Review finding 1: the host bridge's frame callback closed over the
   * mount-time geometry while remeasure() swaps runtime.geometry. Crossing
   * the wide-layout breakpoint changes the canvas size, anchor row, and
   * strap length (document mode → shell mode), so the stale offsets displaced
   * the hit proxy by ~70–100 px from the visible card, and the settle gate
   * compared the rest pose against the stale config — a drag/release on the
   * resized layout could never return to idle.
   */
  test('desktop → mobile resize keeps the hit proxy on the card and settles', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?lanyard=3d');
    await waitForHydration(page);
    await waitFor3dReady(page);
    const shell = page.locator('.profile-card-shell');
    await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 30_000 });

    const hit = page.locator('.profile-card-3d-hit');
    const card = page.locator('.profile-card');

    // The proxy is the projected card rect + an 8 px pad, so at rest it must
    // ring the hidden-but-measurable DOM card by ~8 px on every side.
    const margins = async () => {
      const h = (await hit.boundingBox())!;
      const c = (await card.boundingBox())!;
      return {
        left: c.x - h.x,
        top: c.y - h.y,
        right: h.x + h.width - (c.x + c.width),
        bottom: h.y + h.height - (c.y + c.height),
      };
    };
    const expectAligned = (value: Awaited<ReturnType<typeof margins>>, label: string) => {
      for (const [side, margin] of Object.entries(value)) {
        expect(margin, `${label} ${side} margin`).toBeGreaterThanOrEqual(3);
        expect(margin, `${label} ${side} margin`).toBeLessThanOrEqual(20);
      }
    };

    expectAligned(await margins(), 'desktop');

    // Cross the wide-layout breakpoint: remeasure swaps document-mode strap
    // geometry for shell-mode geometry (different canvas size, anchor row,
    // strap length, and card size).
    await page.setViewportSize({ width: 375, height: 720 });
    await page.waitForTimeout(600);
    await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 10_000 });
    expectAligned(await margins(), 'mobile');

    // A drag/release on the resized layout must still reach idle: the settle
    // gate has to read the remeasured config, not the mount-time one.
    await hit.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const box = (await hit.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 40, {
      steps: 8,
    });
    await expect(shell).toHaveAttribute('data-profile-drag', 'dragging');
    await page.mouse.up();
    await expect(shell).toHaveAttribute('data-profile-drag', 'idle');
    await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 30_000 });
    expectAligned(await margins(), 'mobile after drag');
  });
});
