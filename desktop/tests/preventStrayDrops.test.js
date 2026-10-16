/**
 * Tests for src/utils/preventStrayDrops.js
 *
 * A file dropped outside the drop zones must never open in the app window
 * (C-16), and the guard must not hide drag events from other listeners.
 */

import { describe, it, expect } from 'vitest';
import { preventStrayDrops } from '../src/utils/preventStrayDrops.js';

describe('preventStrayDrops', () => {
  it('cancels the default action of dragover and drop', () => {
    const target = new EventTarget();
    preventStrayDrops(target);

    for (const type of ['dragover', 'drop']) {
      const event = new Event(type, { cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('leaves listeners added before and after the guard running', () => {
    const target = new EventTarget();
    const seen = [];
    target.addEventListener('drop', () => seen.push('before'));
    preventStrayDrops(target);
    target.addEventListener('drop', () => seen.push('after'));

    target.dispatchEvent(new Event('drop', { cancelable: true }));

    expect(seen).toEqual(['before', 'after']);
  });
});
