import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharp from 'sharp';

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
    process, Buffer, console, Uint8Array, // exifr checks instanceof Uint8Array in this realm
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
    expect(parse.mock.calls[0][0]).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])); // IMG_0002.jpg
    expect(dates['IMG_0002.jpg']).toBe(exifDate.getTime());
    expect(dates['IMG_0001.jpg']).toBeGreaterThan(0);
    expect(dates['IMG_0001.jpg']).not.toBe(exifDate.getTime());
  });

  it('HEIC files, real or crafted, never reach exifr; they get their file time', async () => {
    const parse = vi.fn(async () => ({ DateTimeOriginal: exifDate }));
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    // exifr reads a 64-bit box size of 00000000 FFFFFFF8 as -8, so its walk inside 'meta' runs backwards forever.
    const backwardsBox = Buffer.from('00000001' + '66726565' + '00000000fffffff8', 'hex'); // [1]['free'][-8]
    const meta = box('meta', Buffer.concat([Buffer.alloc(4), box('free'), backwardsBox]));
    const crafted = Buffer.concat([ftypHeic, meta, Buffer.alloc(64)]);
    const folder = folderWith({
      'IMG_1234.HEIC': Buffer.concat([ftypHeic, box('meta', Buffer.alloc(4)), Buffer.alloc(64)]),
      'crafted.heic': crafted,
      'short.heic': Buffer.from([0, 0, 0]),
    });

    const dates = await extractExifDates(['IMG_1234.HEIC', 'crafted.heic', 'short.heic'], folder);

    expect(crafted.readUInt32BE(24)).toBe(36);
    expect(parse).not.toHaveBeenCalled();
    for (const name of ['IMG_1234.HEIC', 'crafted.heic', 'short.heic']) expect(dates[name]).toBeGreaterThan(0);
  });

  it('a 1-byte file and an empty file fall back to file time without error', async () => {
    const parse = vi.fn(async () => { throw new Error('Unknown file format'); });
    const { extractExifDates } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'one.jpg': Buffer.from([0]), 'empty.jpg': Buffer.alloc(0) });

    const dates = await extractExifDates(['one.jpg', 'empty.jpg'], folder);

    expect(dates['one.jpg']).toBeGreaterThan(0);
    expect(dates['empty.jpg']).toBeGreaterThan(0);
  });

  // exifr reads a cut-short block of a file under 4 KB past its end into Node's shared memory pool, where other
  // recent data sits (photo metadata branch review, 2026-10-17). The spy puts "8"s after each slice, like that data.
  it('a cut-short photo gets its real date or its file time, never one from leftover memory, and is closed', async () => {
    const { extractExifDates } = load('src/main/exifService.js', { '../utils/logger': logger });
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
      .jpeg().withExif({ IFD2: { DateTimeOriginal: '2023:03:04 05:06:07' } }).toBuffer();
    const files = Object.fromEntries([...Array(jpg.length).keys()].map(n => [`cut${n}.jpg`, jpg.subarray(0, n)]));
    const folder = folderWith(files);
    let open = 0;
    const realOpen = fs.promises.open;
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await realOpen(...args);
      const close = handle.close.bind(handle);
      open++;
      handle.close = () => { open--; return close(); };
      return handle;
    });
    const allocUnsafe = Buffer.allocUnsafe;
    vi.spyOn(Buffer, 'allocUnsafe').mockImplementation(size => allocUnsafe(size + 4096).fill('8').subarray(0, size));
    let dates;
    try {
      dates = await extractExifDates(Object.keys(files), folder);
    } finally {
      vi.restoreAllMocks();
    }

    const taken = new Date(2023, 2, 4, 5, 6, 7).getTime(); // exifr reads EXIF time as local time
    expect(dates[`cut${jpg.length - 1}.jpg`]).toBe(taken);
    for (const name of Object.keys(files)) {
      const { birthtimeMs, mtimeMs } = fs.statSync(path.join(folder, name));
      expect([taken, Math.min(birthtimeMs, mtimeMs)], name).toContain(dates[name]);
    }
    expect(open).toBe(0);
  });
});
