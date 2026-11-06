import { lstat, readFile, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { crc32 } from 'node:zlib';

export const workspaceRoot = resolve(import.meta.dirname, '../..');

export async function containedFile(root: string, path: string) {
  const base = await realpath(root);
  const full = resolve(base, path);
  if (!full.startsWith(`${base}${sep}`)) throw new Error(`Path outside content root: ${path}`);
  let current = base;
  for (const part of relative(base, full).split(sep)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink not allowed: ${path}`);
  }
  if (!(await lstat(full)).isFile() || !(await realpath(full)).startsWith(`${base}${sep}`))
    throw new Error(`Not a contained file: ${path}`);
  return full;
}

// Only the directories adjacent to this running copy of the build scripts are disposable.
export async function cleanOutput(path: string) {
  const full = resolve(path);
  if (![join(workspaceRoot, '.generated'), join(workspaceRoot, 'dist')].includes(full))
    throw new Error('Refusing cleanup outside owned build output');
  if ((await realpath(dirname(full))) !== (await realpath(workspaceRoot)))
    throw new Error('Invalid cleanup parent');
  try {
    if ((await lstat(full)).isSymbolicLink()) throw new Error('Refusing symlink output cleanup');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await rm(full, { recursive: true, force: true });
}

export function imageSize(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR'
  ) {
    let offset = 8;
    let hasData = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) break;
      const kind = bytes.toString('ascii', offset + 4, offset + 8);
      if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) break;
      if ((offset === 8 && (kind !== 'IHDR' || length !== 13)) || (offset !== 8 && kind === 'IHDR'))
        break;
      if (kind === 'IDAT' && length > 0) hasData = true;
      if (kind === 'IEND') {
        if (length !== 0 || end !== bytes.length || !hasData) break;
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      }
      offset = end;
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    let size: { width: number; height: number } | undefined;
    let hasScan = false;
    while (offset < bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) {
        if (size && hasScan && offset === bytes.length) return size;
        break;
      }
      if (marker === undefined || offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8)
        size = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      offset += length;
      if (marker === 0xda) {
        const start = offset;
        while (offset < bytes.length) {
          if (bytes[offset] !== 0xff) {
            offset++;
            continue;
          }
          const next = bytes[offset + 1];
          if (next === 0 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) {
            offset += 2;
            continue;
          }
          break;
        }
        hasScan ||= offset > start;
      }
    }
  }
  throw new Error('Unsupported or malformed PNG/JPEG image');
}

export async function readImage(
  root: string,
  path: string,
  dimensions?: { width: number; height: number },
) {
  const bytes = await readFile(await containedFile(root, path));
  const size = imageSize(bytes);
  if (bytes.length > 32 * 1024 * 1024 || size.width * size.height > 40_000_000)
    throw new Error(`Image exceeds decoding limits (32 MiB / 40 megapixels): ${path}`);
  if (/\.png$/.test(path) !== (bytes[0] === 137))
    throw new Error(`Image format does not match extension: ${path}`);
  if (
    !size.width ||
    !size.height ||
    (dimensions && (size.width !== dimensions.width || size.height !== dimensions.height))
  )
    throw new Error(`Image dimensions do not match: ${path}`);
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ offline: true, serviceWorkers: 'block' });
    const decoded = await page.evaluate(async (encoded) => {
      const data = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([data]));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, bytes.toString('base64'));
    if (decoded.width !== size.width || decoded.height !== size.height)
      throw new Error('Decoded image dimensions differ from header');
  } catch (error) {
    throw new Error(`Image decode failed: ${path}`, { cause: error });
  } finally {
    await browser.close();
  }
  return bytes;
}
