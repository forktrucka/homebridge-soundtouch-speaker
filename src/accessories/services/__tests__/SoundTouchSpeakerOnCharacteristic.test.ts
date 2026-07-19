import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  SoundTouchSpeakerOnCharacteristic,
  POWER_KEY_HOLD_DURATION_MS,
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

        expect(holdKey).not.toHaveBeenCalled();
      });

      it('holds the power key when the live state differs from the target', async () => {
        // Cache says on, but the device is actually in standby and the target is on.
        const { subject, hapCharacteristic, holdKey } = await build({
          source: SourceStatus.standBy,
        });
        hapCharacteristic.value = true;

        await subject.setOn(true);

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

        expect(holdKey).not.toHaveBeenCalled();
      });

      it('does not resume a source', async () => {
        const { subject, getRecents, selectSource } = await build({
          source: SourceStatus.ready,
        });

        await subject.setOn(true);

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

        expect(getRecents).toHaveBeenCalledTimes(1);
        expect(selectSource).not.toHaveBeenCalled();
      });

      it('does not resume a source when powering off', async () => {
        const { subject, getRecents, selectSource } = await build({
          source: SourceStatus.ready,
        });

        await subject.setOn(false);

        expect(getRecents).not.toHaveBeenCalled();
        expect(selectSource).not.toHaveBeenCalled();
      });
    });

    it('throws HapStatusError via HAP binding when the live read fails', async () => {
      const { hapCharacteristic, getSource } = await build();
      getSource.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (
        v: unknown
      ) => Promise<void>;
      await expect(handler(true)).rejects.toBeInstanceOf(FakeHapStatusError);
    });

    describe('when calls overlap (rapid taps without awaiting between them)', () => {
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      it('settles the device to the value requested by the LAST call, not an earlier one', async () => {
        // Simulated device power state, independent of the mocked cached
        // HAP characteristic value. `getSource` reads it live (with a
        // delay); `holdKey` toggles it after a longer delay, modelling the
        // real 300ms POWER hold. This keeps the stale-read window open long
        // enough for overlapping `setOn` calls to race if unserialized.
        let deviceOn = true;

        const { subject, getSource, holdKey } = await build({
          source: SourceStatus.ready,
        });
        getSource.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve(deviceOn ? SourceStatus.ready : SourceStatus.standBy),
                5
              )
            )
        );
        holdKey.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                deviceOn = !deviceOn;
                resolve(true);
              }, 30)
            )
        );

        // Mirrors HAP delivering rapid taps: fire without awaiting between calls.
        const p1 = subject.setOn(false);
        const p2 = subject.setOn(true);
        const p3 = subject.setOn(false);

        await Promise.all([p1, p2, p3]);
        // Allow any stray (buggy, unserialized) in-flight holdKey timers to settle
        // before asserting, so the assertion reflects the fully-settled state.
        await delay(100);

        expect(deviceOn).toBe(false);
      });
    });
  });
});
