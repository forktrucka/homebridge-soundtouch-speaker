import { describe, expect, it } from '@jest/globals';
import { artFromElement } from '../art.js';
import { ArtStatus } from '../special-types.js';
import { XMLElement } from '../utils/xml-element.js';

describe('artFromElement', () => {
  it('parses art url and status', () => {
    const el = new XMLElement({
      $: { artImageStatus: 'IMAGE_PRESENT' },
      _: 'http://example.com/art.jpg',
    });
    expect(artFromElement(el)).toEqual({
      url: 'http://example.com/art.jpg',
      status: ArtStatus.imagePresent,
    });
  });

  it('returns undefined when the status attribute is missing', () => {
    const el = new XMLElement({ _: 'http://example.com/art.jpg' });
    expect(artFromElement(el)).toBeUndefined();
  });

  it('returns undefined when there is no url text', () => {
    const el = new XMLElement({ $: { artImageStatus: 'IMAGE_PRESENT' } });
    expect(artFromElement(el)).toBeUndefined();
  });
});
