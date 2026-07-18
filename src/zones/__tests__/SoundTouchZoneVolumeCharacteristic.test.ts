import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchZoneVolumeCharacteristic } from '../SoundTouchZoneVolumeCharacteristic.js';
import type { Volume } from '../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

function fakeVolume(deviceId: string, actual: number): Volume {
  return { deviceId, target: actual, actual, isMuted: false };
}

function fakeDevice(props: { id: string; volume: number }) {
  const getVolume = jest
    .fn<() => Promise<Volume | undefined>>()
    .mockImplementation(() =>
      Promise.resolve(fakeVolume(props.id, props.volume))
    );
  const setVolume = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  return {
    id: props.id,
    name: props.id,
    api: {
      getVolume,
      setVolume,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };
}

async function build({
  primaryVolume = 20,
  slave1Volume = 20,
  slave2Volume = 20,
}: {
  primaryVolume?: number;
  slave1Volume?: number;
  slave2Volume?: number;
} = {}) {
  const updateValue = jest.fn();
  const hapCharacteristic = {
    value: undefined as number | undefined,
    updateValue,
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };

  const getCharacteristic = jest.fn().mockReturnValue(hapCharacteristic);
  const service = { getCharacteristic };

  const primary = fakeDevice({ id: 'MASTER-1', volume: primaryVolume });
  const slave1 = fakeDevice({ id: 'SLAVE-1', volume: slave1Volume });
  const slave2 = fakeDevice({ id: 'SLAVE-2', volume: slave2Volume });

  const platform = {
    characteristic: { Brightness: 'BrightnessUUID' },
    api: {
      hap: {
        HapStatusError: FakeHapStatusError,
        HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      },
    },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
  };

  const subject = await SoundTouchZoneVolumeCharacteristic.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: service as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary: primary as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slaves: [slave1, slave2] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: {} as any,
  });

  return {
    subject,
    hapCharacteristic,
    updateValue,
    primary,
    slave1,
    slave2,
  };
}

describe('SoundTouchZoneVolumeCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('#getBrightness', () => {
    it("returns the primary's current volume", async () => {
      const { subject } = await build({ primaryVolume: 35 });

      const result = await subject.getBrightness();

      expect(result).toBe(35);
    });
  });

  describe('#refresh', () => {
    it("updates the HAP value to the primary's volume when it changed", async () => {
      const { subject, hapCharacteristic } = await build({
        primaryVolume: 42,
      });
      hapCharacteristic.value = 20;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).toHaveBeenCalledWith(42);
    });

    it('does not update the HAP value when the volume is unchanged', async () => {
      const { subject, hapCharacteristic } = await build({
        primaryVolume: 20,
      });
      hapCharacteristic.value = 20;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).not.toHaveBeenCalled();
    });
  });

  describe('#setBrightness', () => {
    it('applies the same relative delta to the primary and every slave', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primaryVolume: 20,
        slave1Volume: 30,
        slave2Volume: 10,
      });

      // primary moves from 20 -> 30, a delta of +10
      await subject.setBrightness(30);

      expect(primary.api.setVolume).toHaveBeenCalledWith(30);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(40);
      expect(slave2.api.setVolume).toHaveBeenCalledWith(20);
    });

    it('clamps a slave at 100 when the delta would push it over the max', async () => {
      const { subject, primary, slave1 } = await build({
        primaryVolume: 20,
        slave1Volume: 95,
      });

      // delta of +10
      await subject.setBrightness(30);

      expect(primary.api.setVolume).toHaveBeenCalledWith(30);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(100);
    });

    it('clamps a slave at 0 when the delta would push it under the min', async () => {
      const { subject, primary, slave1 } = await build({
        primaryVolume: 20,
        slave1Volume: 5,
      });

      // delta of -15
      await subject.setBrightness(5);

      expect(primary.api.setVolume).toHaveBeenCalledWith(5);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(0);
    });

    it('is a no-op when the value is 0', async () => {
      const { subject, primary, slave1, slave2 } = await build();

      await subject.setBrightness(0);

      expect(primary.api.setVolume).not.toHaveBeenCalled();
      expect(slave1.api.setVolume).not.toHaveBeenCalled();
      expect(slave2.api.setVolume).not.toHaveBeenCalled();
    });
  });

  describe('gabbo events', () => {
    it('listens for volumeUpdated so a push from the primary triggers a refresh', async () => {
      const { subject } = await build();

      expect(subject.gabboEvents).toEqual(['volumeUpdated']);
    });
  });
});
