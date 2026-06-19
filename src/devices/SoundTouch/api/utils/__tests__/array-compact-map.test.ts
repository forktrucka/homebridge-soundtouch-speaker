import { describe, expect, test } from '@jest/globals';
import { compactMap } from '../array-compact-map.js';

describe('compactMap', () => {
  test('maps values like Array.map when transform never returns undefined', () => {
    const result = compactMap([1, 2, 3], (n) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test('drops entries for which transform returns undefined', () => {
    const result = compactMap([1, 2, 3, 4], (n) =>
      n % 2 === 0 ? n : undefined
    );
    expect(result).toEqual([2, 4]);
  });

  test('returns an empty array for an empty input', () => {
    const result = compactMap<number, number>([], (n) => n);
    expect(result).toEqual([]);
  });

  test('returns an empty array when every entry maps to undefined', () => {
    const result = compactMap([1, 2, 3], () => undefined);
    expect(result).toEqual([]);
  });

  test('passes index and source array to the transform', () => {
    const indexes: number[] = [];
    const arrays: number[][] = [];
    const source = [10, 20];
    compactMap(source, (e, index, array) => {
      indexes.push(index);
      arrays.push(array);
      return e;
    });
    expect(indexes).toEqual([0, 1]);
    expect(arrays).toEqual([source, source]);
  });

  test('keeps falsy values other than undefined', () => {
    const result = compactMap([0, null, '', false, undefined], (e) => e);
    expect(result).toEqual([0, null, '', false]);
  });
});
