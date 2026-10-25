import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');

describe('content security policy', () => {
  it("index.html blocks <base> and form posts: base-uri 'none', form-action 'none'", () => {
    const policy = read('index.html').match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
  });

  it('the packaged window policy has the same two rules', () => {
    const packaged = read('src/main/windowManager.js').split('\n').find((line) => line.includes("default-src 'self'; script-src 'self';"));
    expect(packaged).toContain("base-uri 'none'");
    expect(packaged).toContain("form-action 'none'");
  });
});
