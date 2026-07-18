import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchZoneAccessory } from '../SoundTouchZoneAccessory.js';
import { LogLevel } from 'homebridge';
import { Logger } from '../../utils/FormattedLogger.js';
import { ZoneConfiguration } from '../../PlatformConfiguration.js';
import type { AccessoryType } from '../../devices/SoundTouch/SoundTouchDeviceConfiguration.js';

const ZONE_RECONCILIATION_INTERVAL_MS = 60 * 1000;

function buildOnCharacteristic() {
  const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const init = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCharacteristic: { init, refresh } as any,
    refresh,
    init,
  };
}

function build(opts: { isConnected?: boolean } = {}) {
  const { isConnected = true } = opts;
  const { onCharacteristic, refresh } = buildOnCharacteristic();

  const homebridgeLog = jest.fn();
  const primary = {
    name: 'Living Room',
    gabbo: { isConnected },
  };
  const log = Logger.forHomebridgeLogger({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: { log: homebridgeLog } as any,
    level: LogLevel.DEBUG,
  });

  const subject = SoundTouchZoneAccessory.createWithCharacteristics({
    name: 'Downstairs',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary: primary as any,
    onCharacteristic,
    volumeCharacteristic: undefined,
    log,
  });

  return { subject, refresh, homebridgeLog };
}

