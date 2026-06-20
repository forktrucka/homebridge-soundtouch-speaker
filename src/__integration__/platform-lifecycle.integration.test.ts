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
  getServiceName,
  ServiceType,
} from '../accessories/services/SoundTouchSpeakerCharacteristic.js';
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

  function createPlatform(
    overrides: Partial<ExternalPlatformConfig> = {}
  ): SoundTouchHomebridgePlatform {
    const config = {
      platform: 'SoundTouchSpeaker',
      accessories: [{ ip: '127.0.0.1', port }],
      ...overrides,
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

  describe('FirmwareRevision characteristic', () => {
    it('is set to the SCM component softwareVersion', async () => {
      server.setResponse(
        '/info',
        infoXml({ deviceId: DEVICE_ID, softwareVersion: '2.3.4' })
      );
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(
        api.getCharacteristicValue('AccessoryInformation', 'FirmwareRevision')
      ).toBe('2.3.4');
    });

    it('strips the build suffix from the softwareVersion', async () => {
      server.setResponse(
        '/info',
        infoXml({
          deviceId: DEVICE_ID,
          softwareVersion:
            '27.0.6.46330.5043500 epdbuild.trunk.hepdswbld04.2022-08-04T11:20:29',
        })
      );
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(
        api.getCharacteristicValue('AccessoryInformation', 'FirmwareRevision')
      ).toBe('27.0.6.46330.5043500');
    });

    it('is not set when the info response has no components', async () => {
      server.setResponse(
        '/info',
        infoXml({ deviceId: DEVICE_ID, hasComponents: false })
      );
      createPlatform();

      await api.emitDidFinishLaunching();

      expect(
        api.getCharacteristicValue('AccessoryInformation', 'FirmwareRevision')
      ).toBeUndefined();
    });
  });

  describe('when the accessory type is lightbulb', () => {
    it('exposes the speaker as a Lightbulb service', async () => {
      createPlatform({ global: { accessoryType: 'lightbulb' } });

      await api.emitDidFinishLaunching();

      const accessory = api.registeredAccessories[0];
      expect(
        accessory.services.some((service) => service.type.name === 'Lightbulb')
      ).toBe(true);
      expect(
        accessory.services.some((service) => service.type.name === 'Switch')
      ).toBe(false);
    });
  });

  describe('when a cached accessory changes type from Switch to Lightbulb', () => {
    it('removes the orphaned Switch service', async () => {
      const uuid = api.hap.uuid.generate(DEVICE_ID);
      const cached = new api.platformAccessory('Test Speaker', uuid);
      // Seed the stale service the previous (Switch) configuration left behind.
      cached.addService(
        api.hap.Service.Switch,
        getServiceName({
          serviceType: ServiceType.ON_OFF,
          device: { name: 'Test Speaker' } as never,
        })
      );

      const platform = createPlatform({
        global: { accessoryType: 'lightbulb' },
      });
      platform.configureAccessory(cached as unknown as PlatformAccessory);

      await api.emitDidFinishLaunching();

      expect(
        cached.services.some((service) => service.type.name === 'Switch')
      ).toBe(false);
      expect(
        cached.services.some((service) => service.type.name === 'Lightbulb')
      ).toBe(true);
    });
  });
});
