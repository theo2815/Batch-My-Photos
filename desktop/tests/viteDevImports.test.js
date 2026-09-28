import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer } from 'vite';
import { init, parse } from 'es-module-lexer';

let server;

beforeAll(async () => {
  await init;
  server = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
});

afterAll(async () => {
  await server?.close();
});

it('serves a default export for the batch naming module imported by BatchPreview in Vite dev', async () => {
  const preview = (await server.transformRequest('/src/components/PreviewPanel/BatchPreview.jsx')).code;
  const [imports] = parse(preview);
  const namingPath = imports.map(({ n }) => n).find((path) => path?.includes('batchNaming'));
  expect(namingPath).toBeDefined();

  const naming = (await server.transformRequest(namingPath)).code;
  const [, exports] = parse(naming);
  expect(exports.map(({ n }) => n)).toContain('default');
});
