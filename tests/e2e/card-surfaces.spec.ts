import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('B: actual WebGL edge thickness and unbranded reverse lighting response', async ({
  page,
}, testInfo) => {
  // Bundle a test-only renderer with the production material factory. It is
  // never part of the application's entry graph or shipped bundle.
  const result = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/cardSurface.ts'),
        formats: ['iife'],
        name: 'CardSurface',
      },
    },
  });
  const output = Array.isArray(result)
    ? result[0]!.output
    : 'output' in result
      ? result.output
      : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('surface fixture bundle missing');
  await page.setContent('<body style="margin:0;background:#080808"></body>');
  await page.addScriptTag({ content: chunk.code });
  const views = await page.evaluate(() => ({
    edge: window.renderCardSurface(Math.PI / 2),
    back: window.renderCardSurface(Math.PI),
    turned: window.renderCardSurface(Math.PI + 0.5),
  }));
  for (const [name, view] of Object.entries(views)) {
    const path = testInfo.outputPath(`${name}.png`);
    await writeFile(path, Buffer.from(view.png.split(',')[1]!, 'base64'));
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }
  expect(new Set(views.edge.groups)).toEqual(new Set([0, 4, 5]));
  // Orthographic span is 1 world unit across 400 pixels: a 0.025-deep
  // solid paints ten pixels edge-on; a plane paints none.
  expect(views.edge.width).toBeGreaterThanOrEqual(9);
  expect(views.edge.width).toBeLessThanOrEqual(11);
  expect(views.back.width).toBeGreaterThan(320);
  expect(views.turned.width).toBeLessThan(views.back.width);
  for (const view of [views.back, views.turned]) {
    expect(Math.max(...view.center)).toBeLessThan(65);
    expect(Math.max(...view.center) - Math.min(...view.center)).toBeLessThan(12);
  }
  const lightDelta = Math.max(
    ...views.back.center.map((channel, i) => Math.abs(channel - views.turned.center[i]!)),
  );
  expect(lightDelta).toBeGreaterThan(0);
  expect(lightDelta).toBeLessThan(25);
  await writeFile(
    testInfo.outputPath('surface-measurements.json'),
    JSON.stringify(
      {
        edgeWidth: views.edge.width,
        back: views.back.center,
        turned: views.turned.center,
        lightDelta,
      },
      null,
      2,
    ),
  );
});
