import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerPlatformAccessory } from '../SoundTouchSpeakerPlatformAccessory.js';
import type { SoundTouchSpeakerCharacteristic } from '../services/SoundTouchSpeakerCharacteristic.js';
import { LogLevel } from 'homebridge';

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;

function build(pollingInterval = 0) {
  const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const init = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const characteristic = { init, refresh } as unknown as SoundTouchSpeakerCharacteristic;

  const homebridgeLog = jest.fn();
  const gabboOn = jest.fn();
  const gabboDevice = {
    on: gabboOn,
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
  const device = {
    name: 'Kitchen',
    configuration: { pollingInterval },
    gabbo: gabboDevice,
    connectGabbo: jest.fn(),
    disconnectGabbo: jest.fn(),
  };
  const platform = {
    logger: { homebridgeLogger: { log: homebridgeLog }, requiredLogLevel: LogLevel.DEBUG },
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

  return { subject, refresh, homebridgeLog };
}

describe('SoundTouchSpeakerPlatformAccessory', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('reconciliation polling', () => {
    it('always starts the reconciliation loop on init regardless of pollingInterval config', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(0);

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not fire before the reconciliation interval elapses', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(0);

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS - 1);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('logs a deprecation warning when pollingInterval is configured', async () => {
      jest.useFakeTimers();
      const { subject, homebridgeLog } = build(5000);

      await subject.init();

      expect(homebridgeLog).toHaveBeenCalledWith(
        LogLevel.WARN,
        expect.stringContaining('pollingInterval is deprecated')
      );
    });

    it('does not log a deprecation warning when pollingInterval is 0', async () => {
      jest.useFakeTimers();
      const { subject, homebridgeLog } = build(0);

      await subject.init();

      const warnCalls = (homebridgeLog.mock.calls as [string, string][]).filter(
        ([level]) => level === LogLevel.WARN
      );
      expect(warnCalls.every(([, msg]) => !msg.includes('pollingInterval'))).toBe(true);
    });

    it('stops the reconciliation loop after stopPolling is called', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build(0);

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      subject.stopPolling();
      // Drain any iteration already in flight before the stop took effect.
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);
      const callsAfterDrain = refresh.mock.calls.length;
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS * 3);

      expect(refresh.mock.calls).toHaveLength(callsAfterDrain);
    });

    it('is safe to call stopPolling before init', () => {
      const { subject } = build(0);

      expect(() => subject.stopPolling()).not.toThrow();
    });
  });
});
