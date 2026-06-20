import { describe, expect, it } from '@jest/globals';
import { presetFromElement } from '../preset.js';
import { XMLElement } from '../utils/xml-element.js';

describe('presetFromElement', () => {
  it('parses id, dates and content item', () => {
    const el = new XMLElement({
      $: { id: '3', createdOn: '1600000000', updateOn: '1600000500' },
      ContentItem: [
        { $: { source: 'SPOTIFY', sourceAccount: 'acct' }, itemName: ['Mix'] },
      ],
    });
    const result = presetFromElement(el);
    expect(result?.id).toBe(3);
    expect(result?.createdDate).toEqual(new Date(1600000000 * 1000));
    expect(result?.updatedDate).toEqual(new Date(1600000500 * 1000));
    expect(result?.contentItem.source).toBe('SPOTIFY');
    expect(result?.contentItem.itemName).toBe('Mix');
  });

  it('returns undefined when attributes are missing', () => {
    const el = new XMLElement({
      $: { id: '3' },
      ContentItem: [{ $: { source: 'SPOTIFY' } }],
    });
    expect(presetFromElement(el)).toBeUndefined();
  });

  it('returns undefined when the ContentItem child is missing', () => {
    const el = new XMLElement({
      $: { id: '3', createdOn: '1', updatedOn: '2' },
    });
    expect(presetFromElement(el)).toBeUndefined();
  });

  it('returns undefined when the content item is malformed', () => {
    const el = new XMLElement({
      $: { id: '3', createdOn: '1', updatedOn: '2' },
      ContentItem: [{ $: {} }],
    });
    expect(presetFromElement(el)).toBeUndefined();
  });
});
