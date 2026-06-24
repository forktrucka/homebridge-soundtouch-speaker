import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { TuneInClient } from '../TuneInClient.js';

const TUNE_IN_ID = 's24861';
const OPML_BASE =
  'https://opml.radiotime.com/Tune.ashx?render=json&formats=mp3,aac&partnerId=RadioTime&id=';

describe('TuneInClient', () => {
  let mock: MockAdapter;
  let client: TuneInClient;

  beforeEach(() => {
    const instance = axios.create();
    mock = new MockAdapter(instance);
    client = TuneInClient.create(instance);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('.create', () => {
    it('creates a client with a default axios instance when none is provided', () => {
      expect(() => TuneInClient.create()).not.toThrow();
    });
  });

  describe('#resolveStationUrl', () => {
    it('returns the first body url from a successful RadioTime response', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).reply(200, {
        body: [
          { url: 'http://stream.example.com/bbc', reliability: 99 },
          { url: 'http://stream2.example.com/bbc', reliability: 80 },
        ],
      });

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBe('http://stream.example.com/bbc');
    });

    it('returns null when the body array is empty', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).reply(200, { body: [] });

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBeNull();
    });

    it('returns null when the response has no body field', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).reply(200, {});

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBeNull();
    });

    it('returns null on a network error', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).networkError();

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBeNull();
    });

    it('returns null on an HTTP error response', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).reply(500, 'Internal Server Error');

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBeNull();
    });

    it('returns null when the first body entry has no url field', async () => {
      mock.onGet(`${OPML_BASE}${TUNE_IN_ID}`).reply(200, {
        body: [{ text: 'No url here' }],
      });

      const url = await client.resolveStationUrl(TUNE_IN_ID);

      expect(url).toBeNull();
    });
  });
});
