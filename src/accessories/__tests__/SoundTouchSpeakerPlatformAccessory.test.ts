import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerPlatformAccessory } from '../SoundTouchSpeakerPlatformAccessory.js';
import type { SoundTouchSpeakerCharacteristic } from '../services/SoundTouchSpeakerCharacteristic.js';

function build(pollingInterval: number) {
  const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const init = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const characteristic = { init, refresh } as unknown as SoundTouchSpeakerCharacteristic;

  const device = { name: 'Kitchen', configuration: { pollingInterval } };
  const platform = {
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
  };

  const subject = SoundTouchSpeakerPlatformAccessory.createWithCharacteristics({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    device: device as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    speakerCharacteristics: [characteristic],
  });

  return { subject, refresh };
}

describe('SoundTouchSpeakerPlatformAccessory', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('polling lifecycle', () => {
    it('does not start polling when the interval is 0 (disabled)', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(0);

      await subject.init();
      await jest.advanceTimersByTimeAsync(10000);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('polls on the configured interval when it is greater than 0', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(1000);

      await subject.init();
      await jest.advanceTimersByTimeAsync(1000);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('stops the polling loop after stopPolling is called', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(1000);

      await subject.init();
      await jest.advanceTimersByTimeAsync(1000);

      subject.stopPolling();
      // Drain any iteration already scheduled before the stop took effect.
      await jest.advanceTimersByTimeAsync(1000);
      const callsAfterStop = refresh.mock.calls.length;
      await jest.advanceTimersByTimeAsync(10000);

      expect(refresh.mock.calls).toHaveLength(callsAfterStop);
    });

    it('is safe to call stopPolling when not polling', () => {
      const { subject } = build(0);

      expect(() => subject.stopPolling()).not.toThrow();
    });
  });
});
