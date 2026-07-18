import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings.js';

jest.mock('../accessories/SoundTouchSpeakerPlatformAccessory.js');
import { SoundTouchSpeakerPlatformAccessory } from '../accessories/SoundTouchSpeakerPlatformAccessory.js';
jest.mock('../zones/SoundTouchZoneAccessory.js');
import { SoundTouchZoneAccessory } from '../zones/SoundTouchZoneAccessory.js';
import type { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import type { ExternalPlatformConfig } from '../ExternalPlatformConfig.js';
import { AppError } from '../errors.js';

function findRegisteredCallback(
  on: jest.Mock,
  event: string
): () => Promise<void> {
  const call = on.mock.calls.find(
    ([registeredEvent]) => registeredEvent === event
  );
  if (!call) {
    throw new Error(`No listener registered for "${event}"`);
  }
  return call[1] as () => Promise<void>;
}

function buildDevice(props: { id: string; name: string; disabled: boolean }) {
  return {
    id: props.id,
    name: props.name,
    configuration: { disabled: props.disabled, pollingInterval: 2000 },
    api: {},
  } as unknown as SoundTouchDevice;
}

/**
 * The formatted `Logger.warn()` forwards to the raw Homebridge logger via
 * `.log(LogLevel.WARN, message, ...)`, not `.warn()` directly — assert
 * against the underlying `homebridgeLogger.log` mock instead.
 */
function warnMessages(homebridgeLogger: { log: jest.Mock }): string[] {
  return homebridgeLogger.log.mock.calls
    .filter((call) => call[0] === 'warn' /* LogLevel.WARN */)
    .map((call) => call[1] as string);
}

function buildPlatform(configOverrides: Partial<ExternalPlatformConfig> = {}) {
  const registerPlatformAccessories = jest.fn();
  const unregisterPlatformAccessories = jest.fn();
  const updatePlatformAccessories = jest.fn();

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
    updatePlatformAccessories,
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
    { platform: PLATFORM_NAME, ...configOverrides },
    homebridgeApi as never
  );

  return {
    platform,
    registerPlatformAccessories,
    unregisterPlatformAccessories,
    updatePlatformAccessories,
    homebridgeApi,
    homebridgeLogger,
  };
}

