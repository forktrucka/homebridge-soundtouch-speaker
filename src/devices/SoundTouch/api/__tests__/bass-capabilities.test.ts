import { describe, expect, test } from '@jest/globals';
import { bassCapabilitiesFromElement } from '../bass-capabilities.js';
import { XMLElement } from '../utils/xml-element.js';

describe('bassCapabilitiesFromElement', () => {
  test('parses availability and bass range', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      bassAvailable: ['true'],
      bassMin: ['-9'],
      bassMax: ['0'],
      bassDefault: ['-5'],
    });
    expect(bassCapabilitiesFromElement(el)).toEqual({
      deviceId: 'DEV1',
      isAvailable: true,
      min: -9,
      max: 0,
      default: -5,
    });
  });

  test('marks unavailable and leaves range undefined when absent', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      bassAvailable: ['false'],
    });
    expect(bassCapabilitiesFromElement(el)).toEqual({
      deviceId: 'DEV1',
      isAvailable: false,
      min: undefined,
      max: undefined,
      default: undefined,
    });
  });

  test('returns undefined when the deviceID attribute is missing', () => {
    const el = new XMLElement({ bassAvailable: ['true'] });
    expect(bassCapabilitiesFromElement(el)).toBeUndefined();
  });
});
