import { describe, expect, it } from '@jest/globals';
import { parseGabboFrame } from '../gabbo-notification.js';
import { Endpoints } from '../../endpoints.js';

describe('parseGabboFrame', () => {
  it('maps a volume tickle to a volume re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><volumeUpdated/></updates>'
    );

    expect(notification.type).toBe('volume');
    expect(notification.refetch).toBe(Endpoints.volume);
    expect(notification.deviceId).toBe('DEV1');
  });

  it('maps a now-playing change to a now-playing re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><nowPlayingUpdated>' +
        '<nowPlaying source="SPOTIFY"/></nowPlayingUpdated></updates>'
    );

    expect(notification.type).toBe('nowPlaying');
    expect(notification.refetch).toBe(Endpoints.nowPlaying);
  });

  it('maps a bass tickle to a bass re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><bassUpdated/></updates>'
    );

    expect(notification.type).toBe('bass');
    expect(notification.refetch).toBe(Endpoints.bass);
  });

  it('maps a zone tickle to a getZone re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><zoneUpdated/></updates>'
    );

    expect(notification.type).toBe('zone');
    expect(notification.refetch).toBe(Endpoints.getZone);
  });

  it('maps an info tickle to an info re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><infoUpdated/></updates>'
    );

    expect(notification.type).toBe('info');
    expect(notification.refetch).toBe(Endpoints.info);
  });

  it('maps a presets tickle to a presets re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><presetsUpdated><presets/></presetsUpdated></updates>'
    );

    expect(notification.type).toBe('presets');
    expect(notification.refetch).toBe(Endpoints.presets);
  });

  it('maps a recents tickle to a recents re-fetch', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><recentsUpdated><recents/></recentsUpdated></updates>'
    );

    expect(notification.type).toBe('recents');
    expect(notification.refetch).toBe(Endpoints.recents);
  });

  it('maps a now-selection change with no re-fetch (inline only)', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><nowSelectionUpdated><preset id="1"/>' +
        '</nowSelectionUpdated></updates>'
    );

    expect(notification.type).toBe('nowSelection');
    expect(notification.refetch).toBeUndefined();
  });

  it('exposes the updates element for inline-data consumers', async () => {
    const [notification] = await parseGabboFrame(
      '<updates deviceID="DEV1"><volumeUpdated/></updates>'
    );

    expect(notification.element.getAttribute('deviceID')).toBe('DEV1');
  });

  it('returns no notifications for an empty heartbeat frame', async () => {
    const notifications = await parseGabboFrame(
      '<updates deviceID="DEV1"></updates>'
    );

    expect(notifications).toEqual([]);
  });

  it('ignores unrecognised update children', async () => {
    const notifications = await parseGabboFrame(
      '<updates deviceID="DEV1"><somethingNewUpdated/></updates>'
    );

    expect(notifications).toEqual([]);
  });

  it('returns nothing when the frame is not an updates element', async () => {
    const notifications = await parseGabboFrame('<status>/standby</status>');

    expect(notifications).toEqual([]);
  });
});
