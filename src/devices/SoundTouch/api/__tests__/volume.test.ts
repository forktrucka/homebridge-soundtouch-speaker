import { describe, expect, test } from '@jest/globals';
import { volumeFromElement } from '../volume.js';
import { XMLElement } from '../utils/xml-element.js';

describe('volumeFromElement', () => {
  test('parses target, actual and mute state', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      targetvolume: ['40'],
      actualvolume: ['38'],
      muteenabled: ['true'],
    });
    expect(volumeFromElement(el)).toEqual({
      deviceId: 'DEV1',
      target: 40,
      actual: 38,
      isMuted: true,
    });
  });

  test('treats missing mute flag as not muted', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      targetvolume: ['40'],
      actualvolume: ['38'],
    });
    expect(volumeFromElement(el)?.isMuted).toBe(false);
  });

  test('returns undefined when volume values are missing', () => {
    const el = new XMLElement({ $: { deviceID: 'DEV1' } });
    expect(volumeFromElement(el)).toBeUndefined();
  });

  test('returns undefined when the deviceID attribute is missing', () => {
    const el = new XMLElement({ targetvolume: ['40'], actualvolume: ['38'] });
    expect(volumeFromElement(el)).toBeUndefined();
  });
});
