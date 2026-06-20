import { describe, expect, it } from '@jest/globals';
import { bassFromElement } from '../bass.js';
import { XMLElement } from '../utils/xml-element.js';

describe('bassFromElement', () => {
  it('parses target and actual bass', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      targetbass: ['-3'],
      actualbass: ['-2'],
    });
    expect(bassFromElement(el)).toEqual({
      deviceId: 'DEV1',
      target: -3,
      actual: -2,
    });
  });

  it('defaults target and actual to 0 when absent', () => {
    const el = new XMLElement({ $: { deviceID: 'DEV1' } });
    expect(bassFromElement(el)).toEqual({
      deviceId: 'DEV1',
      target: 0,
      actual: 0,
    });
  });

  it('returns undefined when the deviceID attribute is missing', () => {
    const el = new XMLElement({ targetbass: ['0'], actualbass: ['0'] });
    expect(bassFromElement(el)).toBeUndefined();
  });
});
