import { describe, expect, it } from '@jest/globals';
import { zoneFromElement, zoneToElement } from '../zone.js';
import { XMLElement } from '../utils/xml-element.js';

describe('zoneFromElement', () => {
  it('parses master and members', () => {
    const el = new XMLElement({
      $: { master: 'MASTER-1' },
      member: [
        { $: { ipaddress: '10.0.0.1' }, _: 'DEV-1' },
        { $: { ipaddress: '10.0.0.2' }, _: 'DEV-2' },
      ],
    });
    expect(zoneFromElement(el)).toEqual({
      master: 'MASTER-1',
      members: [
        { deviceId: 'DEV-1', ipAddress: '10.0.0.1' },
        { deviceId: 'DEV-2', ipAddress: '10.0.0.2' },
      ],
    });
  });

  it('skips malformed members', () => {
    const el = new XMLElement({
      $: { master: 'MASTER-1' },
      member: [{ $: { ipaddress: '10.0.0.1' }, _: 'DEV-1' }, { _: 'DEV-2' }],
    });
    expect(zoneFromElement(el)?.members).toEqual([
      { deviceId: 'DEV-1', ipAddress: '10.0.0.1' },
    ]);
  });

  it('returns an empty member list when there are none', () => {
    const el = new XMLElement({ $: { master: 'MASTER-1' } });
    expect(zoneFromElement(el)).toEqual({ master: 'MASTER-1', members: [] });
  });

  it('returns undefined when the master attribute is missing', () => {
    const el = new XMLElement({ member: [] });
    expect(zoneFromElement(el)).toBeUndefined();
  });
});

describe('zoneToElement', () => {
  it('serializes master and members and round-trips', () => {
    const zone = {
      master: 'MASTER-1',
      members: [
        { deviceId: 'DEV-1', ipAddress: '10.0.0.1' },
        { deviceId: 'DEV-2', ipAddress: '10.0.0.2' },
      ],
    };
    const el = zoneToElement(zone);
    expect(el.data.zone.$).toEqual({ master: 'MASTER-1' });
    expect(zoneFromElement(new XMLElement(el.data.zone))).toEqual(zone);
  });
});
