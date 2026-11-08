import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
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
      expect([taken, Math.min(birthtimeMs || Infinity, mtimeMs || Infinity)], name).toContain(dates[name]);
    }
    expect(open).toBe(0);
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

  it('a file over the size cap is unavailable and never reaches exifr', async () => {
    const { PHOTO_METADATA_MAX_BYTES } = createRequire(import.meta.url)('../src/main/constants.js');
    const parse = vi.fn();
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    const p = path.join(folder, 'x.jpg');
    fs.truncateSync(p, PHOTO_METADATA_MAX_BYTES + 1);
    expect(await readPhotoMetadata(p)).toEqual({ status: 'unavailable', fileSizeBytes: PHOTO_METADATA_MAX_BYTES + 1 });
    expect(parse).not.toHaveBeenCalled();
  });

  it('cleans text, strips the make from the model, and keeps exact fractions and offsets', async () => {
    const tiff = { ifd0: { Make: 'Ca\u202enon\u200b', Model: 'canon EOS R5', Artist: 'A\u0007b' },
      exif: { DateTimeOriginal: '2026:01:02 03:04:05', SubSecTimeOriginal: '500', OffsetTimeOriginal: '+00:00',
        ExposureTime: 0.3, ISO: [200, 0] } };
    const parse = vi.fn(async (_file, options) => (options.tiff ? tiff : undefined));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({
      cameraMake: 'Canon', cameraModel: 'EOS R5', author: 'Ab', exposureTime: '3/10 s', iso: 200,
      takenAtLocal: '2026-01-02T03:04:05.5', takenAtOffset: 'Z' });
  });

  it('decodes XML escapes in XMP text once, like QuickPitik', async () => {
    const xmp = { dc: { creator: 'Juan &amp; Maria', rights: { lang: 'x-default', value: '&#169; 2026 J&amp;M' } },
      exifEX: { LensModel: '24-70 &quot;Art&quot; &#x41; &amp;#169; &#9999999999;' } };
    const parse = vi.fn(async (_file, options) => (options.tiff ? undefined : xmp));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({
      author: 'Juan & Maria', copyright: '\u00a9 2026 J&M', lens: '24-70 "Art" A &#169; &#9999999999;' });
  });

  // The exifr shapes below were measured with real exifr 7.1.3 on hand-built JPEGs (plan \u00a712, parity gaps a-c).
  it('joins several IPTC authors with spaces, like QuickPitik', async () => {
    const iptc = { Byline: ['Ana Cruz', 'Ben Lim'] };
    const parse = vi.fn(async (_file, options) => (options.tiff ? undefined : { iptc }));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({ author: 'Ana Cruz Ben Lim' });
  });

  it('stops EXIF text at a hidden NUL character, like QuickPitik', async () => {
    const nul = String.fromCharCode(0);
    const tiff = { ifd0: { Artist: `Jo Smith${nul}Ed Co`, Copyright: `Jo${nul}Editor` } };
    const parse = vi.fn(async (_file, options) => (options.tiff ? tiff : undefined));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({
      author: 'Jo Smith', copyright: 'Jo' });
  });

  it('keeps number-like XMP text that exifr turned into numbers', async () => {
    const xmp = { exif: { ExposureTime: 1.5 }, ifd0: { Make: 7, Model: 1234 }, aux: { Lens: 50 },
      dc: { creator: 12345, rights: [{ lang: 'en', value: 'Other' }, { lang: 'x-default', value: 2026 }] } };
    const parse = vi.fn(async (_file, options) => (options.tiff ? undefined : xmp));
    const { readPhotoMetadata } = load('src/main/exifService.js', { exifr: { parse }, '../utils/logger': logger });
    const folder = folderWith({ 'x.jpg': Buffer.from([0xff, 0xd8, 0xff]) });
    expect((await readPhotoMetadata(path.join(folder, 'x.jpg'))).fields).toEqual({
      exposureTime: '1.5 s', cameraMake: '7', cameraModel: '1234', lens: '50', author: '12345', copyright: '2026' });
  });

  const xmpOf = body => '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">${body}</rdf:Description></rdf:RDF></x:xmpmeta>`;
  const blankPng = () => sharp({ create: { width: 1, height: 1, channels: 3, background: '#888' } }).png().toBuffer();

  /** A plain (uncompressed) iTXt XMP chunk, inserted into `png` at byte `at` (33 = right after IHDR). */
  function withXmpChunk(png, xml, at = 33) {
    const body = Buffer.concat([Buffer.from('iTXtXML:com.adobe.xmp\0\0\0\0\0', 'latin1'), Buffer.from(xml)]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length - 4);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([png.subarray(0, at), head, body, crc, png.subarray(at)]);
  }
  const creator = name => `<dc:creator><rdf:Seq><rdf:li>${name}</rdf:li></rdf:Seq></dc:creator>`;

  // exifr parses broken XMP in squared time: 256 KB froze the app ~4.6 s, 512 KB ~18 s (review 2026-10-17).
  // exifr picks its parser by content, so a PNG named .jpg must be capped too.
  it.each(['x.png', 'x.jpg'])('skips a broken XMP block bigger than a JPEG can hold, and answers fast (%s)', async name => {
    const folder = folderWith({ [name]: withXmpChunk(await blankPng(), xmpOf(creator('Ana Cebu') + '<x:a>'.repeat(52000))) });
    const started = Date.now();
    const result = await realExif().readPhotoMetadata(path.join(folder, name));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.fields?.author).toBeUndefined();
  });

  it('reads PNG XMP stored after the image data, as exifr and QuickPitik do', async () => {
    const png = await blankPng();
    const folder = folderWith({ 'x.png': withXmpChunk(png, xmpOf(creator('Ana Cebu')), png.length - 12) }); // before IEND
    expect((await realExif().readPhotoMetadata(path.join(folder, 'x.png'))).fields).toEqual({ author: 'Ana Cebu' });
  });

  it('a PNG with plain and compressed XMP keeps the plain one, as before', async () => {
    const zipped = await sharp(await blankPng()).withXmp(xmpOf(creator('Zipped'))).png().toBuffer();
    const folder = folderWith({ 'x.png': withXmpChunk(zipped, xmpOf(creator('Plain'))) });
    expect((await realExif().readPhotoMetadata(path.join(folder, 'x.png'))).fields).toEqual({ author: 'Plain' });
  });

  // exifr reads a cut-short block past the end of its buffer into the rest of the shared memory slab, where
  // other recent data sits (review 2026-10-17). The spy puts "8"s right after each slab slice, like that data.
  it('a cut-short file never shows memory from past its end', async () => {
    const folder = folderWith({ 'cut.jpg': fs.readFileSync(path.join(fixtures, 'iptc-only.jpg')).subarray(0, 96) });
    const allocUnsafe = Buffer.allocUnsafe;
    const spy = vi.spyOn(Buffer, 'allocUnsafe').mockImplementation(size => allocUnsafe(size + 4096).fill('8').subarray(0, size));
    try {
      const { fields } = await realExif().readPhotoMetadata(path.join(folder, 'cut.jpg'));
      expect(JSON.stringify(fields ?? {})).not.toContain('8');
    } finally {
      spy.mockRestore();
    }
  });

  it('a JPEG named .png keeps its IPTC', async () => {
    const folder = folderWith({ 'x.png': fs.readFileSync(path.join(fixtures, 'iptc-only.jpg')) });
    expect((await realExif().readPhotoMetadata(path.join(folder, 'x.png'))).fields)
      .toEqual(evidence.vectors['iptc-only.jpg']);
  });

  it('reads compressed PNG XMP (zTXt), like QuickPitik', async () => {
    const xml = xmpOf('<dc:creator><rdf:Seq><rdf:li>Ana Cebu</rdf:li></rdf:Seq></dc:creator>'
      + '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">(c) Ana</rdf:li></rdf:Alt></dc:rights>');
    const png = await sharp(await blankPng()).withXmp(xml).png().toBuffer(); // sharp writes XMP as zTXt
    const folder = folderWith({ 'x.png': png });
    expect((await realExif().readPhotoMetadata(path.join(folder, 'x.png'))).fields).toEqual({
      author: 'Ana Cebu', copyright: '(c) Ana' });
  });

  it('a PNG whose XMP sharp cannot read still shows its EXIF', async () => {
    const parse = vi.fn(async (_file, options) => (options.tiff ? { ifd0: { Artist: 'Jo' } } : undefined));
    const metadata = vi.fn(async () => { throw new Error('bad chunk'); });
    const { readPhotoMetadata } = load('src/main/exifService.js', {
      exifr: { parse }, sharp: () => ({ metadata }), '../utils/logger': logger,
    });
    const folder = folderWith({ 'x.png': Buffer.from('89504e47', 'hex') });
    expect(await readPhotoMetadata(path.join(folder, 'x.png'))).toEqual({
      status: 'ready', fields: { author: 'Jo' }, fileSizeBytes: 4 });
    expect(metadata).toHaveBeenCalled();
  });
});
