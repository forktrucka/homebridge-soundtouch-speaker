import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { API } from '../api.js';
import { APIErrors } from '../error.js';
import { KeyValue } from '../special-types.js';

const HOST = '192.168.1.50';
const BASE = `http://${HOST}:8090`;

describe('API', () => {
  let mock: MockAdapter;
  let api: API;

  beforeEach(() => {
    const instance = axios.create();
    mock = new MockAdapter(instance);
    api = API.create(HOST, 8090, instance);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('request plumbing', () => {
    it('GET targets the host, default port and endpoint', async () => {
      mock.onGet(`${BASE}/info`).reply(200, '<info deviceID="D"></info>');
      await api.getInfo();
      expect(mock.history.get[0].url).toBe(`${BASE}/info`);
    });

    it('honours a custom port', async () => {
      const instance = axios.create();
      const customMock = new MockAdapter(instance);
      const customApi = API.create('10.0.0.9', 9999, instance);
      customMock
        .onGet('http://10.0.0.9:9999/volume')
        .reply(200, '<volume deviceID="D"></volume>');
      await customApi.getVolume();
      expect(customMock.history.get[0].url).toBe('http://10.0.0.9:9999/volume');
      customMock.restore();
    });

    it('re-throws network errors that carry no response', async () => {
      mock.onGet(`${BASE}/info`).networkError();
      await expect(api.getInfo()).rejects.toThrow();
    });

    it('parses the body of an error (non-2xx) response instead of throwing it', async () => {
      // A 4xx with a parseable (but non-error) body should resolve, not reject.
      mock
        .onGet(`${BASE}/info`)
        .reply(400, '<info deviceID="D"><name>x</name></info>');
      await expect(api.getInfo()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('throws APIErrors when the response contains an <errors> block', async () => {
      mock
        .onGet(`${BASE}/info`)
        .reply(
          200,
          '<errors deviceID="D"><error value="401" name="HTTP_ERROR" severity="High">no</error></errors>'
        );
      await expect(api.getInfo()).rejects.toBeInstanceOf(APIErrors);
    });

    it('throws APIErrors when the response contains a single <error>', async () => {
      mock
        .onGet(`${BASE}/info`)
        .reply(200, '<error value="1" name="X" severity="Low">bad</error>');
      await expect(api.getInfo()).rejects.toBeInstanceOf(APIErrors);
    });

    it('surfaces APIErrors carried in a 4xx error response body', async () => {
      mock
        .onGet(`${BASE}/info`)
        .reply(
          500,
          '<errors deviceID="D"><error value="500" name="ERR" severity="High">boom</error></errors>'
        );
      await expect(api.getInfo()).rejects.toBeInstanceOf(APIErrors);
    });
  });

  describe('getInfo', () => {
    it('parses an info document', async () => {
      mock
        .onGet(`${BASE}/info`)
        .reply(
          200,
          '<info deviceID="DEV1"><name>Kitchen</name><type>SoundTouch 10</type>' +
            '<components><component><softwareVersion>1.0</softwareVersion>' +
            '<serialNumber>DEV1</serialNumber></component></components>' +
            '<networkInfo><macAddress>AA</macAddress><ipAddress>10.0.0.1</ipAddress></networkInfo></info>'
        );
      const info = await api.getInfo();
      expect(info).toMatchObject({
        deviceId: 'DEV1',
        name: 'Kitchen',
        type: 'SoundTouch 10',
      });
    });

    it('returns undefined when there is no info element', async () => {
      mock.onGet(`${BASE}/info`).reply(200, '<nothing/>');
      await expect(api.getInfo()).resolves.toBeUndefined();
    });
  });

  describe('getVolume / setVolume', () => {
    it('parses a volume document', async () => {
      mock
        .onGet(`${BASE}/volume`)
        .reply(
          200,
          '<volume deviceID="DEV1"><targetvolume>40</targetvolume>' +
            '<actualvolume>38</actualvolume><muteenabled>false</muteenabled></volume>'
        );
      await expect(api.getVolume()).resolves.toEqual({
        deviceId: 'DEV1',
        target: 40,
        actual: 38,
        isMuted: false,
      });
    });

    it('setVolume posts the value and reports success on a status reply', async () => {
      mock.onPost(`${BASE}/volume`).reply(200, '<status>/volume</status>');
      await expect(api.setVolume(30)).resolves.toBe(true);
      expect(mock.history.post[0].data).toContain('<volume>30</volume>');
    });

    it('setVolume reports failure when there is no status reply', async () => {
      mock.onPost(`${BASE}/volume`).reply(200, '<nope/>');
      await expect(api.setVolume(30)).resolves.toBe(false);
    });
  });

  describe('now playing', () => {
    const nowPlayingXml =
      '<nowPlaying deviceID="DEV1" source="SPOTIFY">' +
      '<ContentItem source="SPOTIFY" sourceAccount="a"><itemName>Song</itemName></ContentItem>' +
      '<track>T</track><art artImageStatus="IMAGE_PRESENT">http://art</art>' +
      '<time total="200">5</time></nowPlaying>';

    it('getNowPlaying parses a playing document', async () => {
      mock.onGet(`${BASE}/nowPlaying`).reply(200, nowPlayingXml);
      const np = await api.getNowPlaying();
      expect(np).toMatchObject({
        deviceId: 'DEV1',
        source: 'SPOTIFY',
        track: 'T',
      });
    });

    it('getSource returns the source attribute', async () => {
      mock
        .onGet(`${BASE}/nowPlaying`)
        .reply(
          200,
          '<nowPlaying deviceID="DEV1" source="STANDBY"><ContentItem source="STANDBY"/></nowPlaying>'
        );
      await expect(api.getSource()).resolves.toBe('STANDBY');
    });

    it('getNowPlaying parses a STANDBY response with no art or time', async () => {
      mock
        .onGet(`${BASE}/nowPlaying`)
        .reply(
          200,
          '<nowPlaying deviceID="DEV1" source="STANDBY"><ContentItem source="STANDBY"/></nowPlaying>'
        );
      const np = await api.getNowPlaying();
      expect(np).toBeDefined();
      expect(np?.source).toBe('STANDBY');
      expect(np?.art).toBeUndefined();
      expect(np?.time).toBeUndefined();
    });
  });

  describe('sources / select', () => {
    it('getSources parses the source list', async () => {
      mock
        .onGet(`${BASE}/sources`)
        .reply(
          200,
          '<sources deviceID="DEV1"><sourceItem source="AUX" status="READY">AUX IN</sourceItem></sources>'
        );
      const sources = await api.getSources();
      expect(sources?.deviceId).toBe('DEV1');
      expect(sources?.items[0]).toMatchObject({
        source: 'AUX',
        name: 'AUX IN',
      });
    });

    it('selectSource posts a ContentItem and reports success', async () => {
      mock.onPost(`${BASE}/select`).reply(200, '<status>/select</status>');
      await expect(
        api.selectSource({ source: 'AUX', sourceAccount: '' })
      ).resolves.toBe(true);
      expect(mock.history.post[0].data).toContain('source="AUX"');
    });
  });

  describe('zones', () => {
    it('getZone parses master and members', async () => {
      mock
        .onGet(`${BASE}/getZone`)
        .reply(
          200,
          '<zone master="M1"><member ipaddress="10.0.0.1">DEV1</member></zone>'
        );
      await expect(api.getZone()).resolves.toEqual({
        master: 'M1',
        members: [{ deviceId: 'DEV1', ipAddress: '10.0.0.1' }],
      });
    });

    it('setZone posts the serialized zone', async () => {
      mock.onPost(`${BASE}/setZone`).reply(200, '<status>/setZone</status>');
      const zone = {
        master: 'M1',
        members: [{ deviceId: 'DEV1', ipAddress: '10.0.0.1' }],
      };
      await expect(api.setZone(zone)).resolves.toBe(true);
      expect(mock.history.post[0].data).toContain('master="M1"');
    });

    it('setZone includes senderIPAddress when provided', async () => {
      mock.onPost(`${BASE}/setZone`).reply(200, '<status>/setZone</status>');
      const zone = {
        master: 'M1',
        members: [{ deviceId: 'DEV1', ipAddress: '10.0.0.1' }],
        senderIpAddress: '10.0.0.1',
      };
      await expect(api.setZone(zone)).resolves.toBe(true);
      expect(mock.history.post[0].data).toContain('senderIPAddress="10.0.0.1"');
    });
  });

  describe('bass', () => {
    it('getBassCapabilities parses the capabilities', async () => {
      mock
        .onGet(`${BASE}/bassCapabilities`)
        .reply(
          200,
          '<bassCapabilities deviceID="DEV1"><bassAvailable>true</bassAvailable>' +
            '<bassMin>-9</bassMin><bassMax>0</bassMax><bassDefault>-5</bassDefault></bassCapabilities>'
        );
      await expect(api.getBassCapabilities()).resolves.toEqual({
        deviceId: 'DEV1',
        isAvailable: true,
        min: -9,
        max: 0,
        default: -5,
      });
    });

    it('getBass parses the current bass', async () => {
      mock
        .onGet(`${BASE}/bass`)
        .reply(
          200,
          '<bass deviceID="DEV1"><targetbass>-5</targetbass><actualbass>-5</actualbass></bass>'
        );
      await expect(api.getBass()).resolves.toEqual({
        deviceId: 'DEV1',
        target: -5,
        actual: -5,
      });
    });

    it('setBass posts the value', async () => {
      mock.onPost(`${BASE}/bass`).reply(200, '<status>/bass</status>');
      await expect(api.setBass(-3)).resolves.toBe(true);
      expect(mock.history.post[0].data).toContain('<bass>-3</bass>');
    });
  });

  describe('presets', () => {
    it('parses presets when present', async () => {
      mock
        .onGet(`${BASE}/presets`)
        .reply(
          200,
          '<presets><preset id="1" createdOn="1600000000" updateOn="1600000000">' +
            '<ContentItem source="SPOTIFY" sourceAccount="a"><itemName>Mix</itemName></ContentItem></preset></presets>'
        );
      const presets = await api.getPresets();
      expect(presets).toHaveLength(1);
      expect(presets?.[0]).toMatchObject({ id: 1 });
    });

    it('returns undefined when there are no presets', async () => {
      mock.onGet(`${BASE}/presets`).reply(200, '<presets></presets>');
      await expect(api.getPresets()).resolves.toBeUndefined();
    });
  });

  describe('storePreset', () => {
    it('posts a preset with the correct slot id and ContentItem', async () => {
      mock
        .onPost(`${BASE}/storePreset`)
        .reply(200, '<status>/storePreset</status>');

      const contentItem = {
        source: 'LOCAL_INTERNET_RADIO',
        sourceAccount: '',
        type: 'stationurl',
        isPresetable: true,
        location: 'http://192.168.1.1:18090/preset/2.json',
        itemName: 'BBC World Service',
      };

      await expect(api.storePreset(2, contentItem)).resolves.toBe(true);
      const body = mock.history.post[0].data;
      expect(body).toContain('id="2"');
      expect(body).toContain('source="LOCAL_INTERNET_RADIO"');
      expect(body).toContain('type="stationurl"');
      expect(body).toContain('isPresetable="true"');
      expect(body).toContain('location="http://192.168.1.1:18090/preset/2.json"');
    });

    it('returns false when the response contains no status element', async () => {
      mock.onPost(`${BASE}/storePreset`).reply(200, '<nope/>');

      await expect(
        api.storePreset(1, { source: 'LOCAL_INTERNET_RADIO', sourceAccount: '' })
      ).resolves.toBe(false);
    });
  });

  describe('group', () => {
    it('parses the active group', async () => {
      mock
        .onGet(`${BASE}/getGroup`)
        .reply(
          200,
          '<group id="G1"><name>Stereo</name><masterDeviceId>DEV1</masterDeviceId>' +
            '<status>GROUP_OK</status><roles><groupRole><deviceId>DEV1</deviceId>' +
            '<role>LEFT</role><ipAddress>10.0.0.1</ipAddress></groupRole></roles></group>'
        );
      const group = await api.getGroup();
      expect(group).toMatchObject({
        id: 'G1',
        name: 'Stereo',
        masterDeviceId: 'DEV1',
      });
      expect(group?.roles).toHaveLength(1);
    });
  });

  describe('keys', () => {
    it('pressKey sends a press then a release', async () => {
      mock.onPost(`${BASE}/key`).reply(200, '<status>/key</status>');
      await expect(api.pressKey(KeyValue.play)).resolves.toBe(true);
      expect(mock.history.post).toHaveLength(2);
      expect(mock.history.post[0].data).toContain('state="press"');
      expect(mock.history.post[1].data).toContain('state="release"');
      expect(mock.history.post[0].data).toContain('PLAY');
    });

    it('pressKey aborts before the release when the press fails', async () => {
      mock.onPost(`${BASE}/key`).reply(200, '<nope/>');
      await expect(api.pressKey(KeyValue.play)).resolves.toBe(false);
      expect(mock.history.post).toHaveLength(1);
    });
  });

  describe('setName', () => {
    it('posts the new name and returns the updated info', async () => {
      mock
        .onPost(`${BASE}/name`)
        .reply(
          200,
          '<info deviceID="DEV1"><name>New Name</name><type>SoundTouch 10</type>' +
            '<components><component><softwareVersion>1.0</softwareVersion>' +
            '<serialNumber>DEV1</serialNumber></component></components>' +
            '<networkInfo><macAddress>AA</macAddress><ipAddress>10.0.0.1</ipAddress></networkInfo></info>'
        );
      const info = await api.setName('New Name');
      expect(info?.name).toBe('New Name');
      expect(mock.history.post[0].data).toContain('<name>New Name</name>');
    });
  });
});
