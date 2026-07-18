import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { SoundTouchZoneAccessory } from '../SoundTouchZoneAccessory.js';
import { ZoneConfiguration } from '../../PlatformConfiguration.js';

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
  return {
    id,
    name: id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { host: '10.0.0.1', getZone, getSource } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };
}

async function build({ isNewAccessory }: { isNewAccessory: boolean }) {
  const setCharacteristic = jest.fn().mockReturnThis();
  const informationService = { setCharacteristic };

  const switchHapCharacteristic = {
    value: undefined as boolean | undefined,
    updateValue: jest.fn(),
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };
  const switchService = {
    getCharacteristic: jest.fn().mockReturnValue(switchHapCharacteristic),
  };

  const ACCESSORY_INFORMATION = { name: 'AccessoryInformation' };
  const SWITCH = { name: 'Switch' };

  const getService = jest.fn((query: unknown) => {
    if (query === ACCESSORY_INFORMATION) {
      return informationService;
    }
    return undefined;
  });
  const addService = jest.fn().mockReturnValue(switchService);
  const removeService = jest.fn();

  const accessory = { getService, addService, removeService };

  const platform = {
    service: { AccessoryInformation: ACCESSORY_INFORMATION, Switch: SWITCH },
    characteristic: {
      On: 'OnUUID',
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

  const config = ZoneConfiguration.create({
    name: 'Downstairs',
    primary: 'Kitchen',
    slaves: ['Lounge'],
  });

  const primary = fakeDevice('MASTER-1');
  const slaves = [fakeDevice('SLAVE-1')];

  const zoneAccessory = await SoundTouchZoneAccessory.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: accessory as any,
    config,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary: primary as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slaves: slaves as any,
    isNewAccessory,
  });

  // Stop the reconciliation loop started by init() — these tests only care
  // about the one-time AccessoryInformation side effects of create().
  zoneAccessory.stopPolling();

  return { setCharacteristic, platform };
}

describe('SoundTouchZoneAccessory information characteristic', () => {
  beforeEach(() => {
    // The reconciliation loop started by create()/init() schedules a real
    // setTimeout; fake timers keep it from ever firing during this suite,
    // which only cares about the one-time AccessoryInformation side effects.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the zone accessory is newly created', () => {
    it('sets the Name characteristic to the zone config name', async () => {
      const { setCharacteristic, platform } = await build({
        isNewAccessory: true,
      });

      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.Name,
        'Downstairs'
      );
    });

    it('sets Manufacturer, Model, and SerialNumber', async () => {
      const { setCharacteristic, platform } = await build({
        isNewAccessory: true,
      });

      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.Manufacturer,
        'Bose'
      );
      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.Model,
        'SoundTouch Zone'
      );
      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.SerialNumber,
        'zone::Downstairs'
      );
    });
  });

  describe('when the zone accessory is restored from the Homebridge cache', () => {
    it('does not set the Name characteristic', async () => {
      const { setCharacteristic, platform } = await build({
        isNewAccessory: false,
      });

      expect(setCharacteristic).not.toHaveBeenCalledWith(
        platform.characteristic.Name,
        expect.anything()
      );
    });

    it('still sets Manufacturer, Model, and SerialNumber', async () => {
      const { setCharacteristic, platform } = await build({
        isNewAccessory: false,
      });

      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.Manufacturer,
        'Bose'
      );
      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.Model,
        'SoundTouch Zone'
      );
      expect(setCharacteristic).toHaveBeenCalledWith(
        platform.characteristic.SerialNumber,
        'zone::Downstairs'
      );
    });
  });
});
