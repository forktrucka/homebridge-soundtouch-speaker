import { describe, expect, test } from '@jest/globals';
import { connectionStatusInfoFromElement } from '../connection-status-info.js';
import { XMLElement } from '../utils/xml-element.js';

describe('connectionStatusInfoFromElement', () => {
  test('parses status and device name attributes', () => {
    const el = new XMLElement({
      $: { status: 'CONNECTED', deviceName: 'Phone' },
    });
    expect(connectionStatusInfoFromElement(el)).toEqual({
      status: 'CONNECTED',
      deviceName: 'Phone',
    });
  });

  test('returns undefined fields when attributes are absent', () => {
    const el = new XMLElement({});
    expect(connectionStatusInfoFromElement(el)).toEqual({
      status: undefined,
      deviceName: undefined,
    });
  });
});