describe('SoundTouchZoneAccessory', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('reconciliation polling', () => {
    it('starts the reconciliation loop on init and calls refresh after one interval', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not fire before the reconciliation interval elapses', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS - 1);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('stops the reconciliation loop after stopPolling is called', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      subject.stopPolling();
      // Drain any iteration already in flight before the stop took effect.
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);
      const callsAfterDrain = refresh.mock.calls.length;
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS * 3);

      expect(refresh.mock.calls).toHaveLength(callsAfterDrain);
    });

    it('skips refresh when the primary Gabbo socket is not connected', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build({ isConnected: false });

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('calls refresh when the primary Gabbo socket is connected', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build({ isConnected: true });

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('catches a refresh rejection, logs a warning, and keeps the loop running', async () => {
      jest.useFakeTimers();
      const { subject, refresh, homebridgeLog } = build();
      refresh.mockRejectedValueOnce(new Error('device unreachable'));

      await subject.init();
      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      expect(
        (homebridgeLog.mock.calls as [string, string][]).some(
          ([level]) => level === LogLevel.WARN
        )
      ).toBe(true);

      await jest.advanceTimersByTimeAsync(ZONE_RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('is safe to call stopPolling before init', () => {
      const { subject } = build();

      expect(() => subject.stopPolling()).not.toThrow();
    });
  });

  describe('#create service pruning', () => {
    class FakeHapStatusError extends Error {
      constructor(public readonly hapStatus: number) {
        super('HAP error');
      }
    }

    function fakeDevice(id: string) {
      const getZone = jest
        .fn<() => Promise<undefined>>()
        .mockResolvedValue(undefined);
      const getSource = jest
        .fn<() => Promise<string>>()
        .mockResolvedValue('STANDBY');
      const getVolume = jest
        .fn<() => Promise<undefined>>()
        .mockResolvedValue(undefined);
      return {
        id,
        name: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api: { host: '10.0.0.1', getZone, getSource, getVolume } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configuration: {} as any,
      };
    }

    function makeHapService() {
      const hapCharacteristic = {
        value: undefined as boolean | undefined,
        updateValue: jest.fn(),
        onSet: jest.fn().mockReturnThis(),
        onGet: jest.fn().mockReturnThis(),
      };
      return {
        hapCharacteristic,
        getCharacteristic: jest.fn().mockReturnValue(hapCharacteristic),
      };
    }

    const ACCESSORY_INFORMATION = { name: 'AccessoryInformation' };
    const SWITCH = { name: 'Switch' };
    const LIGHTBULB = { name: 'Lightbulb' };

    /**
     * A stateful fake PlatformAccessory that remembers services added/removed
     * by name, mirroring how a cached PlatformAccessory survives across a
     * Homebridge restart. This lets a test call `SoundTouchZoneAccessory.create`
     * twice against the same accessory object to simulate a restart where
     * `accessoryType` changed in config between runs.
     */
    function makeStatefulAccessory() {
      const informationService = {
        setCharacteristic: jest.fn().mockReturnThis(),
      };
      const servicesByName = new Map<
        string,
        ReturnType<typeof makeHapService>
      >();

      const getService = jest.fn((query: unknown) => {
        if (query === ACCESSORY_INFORMATION) {
          return informationService;
        }
        return servicesByName.get(query as string);
      });

      const addService = jest.fn((_type: unknown, name: string) => {
        const service = makeHapService();
        servicesByName.set(name, service);
        return service;
      });

      const removeService = jest.fn((service: unknown) => {
        for (const [name, value] of servicesByName.entries()) {
          if (value === service) {
            servicesByName.delete(name);
          }
        }
      });

      return {
        accessory: { getService, addService, removeService },
        servicesByName,
        getService,
        addService,
        removeService,
      };
    }

    function buildPlatform() {
      return {
        service: {
          AccessoryInformation: ACCESSORY_INFORMATION,
          Switch: SWITCH,
          Lightbulb: LIGHTBULB,
        },
        characteristic: {
          On: 'OnUUID',
          Brightness: 'BrightnessUUID',
          Name: 'NameUUID',
          Manufacturer: 'ManufacturerUUID',
          Model: 'ModelUUID',
          SerialNumber: 'SerialNumberUUID',
        },
        api: {
          hap: {
            HapStatusError: FakeHapStatusError,
            HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
          },
        },
        logger: {
          homebridgeLogger: { log: jest.fn() },
          requiredLogLevel: 'debug',
          info: jest.fn(),
        },
      };
    }

    function configFor(accessoryType: AccessoryType): ZoneConfiguration {
      return ZoneConfiguration.create({
        name: 'Downstairs',
        primary: 'Kitchen',
        slaves: ['Lounge'],
        accessoryType,
      });
    }

    async function createZoneAccessory(props: {
      platform: ReturnType<typeof buildPlatform>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessory: any;
      accessoryType: AccessoryType;
      isNewAccessory: boolean;
    }) {
      const primary = fakeDevice('MASTER-1');
      const slaves = [fakeDevice('SLAVE-1')];

      const zoneAccessory = await SoundTouchZoneAccessory.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        platform: props.platform as any,
        accessory: props.accessory,
        config: configFor(props.accessoryType),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        primary: primary as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slaves: slaves as any,
        isNewAccessory: props.isNewAccessory,
      });

      // The reconciliation loop started by create()/init() schedules a real
      // setTimeout under fake timers; these tests only care about the
      // one-time service add/remove side effects of create(), not polling.
      zoneAccessory.stopPolling();

      return zoneAccessory;
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('adds a Switch service and no Lightbulb service when freshly created as a switch', async () => {
      jest.useFakeTimers();
      const platform = buildPlatform();
      const { accessory, addService, servicesByName } = makeStatefulAccessory();

      await createZoneAccessory({
        platform,
        accessory,
        accessoryType: 'switch',
        isNewAccessory: true,
      });

      expect(addService).toHaveBeenCalledWith(
        SWITCH,
        'Downstairs Zone ON Service',
        'ZONE'
      );
      expect(servicesByName.has('Downstairs Zone ON Service')).toBe(true);
      expect(servicesByName.has('Downstairs Zone LIGHTBULB Service')).toBe(
        false
      );
    });

    it('adds a Lightbulb service and no Switch service when freshly created as a lightbulb', async () => {
      jest.useFakeTimers();
      const platform = buildPlatform();
      const { accessory, addService, servicesByName } = makeStatefulAccessory();

      await createZoneAccessory({
        platform,
        accessory,
        accessoryType: 'lightbulb',
        isNewAccessory: true,
      });

      expect(addService).toHaveBeenCalledWith(
        LIGHTBULB,
        'Downstairs Zone LIGHTBULB Service',
        'ZONE'
      );
      expect(servicesByName.has('Downstairs Zone LIGHTBULB Service')).toBe(
        true
      );
      expect(servicesByName.has('Downstairs Zone ON Service')).toBe(false);
    });

    describe('when accessoryType changes across a restart', () => {
      it('removes the stale Switch service and adds a Lightbulb service when switching from switch to lightbulb', async () => {
        jest.useFakeTimers();
        const platform = buildPlatform();
        const { accessory, removeService, servicesByName } =
          makeStatefulAccessory();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'switch',
          isNewAccessory: true,
        });
        const staleSwitchService = servicesByName.get(
          'Downstairs Zone ON Service'
        );

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'lightbulb',
          isNewAccessory: false,
        });

        expect(removeService).toHaveBeenCalledWith(staleSwitchService);
        expect(servicesByName.has('Downstairs Zone ON Service')).toBe(false);
        expect(servicesByName.has('Downstairs Zone LIGHTBULB Service')).toBe(
          true
        );
      });

      it('removes the stale Lightbulb service and adds a Switch service when switching from lightbulb to switch', async () => {
        jest.useFakeTimers();
        const platform = buildPlatform();
        const { accessory, removeService, servicesByName } =
          makeStatefulAccessory();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'lightbulb',
          isNewAccessory: true,
        });
        const staleLightbulbService = servicesByName.get(
          'Downstairs Zone LIGHTBULB Service'
        );

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'switch',
          isNewAccessory: false,
        });

        expect(removeService).toHaveBeenCalledWith(staleLightbulbService);
        expect(servicesByName.has('Downstairs Zone LIGHTBULB Service')).toBe(
          false
        );
        expect(servicesByName.has('Downstairs Zone ON Service')).toBe(true);
      });
    });

    describe('when accessoryType is unchanged across a restart', () => {
      it('does not remove or duplicate the Switch service', async () => {
        jest.useFakeTimers();
        const platform = buildPlatform();
        const { accessory, addService, removeService, servicesByName } =
          makeStatefulAccessory();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'switch',
          isNewAccessory: true,
        });
        addService.mockClear();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'switch',
          isNewAccessory: false,
        });

        expect(removeService).not.toHaveBeenCalled();
        expect(addService).not.toHaveBeenCalled();
        expect(servicesByName.has('Downstairs Zone ON Service')).toBe(true);
      });

      it('does not remove or duplicate the Lightbulb service', async () => {
        jest.useFakeTimers();
        const platform = buildPlatform();
        const { accessory, addService, removeService, servicesByName } =
          makeStatefulAccessory();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'lightbulb',
          isNewAccessory: true,
        });
        addService.mockClear();

        await createZoneAccessory({
          platform,
          accessory,
          accessoryType: 'lightbulb',
          isNewAccessory: false,
        });

        expect(removeService).not.toHaveBeenCalled();
        expect(addService).not.toHaveBeenCalled();
        expect(servicesByName.has('Downstairs Zone LIGHTBULB Service')).toBe(
          true
        );
      });
    });
  });
});
