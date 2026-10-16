import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const folders = [];
const logger = { log() {}, warn() {}, error() {}, time() {}, timeEnd() {} };
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
    process, Buffer, console,
  }, { filename });
  return module.exports;
}
function folderWith(files) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exif-'));
  folders.push(folder);
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), bytes);
  return folder;
}

// C-22 / NV-08: exifr reads a file starting 00 00 as HEIF and loops forever on its zero-length box.
const heifLooper = Buffer.concat([
  Buffer.from('00000014667479706865696300000000686569630000000066726565', 'hex'),
  Buffer.alloc(12),
]);
const exifDate = new Date('2024-05-01T00:00:00Z');
function box(kind, body = Buffer.alloc(0)) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(kind, 4, 'latin1');
  return Buffer.concat([head, body]);
}
const ftypHeic = box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1'));

afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe('extractExifDates', () => {
  it('never hands files starting 00 00 to exifr; they get their file time', async () => {
    const parse = vi.fn(async () => ({ DateTimeOriginal: exifDate }));
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({
      'IMG_0001.jpg': heifLooper,
      'IMG_0002.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
    });

    const dates = await extractExifDates(['IMG_0001.jpg', 'IMG_0002.jpg'], folder);

    expect(heifLooper.length).toBe(40);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0]).toBe(path.join(folder, 'IMG_0002.jpg'));
    expect(dates['IMG_0002.jpg']).toBe(exifDate.getTime());
    expect(dates['IMG_0001.jpg']).toBeGreaterThan(0);
    expect(dates['IMG_0001.jpg']).not.toBe(exifDate.getTime());
  });

  it('real HEIC photos (ftyp then meta) still get their EXIF date', async () => {
    const parse = vi.fn(async () => ({ DateTimeOriginal: exifDate }));
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const realHeic = Buffer.concat([ftypHeic, box('meta', Buffer.alloc(4)), Buffer.alloc(64)]);
    const folder = folderWith({ 'IMG_1234.HEIC': realHeic });

    const dates = await extractExifDates(['IMG_1234.HEIC'], folder);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(dates['IMG_1234.HEIC']).toBe(exifDate.getTime());
  });

  it('HEIF-like files whose boxes jump past the end before meta get their file time', async () => {
    const parse = vi.fn(async () => ({ DateTimeOriginal: exifDate }));
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const farBox = Buffer.concat([Buffer.from('000f4240', 'hex'), Buffer.from('mdat', 'latin1')]);
    const folder = folderWith({
      'far.heic': Buffer.concat([ftypHeic, farBox, Buffer.alloc(32)]),
      'short.heic': Buffer.from([0, 0, 0]),
    });

    const dates = await extractExifDates(['far.heic', 'short.heic'], folder);

    expect(parse).not.toHaveBeenCalled();
    expect(dates['far.heic']).toBeGreaterThan(0);
    expect(dates['short.heic']).toBeGreaterThan(0);
  });

  it('a 1-byte file and an empty file fall back to file time without error', async () => {
    const parse = vi.fn(async () => { throw new Error('Unknown file format'); });
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'one.jpg': Buffer.from([0]), 'empty.jpg': Buffer.alloc(0) });

    const dates = await extractExifDates(['one.jpg', 'empty.jpg'], folder);

    expect(dates['one.jpg']).toBeGreaterThan(0);
    expect(dates['empty.jpg']).toBeGreaterThan(0);
  });
});
