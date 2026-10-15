import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer } from 'vite';

let server;

beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
});

afterAll(async () => {
  await server?.close();
});

it('serves a default export for the batch naming module imported by BatchPreview in Vite dev', async () => {
  const preview = (await server.transformRequest('/src/components/PreviewPanel/BatchPreview.jsx')).code;
  const namingPath = preview.match(/import batchNaming from ["']([^"']*batchNaming\.js)["']/)?.[1];
  expect(namingPath).toBeDefined();

  const naming = (await server.transformRequest(namingPath)).code;
  expect(naming).toMatch(/\bexport\s+default\b/);
  expect(naming).not.toMatch(/\bmodule\.exports\b/);
});
