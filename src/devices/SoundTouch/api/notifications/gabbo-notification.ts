import { parseString } from 'xml2js';
import { promisify } from 'util';
import { Endpoints } from '../endpoints.js';
import { XMLElement } from '../utils/index.js';

/**
 * The SoundTouch speaker pushes `<updates>` frames over its `gabbo` WebSocket
 * (port 8080) when state changes. Most are "tickles" — they name *what*
 * changed; the client re-fetches the matching GET endpoint. A few carry data
 * inline. This module turns a raw `<updates>` frame into typed notifications,
 * each naming the endpoint to re-GET (where one applies).
 *
 * Reference: `soundtouch-api-expert/api-reference.md` → "WebSocket
 * notifications". This is the parse/dispatch logic Spike C validates against
 * the documented frame shapes.
 */

type GabboNotificationType =
  | 'volume'
  | 'nowPlaying'
  | 'bass'
  | 'zone'
  | 'presets'
  | 'sources'
  | 'info'
  | 'nowSelection'
  | 'recents'
  | 'connectionState'
  | 'swUpdateStatus'
  | 'siteSurveyResults'
  | 'acctMode';

export interface GabboNotification {
  readonly type: GabboNotificationType;
  /** The GET endpoint to re-fetch for this change, when the tickle carries no
   *  usable inline data. `undefined` ⇒ inline-only or no action needed. */
  readonly refetch?: Endpoints;
  readonly deviceId?: string;
  /** The full `<updates>` element, so inline-data consumers can read it. */
  readonly element: XMLElement;
}

interface Mapping {
  readonly type: GabboNotificationType;
  readonly refetch?: Endpoints;
}

// `<updates>` child element name → notification type + the endpoint to re-GET.
const UPDATE_MAP: Readonly<Record<string, Mapping>> = {
  volumeUpdated: { type: 'volume', refetch: Endpoints.volume },
  nowPlayingUpdated: { type: 'nowPlaying', refetch: Endpoints.nowPlaying },
  bassUpdated: { type: 'bass', refetch: Endpoints.bass },
  zoneUpdated: { type: 'zone', refetch: Endpoints.getZone },
  presetsUpdated: { type: 'presets', refetch: Endpoints.presets },
  sourcesUpdated: { type: 'sources', refetch: Endpoints.sources },
  infoUpdated: { type: 'info', refetch: Endpoints.info },
  nowSelectionUpdated: { type: 'nowSelection' },
  recentsUpdated: { type: 'recents' },
  connectionStateUpdated: { type: 'connectionState' },
  swUpdateStatusUpdated: { type: 'swUpdateStatus' },
  siteSurveyResultsUpdated: { type: 'siteSurveyResults' },
  acctModeUpdated: { type: 'acctMode' },
};

const parseXML = promisify(
  (xml: string, cb: (err: Error | null, res: unknown) => void) =>
    parseString(xml, { trim: true }, cb)
);

/**
 * Map a parsed `<updates>` element to the notifications it carries. A frame
 * usually carries a single change; an empty frame (heartbeat) yields none.
 */
function notificationsFromUpdates(updates: XMLElement): GabboNotification[] {
  const deviceId = updates.getAttribute('deviceID');

  return Object.entries(UPDATE_MAP)
    .filter(([child]) => updates.hasChild(child))
    .map(([, mapping]) => ({
      type: mapping.type,
      refetch: mapping.refetch,
      deviceId,
      element: updates,
    }));
}

/** Parse a raw `<updates>` WebSocket frame into typed notifications. */
export async function parseGabboFrame(
  xml: string
): Promise<GabboNotification[]> {
  const data = await parseXML(xml);
  const root = new XMLElement(data);
  const updates = root.getChild('updates');
  if (!updates) {
    return [];
  }
  return notificationsFromUpdates(updates);
}
