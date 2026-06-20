import { describe, expect, it } from '@jest/globals';
import { groupFromElement, roleFromElement } from '../group.js';
import { GroupLocation } from '../special-types.js';
import { XMLElement } from '../utils/xml-element.js';

describe('roleFromElement', () => {
  it('parses a role into device id, location and ip address', () => {
    const el = new XMLElement({
      deviceId: ['DEV-1'],
      role: ['LEFT'],
      ipAddress: ['10.0.0.1'],
    });
    expect(roleFromElement(el)).toEqual({
      deviceId: 'DEV-1',
      ipAddress: '10.0.0.1',
      location: GroupLocation.left,
    });
  });

  it('returns undefined when children are missing', () => {
    const el = new XMLElement({ deviceId: ['DEV-1'] });
    expect(roleFromElement(el)).toBeUndefined();
  });
});

describe('groupFromElement', () => {
  function makeGroupData() {
    return {
      $: { id: 'GROUP-1' },
      name: ['Downstairs'],
      masterDeviceId: ['DEV-1'],
      status: ['GROUP_OK'],
      roles: [
        {
          groupRole: [
            { deviceId: ['DEV-1'], role: ['LEFT'], ipAddress: ['10.0.0.1'] },
            { deviceId: ['DEV-2'], role: ['RIGHT'], ipAddress: ['10.0.0.2'] },
          ],
        },
      ],
    };
  }

  it('parses a full group with its roles', () => {
    const result = groupFromElement(new XMLElement(makeGroupData()));
    expect(result).toEqual({
      id: 'GROUP-1',
      name: 'Downstairs',
      masterDeviceId: 'DEV-1',
      status: 'GROUP_OK',
      roles: [
        {
          deviceId: 'DEV-1',
          ipAddress: '10.0.0.1',
          location: GroupLocation.left,
        },
        {
          deviceId: 'DEV-2',
          ipAddress: '10.0.0.2',
          location: GroupLocation.right,
        },
      ],
    });
  });

  it('skips malformed roles', () => {
    const data = makeGroupData();
    data.roles[0].groupRole.push({ deviceId: ['DEV-3'] } as never);
    expect(groupFromElement(new XMLElement(data))?.roles).toHaveLength(2);
  });

  it('returns undefined when the id attribute is missing', () => {
    const data = makeGroupData();
    data.$ = {} as never;
    expect(groupFromElement(new XMLElement(data))).toBeUndefined();
  });

  it('returns undefined when required children are missing', () => {
    const el = new XMLElement({ $: { id: 'GROUP-1' } });
    expect(groupFromElement(el)).toBeUndefined();
  });
});
