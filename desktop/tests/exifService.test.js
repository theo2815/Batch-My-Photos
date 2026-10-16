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