describe('SoundTouchHomebridgePlatform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      SoundTouchSpeakerPlatformAccessory as jest.Mocked<
        typeof SoundTouchSpeakerPlatformAccessory
      >
    ).create = jest
      .fn<typeof SoundTouchSpeakerPlatformAccessory.create>()
      .mockResolvedValue({
        stopPolling: jest.fn(),
      } as unknown as SoundTouchSpeakerPlatformAccessory);

    (
      SoundTouchZoneAccessory as jest.Mocked<typeof SoundTouchZoneAccessory>
    ).create = jest
      .fn<typeof SoundTouchZoneAccessory.create>()
      .mockResolvedValue({
        stopPolling: jest.fn(),
      } as unknown as SoundTouchZoneAccessory);
  });

  describe('discoverDevices', () => {
    it('registers a non-disabled device', async () => {
      const device = buildDevice({
        id: 'dev1',
        name: 'Kitchen',
        disabled: false,
      });
      const { platform, registerPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      await platform.discoverDevices();

      expect(registerPlatformAccessories).toHaveBeenCalledTimes(1);
    });

    it('registers nothing when searchDevices returns an empty list', async () => {
      // Disabled devices are filtered out by searchDevices() before discoverDevices sees them.
      const { platform, registerPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([]);

      await platform.discoverDevices();

      expect(registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('unregisters a cached accessory that is absent from discovery results', async () => {
      // Disabled devices are excluded from searchDevices() results; the stale-pruning
      // loop in discoverDevices() then unregisters any cached accessory not rediscovered.
      const { platform, unregisterPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([]);

      const cachedAccessory = {
        displayName: 'Bedroom',
        UUID: 'uuid:dev3',
        context: {},
      };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(unregisterPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        [cachedAccessory]
      );
    });

    it('does not unregister a cached accessory when its device is not disabled', async () => {
      const device = buildDevice({
        id: 'dev4',
        name: 'Study',
        disabled: false,
      });
      const { platform, unregisterPlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      const cachedAccessory = {
        displayName: 'Study',
        UUID: 'uuid:dev4',
        context: {},
      };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(unregisterPlatformAccessories).not.toHaveBeenCalled();
    });

    it('refreshes stale context on a restored accessory when the device was renamed', async () => {
      const device = buildDevice({
        id: 'dev5',
        name: 'New Name',
        disabled: false,
      });
      const { platform, updatePlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      const cachedAccessory = {
        displayName: 'Old Name',
        UUID: 'uuid:dev5',
        context: { deviceId: 'stale-id' },
      };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(cachedAccessory.context.deviceId).toBe('dev5');
      expect(cachedAccessory.displayName).toBe('New Name');
      expect(updatePlatformAccessories).toHaveBeenCalledWith([cachedAccessory]);
    });

    it('does not call updatePlatformAccessories when a restored accessory context is unchanged', async () => {
      const device = buildDevice({
        id: 'dev6',
        name: 'Same Name',
        disabled: false,
      });
      const { platform, updatePlatformAccessories } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);

      const cachedAccessory = {
        displayName: 'Same Name',
        UUID: 'uuid:dev6',
        context: { deviceId: 'dev6' },
      };
      platform.configureAccessory(cachedAccessory as never);

      await platform.discoverDevices();

      expect(updatePlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessoryForDevice', () => {
    it('calls refresh on the registered accessory wrapper for the device', async () => {
      const refresh = jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      (
        SoundTouchSpeakerPlatformAccessory as jest.Mocked<
          typeof SoundTouchSpeakerPlatformAccessory
        >
      ).create = jest
        .fn<typeof SoundTouchSpeakerPlatformAccessory.create>()
        .mockResolvedValue({
          stopPolling: jest.fn(),
          refresh,
        } as unknown as SoundTouchSpeakerPlatformAccessory);

      const device = buildDevice({
        id: 'dev1',
        name: 'Kitchen',
        disabled: false,
      });
      const { platform } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);
      await platform.discoverDevices();

      await platform.refreshAccessoryForDevice('dev1');

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no accessory wrapper is registered for the device', async () => {
      const { platform } = buildPlatform();

      await expect(
        platform.refreshAccessoryForDevice('unknown-device')
      ).resolves.toBeUndefined();
    });

    it('logs and does not throw when the wrapper refresh fails', async () => {
      const refresh = jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error('boom'));
      (
        SoundTouchSpeakerPlatformAccessory as jest.Mocked<
          typeof SoundTouchSpeakerPlatformAccessory
        >
      ).create = jest
        .fn<typeof SoundTouchSpeakerPlatformAccessory.create>()
        .mockResolvedValue({
          stopPolling: jest.fn(),
          refresh,
        } as unknown as SoundTouchSpeakerPlatformAccessory);

      const device = buildDevice({
        id: 'dev2',
        name: 'Office',
        disabled: false,
      });
      const { platform } = buildPlatform();
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([device]);
      await platform.discoverDevices();

      await expect(
        platform.refreshAccessoryForDevice('dev2')
      ).resolves.toBeUndefined();
    });
  });

  describe('_resolveZones', () => {
    it('resolves zone members by name and persists their device ids on a new zone accessory', async () => {
      const primary = buildDevice({
        id: 'primary-id',
        name: 'Kitchen',
        disabled: false,
      });
      const slave = buildDevice({
        id: 'slave-id',
        name: 'Lounge',
        disabled: false,
      });
      const { platform, registerPlatformAccessories } = buildPlatform({
        zones: [{ name: 'Downstairs', primary: 'Kitchen', slaves: ['Lounge'] }],
      });
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([primary, slave]);

      await platform.discoverDevices();

      const zoneAccessoryCall = registerPlatformAccessories.mock.calls.find(
        (call) =>
          (call[2] as { displayName: string }[])[0]?.displayName ===
          'Downstairs'
      );
      const zoneAccessory = (
        zoneAccessoryCall?.[2] as { context: Record<string, unknown> }[]
      )[0];
      expect(zoneAccessory?.context.memberDeviceIds).toEqual({
        Kitchen: 'primary-id',
        Lounge: 'slave-id',
      });
    });

    it('resolves a zone member via its persisted device id when its name no longer matches', async () => {
      const renamedPrimary = buildDevice({
        id: 'primary-id',
        name: 'Kitchen Renamed',
        disabled: false,
      });
      const slave = buildDevice({
        id: 'slave-id',
        name: 'Lounge',
        disabled: false,
      });
      const { platform, updatePlatformAccessories } = buildPlatform({
        zones: [{ name: 'Downstairs', primary: 'Kitchen', slaves: ['Lounge'] }],
      });
      jest
        .spyOn(platform, 'searchDevices')
        .mockResolvedValue([renamedPrimary, slave]);

      const cachedZoneAccessory = {
        displayName: 'Downstairs',
        UUID: 'uuid:zone::Downstairs',
        context: {
          memberDeviceIds: { Kitchen: 'primary-id', Lounge: 'slave-id' },
        },
      };
      platform.configureAccessory(cachedZoneAccessory as never);

      await platform.discoverDevices();

      expect(
        (SoundTouchZoneAccessory as jest.Mocked<typeof SoundTouchZoneAccessory>)
          .create
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          primary: renamedPrimary,
        })
      );
      // The resolved mapping is unchanged (same reference -> same id), so no
      // context write is needed.
      expect(updatePlatformAccessories).not.toHaveBeenCalled();
    });

    it('re-resolves and re-persists when the config is intentionally re-pointed to a different speaker', async () => {
      const originalPrimary = buildDevice({
        id: 'original-id',
        name: 'Not Kitchen Anymore',
        disabled: false,
      });
      const newPrimary = buildDevice({
        id: 'new-id',
        name: 'Kitchen',
        disabled: false,
      });
      const slave = buildDevice({
        id: 'slave-id',
        name: 'Lounge',
        disabled: false,
      });
      const { platform, updatePlatformAccessories } = buildPlatform({
        zones: [{ name: 'Downstairs', primary: 'Kitchen', slaves: ['Lounge'] }],
      });
      jest
        .spyOn(platform, 'searchDevices')
        .mockResolvedValue([originalPrimary, newPrimary, slave]);

      const cachedZoneAccessory = {
        displayName: 'Downstairs',
        UUID: 'uuid:zone::Downstairs',
        context: {
          memberDeviceIds: { Kitchen: 'original-id', Lounge: 'slave-id' },
        },
      };
      platform.configureAccessory(cachedZoneAccessory as never);

      await platform.discoverDevices();

      expect(
        (SoundTouchZoneAccessory as jest.Mocked<typeof SoundTouchZoneAccessory>)
          .create
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          primary: newPrimary,
        })
      );
      expect(cachedZoneAccessory.context.memberDeviceIds).toEqual({
        Kitchen: 'new-id',
        Lounge: 'slave-id',
      });
      expect(updatePlatformAccessories).toHaveBeenCalledWith([
        cachedZoneAccessory,
      ]);
    });

    it('skips the zone and warns when the primary cannot be resolved by name or persisted id', async () => {
      const slave = buildDevice({
        id: 'slave-id',
        name: 'Lounge',
        disabled: false,
      });
      const { platform, registerPlatformAccessories, homebridgeLogger } =
        buildPlatform({
          zones: [
            { name: 'Downstairs', primary: 'Kitchen', slaves: ['Lounge'] },
          ],
        });
      jest.spyOn(platform, 'searchDevices').mockResolvedValue([slave]);

      await platform.discoverDevices();

      expect(registerPlatformAccessories).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ displayName: 'Downstairs' }),
        ])
      );
      expect(
        warnMessages(homebridgeLogger).some((msg) =>
          msg.includes('primary speaker "Kitchen"')
        )
      ).toBe(true);
    });

    it('registers the zone with the remaining members and warns when a slave cannot be resolved', async () => {
      const primary = buildDevice({
        id: 'primary-id',
        name: 'Kitchen',
        disabled: false,
      });
      const resolvableSlave = buildDevice({
        id: 'slave-id',
        name: 'Study',
        disabled: false,
      });
      const { platform, registerPlatformAccessories, homebridgeLogger } =
        buildPlatform({
          zones: [
            {
              name: 'Downstairs',
              primary: 'Kitchen',
              slaves: ['Lounge', 'Study'],
            },
          ],
        });
      jest
        .spyOn(platform, 'searchDevices')
        .mockResolvedValue([primary, resolvableSlave]);

      await platform.discoverDevices();

      const zoneCall = registerPlatformAccessories.mock.calls.find(
        (call) =>
          (call[2] as { displayName: string }[])[0]?.displayName ===
          'Downstairs'
      );
      expect(zoneCall).toBeDefined();
      expect(
        warnMessages(homebridgeLogger).some((msg) =>
          msg.includes('slave speaker "Lounge"')
        )
      ).toBe(true);
    });

    it('preserves a transiently-absent member device id in the persisted mapping across a discovery pass where it is not found', async () => {
      const primary = buildDevice({
        id: 'primary-id',
        name: 'Kitchen',
        disabled: false,
      });
      const slaveB = buildDevice({
        id: 'slaveB-id',
        name: 'Lounge',
        disabled: false,
      });
      // slaveC is not discovered at all this pass — neither by name nor id.
      const { platform, updatePlatformAccessories, homebridgeLogger } =
        buildPlatform({
          zones: [
            {
              name: 'Downstairs',
              primary: 'Kitchen',
              slaves: ['Lounge', 'Attic'],
            },
          ],
        });
      jest
        .spyOn(platform, 'searchDevices')
        .mockResolvedValue([primary, slaveB]);

      const cachedZoneAccessory = {
        displayName: 'Downstairs',
        UUID: 'uuid:zone::Downstairs',
        context: {
          memberDeviceIds: {
            Kitchen: 'primary-id',
            Lounge: 'slaveB-id',
            Attic: 'slaveC-id',
          },
        },
      };
      platform.configureAccessory(cachedZoneAccessory as never);

      await platform.discoverDevices();

      expect(cachedZoneAccessory.context.memberDeviceIds).toEqual({
        Kitchen: 'primary-id',
        Lounge: 'slaveB-id',
        Attic: 'slaveC-id',
      });
      expect(
        warnMessages(homebridgeLogger).some((msg) =>
          msg.includes('slave speaker "Attic"')
        )
      ).toBe(true);
      expect(updatePlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('didFinishLaunching listener', () => {
    it('catches a rejection from the startup sequence and logs a DidFinishLaunchingFailed AppError', async () => {
      const { platform, homebridgeApi } = buildPlatform();
      const cause = new Error('discovery boom');
      jest.spyOn(platform, 'discoverDevices').mockRejectedValue(cause);
      const errorSpy = jest
        .spyOn(platform.logger, 'error')
        .mockImplementation(() => undefined);
      const callback = findRegisteredCallback(
        homebridgeApi.on as jest.Mock,
        'didFinishLaunching'
      );

      await expect(callback()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedError = errorSpy.mock.calls[0][0] as AppError;
      expect(loggedError).toBeInstanceOf(AppError);
      expect(loggedError.name).toBe('DidFinishLaunchingFailed');
      expect(loggedError.cause).toBe(cause);
    });

    it('does not log an error when the startup sequence completes successfully', async () => {
      const { platform, homebridgeApi } = buildPlatform();
      jest.spyOn(platform, 'discoverDevices').mockResolvedValue(undefined);
      const errorSpy = jest.spyOn(platform.logger, 'error');
      const callback = findRegisteredCallback(
        homebridgeApi.on as jest.Mock,
        'didFinishLaunching'
      );

      await expect(callback()).resolves.toBeUndefined();

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
