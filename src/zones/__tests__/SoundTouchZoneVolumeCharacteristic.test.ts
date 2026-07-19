import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  SoundTouchZoneVolumeCharacteristic,
  SET_ZONE_VOLUME_DEBOUNCE_MS,
} from '../SoundTouchZoneVolumeCharacteristic.js';
import type { Volume } from '../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

function fakeVolume(deviceId: string, actual: number): Volume {
  return { deviceId, target: actual, actual, isMuted: false };
}

function fakeDevice(props: { id: string; volume: number }) {
  const getVolume = jest
    .fn<() => Promise<Volume | undefined>>()
    .mockImplementation(() =>
      Promise.resolve(fakeVolume(props.id, props.volume))
    );
  const setVolume = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  return {
    id: props.id,
    name: props.id,
    api: {
      getVolume,
      setVolume,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };
}

async function build({
  primaryVolume = 20,
  slave1Volume = 20,
  slave2Volume = 20,
}: {
  primaryVolume?: number;
  slave1Volume?: number;
  slave2Volume?: number;
} = {}) {
  const updateValue = jest.fn();
  const hapCharacteristic = {
    value: undefined as number | undefined,
    updateValue,
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };

  const getCharacteristic = jest.fn().mockReturnValue(hapCharacteristic);
  const service = { getCharacteristic };

  const primary = fakeDevice({ id: 'MASTER-1', volume: primaryVolume });
  const slave1 = fakeDevice({ id: 'SLAVE-1', volume: slave1Volume });
  const slave2 = fakeDevice({ id: 'SLAVE-2', volume: slave2Volume });

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

  const subject = await SoundTouchZoneVolumeCharacteristic.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: service as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primary: primary as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slaves: [slave1, slave2] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: {} as any,
  });

  return {
    subject,
    hapCharacteristic,
    updateValue,
    primary,
    slave1,
    slave2,
  };
}

// Advances past the debounce window and flushes the microtasks it triggers
// (the primary read, member reads/writes, and the live re-read/updateValue),
// so the debounced action has fully settled before assertions run.
async function settle(extraMs = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(SET_ZONE_VOLUME_DEBOUNCE_MS + extraMs);
}

describe('SoundTouchZoneVolumeCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('#getBrightness', () => {
    it("returns the primary's current volume", async () => {
      const { subject } = await build({ primaryVolume: 35 });

      const result = await subject.getBrightness();

      expect(result).toBe(35);
    });
  });

  describe('#refresh', () => {
    it("updates the HAP value to the primary's volume when it changed", async () => {
      const { subject, hapCharacteristic } = await build({
        primaryVolume: 42,
      });
      hapCharacteristic.value = 20;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).toHaveBeenCalledWith(42);
    });

    it('does not update the HAP value when the volume is unchanged', async () => {
      const { subject, hapCharacteristic } = await build({
        primaryVolume: 20,
      });
      hapCharacteristic.value = 20;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).not.toHaveBeenCalled();
    });
  });

  describe('#setBrightness', () => {
    it('applies the same relative delta to the primary and every slave after the debounce window elapses', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primaryVolume: 20,
        slave1Volume: 30,
        slave2Volume: 10,
      });

      // primary moves from 20 -> 30, a delta of +10
      await subject.setBrightness(30);
      await settle();

      expect(primary.api.setVolume).toHaveBeenCalledWith(30);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(40);
      expect(slave2.api.setVolume).toHaveBeenCalledWith(20);
    });

    it('clamps a slave at 100 when the delta would push it over the max', async () => {
      const { subject, primary, slave1 } = await build({
        primaryVolume: 20,
        slave1Volume: 95,
      });

      // delta of +10
      await subject.setBrightness(30);
      await settle();

      expect(primary.api.setVolume).toHaveBeenCalledWith(30);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(100);
    });

    it('clamps a slave at 0 when the delta would push it under the min', async () => {
      const { subject, primary, slave1 } = await build({
        primaryVolume: 20,
        slave1Volume: 5,
      });

      // delta of -15
      await subject.setBrightness(5);
      await settle();

      expect(primary.api.setVolume).toHaveBeenCalledWith(5);
      expect(slave1.api.setVolume).toHaveBeenCalledWith(0);
    });

    it('is a no-op when the value is 0', async () => {
      const { subject, primary, slave1, slave2 } = await build();

      await subject.setBrightness(0);
      await settle();

      expect(primary.api.setVolume).not.toHaveBeenCalled();
      expect(slave1.api.setVolume).not.toHaveBeenCalled();
      expect(slave2.api.setVolume).not.toHaveBeenCalled();
    });

    it('does not schedule or cancel a pending timer when called with 0', async () => {
      const { subject, primary } = await build({ primaryVolume: 20 });

      await subject.setBrightness(30);
      await subject.setBrightness(0);
      await settle();

      // The earlier non-zero request still applies - the 0 call was a pure
      // no-op, not a cancellation.
      expect(primary.api.setVolume).toHaveBeenCalledWith(30);
    });

    it('resolves the HAP set handler promptly, without waiting on the debounced action', async () => {
      const { subject, primary } = await build({ primaryVolume: 20 });

      const handlerPromise = subject.setBrightness(30);

      await expect(handlerPromise).resolves.toBeUndefined();
      // The debounce timer hasn't fired yet, so the device action has not
      // started.
      expect(primary.api.setVolume).not.toHaveBeenCalled();
    });

    describe('when a single call is made (no burst)', () => {
      it('still applies after the debounce window elapses', async () => {
        const { subject, primary } = await build({ primaryVolume: 20 });

        await subject.setBrightness(30);

        // Not yet applied - still within the debounce window.
        expect(primary.api.setVolume).not.toHaveBeenCalled();

        await settle();

        expect(primary.api.setVolume).toHaveBeenCalledWith(30);
      });
    });

    describe('when calls overlap (rapid slider drags without awaiting between them)', () => {
      it('coalesces N rapid calls into exactly ONE apply per device, targeting the LAST requested value', async () => {
        const { subject, primary, slave1, slave2 } = await build({
          primaryVolume: 20,
          slave1Volume: 20,
          slave2Volume: 20,
        });

        const p1 = subject.setBrightness(30);
        await jest.advanceTimersByTimeAsync(SET_ZONE_VOLUME_DEBOUNCE_MS / 4);
        const p2 = subject.setBrightness(40);
        await jest.advanceTimersByTimeAsync(SET_ZONE_VOLUME_DEBOUNCE_MS / 4);
        const p3 = subject.setBrightness(55);

        await Promise.all([p1, p2, p3]);
        await settle();

        // Exactly one apply per device, for the whole burst.
        expect(primary.api.setVolume).toHaveBeenCalledTimes(1);
        expect(slave1.api.setVolume).toHaveBeenCalledTimes(1);
        expect(slave2.api.setVolume).toHaveBeenCalledTimes(1);

        // Delta computed against the LAST requested value (55), from a
        // single fresh read taken at fire time (primary still at 20, since
        // the fake device's getVolume always returns the configured value).
        expect(primary.api.setVolume).toHaveBeenCalledWith(55);
        expect(slave1.api.setVolume).toHaveBeenCalledWith(55);
        expect(slave2.api.setVolume).toHaveBeenCalledWith(55);
      });

      it('never applies an early value superseded within the window', async () => {
        const { subject, primary } = await build({ primaryVolume: 20 });

        const p1 = subject.setBrightness(30);
        await jest.advanceTimersByTimeAsync(SET_ZONE_VOLUME_DEBOUNCE_MS / 2);
        const p2 = subject.setBrightness(70);

        await Promise.all([p1, p2]);
        await settle();

        expect(primary.api.setVolume).not.toHaveBeenCalledWith(30);
        expect(primary.api.setVolume).toHaveBeenCalledWith(70);
      });

      it('does not block each individual setBrightness call on the debounced device action completing', async () => {
        const { subject, primary } = await build({ primaryVolume: 20 });
        let setVolumeResolved = false;
        primary.api.setVolume.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                setVolumeResolved = true;
                resolve(true);
              }, 5_000)
            )
        );

        const p1 = subject.setBrightness(30);
        const p2 = subject.setBrightness(40);
        const p3 = subject.setBrightness(55);

        // All three acks resolve immediately - well before the debounce
        // window even elapses, let alone the (delayed) setVolume call.
        await Promise.all([p1, p2, p3]);

        expect(setVolumeResolved).toBe(false);
        expect(primary.api.setVolume).not.toHaveBeenCalled();
      });
    });

    describe('closing the loop with a live re-read after the debounced action settles', () => {
      it('pushes updateValue with the re-read primary volume on the success path', async () => {
        const { subject, primary, updateValue } = await build({
          primaryVolume: 20,
        });
        // After the apply, the primary's live volume has settled at 30.
        primary.api.getVolume
          .mockResolvedValueOnce(fakeVolume('MASTER-1', 20))
          .mockResolvedValue(fakeVolume('MASTER-1', 30));

        await subject.setBrightness(30);
        await settle();

        expect(updateValue).toHaveBeenCalledWith(30);
      });

      it('pushes updateValue with the live volume and logs rather than throws when the apply step fails', async () => {
        const { subject, primary, updateValue } = await build({
          primaryVolume: 20,
        });
        primary.api.setVolume.mockRejectedValue(
          new Error('device unreachable')
        );

        await subject.setBrightness(30);

        // The debounced action's rejection must not become an unhandled
        // rejection or bubble out of the timer callback.
        await expect(settle()).resolves.toBeUndefined();

        // Live re-read still ran despite the setVolume failure, and reports
        // the actual (unchanged) primary volume.
        expect(updateValue).toHaveBeenCalledWith(20);
      });
    });
  });

  describe('gabbo events', () => {
    it('listens for volumeUpdated so a push from the primary triggers a refresh', async () => {
      const { subject } = await build();

      expect(subject.gabboEvents).toEqual(['volumeUpdated']);
    });
  });
});
