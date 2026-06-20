import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerBrightnessCharacteristic } from '../SoundTouchSpeakerBrightnessCharacteristic.js';
import { SoundTouchDevice } from '../../../devices/SoundTouch/SoundTouchDevice.js';
import { KeyValue } from '../../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

function build({
  volume = 50,
  isOn = true,
}: { volume?: number; isOn?: boolean } = {}) {
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

  jest.spyOn(SoundTouchDevice, 'deviceIsOn').mockResolvedValue(isOn);

  const subject = new SoundTouchSpeakerBrightnessCharacteristic({
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
      const { subject, hapCharacteristic, updateValue } = build({ volume: 42 });
      hapCharacteristic.value = 0;

      await subject.init();

      expect(updateValue).toHaveBeenCalledWith(42);
    });
  });

  describe('#refresh', () => {
    it('updates the HAP value with the actual volume from the device', async () => {
      const { subject, hapCharacteristic, updateValue } = build({ volume: 60 });
      hapCharacteristic.value = 40;

      await subject.refresh();

      expect(updateValue).toHaveBeenCalledWith(60);
    });

    it('does not update the HAP value when it has not changed', async () => {
      const { subject, hapCharacteristic, updateValue } = build({ volume: 50 });
      hapCharacteristic.value = 50;

      await subject.refresh();

      expect(updateValue).not.toHaveBeenCalled();
    });

    it('does not throw when the device returns no volume', async () => {
      const { subject, getVolume } = build();
      getVolume.mockResolvedValue(undefined as never);

      await expect(subject.refresh()).resolves.not.toThrow();
    });
  });

  describe('#getBrightness', () => {
    it('returns the actual volume from the device', async () => {
      const { subject } = build({ volume: 75 });

      const result = await subject.getBrightness();

      expect(result).toBe(75);
    });

    it('throws HapStatusError when the device is unreachable', async () => {
      const { subject, getVolume } = build();
      getVolume.mockRejectedValue(new Error('network error'));

      await expect(subject.getBrightness()).rejects.toBeInstanceOf(
        FakeHapStatusError
      );
    });
  });

  describe('#setBrightness', () => {
    describe('when value is 0', () => {
      it('powers off the device when it is on', async () => {
        const { subject, pressKey } = build({ isOn: true });

        await subject.setBrightness(0);

        expect(pressKey).toHaveBeenCalledWith(KeyValue.power);
      });

      it('does nothing when the device is already off', async () => {
        const { subject, pressKey } = build({ isOn: false });

        await subject.setBrightness(0);

        expect(pressKey).not.toHaveBeenCalled();
      });

      it('throws HapStatusError when the power-off command fails', async () => {
        const { subject, pressKey } = build({ isOn: true });
        pressKey.mockRejectedValue(new Error('network error'));

        await expect(subject.setBrightness(0)).rejects.toBeInstanceOf(
          FakeHapStatusError
        );
      });
    });

    describe('when value is greater than 0', () => {
      it('sets the volume to the given value', async () => {
        const { subject, setVolume } = build({ isOn: true });

        await subject.setBrightness(65);

        expect(setVolume).toHaveBeenCalledWith(65);
      });

      it('throws HapStatusError when the volume set fails', async () => {
        const { subject, setVolume } = build({ isOn: true });
        setVolume.mockRejectedValue(new Error('network error'));

        await expect(subject.setBrightness(65)).rejects.toBeInstanceOf(
          FakeHapStatusError
        );
      });
    });
  });
});
