import { describe, expect, it } from '@jest/globals';
import { recentFromElement } from '../recent.js';
import { XMLElement } from '../utils/xml-element.js';

describe('recentFromElement', () => {
  it('parses the (lowercase) contentItem and utcTime', () => {
    // A real device's /recents response nests a lowercase <contentItem>,
    // unlike /presets which nests <ContentItem> — confirmed against a live
    // speaker on 2026-07-18.
    const el = new XMLElement({
      $: { utcTime: '1600000000' },
      contentItem: [
        { $: { source: 'SPOTIFY', sourceAccount: 'acct' }, itemName: ['Mix'] },
      ],
    });

    const result = recentFromElement(el);

    expect(result?.contentItem.source).toBe('SPOTIFY');
    expect(result?.contentItem.itemName).toBe('Mix');
    expect(result?.utcTime).toEqual(new Date(1600000000 * 1000));
  });

  it('returns undefined utcTime when the attribute is absent', () => {
    const el = new XMLElement({
      contentItem: [{ $: { source: 'AUX' } }],
    });

    const result = recentFromElement(el);

    expect(result?.utcTime).toBeUndefined();
  });

  it('returns undefined when the contentItem child is missing', () => {
    const el = new XMLElement({ $: { utcTime: '1' } });

    expect(recentFromElement(el)).toBeUndefined();
  });

  it('returns undefined when the content item is malformed', () => {
    const el = new XMLElement({
      $: { utcTime: '1' },
      contentItem: [{ $: {} }],
    });

    expect(recentFromElement(el)).toBeUndefined();
  });
});
