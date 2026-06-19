import { describe, expect, test } from '@jest/globals';
import { timeFromElement } from '../time.js';
import { XMLElement } from '../utils/xml-element.js';

describe('timeFromElement', () => {
  test('parses current text and total attribute', () => {
    const el = new XMLElement({ $: { total: '240' }, _: '57' });
    expect(timeFromElement(el)).toEqual({ current: 57, total: 240 });
  });

  test('defaults to zero when values are absent', () => {
    const el = new XMLElement({});
    expect(timeFromElement(el)).toEqual({ current: 0, total: 0 });
  });
});
