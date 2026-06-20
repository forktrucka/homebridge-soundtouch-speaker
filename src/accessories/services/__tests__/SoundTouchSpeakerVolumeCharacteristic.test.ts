import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerVolumeCharacteristic } from '../SoundTouchSpeakerVolumeCharacteristic.js';
import type { Volume } from '../../../devices/SoundTouch/api/volume.js';

class FakeCharacteristic {
  value: unknown = null;
  readonly updateValue = jest.fn((value: unknown) => {
    this.value = value;
    return this;
  });
  readonly onSet = jest.fn(() => this);
  readonly onGet = jest.fn(() => this);
}

class HapStatusError extends Error {
  constructor(readonly hapStatus: number) {
    super(`HapStatusError ${hapStatus}`);
  }
}

function volume(actual: number): Volume {
  return { deviceId: 'DEV1', target: actual, actual, isMuted: false };
}

function build() {
  const characteristic = new FakeCharacteristic();
  const VolumeIdentifier = { name: 'Volume' };
  const service = {
    getCharacteristic: jest.fn(() => characteristic),
  };
  const api = {
    getVolume: jest.fn<() => Promise<Volume | undefined>>(),
    setVolume: jest.fn<(value: number) => Promise<boolean>>(),
  };
  const device = { name: 'Kitchen', api };
  const platform = {
    characteristic: { Volume: VolumeIdentifier },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
    api: {
      hap: {
        HapStatusError,
        HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any = { service, device, platform, accessory: {} };
  const subject = new SoundTouchSpeakerVolumeCharacteristic(props);

  return { subject, characteristic, api, service, device, platform };
}

describe('SoundTouchSpeakerVolumeCharacteristic', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  describe('#getVolume', () => {
    it('returns the actual volume reported by the device', async () => {
      harness.api.getVolume.mockResolvedValue(volume(42));

      await expect(harness.subject.getVolume()).resolves.toBe(42);
    });

    it('returns 0 when the device reports no volume', async () => {
      harness.api.getVolume.mockResolvedValue(undefined);

      await expect(harness.subject.getVolume()).resolves.toBe(0);
    });
  });

  describe('#setVolume', () => {
    it('sends the desired volume to the device', async () => {
      harness.api.setVolume.mockResolvedValue(true);

      await harness.subject.setVolume(55);

      expect(harness.api.setVolume).toHaveBeenCalledWith(55);
    });

    it('throws a HAP communication error when the device call fails', async () => {
      harness.api.setVolume.mockRejectedValue(new Error('unreachable'));

      await expect(harness.subject.setVolume(30)).rejects.toBeInstanceOf(
        HapStatusError
      );
    });
  });

  describe('#init', () => {
    it('refreshes the characteristic from the device on startup', async () => {
      harness.api.getVolume.mockResolvedValue(volume(15));

      await harness.subject.init();

      expect(harness.characteristic.updateValue).toHaveBeenCalledWith(15);
    });
  });

  describe('.create', () => {
    it('resolves to a volume characteristic instance', async () => {
      const { service, device, platform } = build();

      const created = await SoundTouchSpeakerVolumeCharacteristic.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service: service as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        device: device as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        platform: platform as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accessory: {} as any,
      });

      expect(created).toBeInstanceOf(SoundTouchSpeakerVolumeCharacteristic);
    });
  });

  describe('#refresh', () => {
    it('pushes the actual volume to HomeKit when it has changed', async () => {
      harness.api.getVolume.mockResolvedValue(volume(70));

      await harness.subject.refresh();

      expect(harness.characteristic.updateValue).toHaveBeenCalledWith(70);
    });

    it('does not update HomeKit when the volume is unchanged', async () => {
      harness.characteristic.value = 70;
      harness.api.getVolume.mockResolvedValue(volume(70));

      await harness.subject.refresh();

      expect(harness.characteristic.updateValue).not.toHaveBeenCalled();
    });

    it('does nothing when the device reports no volume', async () => {
      harness.api.getVolume.mockResolvedValue(undefined);

      await harness.subject.refresh();

      expect(harness.characteristic.updateValue).not.toHaveBeenCalled();
    });
  });
});
