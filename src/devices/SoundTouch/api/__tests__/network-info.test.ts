import { describe, expect, it } from '@jest/globals';
import { networkInfoFromElement } from '../network-info.js';
import { XMLElement } from '../utils/xml-element.js';

describe('networkInfoFromElement', () => {
  it('parses mac and ip addresses', () => {
    const el = new XMLElement({
      macAddress: ['AA:BB:CC:DD:EE:FF'],
      ipAddress: ['192.168.1.50'],
    });
    expect(networkInfoFromElement(el)).toEqual({
      macAddress: 'AA:BB:CC:DD:EE:FF',
      ipAddress: '192.168.1.50',
    });
  });

  it('returns undefined when children are missing', () => {
    const el = new XMLElement({ macAddress: ['AA:BB:CC:DD:EE:FF'] });
    expect(networkInfoFromElement(el)).toBeUndefined();
  });

  it('returns undefined when a child is empty', () => {
    const el = new XMLElement({ macAddress: [], ipAddress: [] });
    expect(networkInfoFromElement(el)).toBeUndefined();
  });
});
