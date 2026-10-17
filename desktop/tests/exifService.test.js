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
});

// QuickPitik parity fixtures, copied unchanged from the monorepo (see fixtures/photo-metadata/SOURCE.txt).
const fixtures = path.join(import.meta.dirname, 'fixtures', 'photo-metadata');
const evidence = JSON.parse(fs.readFileSync(path.join(fixtures, 'expected.json'), 'utf8'));
const realExif = () => load('src/main/exifService.js', { '../utils/logger': logger });

describe('readPhotoMetadata', () => {
  it.each(Object.entries(evidence.vectors))('matches QuickPitik for %s', async (name, expected) => {
    const result = await realExif().readPhotoMetadata(path.join(fixtures, name));
    expect(result.status).toBe(Object.keys(expected).length ? 'ready' : 'empty');
    expect({ ...result.fields }).toEqual(expected);
    expect(result.fileSizeBytes).toBe(fs.statSync(path.join(fixtures, name)).size);
  });

  it('never returns GPS, serial numbers or private XMP from any fixture', async () => {
    const { readPhotoMetadata } = realExif();
    for (const name of fs.readdirSync(fixtures).filter(n => n !== 'expected.json')) {
      const json = JSON.stringify(await readPhotoMetadata(path.join(fixtures, name)));
      for (const sentinel of evidence.sentinels) expect(json, name).not.toContain(sentinel);
    }
  });

  it('keeps the backend 7,000-unit text budget on the payload-limit fixture', async () => {
    const { fields } = await realExif().readPhotoMetadata(path.join(fixtures, 'xmp-payload-limit.jpg'));
    expect(fields.aperture).toBe(2.8);
    expect(fields.author).toContain('"');
    expect(fields.author).toContain('\\');
    expect(fields.copyright).toBeTruthy();
    expect(Buffer.byteLength(JSON.stringify(fields))).toBeLessThanOrEqual(8 * 1024);
  });

  it('a corrupt file resolves without fields instead of throwing', async () => {
    const result = await realExif().readPhotoMetadata(path.join(fixtures, evidence.parserFailure));
    expect(result.fields).toBeUndefined();
    expect(['empty', 'failed']).toContain(result.status);
  });

  it('never hands files starting 00 00 to exifr', async () => {
    const parse = vi.fn();
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'IMG_0001.jpg': heifLooper });
    expect(await readPhotoMetadata(path.join(folder, 'IMG_0001.jpg'))).toEqual({
      status: 'unavailable', fileSizeBytes: 40,
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it('formats exifr cannot read are unavailable and never reach exifr', async () => {
    const parse = vi.fn();
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({
      'a.webp': Buffer.from('RIFF'), 'b.gif': Buffer.from('GIF8'), 'c.bmp': Buffer.from('BM'),
    });
    for (const name of ['a.webp', 'b.gif', 'c.bmp']) {
      expect((await readPhotoMetadata(path.join(folder, name))).status).toBe('unavailable');
    }
    expect(parse).not.toHaveBeenCalled();
  });

  it('an exifr error gives failed with the file size, and logs nothing', async () => {
    const warn = vi.fn();
    const parse = vi.fn(async () => { throw new Error('SERIAL_SENTINEL_QP_94'); });
    const { readPhotoMetadata } = load('src/main/exifService.js', {
      exifr: { parse }, '../utils/logger': { ...logger, warn, log: warn },
    });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect(await readPhotoMetadata(path.join(folder, 'x.jpg'))).toEqual({ status: 'failed', fileSizeBytes: 3 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('a missing file gives failed', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-photo.jpg');
    expect(await realExif().readPhotoMetadata(missing)).toEqual({ status: 'failed' });
  });

  it('cleans text, strips the make from the model, and keeps exact fractions and offsets', async () => {
    const tiff = { ifd0: { Make: 'Ca‮non​', Model: 'canon EOS R5', Artist: 'A\u0007b' },
      exif: { DateTimeOriginal: '2026:01:02 03:04:05', SubSecTimeOriginal: '500', OffsetTimeOriginal: '+00:00',
        ExposureTime: 0.3, ISO: [200, 0] } };
    const parse = vi.fn(async (_file, options) => (options.tiff ? tiff : undefined));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({
      cameraMake: 'Canon', cameraModel: 'EOS R5', author: 'Ab', exposureTime: '3/10 s', iso: 200,
      takenAtLocal: '2026-01-02T03:04:05.5', takenAtOffset: 'Z' });
  });
});
