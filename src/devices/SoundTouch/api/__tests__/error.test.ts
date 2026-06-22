import { describe, expect, it } from '@jest/globals';
import { APIErrors, errorFromElement } from '../error.js';
import { XMLElement } from '../utils/xml-element.js';

describe('errorFromElement', () => {
  it('parses value, name, severity and message', () => {
    const el = new XMLElement({
      $: { value: '401', name: 'HTTP_ERROR', severity: 'High' },
      _: 'Unauthorized',
    });
    expect(errorFromElement(el)).toEqual({
      value: 401,
      name: 'HTTP_ERROR',
      severity: 'High',
      message: 'Unauthorized',
    });
  });

  it('falls back to value 0 when the value is not numeric', () => {
    const el = new XMLElement({
      $: { value: 'NaN', name: 'X', severity: 'Low' },
    });
    expect(errorFromElement(el)?.value).toBe(0);
  });

  it('returns undefined when required attributes are missing', () => {
    const el = new XMLElement({ $: { value: '1', name: 'X' } });
    expect(errorFromElement(el)).toBeUndefined();
  });
});

describe('APIErrors', () => {
  it('fromElement collects all errors and the device id', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      error: [
        { $: { value: '1', name: 'A', severity: 'High' }, _: 'msg a' },
        { $: { value: '2', name: 'B', severity: 'Low' }, _: 'msg b' },
      ],
    });
    const errors = APIErrors.fromElement(el);
    expect(errors?.deviceId).toBe('DEV1');
    expect(errors?.errors).toHaveLength(2);
  });

  it('fromElement skips malformed error entries', () => {
    const el = new XMLElement({
      $: { deviceID: 'DEV1' },
      error: [
        { $: { value: '1', name: 'A', severity: 'High' } },
        { $: { value: '2' } },
      ],
    });
    expect(APIErrors.fromElement(el)?.errors).toHaveLength(1);
  });

  it('is an Error carrying device id and a descriptive message', () => {
    const errors = APIErrors.create(
      [{ value: 1, name: 'A', severity: 'High' }],
      'DEV1'
    );
    expect(errors).toBeInstanceOf(Error);
    expect(errors.deviceId).toBe('DEV1');
    expect(errors.message).toContain('DEV1');
    expect(errors.message).toContain('"name":"A"');
  });
});
