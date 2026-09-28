// Diagnostic only: node scripts/evaluate-blur-policy.cjs labeled.json
// JSON input: [{ "file": "relative/or/absolute/image.jpg", "label": "sharp" }]
// Set BATCH_BLUR_AI_URL and optionally BATCH_BLUR_AI_API_KEY in the environment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const sharp = require('sharp');

// The classifier service is Electron-main code; its pure mapping and Sharp
// preparation are reused here under Node without launching the application.
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  return request === 'electron' ? { app: { isPackaged: false } } : originalLoad.call(this, request, ...args);
};
let blur;
try {
  blur = require('../src/main/blurDetectionService');
} finally {
  Module._load = originalLoad;
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const classes = blur.CLASS_NAMES.filter(name => name !== 'sharp');

async function classify(jpeg) {
  const form = new FormData();
  form.append('files', new Blob([jpeg], { type: 'image/jpeg' }), '0');
  const headers = {};
  if (process.env.BATCH_BLUR_AI_API_KEY) headers['X-API-Key'] = process.env.BATCH_BLUR_AI_API_KEY;
  const response = await fetch(`${process.env.BATCH_BLUR_AI_URL.replace(/\/+$/, '')}/api/v1/blur/classify/stream`, {
    method: 'POST', headers, body: form,
  });
  if (!response.ok) throw new Error('classification failed');
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines.length !== 2) throw new Error('incomplete classification stream');
  const [row, summary] = lines.map(line => JSON.parse(line));
  if (row?.index !== 0 || row.filename !== '0' || !blur.validClassification(row) ||
      summary?._summary !== true || summary.complete !== true || summary.total !== 1 ||
      summary.successful !== 1 || summary.errors !== 0) throw new Error('incomplete classification stream');
  return row;
}

async function evaluate(records, classifyImage = classify, customCategories = []) {
  if (!Array.isArray(records) || records.length === 0 || records.some(row => !row || !blur.CLASS_NAMES.includes(row.label) ||
      typeof row.file !== 'string')) throw new Error('Expected labeled image records');
  if (customCategories.some(name => !classes.includes(name))) throw new Error('Invalid custom category');

  const filters = { all: null, ...Object.fromEntries(classes.map(name => [name, new Set([name])])) };
  if (customCategories.length) filters.custom = new Set(customCategories);
  const policies = Object.fromEntries(Object.entries(blur.SENSITIVITY_TO_THRESHOLD).flatMap(([sensitivity]) =>
    Object.keys(filters).map(filter => [`${sensitivity}:${filter}`, {
      total: records.length, unknown: 0, correct: 0, dangerousFlips: 0, falseBlurry: 0,
    }])));
  const server = { total: records.length, unknown: 0, correct: 0, dangerousFlips: 0, falseBlurry: 0 };
  const items = [];

  for (const [index, row] of records.entries()) {
    const item = { index, label: row.label, status: 'unknown', sourceSha256: null,
      preparedSha256: null, width: null, height: null, serverArgmax: null, decisions: {} };
    items.push(item);
    try {
      const source = await fs.promises.readFile(row.file);
      item.sourceSha256 = hash(source);
      const jpeg = await blur.prepareImageForUpload(row.file);
      if (!jpeg) throw new Error('Image preparation failed');
      item.preparedSha256 = hash(jpeg);
      const metadata = await sharp(jpeg).metadata();
      item.width = metadata.width;
      item.height = metadata.height;
      const prediction = await classifyImage(jpeg);
      if (!blur.validClassification(prediction)) throw new Error('Invalid classification');
      item.serverArgmax = prediction.predicted_class;
      const actualBlur = row.label !== 'sharp';
      const serverBlur = item.serverArgmax !== 'sharp';
      server.correct += Number(item.serverArgmax === row.label);
      server.dangerousFlips += Number(actualBlur && !serverBlur);
      server.falseBlurry += Number(!actualBlur && serverBlur);
      for (const [sensitivity, threshold] of Object.entries(blur.SENSITIVITY_TO_THRESHOLD)) {
        for (const [filterName, categoryFilter] of Object.entries(filters)) {
          const key = `${sensitivity}:${filterName}`;
          const flagged = blur.mapClassification(prediction, threshold, categoryFilter, '').isBlurry;
          const expected = actualBlur && (!categoryFilter || categoryFilter.has(row.label));
          item.decisions[key] = flagged;
          policies[key].correct += Number(flagged === expected);
          policies[key].dangerousFlips += Number(expected && !flagged);
          policies[key].falseBlurry += Number(!actualBlur && flagged);
        }
      }
      item.status = 'classified';
    } catch (_error) {
      // Each failed input stays in every denominator; no local path or server error is emitted.
    }
    if (item.status === 'unknown') {
      server.unknown++;
      for (const policy of Object.values(policies)) policy.unknown++;
    }
  }
  return { total: records.length, unknown: server.unknown, complete: server.unknown === 0,
    server, policies, items };
}

if (require.main === module) {
  (async () => {
    if (process.argv.length < 3 || !process.env.BATCH_BLUR_AI_URL) throw new Error('Missing input or URL');
    const manifest = path.resolve(process.argv[2]);
    const rows = JSON.parse(await fs.promises.readFile(manifest, 'utf8'));
    const records = rows.map(row => ({ ...row, file: path.resolve(path.dirname(manifest), row.file) }));
    const custom = process.argv[3] ? process.argv[3].split(',') : [];
    const report = await evaluate(records, classify, custom);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.complete) process.exitCode = 2;
  })().catch(() => {
    process.stderr.write('Blur policy evaluation failed; check input and environment.\n');
    process.exitCode = 1;
  });
}

module.exports = { evaluate };
