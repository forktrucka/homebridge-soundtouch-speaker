/* eslint-disable  @typescript-eslint/no-explicit-any */
import { XMLElement } from './utils/index.js';

export interface ContentItem {
  readonly source: string;
  readonly sourceAccount: string;
  readonly type?: string;
  readonly isPresetable?: boolean;
  readonly location?: string;
  readonly itemName?: string;
  readonly containerArt?: string;
}
export function contentItemFromElement(
  element: XMLElement
): ContentItem | undefined {
  if (!element.hasAttribute('source')) {
    return undefined;
  }
  const source = element.getAttribute('source');
  if (!source) {
    return undefined;
  }
  return {
    source,
    sourceAccount: element.getAttribute('sourceAccount') || '',
    location: element.getAttribute('location'),
    isPresetable: element.getAttribute('isPresetable') === 'true',
    itemName: element.getText('itemName'),
    containerArt: element.getAttribute('containerArt'),
  };
}
export function contentItemToElement(contentItem: ContentItem): XMLElement {
  const data: any = {
    $: {
      source: contentItem.source,
      sourceAccount: contentItem.sourceAccount,
    },
  };
  if (contentItem.type !== undefined) {
    data.$.type = contentItem.type;
  }
  if (contentItem.isPresetable !== undefined) {
    data.$.isPresetable = contentItem.isPresetable;
  }
  if (contentItem.location !== undefined) {
    data.$.location = contentItem.location;
  }
  if (contentItem.containerArt !== undefined) {
    data.$.containerArt = contentItem.containerArt;
  }
  if (contentItem.itemName !== undefined) {
    data.itemName = contentItem.itemName;
  }
  return new XMLElement({
    ContentItem: data,
  });
}
