import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerOnCharacteristic } from '../SoundTouchSpeakerOnCharacteristic.js';
import { SourceStatus } from '../../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

async function build({ source = SourceStatus.ready }: { source?: string } = {}) {
  const updateValue = jest.fn();
  const hapCharacteristic = {
    value: source !== SourceStatus.standBy,
    updateValue,
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };

  const getCharacteristic = jest.fn().mockReturnValue(hapCharacteristic);
  const service = { getCharacteristic };

  const getSource = jest
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValue(source);
  const pressKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

  const device = {
    name: 'Test Speaker',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { getSource, pressKey } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };

  const platform = {
    characteristic: { On: 'OnUUID' },
    api: {
      hap: {
        HapStatusError: FakeHapStatusError,
        HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      },
    },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
  };

  const subject = await SoundTouchSpeakerOnCharacteristic.create({
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
    getSource,
    pressKey,
    updateValue,
  };
}

describe('SoundTouchSpeakerOnCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('#getOn', () => {
    it('returns true when the device is playing a source', async () => {
      const { subject } = await build({ source: SourceStatus.ready });

      const result = await subject.getOn();

      expect(result).toBe(true);
    });

    it('returns false when the device is in standby', async () => {
      const { subject } = await build({ source: SourceStatus.standBy });

      const result = await subject.getOn();

      expect(result).toBe(false);
    });

    it('throws HapStatusError via HAP binding when the device is unreachable', async () => {
      const { hapCharacteristic, getSource } = await build();
      getSource.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onGet.mock.calls[0]?.[0] as () => Promise<unknown>;
      await expect(handler()).rejects.toBeInstanceOf(FakeHapStatusError);
    });
  });

  describe('#setOn', () => {
    describe('when the cached value has drifted from the live device state', () => {
      it('does not press the power key when the live state already matches the target', async () => {
        // Cache says off, but the device is actually on and the target is on.
        const { subject, hapCharacteristic, pressKey } = await build({
          source: SourceStatus.ready,
        });
        hapCharacteristic.value = false;

        await subject.setOn(true);

        expect(pressKey).not.toHaveBeenCalled();
      });

      it('presses the power key when the live state differs from the target', async () => {
        // Cache says on, but the device is actually in standby and the target is on.
        const { subject, hapCharacteristic, pressKey } = await build({
          source: SourceStatus.standBy,
        });
        hapCharacteristic.value = true;

        await subject.setOn(true);

        expect(pressKey).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the live state matches the target', () => {
      it('does not press the power key', async () => {
        const { subject, pressKey } = await build({ source: SourceStatus.ready });

        await subject.setOn(true);

        expect(pressKey).not.toHaveBeenCalled();
      });
    });

    describe('when the live state differs from the target', () => {
      it('presses the power key', async () => {
        const { subject, pressKey } = await build({ source: SourceStatus.standBy });

        await subject.setOn(true);

        expect(pressKey).toHaveBeenCalledTimes(1);
      });
    });

    it('throws HapStatusError via HAP binding when the live read fails', async () => {
      const { hapCharacteristic, getSource } = await build();
      getSource.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (v: unknown) => Promise<void>;
      await expect(handler(true)).rejects.toBeInstanceOf(FakeHapStatusError);
    });
  });
});
