import { describe, expect, test } from '@jest/globals';
import { memberFromElement } from '../member.js';
import { XMLElement } from '../utils/xml-element.js';

describe('memberFromElement', () => {
  test('parses device id from text and ip from attribute', () => {
    const el = new XMLElement({ $: { ipaddress: '10.0.0.5' }, _: 'DEV-A' });
    expect(memberFromElement(el)).toEqual({
      deviceId: 'DEV-A',
      ipAddress: '10.0.0.5',
    });
  });

  test('returns undefined when the ipaddress attribute is missing', () => {
    const el = new XMLElement({ _: 'DEV-A' });
    expect(memberFromElement(el)).toBeUndefined();
  });

  test('returns undefined when the device id text is missing', () => {
    const el = new XMLElement({ $: { ipaddress: '10.0.0.5' } });
    expect(memberFromElement(el)).toBeUndefined();
  });
});
