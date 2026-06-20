import { describe, expect, test } from '@jest/globals';
import { nowPlayingFromElement } from '../now-playing.js';
import {
  PlayStatus,
  Rate,
  RepeatStatus,
  ShuffleStatus,
  StreamStatus,
} from '../special-types.js';
import { XMLElement } from '../utils/xml-element.js';

function makeFullData() {
  return {
    $: { deviceID: 'DEV1', source: 'SPOTIFY', sourceAccount: 'acct' },
    ContentItem: [
      { $: { source: 'SPOTIFY', sourceAccount: 'acct' }, itemName: ['Song'] },
    ],
    art: [{ $: { artImageStatus: 'IMAGE_PRESENT' }, _: 'http://art' }],
    time: [{ $: { total: '240' }, _: '57' }],
    ConnectionStatusInfo: [{ $: { status: 'CONNECTED', deviceName: 'Phone' } }],
    track: ['Track Name'],
    artist: ['Artist Name'],
    album: ['Album Name'],
    genre: ['Pop'],
    stationName: ['Station'],
    stationLocation: ['Location'],
    rating: ['UP'],
    playStatus: ['PLAY_STATE'],
    shuffleSetting: ['SHUFFLE_ON'],
    repeatSetting: ['REPEAT_ALL'],
    streamType: ['TRACK_ONDEMAND'],
    skipEnabled: [''],
    skipPreviousEnabled: [''],
    favoriteEnabled: [''],
    isFavorite: [''],
    rateEnabled: [''],
  };
}

describe('nowPlayingFromElement', () => {
  test('parses a fully populated now playing element', () => {
    const result = nowPlayingFromElement(new XMLElement(makeFullData()));
    expect(result).toMatchObject({
      deviceId: 'DEV1',
      source: 'SPOTIFY',
      sourceAccount: 'acct',
      track: 'Track Name',
      artist: 'Artist Name',
      album: 'Album Name',
      genre: 'Pop',
      stationName: 'Station',
      stationLocation: 'Location',
      rating: Rate.up,
      playStatus: PlayStatus.play,
      shuffleSetting: ShuffleStatus.on,
      repeatSetting: RepeatStatus.all,
      streamType: StreamStatus.trackOndemand,
      canGoForward: true,
      canGoBackward: true,
      isFavoriteEnabled: true,
      isFavorite: true,
      isRateEnabled: true,
    });
    expect(result?.contentItem.itemName).toBe('Song');
    expect(result?.art?.url).toBe('http://art');
    expect(result?.time).toEqual({ current: 57, total: 240 });
    expect(result?.connectionStatusInfo).toEqual({
      status: 'CONNECTED',
      deviceName: 'Phone',
    });
  });

  test('applies defaults for absent optional fields', () => {
    const data = {
      $: { deviceID: 'DEV1', source: 'SPOTIFY' },
      ContentItem: [{ $: { source: 'SPOTIFY' } }],
      art: [{ $: { artImageStatus: 'IMAGE_PRESENT' }, _: 'http://art' }],
      time: [{ $: { total: '0' }, _: '0' }],
    };
    const result = nowPlayingFromElement(new XMLElement(data));
    expect(result).toMatchObject({
      sourceAccount: '',
      rating: Rate.none,
      canGoForward: false,
      canGoBackward: false,
      isFavoriteEnabled: false,
      isFavorite: false,
      isRateEnabled: false,
    });
    expect(result?.playStatus).toBeUndefined();
    expect(result?.shuffleSetting).toBeUndefined();
    expect(result?.repeatSetting).toBeUndefined();
    expect(result?.streamType).toBeUndefined();
    expect(result?.connectionStatusInfo).toBeUndefined();
  });

  test('returns undefined when required attributes are missing', () => {
    const el = new XMLElement({ $: { deviceID: 'DEV1' } });
    expect(nowPlayingFromElement(el)).toBeUndefined();
  });

  test('returns undefined when the ContentItem child is missing', () => {
    const data = makeFullData();
    delete (data as Record<string, unknown>).ContentItem;
    expect(nowPlayingFromElement(new XMLElement(data))).toBeUndefined();
  });

  test('parses successfully when art or time children are absent', () => {
    const data = makeFullData();
    delete (data as Record<string, unknown>).art;
    delete (data as Record<string, unknown>).time;
    const result = nowPlayingFromElement(new XMLElement(data));
    expect(result).toBeDefined();
    expect(result?.art).toBeUndefined();
    expect(result?.time).toBeUndefined();
    expect(result?.source).toBe('SPOTIFY');
  });

  test('returns undefined when the content item is malformed', () => {
    const data = makeFullData();
    data.ContentItem = [{ $: {} } as never];
    expect(nowPlayingFromElement(new XMLElement(data))).toBeUndefined();
  });
});
