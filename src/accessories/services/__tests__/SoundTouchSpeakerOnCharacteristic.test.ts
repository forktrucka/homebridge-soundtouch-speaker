import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  SoundTouchSpeakerOnCharacteristic,
  POWER_KEY_HOLD_DURATION_MS,
  SET_ON_DEBOUNCE_MS,
} from '../SoundTouchSpeakerOnCharacteristic.js';
import {
  SourceStatus,
  Recent,
  KeyValue,
} from '../../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

async function build({
  source = SourceStatus.ready,
}: { source?: string } = {}) {
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
  const holdKey = jest
    .fn<(value: KeyValue, duration?: number) => Promise<boolean>>()
    .mockResolvedValue(true);
  const getRecents = jest
    .fn<() => Promise<Recent[] | undefined>>()
    .mockResolvedValue(undefined);
  const selectSource = jest
    .fn<() => Promise<boolean>>()
    .mockResolvedValue(true);

  const device = {
    name: 'Test Speaker',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { getSource, pressKey, holdKey, getRecents, selectSource } as any,
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
    holdKey,
    getRecents,
    selectSource,
    updateValue,
  };
}

// Advances past the debounce window and flushes the microtasks it triggers
// (the live read, and optionally holdKey/resumeLastPlayedSource/updateValue),
// so the debounced action has fully settled before assertions run.
async function settle(extraMs = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(SET_ON_DEBOUNCE_MS + extraMs);
}

describe('SoundTouchSpeakerOnCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

      const handler = hapCharacteristic.onGet.mock
        .calls[0]?.[0] as () => Promise<unknown>;
      await expect(handler()).rejects.toBeInstanceOf(FakeHapStatusError);
    });
  });

  describe('#setOn', () => {
    describe('when the cached value has drifted from the live device state', () => {
      it('does not hold the power key when the live state already matches the target', async () => {
        // Cache says off, but the device is actually on and the target is on.
        const { subject, hapCharacteristic, holdKey } = await build({
          source: SourceStatus.ready,
        });
        hapCharacteristic.value = false;

        await subject.setOn(true);
        await settle();

        expect(holdKey).not.toHaveBeenCalled();
      });

      it('holds the power key when the live state differs from the target', async () => {
        // Cache says on, but the device is actually in standby and the target is on.
        const { subject, hapCharacteristic, holdKey } = await build({
          source: SourceStatus.standBy,
        });
        hapCharacteristic.value = true;

        await subject.setOn(true);
        await settle();

        expect(holdKey).toHaveBeenCalledTimes(1);
        expect(holdKey).toHaveBeenCalledWith(
          KeyValue.power,
          POWER_KEY_HOLD_DURATION_MS
        );
      });
    });

    describe('when the live state matches the target', () => {
      it('does not hold the power key', async () => {
        const { subject, holdKey } = await build({
          source: SourceStatus.ready,
        });

        await subject.setOn(true);
        await settle();

        expect(holdKey).not.toHaveBeenCalled();
      });

      it('does not resume a source', async () => {
        const { subject, getRecents, selectSource } = await build({
          source: SourceStatus.ready,
        });

        await subject.setOn(true);
        await settle();

        expect(getRecents).not.toHaveBeenCalled();
        expect(selectSource).not.toHaveBeenCalled();
      });
    });

    describe('when the live state differs from the target', () => {
      it('holds the power key for the deliberate hold duration instead of a bare press', async () => {
        const { subject, pressKey, holdKey } = await build({
          source: SourceStatus.standBy,
        });

        await subject.setOn(true);
        await settle();

        expect(pressKey).not.toHaveBeenCalled();
        expect(holdKey).toHaveBeenCalledTimes(1);
        expect(holdKey).toHaveBeenCalledWith(
          KeyValue.power,
          POWER_KEY_HOLD_DURATION_MS
        );
      });

      it('resumes the most recent source after powering on', async () => {
        const { subject, getRecents, selectSource, holdKey } = await build({
          source: SourceStatus.standBy,
        });
        const mostRecentContentItem = { source: 'SPOTIFY', sourceAccount: 'a' };
        getRecents.mockResolvedValue([
          { contentItem: mostRecentContentItem, utcTime: new Date() },
          {
            contentItem: { source: 'AUX', sourceAccount: 'AUX' },
            utcTime: new Date(),
          },
        ]);

        await subject.setOn(true);
        await settle();

        expect(holdKey).toHaveBeenCalledTimes(1);
        expect(getRecents).toHaveBeenCalledTimes(1);
        expect(selectSource).toHaveBeenCalledWith(mostRecentContentItem);
      });

      it('does not select a source when there are no recents', async () => {
        const { subject, getRecents, selectSource } = await build({
          source: SourceStatus.standBy,
        });
        getRecents.mockResolvedValue(undefined);

        await subject.setOn(true);
        await settle();

        expect(getRecents).toHaveBeenCalledTimes(1);
        expect(selectSource).not.toHaveBeenCalled();
      });

      it('does not resume a source when powering off', async () => {
        const { subject, getRecents, selectSource } = await build({
          source: SourceStatus.ready,
        });

        await subject.setOn(false);
        await settle();

        expect(getRecents).not.toHaveBeenCalled();
        expect(selectSource).not.toHaveBeenCalled();
      });
    });

    it('resolves the HAP set handler promptly, without waiting on the debounced action', async () => {
      // Never resolves within the test - if the returned setOn promise waited
      // on this, the assertion below would hang/timeout instead of settling.
      const { subject, holdKey } = await build({
        source: SourceStatus.standBy,
      });
      holdKey.mockImplementation(() => new Promise(() => undefined));

      const handlerPromise = subject.setOn(true);

      await expect(handlerPromise).resolves.toBeUndefined();
      // The debounce timer hasn't fired yet, so the device action - which
      // would hang - has not started.
      expect(holdKey).not.toHaveBeenCalled();
    });

    describe('when a single call is made (no burst)', () => {
      it('still applies after the debounce window elapses', async () => {
        const { subject, holdKey } = await build({
          source: SourceStatus.standBy,
        });

        await subject.setOn(true);

        // Not yet applied - still within the debounce window.
        expect(holdKey).not.toHaveBeenCalled();

        await settle();

        expect(holdKey).toHaveBeenCalledTimes(1);
        expect(holdKey).toHaveBeenCalledWith(
          KeyValue.power,
          POWER_KEY_HOLD_DURATION_MS
        );
      });
    });

    describe('when calls overlap (rapid taps without awaiting between them)', () => {
      it('coalesces N rapid calls into exactly ONE physical action, targeting the LAST requested value', async () => {
        const { subject, getSource, holdKey } = await build({
          source: SourceStatus.ready,
        });

        // Fire a burst of taps in quick succession, each well inside the
        // debounce window, mirroring HAP delivering rapid onSet calls.
        const p1 = subject.setOn(false);
        await jest.advanceTimersByTimeAsync(SET_ON_DEBOUNCE_MS / 4);
        const p2 = subject.setOn(true);
        await jest.advanceTimersByTimeAsync(SET_ON_DEBOUNCE_MS / 4);
        const p3 = subject.setOn(false);

        await Promise.all([p1, p2, p3]);
        await settle();

        // Only one physical action runs for the whole burst - not one per
        // setOn call - and it targets the LAST requested value (false), not
        // an intermediate one (true). (getSource is read twice: once inside
        // the debounced action to decide whether to press, once more for
        // the post-settle live re-read that closes the loop via updateValue
        // - see "closing the loop" below - so it isn't the right signal for
        // coalescing on its own.)
        expect(getSource).toHaveBeenCalledTimes(2);
        expect(holdKey).toHaveBeenCalledTimes(1);
      });

      it('does not block each individual setOn call on the debounced device action completing', async () => {
        const { subject, holdKey } = await build({
          source: SourceStatus.standBy,
        });
        let holdKeyResolved = false;
        holdKey.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                holdKeyResolved = true;
                resolve(true);
              }, 5_000)
            )
        );

        const p1 = subject.setOn(false);
        const p2 = subject.setOn(true);
        const p3 = subject.setOn(false);

        // All three acks resolve immediately - well before the debounce
        // window even elapses, let alone the (delayed) holdKey call.
        await Promise.all([p1, p2, p3]);

        expect(holdKeyResolved).toBe(false);
        expect(holdKey).not.toHaveBeenCalled();
      });
    });

    describe('closing the loop with a live re-read after the debounced action settles', () => {
      it('pushes updateValue with the live device state on the success path', async () => {
        const { subject, updateValue, getSource } = await build({
          source: SourceStatus.standBy,
        });
        // After the power toggle applies, the device is actually on.
        getSource
          .mockResolvedValueOnce(SourceStatus.standBy)
          .mockResolvedValue(SourceStatus.ready);

        await subject.setOn(true);
        await settle();

        expect(updateValue).toHaveBeenCalledWith(true);
      });

      it('pushes updateValue with the actual device state and logs rather than throws when the device action fails', async () => {
        const { subject, updateValue, holdKey } = await build({
          source: SourceStatus.standBy,
        });
        holdKey.mockRejectedValue(new Error('device unreachable'));

        await subject.setOn(true);

        // The debounced action's rejection must not become an unhandled
        // rejection or bubble out of the timer callback.
        await expect(settle()).resolves.toBeUndefined();

        // Live re-read still ran despite the holdKey failure, and reports
        // the actual (unchanged, still standby) state - not the optimistic
        // requested value.
        expect(updateValue).toHaveBeenCalledWith(false);
      });
    });

    it('does not propagate a live-read failure to the HAP set handler (it settles, then updates via reconciliation instead)', async () => {
      // Because the debounced action now runs after the HAP ack, a
      // `deviceIsOn` failure can no longer surface as a synchronous
      // HapStatusError from the set handler - it's caught and logged in the
      // debounced action instead (see the "closing the loop" tests above).
      const { hapCharacteristic, getSource } = await build();
      getSource.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (
        v: unknown
      ) => Promise<void>;

      await expect(handler(true)).resolves.toBeUndefined();
    });
  });
});
