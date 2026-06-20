import { XMLElement } from './utils/xml-element.js';

export interface Component {
  readonly category?: string;
  readonly softwareVersion: string;
  readonly serialNumber: string;
}

export function componentFromElement(
  element: XMLElement
): Component | undefined {
  if (!element.hasChildren(['softwareVersion', 'serialNumber'])) {
    return undefined;
  }
  const softwareVersion = element.getText('softwareVersion');
  const serialNumber = element.getText('serialNumber');
  if (!softwareVersion || !serialNumber) {
    return undefined;
  }
  return {
    category: element.getText('componentCategory') ?? undefined,
    softwareVersion,
    serialNumber,
  };
}
