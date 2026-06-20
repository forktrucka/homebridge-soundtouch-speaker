import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { PlatformAccessory } from 'homebridge';
import type { ExternalPlatformConfig } from '../ExternalPlatformConfig.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { SoundTouchSpeakerPlatformAccessory } from '../accessories/SoundTouchSpeakerPlatformAccessory.js';
import {
  FakeSoundTouchServer,
  infoXml,
  nowPlayingXml,
} from './helpers/fake-soundtouch-server.js';
import { HomebridgeApiStub } from './helpers/homebridge-stub.js';

const DEVICE_ID = 'DEV-INT-1';

describe('SoundTouchHomebridgePlatform', () => {
  let server: FakeSoundTouchServer;
  let port: number;
  let api: HomebridgeApiStub;

  beforeEach(async () => {
    server = new FakeSoundTouchServer();
    port = await server.start();
    server.setResponse(
      '/info',
      infoXml({ deviceId: DEVICE_ID, name: 'Test Speaker' })
    );

    // The accessory polls on a hardcoded 2s interval; faking timers keeps the
    // polling loop parked so the suite leaves no open handles. Real I/O
    // (the HTTP requests to the fake server) is left untouched.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    api = new HomebridgeApiStub();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await server.stop();
  });

  function createPlatform(): SoundTouchHomebridgePlatform {
    const config = {
      platform: 'SoundTouchSpeaker',
      accessories: [{ ip: '127.0.0.1', port }],
    } as ExternalPlatformConfig;

    return new SoundTouchHomebridgePlatform(
      api.logger,
      config,
      api.asHomebridgeApi()
    );
  }

  describe('when a device is reachable at a configured IP', () => {
    it('registers the accessory with Homebridge', async () => {
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(api.registeredAccessories).toHaveLength(1);
    });

    it('initialises the On characteristic to false when the device is in standby', async () => {
      server.setResponse('/nowPlaying', nowPlayingXml('STANDBY'));
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(api.getCharacteristicValue('Switch', 'On')).toBe(false);
    });

    it('initialises the On characteristic to true when the device is playing', async () => {
      server.setResponse('/nowPlaying', nowPlayingXml('SPOTIFY'));
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(api.getCharacteristicValue('Switch', 'On')).toBe(true);
    });

    it('unregisters a stale cached accessory not seen in discovery', async () => {
      const stale = new api.platformAccessory('Stale Speaker', 'stale-uuid');
      const platform = createPlatform();
      platform.configureAccessory(stale as unknown as PlatformAccessory);

      await api.emitDidFinishLaunching();

      expect(api.unregisteredAccessories).toContain(stale);
    });

    it('stops the discovered accessory polling loop on shutdown', async () => {
      const stopPolling = jest.spyOn(
        SoundTouchSpeakerPlatformAccessory.prototype,
        'stopPolling'
      );
      createPlatform();
      await api.emitDidFinishLaunching();

      api.emitShutdown();

      expect(stopPolling).toHaveBeenCalledTimes(1);
      stopPolling.mockRestore();
    });
  });
});
