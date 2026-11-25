import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

interface EntranceSample {
  t: number;
  pose: number[];
}

interface CanvasFrame {
  pose: number[];
  png: string;
}

/** Accumulates per-side worst margins over every scanned entrance frame. */
interface ProxyWorstState {
  frames: number;
  maxAbsPitch: number;
  sides: { left: number; top: number; right: number; bottom: number };
  worstPose: number[];
  centerChecked: number;
  centerMisses: number;
  centerMissSamples: string[];
  probe: HTMLCanvasElement | null;
}

declare global {
  interface Window {
    __entrance: {
      samples: EntranceSample[];
      frames: Record<string, CanvasFrame>;
    };
    __proxyWorst: ProxyWorstState | null;
  }
}

async function recordEntrance(page: Page, mobile: boolean) {
  await page.addInitScript(() => {
    window.__entrance = { samples: [], frames: {} };
    const observer = new MutationObserver((records) => {
      const record = records.find((entry) => entry.attributeName === 'data-lanyard-pose');
      if (!(record?.target instanceof HTMLElement)) return;
      const host = record.target;
      const pose = (host.dataset.lanyardPose ?? '').split(',').map(Number);
      if (pose.length !== 6) return;
      const samples = window.__entrance.samples;
      samples.push({ t: performance.now(), pose });
      const first = samples[0]!;
      const drop = first.pose[1]! - pose[1]!;
      const yaw = Math.abs(pose[3]!);
      const key =
        samples.length === 1
          ? 'start'
          : yaw > 75 && yaw < 110 && !window.__entrance.frames.side
            ? 'side'
            : yaw > 170 && !window.__entrance.frames.back
              ? 'back'
              : window.__entrance.frames.back &&
                  yaw < 70 &&
                  yaw > 20 &&
                  !window.__entrance.frames.return
                ? 'return'
                : drop > 0.15 && yaw > 10 && !window.__entrance.frames.falling
                  ? 'falling'
                  : yaw < 0.01 && Math.abs(pose[0]!) < 0.0001
                    ? 'rest'
                    : null;
      const canvas = host.querySelector('canvas');
      // Mutation delivery follows the R3F render in the same task, before
      // Chromium clears the non-preserved WebGL drawing buffer.
      if (key && canvas && !window.__entrance.frames[key]) {
        window.__entrance.frames[key] = { pose, png: canvas.toDataURL() };
      }
    });
    observer.observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-lanyard-pose'],
    });
  });

  // On short mobile screens the card starts below the fold. Hold only the
  // lazy module while scrolling it into view, then observe the real mount.
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (mobile) {
    await page.route('**/assets/lanyard3d-*.js', async (route) => {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
  }
  await page.goto('/?lanyard=3d', { waitUntil: 'domcontentloaded' });
  if (mobile) {
    await page.locator('.profile-card-shell').evaluate((shell) => {
      window.scrollTo({
        top: shell.getBoundingClientRect().top + window.scrollY - 140,
        behavior: 'instant',
      });
    });
    release();
  }
  await expect(page.locator('.profile-card-shell')).toHaveAttribute('data-profile-phase', 'idle', {
    timeout: 30_000,
  });
  return page.evaluate(() => window.__entrance);
}

async function canvasBounds(page: Page, png: string) {
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows: Array<{ y: number; left: number; right: number }> = [];
    let portraitPixels = 0;
    let seenPaint = false;
    let gap = 0;
    let maxGap = 0;
    for (let y = 0; y < canvas.height; y++) {
      let left = canvas.width;
      let right = -1;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i + 3]! < 200) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        // Warm tones in the approved photograph distinguish a mapped front
        // from all three untextured, cool-neutral surface colors.
        if (
          pixels[i]! > 30 &&
          pixels[i]! > pixels[i + 1]! * 1.08 &&
          pixels[i + 1]! > pixels[i + 2]! * 1.08
        )
          portraitPixels++;
      }
      if (right >= left) {
        if (seenPaint) maxGap = Math.max(maxGap, gap);
        seenPaint = true;
        gap = 0;
      } else if (seenPaint) {
        gap++;
      }
      // The narrow strap is excluded by width, not by a page-color guess.
      if (right - left > 100) rows.push({ y, left, right });
    }
    const middle = rows[Math.floor(rows.length / 2)];
    return {
      top: rows[0]?.y ?? -1,
      bottom: rows.at(-1)?.y ?? -1,
      width: middle ? middle.right - middle.left + 1 : 0,
      portraitPixels,
      maxGap,
      canvasWidth: canvas.width,
    };
  }, png);
}

