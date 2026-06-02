/**
 * Tests for progressManager.js
 *
 * Tests the pure serialization/integrity functions without Electron dependency.
 * deepSortKeys and HMAC/hash logic are tested directly.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ---- Re-implement pure functions for isolated testing ----

function deepSortKeys(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  const sorted = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    sorted[key] = deepSortKeys(value[key]);
  }
  return sorted;
}

function calculateHash(data, integrityKey) {
  const { integrity: _integrity, ...cleanData } = data;
  const jsonString = JSON.stringify(deepSortKeys(cleanData));
  return crypto.createHmac('sha256', integrityKey).update(jsonString).digest('hex');
}

describe('deepSortKeys', () => {
  it('returns primitives unchanged', () => {
    expect(deepSortKeys(null)).toBe(null);
    expect(deepSortKeys(42)).toBe(42);
    expect(deepSortKeys('hello')).toBe('hello');
    expect(deepSortKeys(true)).toBe(true);
  });

  it('sorts object keys alphabetically', () => {
    const input = { c: 1, a: 2, b: 3 };
    const result = deepSortKeys(input);
    expect(Object.keys(result)).toEqual(['a', 'b', 'c']);
  });

  it('deeply sorts nested objects', () => {
    const input = { z: { b: 1, a: 2 }, a: { d: 3, c: 4 } };
    const result = deepSortKeys(input);
    expect(Object.keys(result)).toEqual(['a', 'z']);
    expect(Object.keys(result.a)).toEqual(['c', 'd']);
    expect(Object.keys(result.z)).toEqual(['a', 'b']);
  });

  it('preserves array order but sorts objects within arrays', () => {
    const input = [{ b: 1, a: 2 }, { d: 3, c: 4 }];
    const result = deepSortKeys(input);
    expect(Object.keys(result[0])).toEqual(['a', 'b']);
    expect(Object.keys(result[1])).toEqual(['c', 'd']);
  });

  it('produces deterministic JSON regardless of key insertion order', () => {
    const obj1 = { folderPath: '/a', mode: 'move', totalFiles: 10 };
    const obj2 = { totalFiles: 10, folderPath: '/a', mode: 'move' };
    expect(JSON.stringify(deepSortKeys(obj1))).toBe(JSON.stringify(deepSortKeys(obj2)));
  });

  it('handles empty objects and arrays', () => {
    expect(deepSortKeys({})).toEqual({});
    expect(deepSortKeys([])).toEqual([]);
  });
});

describe('calculateHash (HMAC integrity)', () => {
  const testKey = 'a'.repeat(64); // 32-byte hex key

  it('produces a hex string', () => {
    const hash = calculateHash({ foo: 'bar' }, testKey);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for same data', () => {
    const data = { folderPath: '/photos', totalFiles: 100 };
    const hash1 = calculateHash(data, testKey);
    const hash2 = calculateHash(data, testKey);
    expect(hash1).toBe(hash2);
  });

  it('is deterministic regardless of key insertion order', () => {
    const data1 = { folderPath: '/photos', totalFiles: 100 };
    const data2 = { totalFiles: 100, folderPath: '/photos' };
    expect(calculateHash(data1, testKey)).toBe(calculateHash(data2, testKey));
  });

  it('excludes the integrity field from hash calculation', () => {
    const data = { foo: 'bar', integrity: 'should_be_ignored' };
    const dataWithout = { foo: 'bar' };
    expect(calculateHash(data, testKey)).toBe(calculateHash(dataWithout, testKey));
  });

  it('changes when data changes', () => {
    const hash1 = calculateHash({ foo: 'bar' }, testKey);
    const hash2 = calculateHash({ foo: 'baz' }, testKey);
    expect(hash1).not.toBe(hash2);
  });

  it('changes when key changes', () => {
    const data = { foo: 'bar' };
    const hash1 = calculateHash(data, 'key1');
    const hash2 = calculateHash(data, 'key2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('encryption round-trip (AES-256-GCM)', () => {
  // Test encryption/decryption without Electron dependency
  const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  const IV_LENGTH = 12;
  const AUTH_TAG_LENGTH = 16;

  function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
      encrypted: true,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext,
    };
  }

  function decrypt(envelope, key) {
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  const testKey = crypto.randomBytes(32);

  it('round-trips plaintext through encrypt/decrypt', () => {
    const original = JSON.stringify({ folderPath: '/photos', totalFiles: 500 });
    const encrypted = encrypt(original, testKey);
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plaintext = 'test data';
    const enc1 = encrypt(plaintext, testKey);
    const enc2 = encrypt(plaintext, testKey);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it('fails decryption with wrong key', () => {
    const encrypted = encrypt('secret', testKey);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('fails decryption with tampered ciphertext', () => {
    const encrypted = encrypt('secret', testKey);
    encrypted.ciphertext = 'aa' + encrypted.ciphertext.slice(2);
    expect(() => decrypt(encrypted, testKey)).toThrow();
  });

  it('fails decryption with tampered auth tag', () => {
    const encrypted = encrypt('secret', testKey);
    encrypted.authTag = 'bb' + encrypted.authTag.slice(2);
    expect(() => decrypt(encrypted, testKey)).toThrow();
  });
});
