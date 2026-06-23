import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings.js';

jest.mock('../accessories/SoundTouchSpeakerPlatformAccessory.js');
import { SoundTouchSpeakerPlatformAccessory } from '../accessories/SoundTouchSpeakerPlatformAccessory.js';
import type { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';

function buildDevice(props: { id: string; name: string; disabled: boolean }) {
  return {
    id: props.id,
    name: props.name,
    configuration: { disabled: props.disabled, pollingInterval: 2000 },
    api: {},
  } as unknown as SoundTouchDevice;
}

function buildPlatform() {
  const registerPlatformAccessories = jest.fn();
  const unregisterPlatformAccessories = jest.fn();

  const homebridgeApi = {
    hap: {
      uuid: { generate: (id: string) => `uuid:${id}` },
      Service: {},
      Characteristic: {},
    },
    platformAccessory: jest.fn((name: string, uuid: string) => ({
      displayName: name,
      UUID: uuid,
      context: {},
    })),
    registerPlatformAccessories,
    unregisterPlatformAccessories,
    on: jest.fn(),
  };

  const homebridgeLogger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    prefix: '',
  };

  const platform = new SoundTouchHomebridgePlatform(
    homebridgeLogger as never,
    { platform: PLATFORM_NAME },
    homebridgeApi as never
  );

  return { platform, registerPlatformAccessories, unregisterPlatformAccessories };
}

describe('SoundTouchHomebridgePlatform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      SoundTouchSpeakerPlatformAccessory as jest.Mocked<typeof SoundTouchSpeakerPlatformAccessory>
    ).create = jest.fn<typeof SoundTouchSpeakerPlatformAccessory.create>().mockResolvedValue({
      stopPolling: jest.fn(),
    } as unknown as SoundTouchSpeakerPlatformAccessory);
  });

  describe('discoverDevices', () => {
    it('registers a non-disabled device', async () => {
      const device = buildDevice({ id: 'dev1', name: 'Kitchen', disabled: false });
      const { platform, registerPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      await platform.discoverDevices();

      expect(registerPlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('skips a disabled device without registering it', async () => {
      const device = buildDevice({ id: 'dev2', name: 'Lounge', disabled: true });
      const { platform, registerPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      await platform.discoverDevices();

      expect(registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('unregisters a cached accessory when its device is disabled', async () => {
      const device = buildDevice({ id: 'dev3', name: 'Bedroom', disabled: true });
      const { platform, unregisterPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      const cachedAccessory = { displayName: 'Bedroom', UUID: 'uuid:dev3', context: {} };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(unregisterPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        [cachedAccessory]
      );
    });

    it('does not unregister a cached accessory when its device is not disabled', async () => {
      const device = buildDevice({ id: 'dev4', name: 'Study', disabled: false });
      const { platform, unregisterPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      const cachedAccessory = { displayName: 'Study', UUID: 'uuid:dev4', context: {} };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(unregisterPlatformAccessories).not.toHaveBeenCalled();
    });
  });
});
