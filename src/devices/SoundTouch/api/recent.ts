import { XMLElement } from './utils/xml-element.js';
import { ContentItem, contentItemFromElement } from './content-item.js';

export interface Recent {
  readonly contentItem: ContentItem;
  readonly utcTime?: Date;
}

export function recentFromElement(element: XMLElement): Recent | undefined {
  if (!element.hasChild('ContentItem')) {
    return undefined;
  }
  const contentItemElement = element.getChild('ContentItem');
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
