import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const logger = { log() {}, warn() {}, error() {}, time() {}, timeEnd() {} };
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process, Buffer, URL, console, setTimeout, clearTimeout, AbortController, AbortSignal,
    TextDecoder, TextEncoder, FormData, Blob,
  }, { filename });
  return module.exports;
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bmp-decoders-'));
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));
const red = () => sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } });
async function fixture(name, bytes) {
  const file = path.join(folder, name);
  fs.writeFileSync(file, await bytes);
  return file;
}

const blur = load('src/main/blurDetectionService.js', {
  electron: { net: {} },
  './config': { features: {}, urls: {} },
  './blurBetaKeyStore': { get: () => '' },
  '../utils/logger': logger,
});

describe('image decoders refused for files from received folders', () => {
  it('refuses an SVG saved under a .jpg name', async () => {
    const file = await fixture('x.jpg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await blur.prepareImageForUpload(file)).toBeNull();
    expect(await blur.computeBlurScore(file)).toEqual({ variance: -1, edgeDensity: -1 });
  });

  it('refuses an AVIF (HEIF) picture saved under a .jpg name', async () => {
    const file = await fixture('y.jpg', red().avif().toBuffer());
    expect(await blur.prepareImageForUpload(file)).toBeNull();
  });

  it('still decodes real TIFF and GIF files', async () => {
    const tiff = await fixture('z.tif', red().tiff().toBuffer());
    const gif = await fixture('w.gif', red().gif().toBuffer());
    expect(Buffer.isBuffer(await blur.prepareImageForUpload(tiff))).toBe(true);
    expect(Buffer.isBuffer(await blur.prepareImageForUpload(gif))).toBe(true);
  });
});
