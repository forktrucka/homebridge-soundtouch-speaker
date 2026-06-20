import { describe, expect, it } from '@jest/globals';
import { infoFromElement } from '../info.js';
import { XMLElement } from '../utils/xml-element.js';

function makeInfoData() {
  return {
    $: { deviceID: 'DEV123' },
    name: ['Kitchen Speaker'],
    type: ['SoundTouch 10'],
    components: [
      {
        component: [
          { softwareVersion: ['1.0.0'], serialNumber: ['SN-1'] },
          { softwareVersion: ['2.0.0'], serialNumber: ['SN-2'] },
        ],
      },
    ],
    networkInfo: [
      { macAddress: ['AA:BB'], ipAddress: ['10.0.0.1'] },
      { macAddress: ['CC:DD'], ipAddress: ['10.0.0.2'] },
    ],
  };
}

describe('infoFromElement', () => {
  it('parses a full info element', () => {
    const result = infoFromElement(new XMLElement(makeInfoData()));
    expect(result).toEqual({
      deviceId: 'DEV123',
      name: 'Kitchen Speaker',
      type: 'SoundTouch 10',
      components: [
        { softwareVersion: '1.0.0', serialNumber: 'SN-1' },
        { softwareVersion: '2.0.0', serialNumber: 'SN-2' },
      ],
      networkInfo: [
        { macAddress: 'AA:BB', ipAddress: '10.0.0.1' },
        { macAddress: 'CC:DD', ipAddress: '10.0.0.2' },
      ],
    });
  });

  it('skips malformed components and network info entries', () => {
    const data = makeInfoData();
    data.components[0].component.push({
      softwareVersion: ['3.0.0'],
    } as never);
    data.networkInfo.push({ macAddress: ['EE:FF'] } as never);
    const result = infoFromElement(new XMLElement(data));
    expect(result?.components).toHaveLength(2);
    expect(result?.networkInfo).toHaveLength(2);
  });

  it('returns undefined when the deviceID attribute is missing', () => {
    const data = makeInfoData();
    data.$ = {} as never;
    expect(infoFromElement(new XMLElement(data))).toBeUndefined();
  });

  it('returns undefined when required children are missing', () => {
    const el = new XMLElement({ $: { deviceID: 'DEV123' } });
    expect(infoFromElement(el)).toBeUndefined();
  });
});
