import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchZoneAccessory } from '../SoundTouchZoneAccessory.js';
import { LogLevel } from 'homebridge';
import { Logger } from '../../utils/FormattedLogger.js';

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
});
