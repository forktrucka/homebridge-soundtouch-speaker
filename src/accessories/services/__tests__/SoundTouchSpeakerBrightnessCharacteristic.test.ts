import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerBrightnessCharacteristic } from '../SoundTouchSpeakerBrightnessCharacteristic.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

async function build({ volume = 50 }: { volume?: number } = {}) {
  const updateValue = jest.fn();
  const hapCharacteristic = {
    value: volume as number | boolean,
    updateValue,
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };

  const getCharacteristic = jest.fn().mockReturnValue(hapCharacteristic);
  const service = { getCharacteristic };

  const getVolume = jest
    .fn<
      () => Promise<{
        actual: number;
        target: number;
        isMuted: boolean;
        deviceId: string;
      }>
    >()
    .mockResolvedValue({
      actual: volume,
      target: volume,
      isMuted: false,
      deviceId: 'abc',
    });
  const setVolume = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const pressKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

  const device = {
    name: 'Test Speaker',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { getVolume, setVolume, pressKey } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };

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

  const subject = await SoundTouchSpeakerBrightnessCharacteristic.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: service as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    device: device as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: {} as any,
  });

  return {
    subject,
    hapCharacteristic,
    getVolume,
    setVolume,
    pressKey,
    updateValue,
  };
}

describe('SoundTouchSpeakerBrightnessCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('#init', () => {
    it('refreshes the characteristic value on init', async () => {
      const { subject, hapCharacteristic, updateValue } = await build({ volume: 42 });
      hapCharacteristic.value = 0;

      await subject.init();

      expect(updateValue).toHaveBeenCalledWith(42);
    });
  });

  describe('#refresh', () => {
    it('updates the HAP value with the actual volume from the device', async () => {
      const { subject, hapCharacteristic, updateValue } = await build({ volume: 60 });
      hapCharacteristic.value = 40;

      await subject.refresh();

      expect(updateValue).toHaveBeenCalledWith(60);
    });

    it('does not update the HAP value when it has not changed', async () => {
      const { subject, hapCharacteristic, updateValue } = await build({ volume: 50 });
      hapCharacteristic.value = 50;

      await subject.refresh();

      expect(updateValue).not.toHaveBeenCalled();
    });

    it('does not throw when the device returns no volume', async () => {
      const { subject, getVolume } = await build();
      getVolume.mockResolvedValue(undefined as never);

      await expect(subject.refresh()).resolves.not.toThrow();
    });
  });

  describe('#getBrightness', () => {
    it('returns the actual volume from the device', async () => {
      const { subject } = await build({ volume: 75 });

      const result = await subject.getBrightness();

      expect(result).toBe(75);
    });

    it('throws HapStatusError via HAP binding when the device is unreachable', async () => {
      const { hapCharacteristic, getVolume } = await build();
      getVolume.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onGet.mock.calls[0]?.[0] as () => Promise<unknown>;
      await expect(handler()).rejects.toBeInstanceOf(FakeHapStatusError);
    });
  });

  describe('#setBrightness', () => {
    describe('when value is 0', () => {
      it('is a no-op — power-off is owned by setOn', async () => {
        const { subject, pressKey, setVolume } = await build();

        await subject.setBrightness(0);

        expect(pressKey).not.toHaveBeenCalled();
        expect(setVolume).not.toHaveBeenCalled();
      });
    });

    describe('when value is greater than 0', () => {
      it('sets the volume to the given value', async () => {
        const { subject, setVolume } = await build();

        await subject.setBrightness(65);

        expect(setVolume).toHaveBeenCalledWith(65);
      });

      it('throws HapStatusError via HAP binding when the volume set fails', async () => {
        const { hapCharacteristic, setVolume } = await build();
        setVolume.mockRejectedValue(new Error('network error'));

        const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (v: unknown) => Promise<void>;
        await expect(handler(65)).rejects.toBeInstanceOf(FakeHapStatusError);
      });
    });
  });
});
