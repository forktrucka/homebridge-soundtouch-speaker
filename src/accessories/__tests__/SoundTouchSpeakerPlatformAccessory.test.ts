import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerPlatformAccessory } from '../SoundTouchSpeakerPlatformAccessory.js';
import type { SoundTouchSpeakerCharacteristic } from '../services/SoundTouchSpeakerCharacteristic.js';
import type { GabboUpdateType } from '../../devices/SoundTouch/api/GabboClient.js';
import { LogLevel } from 'homebridge';

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;

function buildCharacteristic(gabboEvents: readonly GabboUpdateType[] = []) {
  const refresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const init = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { characteristic: { init, refresh, gabboEvents } as unknown as SoundTouchSpeakerCharacteristic, refresh, init };
}

function build(opts: { pollingInterval?: number; gabboEvents?: readonly GabboUpdateType[]; isConnected?: boolean } = {}) {
  const { pollingInterval = 0, gabboEvents = [], isConnected = true } = opts;
  const { characteristic, refresh } = buildCharacteristic(gabboEvents);

  const homebridgeLog = jest.fn();
  const gabboOn = jest.fn();
  const device = {
    name: 'Kitchen',
    configuration: { pollingInterval },
    gabbo: { on: gabboOn, connect: jest.fn(), disconnect: jest.fn(), isConnected },
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

  return { subject, refresh, homebridgeLog, gabboOn };
}

function getCallback(gabboOn: jest.Mock, event: string): () => void {
  const call = (gabboOn.mock.calls as [string, () => void][]).find(([e]) => e === event);
  if (!call) throw new Error(`No handler registered for gabbo event: ${event}`);
  return call[1];
}

describe('SoundTouchSpeakerPlatformAccessory', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('reconciliation polling', () => {
    it('always starts the reconciliation loop on init regardless of pollingInterval config', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not fire before the reconciliation interval elapses', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS - 1);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('logs a deprecation warning when pollingInterval is configured', async () => {
      jest.useFakeTimers();
      const { subject, homebridgeLog } = build({ pollingInterval: 5000 });

      await subject.init();

      expect(homebridgeLog).toHaveBeenCalledWith(
        LogLevel.WARN,
        expect.stringContaining('pollingInterval is deprecated')
      );
    });

    it('does not log a deprecation warning when pollingInterval is 0', async () => {
      jest.useFakeTimers();
      const { subject, homebridgeLog } = build({ pollingInterval: 0 });

      await subject.init();

      const warnCalls = (homebridgeLog.mock.calls as [string, string][]).filter(
        ([level]) => level === LogLevel.WARN
      );
      expect(warnCalls.every(([, msg]) => !msg.includes('pollingInterval'))).toBe(true);
    });

    it('stops the reconciliation loop after stopPolling is called', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build();

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      subject.stopPolling();
      // Drain any iteration already in flight before the stop took effect.
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);
      const callsAfterDrain = refresh.mock.calls.length;
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS * 3);

      expect(refresh.mock.calls).toHaveLength(callsAfterDrain);
    });

    it('skips refresh when the Gabbo socket is not connected', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build({ isConnected: false });

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('calls refresh when the Gabbo socket is connected', async () => {
      jest.useFakeTimers();
      const { subject, refresh } = build({ isConnected: true });

      await subject.init();
      await jest.advanceTimersByTimeAsync(RECONCILIATION_INTERVAL_MS);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('is safe to call stopPolling before init', () => {
      const { subject } = build();

      expect(() => subject.stopPolling()).not.toThrow();
    });
  });

  describe('gabbo event subscriptions', () => {
    it('subscribes only to events declared by characteristics', async () => {
      jest.useFakeTimers();
      const { subject, gabboOn } = build({ gabboEvents: ['volumeUpdated'] });

      await subject.init();

      const registeredEvents = (gabboOn.mock.calls as [string, unknown][]).map(([e]) => e);
      expect(registeredEvents).toContain('volumeUpdated');
      expect(registeredEvents).not.toContain('connectionStateUpdated');
      expect(registeredEvents).not.toContain('nowPlayingUpdated');
      expect(registeredEvents).not.toContain('bassUpdated');
    });

    it('does not register any gabbo handlers when no characteristic declares events', async () => {
      jest.useFakeTimers();
      const { subject, gabboOn } = build({ gabboEvents: [] });

      await subject.init();

      expect(gabboOn).not.toHaveBeenCalled();
    });

    it('calls refresh on the characteristic when its declared event fires', async () => {
      jest.useFakeTimers();
      const { subject, refresh, gabboOn } = build({ gabboEvents: ['volumeUpdated'] });

      await subject.init();
      getCallback(gabboOn, 'volumeUpdated')();
      await jest.advanceTimersByTimeAsync(0);

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not call refresh when an unsubscribed event fires', async () => {
      jest.useFakeTimers();
      const { subject, refresh, gabboOn } = build({ gabboEvents: ['volumeUpdated'] });

      await subject.init();

      const registeredEvents = (gabboOn.mock.calls as [string, unknown][]).map(([e]) => e);
      expect(registeredEvents).not.toContain('connectionStateUpdated');
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
