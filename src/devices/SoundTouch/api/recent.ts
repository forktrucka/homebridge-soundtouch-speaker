import { XMLElement } from './utils/xml-element.js';
import { ContentItem, contentItemFromElement } from './content-item.js';

export interface Recent {
  readonly contentItem: ContentItem;
  readonly utcTime?: Date;
}

export function recentFromElement(element: XMLElement): Recent | undefined {
  // Unlike /presets (which nests <ContentItem>), a real device's /recents
  // response nests a lowercase <contentItem> — confirmed against a live
  // speaker on 2026-07-18. xml2js tag matching is case-sensitive.
  if (!element.hasChild('contentItem')) {
    return undefined;
  }
  const contentItemElement = element.getChild('contentItem');
  if (!contentItemElement) {
    return undefined;
  }
  const contentItem = contentItemFromElement(contentItemElement);
  if (!contentItem) {
    return undefined;
  }
  const utcTime = element.getAttribute('utcTime');
  return {
    contentItem,
    utcTime: utcTime ? new Date(parseInt(utcTime) * 1000) : undefined,
  };
}
