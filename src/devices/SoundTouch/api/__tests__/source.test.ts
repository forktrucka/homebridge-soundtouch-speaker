import { describe, expect, test } from '@jest/globals';
import { sourceFromElement, sourcesFromElement } from '../source.js';
import { SourceStatus } from '../special-types.js';
import { XMLElement } from '../utils/xml-element.js';

describe('sourceFromElement', () => {
  test('parses a source item with all flags', () => {
    const el = new XMLElement({
      $: {
        source: 'AUX',
        status: 'READY',
        sourceAccount: 'acct',
        isLocal: 'true',
        multiroomallowed: 'true',
      },
      _: 'AUX IN',
    });
    expect(sourceFromElement(el)).toEqual({
      source: 'AUX',
      name: 'AUX IN',
      sourceAccount: 'acct',
      status: SourceStatus.ready,
      isLocal: true,
      isMultiroomAllowed: true,
    });
  });

  test('defaults flags and account when absent', () => {
    const el = new XMLElement({
      $: { source: 'BLUETOOTH', status: 'UNAVAILABLE' },
      _: 'Bluetooth',
    });
    expect(sourceFromElement(el)).toEqual({
      source: 'BLUETOOTH',
      name: 'Bluetooth',
      sourceAccount: '',
      status: SourceStatus.unavailable,
      isLocal: false,
      isMultiroomAllowed: false,
    });
  });

  test('returns undefined when required attributes are missing', () => {
    const el = new XMLElement({ $: { source: 'AUX' }, _: 'AUX' });
    expect(sourceFromElement(el)).toBeUndefined();
  });

  test('returns undefined when the name text is missing', () => {
    const el = new XMLElement({ $: { source: 'AUX', status: 'READY' } });
    expect(sourceFromElement(el)).toBeUndefined();
  });
});

describe('sourcesFromElement', () => {
  test('parses the device id and its source items', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      sourceItem: [
        { $: { source: 'AUX', status: 'READY' }, _: 'AUX IN' },
        { $: { source: 'BLUETOOTH', status: 'READY' }, _: 'Bluetooth' },
      ],
    });
    const result = sourcesFromElement(el);
    expect(result?.deviceId).toBe('DEV1');
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0].source).toBe('AUX');
  });

  test('skips malformed source items', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      sourceItem: [
        { $: { source: 'AUX', status: 'READY' }, _: 'AUX IN' },
        { $: { source: 'BAD' }, _: 'Bad' },
      ],
    });
    expect(sourcesFromElement(el)?.items).toHaveLength(1);
  });

  test('returns undefined when the deviceID attribute is missing', () => {
    const el = new XMLElement({ sourceItem: [] });
    expect(sourcesFromElement(el)).toBeUndefined();
  });
});
