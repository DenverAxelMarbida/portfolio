import { createServer, type ViteDevServer } from 'vite';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import type { Locator, Page } from '@playwright/test';
import { developmentPages } from '../../scripts/serve.mjs';
import { dispose, project, run, workspace, writeProject } from '../content/fixtures';

/** Dev-only carousel test hook installed by ProjectMedia's activation effect. */
export type CarouselDebug = { __carouselDebugGoto?: (index: number, delta?: 1 | -1) => void };

export interface CarouselFixtureShot {
  file: string;
  alt: string;
  width: number;
  height: number;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A solid-color PNG of exact dimensions, so carousel-ratio fixtures can declare honest sizes. */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Two contrasting-ratio screenshots: the standard hydration probe pair. */
export const probePair = [
  {
    file: 'probe-a.png',
    alt: 'Synthetic first image',
    width: 1920,
    height: 1080,
  },
  {
    file: 'probe-b.png',
    alt: 'Synthetic second image',
    width: 800,
    height: 1000,
  },
] as const satisfies readonly CarouselFixtureShot[];

// Fixture server state is per worker: consuming specs run serially, so at most
// one fixture server lives at a time. Cleanup is explicit via
// stopCarouselFixture from the owning spec's afterEach.
let root = '';
let server: ViteDevServer | undefined;
// In-process vite dev servers must run with a development environment (the
// dev-only debug hook and dependency pre-bundling both depend on it), so the
// environment is pinned here and restored on stop.
let savedNodeEnv: string | undefined;

/**
 * Builds a one-project publication with the given screenshots and serves it
 * through a real Vite dev server (development pages plugin included), so
 * hydration, the deferred runtime chunk and the debug hook all behave exactly
 * like the deployed application. Returns the server origin.
 */
export async function carouselFixture(
  screenshots: readonly CarouselFixtureShot[],
): Promise<string> {
  root = await workspace();
  for (const [index, shot] of screenshots.entries()) {
    await writeFile(
      join(root, `content/media/${shot.file}`),
      solidPng(shot.width, shot.height, [
        (32 + index * 64) % 256,
        (96 + index * 64) % 256,
        (160 + index * 64) % 256,
      ]),
    );
  }
  await writeProject(root, {
    ...project(),
    screenshots: screenshots.map((shot) => ({
      assetPath: shot.file,
      alt: shot.alt,
      caption: null,
      width: shot.width,
      height: shot.height,
      evidenceIds: ['brief'],
    })),
  });
  await run(root, 'scripts/content/generate.ts', 'generate');
  savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  server = await createServer({
    root,
    configFile: join(root, 'vite.config.ts'),
    plugins: [developmentPages()],
    server: { port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing dev address');
  return `http://127.0.0.1:${address.port}`;
}

/** Stops the fixture server, restores the worker environment, disposes the workspace. */
export async function stopCarouselFixture(): Promise<void> {
  if (server) await server.close();
  server = undefined;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  savedNodeEnv = undefined;
  if (root) {
    await dispose(root);
    root = '';
  }
}

export interface CarouselLogEntry {
  t: number;
  v: string;
}

/**
 * Records every `data-carousel-active` change of one media root with
 * page-internal timestamps, so countdown spacing survives protocol latency.
 * The sequence is reconstructed from each mutation record's oldValue, so even
 * changes made twice within one synchronous task (wrap start + instant
 * landing) appear in order.
 */
export async function installLog(media: Locator, name: string): Promise<void> {
  await media.evaluate((element, logName) => {
    const w = window as unknown as {
      __carouselLogs?: Record<string, CarouselLogEntry[]>;
    };
    w.__carouselLogs ??= {};
    const log: CarouselLogEntry[] = [];
    w.__carouselLogs[logName] = log;
    new MutationObserver((records) => {
      const now = performance.now();
      for (const record of records) {
        const v = record.oldValue ?? '';
        const last = log[log.length - 1];
        if (!last || last.v !== v) log.push({ t: now, v });
      }
      const current = element.getAttribute('data-carousel-active') ?? '';
      const last = log[log.length - 1];
      if (!last || last.v !== current) log.push({ t: now, v: current });
    }).observe(element, {
      attributes: true,
      attributeFilter: ['data-carousel-active'],
      attributeOldValue: true,
    });
  }, name);
}

export async function readLog(page: Page, name: string): Promise<CarouselLogEntry[]> {
  return page.evaluate((logName) => {
    const w = window as unknown as { __carouselLogs?: Record<string, CarouselLogEntry[]> };
    return w.__carouselLogs?.[logName] ?? [];
  }, name);
}

/** Indexed access with a hard failure instead of an undefined leak. */
export function logEntry(log: CarouselLogEntry[], index: number): CarouselLogEntry {
  const item = log[index];
  if (!item) throw new Error(`Missing carousel log entry ${index} (have ${log.length})`);
  return item;
}