for (const width of [1280, 375]) {
  test(`B: gravity entrance and painted frames at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const recording = await recordEntrance(page, width === 375);
    const cardHeight = await page
      .locator('.profile-card')
      .evaluate((card) => (card as HTMLElement).offsetHeight);
    const { samples, frames } = recording;
    for (const [name, frame] of Object.entries(frames)) {
      const path = testInfo.outputPath(`${width}-${name}.png`);
      await writeFile(path, Buffer.from(frame.png.split(',')[1]!, 'base64'));
      await testInfo.attach(`${width}-${name}`, {
        path,
        contentType: 'image/png',
      });
    }
    expect(samples.length).toBeGreaterThan(20);
    const first = samples[0]!;
    const last = samples.at(-1)!;
    const dropPx = (first.pose[1]! - last.pose[1]!) * cardHeight;
    const downward = samples
      .slice(1)
      .map((sample, i) => (samples[i]!.pose[1]! - sample.pose[1]!) * cardHeight);
    const maxStepPx = Math.max(...downward.map(Math.abs));
    const overshootPx =
      (last.pose[1]! - Math.min(...samples.map((sample) => sample.pose[1]!))) * cardHeight;
    const lateralPx =
      (Math.max(...samples.map((sample) => sample.pose[0]!)) -
        Math.min(...samples.map((sample) => sample.pose[0]!))) *
      cardHeight;
    expect(dropPx).toBeGreaterThan(width === 1280 ? 180 : 85);
    expect(lateralPx).toBeLessThan(cardHeight * 0.85);
    // At 30Hz the reference-speed fall can travel ~0.2 card heights per frame.
    expect(maxStepPx).toBeLessThan(cardHeight * 0.22);
    expect(downward.filter((step) => step > 2).length).toBeGreaterThan(3);
    expect(overshootPx).toBeGreaterThan(0);
    expect(overshootPx).toBeLessThan(30);
    // Reference entrance starts foreshortened, oscillates through front, and
    // presents the back before returning to the original content.
    const yaws = samples.map((sample) => sample.pose[3]!);
    expect(Math.abs(yaws[0]!)).toBeGreaterThan(30);
    expect(Math.abs(yaws[0]!)).toBeLessThan(70);
    expect(Math.max(...yaws.map(Math.abs))).toBeGreaterThan(170);
    expect(yaws.some((yaw) => yaw > 10 && yaw < 40)).toBe(true);
    let maxYawStep = 0;
    for (let i = 1; i < yaws.length; i += 1) {
      // Shortest angular distance, so a wrap cannot masquerade as continuity.
      maxYawStep = Math.max(maxYawStep, Math.abs(((yaws[i]! - yaws[i - 1]! + 540) % 360) - 180));
    }
    // Up to 33ms of simulation per frame during the fast showcase transit.
    expect(maxYawStep).toBeLessThan(65);
    expect(Math.abs(first.pose[4]!)).toBeGreaterThan(40);
    expect(Math.abs(first.pose[5]!)).toBeGreaterThan(8);
    expect(last.pose.slice(2)).toEqual([0, 0, 0, 0]);
    expect(samples.slice(-4).every((s) => s.pose.join() === last.pose.join())).toBe(true);
    expect(frames.start).toBeDefined();
    expect(frames.falling).toBeDefined();
    expect(frames.rest).toBeDefined();
    expect(frames.side).toBeDefined();
    expect(frames.back).toBeDefined();
    expect(frames.return).toBeDefined();

    const start = await canvasBounds(page, frames.start!.png);
    const falling = await canvasBounds(page, frames.falling!.png);
    const rest = await canvasBounds(page, frames.rest!.png);
    const back = await canvasBounds(page, frames.back!.png);
    const returning = await canvasBounds(page, frames.return!.png);
    const canvasCssWidth = await page
      .locator('.profile-card-lanyard3d canvas')
      .evaluate((c) => c.getBoundingClientRect().width);
    const dpr = rest.canvasWidth / canvasCssWidth;
    expect((rest.top - start.top) / dpr).toBeGreaterThan(width === 1280 ? 80 : 20);
    expect(falling.top).toBeGreaterThan(start.top);
    expect(start.bottom - start.top).toBeLessThan((rest.bottom - rest.top) * 0.85);
    expect(falling.portraitPixels).toBeGreaterThan(500);
    expect(rest.portraitPixels).toBeGreaterThan(500);
    expect(back.portraitPixels).toBe(0);
    expect(returning.portraitPixels).toBeGreaterThan(500);
    for (const frame of [start, falling, back, returning, rest]) {
      // No empty scanline between the painted anchor, rope, clip and card.
      expect(frame.maxGap).toBeLessThanOrEqual(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);

    await page.screenshot({ path: testInfo.outputPath(`${width}-rest-page.png`), fullPage: false });
    const measurements = JSON.stringify(
        {
          width,
          dropPx,
          maxStepPx,
          overshootPx,
          lateralPx,
          maxYawStep,
          wallClockSettleMs: last.t - first.t,
          start,
          falling,
          rest,
          back,
          returning,
          samples,
        },
        null,
        2,
      ),
      measurementPath = testInfo.outputPath('measurements.json');
    await writeFile(measurementPath, measurements);
    await testInfo.attach('entrance-measurements', {
      path: measurementPath,
      contentType: 'application/json',
    });
  });
}

test('B: hidden-tab recovery stays at rest without replay or accumulated jump', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const recording = await recordEntrance(page, false);
  const restPose = recording.samples.at(-1)!.pose.join();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.profile-card-shell')).toHaveAttribute(
    'data-profile-motion',
    'static',
  );
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__entrance.samples.length);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__entrance.samples.length)).toBe(before);
  await page.evaluate(() => {
    delete (document as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.profile-card-shell')).toHaveAttribute('data-profile-phase', 'idle');
  await page.waitForTimeout(300);
  const resumed = await page.evaluate((index) => window.__entrance.samples.slice(index), before);
  expect(resumed.length).toBeGreaterThan(1);
  expect(resumed.every((sample) => sample.pose.join() === restPose)).toBe(true);
});

test('B: mobile touch drag releases, and scrolling outside the card stays native', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 720 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/?lanyard=3d');
    const hit = page.locator('.profile-card-3d-hit');
    await hit.scrollIntoViewIfNeeded();
    const shell = page.locator('.profile-card-shell');
    await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 30_000 });
    // The first scroll can race the first rendered pose, when the proxy is
    // still at the host origin. Scroll the settled card before measuring.
    await hit.scrollIntoViewIfNeeded();
    const host = page.locator('.profile-card-lanyard3d');
    const rest = await host.getAttribute('data-lanyard-pose');
    const box = (await hit.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    expect(
      await hit.evaluate(
        (element, point) => document.elementFromPoint(point.x, point.y) === element,
        { x, y },
      ),
    ).toBe(true);
    const scroll = await page.evaluate(() => window.scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + step * 3, y: y - step * 6 }],
      });
    }
    await expect(shell).toHaveAttribute('data-profile-drag', 'dragging');
    await expect.poll(() => host.getAttribute('data-lanyard-pose')).not.toBe(rest);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(shell).toHaveAttribute('data-profile-drag', 'idle');
    await expect.poll(() => host.getAttribute('data-lanyard-pose'), { timeout: 20_000 }).toBe(rest);
    // A swipe in the page gutter must still scroll the document.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 8, y: 600 }],
    });
    for (let y = 580; y >= 360; y -= 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 8, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scroll + 50);
  } finally {
    await context.close();
  }
});

test('B: the drag proxy covers the foreshortened entrance card', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Review finding 3: the proxy rect was the z=0 planar projection of the
  // face corners, but the camera is a real PerspectiveCamera — during the
  // entrance the card's depth magnifies the near corners up to ~30 px beyond
  // the padded planar rect, so drags near those corners missed the proxy.
  //
  // Every pose mutation is scanned (no pose filter): the deficit comes and
  // goes across the entrance and the showcase swivel, so a single captured
  // frame can land on a benign pose. Per-side minima are accumulated over
  // all frames and the worst frame's pixels are kept as evidence.
  //
  // The scan runs inside the MutationObserver: that microtask follows the
  // R3F render in the same task, so the non-preserved WebGL drawing buffer
  // is still valid. The Pause button cannot hold these poses — it settles
  // the bridge to rest — so everything is measured synchronously in the
  // callback: pixel readback, proxy rect, and hit testing. Scanning stops
  // once the shell reports the entrance settled (phase `idle`).
  await page.addInitScript(() => {
    const state: ProxyWorstState = {
      frames: 0,
      maxAbsPitch: 0,
      sides: { left: 1e9, top: 1e9, right: 1e9, bottom: 1e9 },
      worstPose: [],
      centerChecked: 0,
      centerMisses: 0,
      centerMissSamples: [],
      probe: null,
    };
    window.__proxyWorst = state;
    let worstMin = Infinity;
    let done = false;
    const observer = new MutationObserver((records) => {
      if (done) return;
      const record = records.find((entry) => entry.attributeName === 'data-lanyard-pose');
      if (!(record?.target instanceof HTMLElement)) return;
      const shell = document.querySelector('.profile-card-shell');
      if (shell instanceof HTMLElement && shell.dataset.profilePhase === 'idle') {
        done = true;
        return;
      }
      const host = record.target;
      const pose = (host.dataset.lanyardPose ?? '').split(',').map(Number);
      if (pose.length !== 6) return;
      const canvas = host.querySelector('canvas');
      const hit = document.querySelector('.profile-card-3d-hit');
      if (!(canvas instanceof HTMLCanvasElement) || !(hit instanceof HTMLElement)) return;

      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(canvas, 0, 0);
      const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let minX = probe.width;
      let maxX = -1;
      let minY = probe.height;
      let maxY = -1;
      for (let y = 0; y < probe.height; y += 1) {
        let left = probe.width;
        let right = -1;
        for (let x = 0; x < probe.width; x += 1) {
          const i = (y * probe.width + x) * 4;
          if (pixels[i + 3]! < 200) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
        // The strap, clip, and ring never span 100 px; the card does.
        if (right - left > 100) {
          minX = Math.min(minX, left);
          maxX = Math.max(maxX, right);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      // Edge-on frames where even the card falls under the band threshold
      // carry no measurable bbox; skip them rather than record garbage.
      if (maxX < minX) return;
      const canvasRect = canvas.getBoundingClientRect();
      const hitRect = hit.getBoundingClientRect();
      const scale = canvasRect.width / probe.width;
      const card = {
        left: canvasRect.left + minX * scale,
        top: canvasRect.top + minY * scale,
        right: canvasRect.left + (maxX + 1) * scale,
        bottom: canvasRect.top + (maxY + 1) * scale,
      };
      const margins = {
        left: card.left - hitRect.left,
        top: card.top - hitRect.top,
        right: hitRect.right - card.right,
        bottom: hitRect.bottom - card.bottom,
      };
      state.frames += 1;
      state.maxAbsPitch = Math.max(state.maxAbsPitch, Math.abs(pose[4]!));
      state.sides.left = Math.min(state.sides.left, margins.left);
      state.sides.top = Math.min(state.sides.top, margins.top);
      state.sides.right = Math.min(state.sides.right, margins.right);
      state.sides.bottom = Math.min(state.sides.bottom, margins.bottom);
      const frameMin = Math.min(margins.left, margins.top, margins.right, margins.bottom);
      if (frameMin < worstMin) {
        worstMin = frameMin;
        state.worstPose = pose;
        state.probe = probe;
      }
      // Hit-test the projected center only while it is on-screen; off-screen
      // points have no element to return and no pointer could reach them.
      const cx = (card.left + card.right) / 2;
      const cy = (card.top + card.bottom) / 2;
      if (cx >= 0 && cx < window.innerWidth && cy >= 0 && cy < window.innerHeight) {
        state.centerChecked += 1;
        const element = document.elementFromPoint(cx, cy);
        if (!(element === hit || (element !== null && hit.contains(element)))) {
          state.centerMisses += 1;
          if (state.centerMissSamples.length < 5) {
            state.centerMissSamples.push(
              element ? `${element.tagName}.${element.className}` : 'null',
            );
          }
        }
      }
    });
    observer.observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-lanyard-pose'],
    });
  });

  await page.goto('/?lanyard=3d', { waitUntil: 'domcontentloaded' });
  const shell = page.locator('.profile-card-shell');
  await expect(shell).toHaveAttribute('data-profile-phase', 'idle', { timeout: 60_000 });
  // Flush any mutation batched behind the phase change.
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    const state = window.__proxyWorst!;
    return {
      frames: state.frames,
      maxAbsPitch: state.maxAbsPitch,
      sides: state.sides,
      worstPose: state.worstPose,
      centerChecked: state.centerChecked,
      centerMisses: state.centerMisses,
      centerMissSamples: state.centerMissSamples,
      png: state.probe ? state.probe.toDataURL() : null,
    };
  });

  if (result.png) {
    const pngPath = testInfo.outputPath('entrance-worst.png');
    await writeFile(pngPath, Buffer.from(result.png.split(',')[1]!, 'base64'));
    await testInfo.attach('entrance-worst', { path: pngPath, contentType: 'image/png' });
  }

  // Sanity: the scan saw a real entrance (foreshortened frames with a
  // measurable card band), not an empty or trivially short recording.
  expect(result.frames).toBeGreaterThanOrEqual(10);
  expect(result.maxAbsPitch).toBeGreaterThanOrEqual(30);
  expect(result.png).toBeTruthy();

  // Every visible card pixel must sit inside the proxy with the 8 px pad to
  // spare on every side, in every scanned frame. Pre-fix, the magnified near
  // corner fell ~17–30 px outside the padded planar rect — the per-side
  // minimum goes negative and fails immediately.
  for (const [side, margin] of Object.entries(result.sides)) {
    expect(
      margin,
      `worst ${side} margin over ${result.frames} frames (worst pose ${result.worstPose.join(',')})`,
    ).toBeGreaterThanOrEqual(3);
  }
  // The card's projected center must hit-test to the proxy whenever it is
  // on-screen (the wrapper above the proxy is pointer-events: none).
  expect(result.centerChecked).toBeGreaterThanOrEqual(1);
  expect(
    result.centerMisses,
    `frames whose card center missed the proxy: ${result.centerMissSamples.join(' | ')}`,
  ).toBe(0);
  expect(errors).toEqual([]);
});
