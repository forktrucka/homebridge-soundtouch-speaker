import { describe, expect, test } from '@jest/globals';
import { componentFromElement } from '../component.js';
import { XMLElement } from '../utils/xml-element.js';

describe('componentFromElement', () => {
  test('parses a component with software version and serial number', () => {
    const el = new XMLElement({
      softwareVersion: ['1.2.3'],
      serialNumber: ['SN-001'],
    });
    expect(componentFromElement(el)).toEqual({
      category: undefined,
      softwareVersion: '1.2.3',
      serialNumber: 'SN-001',
    });
  });

  test('parses componentCategory when present', () => {
    const el = new XMLElement({
      componentCategory: ['DEVICE'],
      softwareVersion: ['1.2.3'],
      serialNumber: ['SN-001'],
    });
    expect(componentFromElement(el)).toEqual({
      category: 'DEVICE',
      softwareVersion: '1.2.3',
      serialNumber: 'SN-001',
    });
  });

  test('returns undefined when children are missing', () => {
    const el = new XMLElement({ softwareVersion: ['1.2.3'] });
    expect(componentFromElement(el)).toBeUndefined();
  });

  test('returns undefined when a child is empty', () => {
    const el = new XMLElement({ softwareVersion: [], serialNumber: [] });
    expect(componentFromElement(el)).toBeUndefined();
  });
});
