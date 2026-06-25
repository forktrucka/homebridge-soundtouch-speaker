import { SourceStatus } from './special-types.js';
import { compactMap, XMLElement } from './utils/index.js';

export interface Sources {
  readonly deviceId: string;
  readonly items: Source[];
}

export interface Source {
  readonly name: string;
  readonly source: string;
  readonly sourceAccount: string;
  readonly status: SourceStatus;
  readonly isLocal: boolean;
  readonly isMultiroomAllowed: boolean;
}

export function sourceFromElement(element: XMLElement): Source | undefined {
  if (!element.hasAttributes(['source', 'status'])) {
    return undefined;
  }
  const source = element.getAttribute('source');
  const status = element.getAttribute('status');
  if (!source || !status) {
    return undefined;
  }
  const name = element.getText() || source;
  return {
    source,
    name,
    sourceAccount: element.getAttribute('sourceAccount') || '',
    status: status as SourceStatus,
    isLocal: element.getAttribute('isLocal') === 'true',
    isMultiroomAllowed: element.getAttribute('multiroomallowed') === 'true',
  };
}

export function sourcesFromElement(element: XMLElement): Sources | undefined {
  if (!element.hasAttribute('deviceID')) {
    return undefined;
  }
  const deviceId = element.getAttribute('deviceID');
  if (!deviceId) {
    return undefined;
  }
  return {
    deviceId,
    items: compactMap(element.getList('sourceItem'), sourceFromElement),
  };
}
