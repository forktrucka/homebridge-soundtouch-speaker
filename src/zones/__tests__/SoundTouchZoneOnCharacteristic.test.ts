import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  SoundTouchZoneOnCharacteristic,
  SET_ZONE_ON_DEBOUNCE_MS,
} from '../SoundTouchZoneOnCharacteristic.js';
import type {
  NowPlaying,
  Preset,
  Zone,
} from '../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

function fakeNowPlaying(
  props: Partial<NowPlaying> & { source: string }
): NowPlaying {
  return {
    deviceId: 'MASTER-1',
    sourceAccount: '',
    contentItem: { source: props.source, sourceAccount: '' },
    canGoForward: false,
    canGoBackward: false,
    isFavoriteEnabled: false,
    isFavorite: false,
    isRateEnabled: false,
    rating: 'NONE' as NowPlaying['rating'],
    ...props,
  };
}

function fakeDevice(props: {
  id: string;
  host: string;
  source?: string | undefined;
  nowPlaying?: NowPlaying | undefined;
  presets?: Preset[] | undefined;
}) {
  const pressKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const holdKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const getSource = jest
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValue(props.source ?? 'STANDBY');
  const getNowPlaying = jest
    .fn<() => Promise<NowPlaying | undefined>>()
    .mockResolvedValue(
      props.nowPlaying ?? fakeNowPlaying({ source: props.source ?? 'STANDBY' })
    );
  const getPresets = jest
    .fn<() => Promise<Preset[] | undefined>>()
    .mockResolvedValue(props.presets ?? []);
  const selectSource = jest
    .fn<() => Promise<boolean>>()
    .mockResolvedValue(true);
  return {
    id: props.id,
    name: props.id,
    api: {
      host: props.host,
      pressKey,
      holdKey,
      getSource,
      getNowPlaying,
      getPresets,
      selectSource,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configuration: {} as any,
  };
}

async function build({
  zoneResponse,
  primarySource,
  slave1Source,
  slave2Source,
  primaryNowPlaying,
  primaryPresets,
  defaultSource,
}: {
  zoneResponse?: Zone | undefined;
  primarySource?: string | undefined;
  slave1Source?: string | undefined;
  slave2Source?: string | undefined;
  primaryNowPlaying?: NowPlaying | undefined;
  primaryPresets?: Preset[] | undefined;
  defaultSource?: { type: 'preset'; slot: number } | undefined;
} = {}) {
  const updateValue = jest.fn();
  const hapCharacteristic = {
    value: undefined as boolean | undefined,
    updateValue,
    onSet: jest.fn().mockReturnThis(),
    onGet: jest.fn().mockReturnThis(),
  };

  const getCharacteristic = jest.fn().mockReturnValue(hapCharacteristic);
  const service = { getCharacteristic };

  const getZone = jest
    .fn<() => Promise<Zone | undefined>>()
    .mockResolvedValue(zoneResponse);
  const setZone = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const removeZoneSlave = jest
    .fn<() => Promise<boolean>>()
    .mockResolvedValue(true);

  const primary = fakeDevice({
    id: 'MASTER-1',
    host: '10.0.0.1',
    source: primarySource,
    nowPlaying: primaryNowPlaying,
    presets: primaryPresets,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (primary.api as any).getZone = getZone;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (primary.api as any).setZone = setZone;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (primary.api as any).removeZoneSlave = removeZoneSlave;

  const slave1 = fakeDevice({
    id: 'SLAVE-1',
    host: '10.0.0.2',
    source: slave1Source,
  });
  const slave2 = fakeDevice({
    id: 'SLAVE-2',
    host: '10.0.0.3',
    source: slave2Source,
  });

  const refreshAccessoryForDevice = jest
    .fn<(deviceId: string) => Promise<void>>()
    .mockResolvedValue(undefined);

  const platform = {
    characteristic: { On: 'OnUUID' },
    api: {
      hap: {
        HapStatusError: FakeHapStatusError,
        HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      },
    },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
    refreshAccessoryForDevice,
  };

  const subject = await SoundTouchZoneOnCharacteristic.create({
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
    defaultSource,
  });

  return {
    subject,
    hapCharacteristic,
    getZone,
    setZone,
    removeZoneSlave,
    updateValue,
    primary,
    slave1,
    slave2,
    refreshAccessoryForDevice,
  };
}

// Advances past the debounce window and flushes the microtasks it triggers
// (the device action, and the live re-read/updateValue), so the debounced
// action has fully settled before assertions run.
async function settle(extraMs = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(SET_ZONE_ON_DEBOUNCE_MS + extraMs);
}

describe('SoundTouchZoneOnCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('#getOn', () => {
    it('returns true when getZone reports all configured slaves as members and the primary is on', async () => {
      const { subject } = await build({
        primarySource: 'AUX',
        zoneResponse: {
          master: 'MASTER-1',
          members: [
            { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
            { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
          ],
        },
      });

      const result = await subject.getOn();

      expect(result).toBe(true);
    });

    it('returns false without calling getZone when the primary is in standby', async () => {
      const { subject, getZone } = await build({
        primarySource: 'STANDBY',
        zoneResponse: {
          master: 'MASTER-1',
          members: [
            { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
            { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
          ],
        },
      });

      const result = await subject.getOn();

      expect(result).toBe(false);
      expect(getZone).not.toHaveBeenCalled();
    });

    it('returns false when a configured slave is missing from the zone', async () => {
      const { subject } = await build({
        primarySource: 'AUX',
        zoneResponse: {
          master: 'MASTER-1',
          members: [{ deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' }],
        },
      });

      const result = await subject.getOn();

      expect(result).toBe(false);
    });

    it('returns false when there is no active zone', async () => {
      const { subject } = await build({
        primarySource: 'AUX',
        zoneResponse: undefined,
      });

      const result = await subject.getOn();

      expect(result).toBe(false);
    });

    it('throws HapStatusError via HAP binding when the device is unreachable', async () => {
      const { hapCharacteristic, getZone } = await build({
        primarySource: 'AUX',
      });
      getZone.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onGet.mock
        .calls[0]?.[0] as () => Promise<unknown>;
      await expect(handler()).rejects.toBeInstanceOf(FakeHapStatusError);
    });
  });

  describe('#setOn', () => {
    it('calls setZone on the primary with the master and configured slave MACs/IPs when turned on', async () => {
      const { subject, setZone } = await build();

      await subject.setOn(true);
      await settle();

      expect(setZone).toHaveBeenCalledWith({
        master: 'MASTER-1',
        senderIpAddress: '10.0.0.1',
        members: [
          { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
          { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
        ],
      });
    });

    it('calls removeZoneSlave on the primary for the configured slaves when turned off', async () => {
      const { subject, removeZoneSlave } = await build();

      await subject.setOn(false);
      await settle();

      expect(removeZoneSlave).toHaveBeenCalledWith({
        master: 'MASTER-1',
        senderIpAddress: '10.0.0.1',
        members: [
          { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
          { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
        ],
      });
    });

    it('resolves the HAP set handler promptly, without waiting on the debounced action', async () => {
      const { hapCharacteristic, setZone } = await build();
      setZone.mockImplementation(() => new Promise(() => undefined));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (
        value: unknown
      ) => Promise<unknown>;

      await expect(handler(true)).resolves.toBeUndefined();
      // The debounce timer hasn't fired yet, so the device action - which
      // would hang - has not started.
      expect(setZone).not.toHaveBeenCalled();
    });

    it('does not propagate a debounced device failure to the HAP set handler (it settles, then updates via reconciliation instead)', async () => {
      const { hapCharacteristic, setZone } = await build();
      setZone.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (
        value: unknown
      ) => Promise<unknown>;

      await expect(handler(true)).resolves.toBeUndefined();
    });

    it('powers on the primary and every slave that is in standby before activating the zone', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);
      await settle();

      expect(primary.api.holdKey).toHaveBeenCalledWith('POWER', 300);
      expect(slave1.api.holdKey).toHaveBeenCalledWith('POWER', 300);
      expect(slave2.api.holdKey).toHaveBeenCalledWith('POWER', 300);
      expect(primary.api.pressKey).not.toHaveBeenCalled();
      expect(slave1.api.pressKey).not.toHaveBeenCalled();
      expect(slave2.api.pressKey).not.toHaveBeenCalled();
    });

    it('does not re-send a power command to a device that is already on when activating', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'AUX',
        slave1Source: 'AUX',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);
      await settle();

      expect(primary.api.holdKey).not.toHaveBeenCalled();
      expect(slave1.api.holdKey).not.toHaveBeenCalled();
      expect(slave2.api.holdKey).toHaveBeenCalledWith('POWER', 300);
    });

    it('powers off the primary and every slave that is on after ungrouping the zone', async () => {
      const { subject, primary, slave1, slave2, removeZoneSlave } = await build(
        {
          primarySource: 'AUX',
          slave1Source: 'AUX',
          slave2Source: 'AUX',
        }
      );

      await subject.setOn(false);
      await settle();

      expect(removeZoneSlave).toHaveBeenCalled();
      expect(primary.api.holdKey).toHaveBeenCalledWith('POWER', 300);
      expect(slave1.api.holdKey).toHaveBeenCalledWith('POWER', 300);
      expect(slave2.api.holdKey).toHaveBeenCalledWith('POWER', 300);
    });

    it('does not send a power command to a device that is already off when deactivating', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(false);
      await settle();

      expect(primary.api.holdKey).not.toHaveBeenCalled();
      expect(slave1.api.holdKey).not.toHaveBeenCalled();
      expect(slave2.api.holdKey).not.toHaveBeenCalled();
    });

    it('refreshes the primary and every slave own accessory after powering them on', async () => {
      const { subject, refreshAccessoryForDevice } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);
      await settle();

      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('MASTER-1');
      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('SLAVE-1');
      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('SLAVE-2');
    });

    it('does not refresh a device own accessory when its power state was already correct', async () => {
      const { subject, refreshAccessoryForDevice } = await build({
        primarySource: 'AUX',
        slave1Source: 'AUX',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);
      await settle();

      expect(refreshAccessoryForDevice).not.toHaveBeenCalledWith('MASTER-1');
      expect(refreshAccessoryForDevice).not.toHaveBeenCalledWith('SLAVE-1');
      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('SLAVE-2');
    });

    it('refreshes the primary and every slave own accessory after powering them off', async () => {
      const { subject, refreshAccessoryForDevice } = await build({
        primarySource: 'AUX',
        slave1Source: 'AUX',
        slave2Source: 'AUX',
      });

      await subject.setOn(false);
      await settle();

      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('MASTER-1');
      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('SLAVE-1');
      expect(refreshAccessoryForDevice).toHaveBeenCalledWith('SLAVE-2');
    });

    describe('default source', () => {
      it('selects the configured preset on the primary before setZone when the primary is idle', async () => {
        const preset: Preset = {
          id: 2,
          createdDate: new Date(0),
          updatedDate: new Date(0),
          contentItem: { source: 'TUNEIN', sourceAccount: '', location: 'x' },
        };
        const { subject, primary, setZone } = await build({
          primaryNowPlaying: fakeNowPlaying({ source: 'STANDBY' }),
          primaryPresets: [preset],
          defaultSource: { type: 'preset', slot: 2 },
        });
        const callOrder: string[] = [];
        primary.api.selectSource.mockImplementation(async () => {
          callOrder.push('selectSource');
          return true;
        });
        setZone.mockImplementation(async () => {
          callOrder.push('setZone');
          return true;
        });

        await subject.setOn(true);
        await settle();

        expect(primary.api.selectSource).toHaveBeenCalledWith(
          preset.contentItem
        );
        expect(callOrder).toEqual(['selectSource', 'setZone']);
      });

      it('does not select a default source when the primary is already playing', async () => {
        const preset: Preset = {
          id: 2,
          createdDate: new Date(0),
          updatedDate: new Date(0),
          contentItem: { source: 'TUNEIN', sourceAccount: '', location: 'x' },
        };
        const { subject, primary, setZone } = await build({
          primaryNowPlaying: fakeNowPlaying({
            source: 'TUNEIN',
            contentItem: {
              source: 'TUNEIN',
              sourceAccount: '',
              location: 'y',
            },
          }),
          primaryPresets: [preset],
          defaultSource: { type: 'preset', slot: 2 },
        });

        await subject.setOn(true);
        await settle();

        expect(primary.api.selectSource).not.toHaveBeenCalled();
        expect(setZone).toHaveBeenCalled();
      });

      it('does not call selectSource when no defaultSource is configured', async () => {
        const { subject, primary } = await build({
          primaryNowPlaying: fakeNowPlaying({ source: 'STANDBY' }),
        });

        await subject.setOn(true);
        await settle();

        expect(primary.api.selectSource).not.toHaveBeenCalled();
        expect(primary.api.getPresets).not.toHaveBeenCalled();
      });

      it('warns and still activates the zone when the configured slot is empty on the device', async () => {
        const { subject, primary, setZone } = await build({
          primaryNowPlaying: fakeNowPlaying({ source: 'STANDBY' }),
          primaryPresets: [],
          defaultSource: { type: 'preset', slot: 4 },
        });

        await subject.setOn(true);
        await settle();

        expect(primary.api.selectSource).not.toHaveBeenCalled();
        expect(setZone).toHaveBeenCalled();
      });
    });

    it('does not throw when refreshing a slave with no registered accessory wrapper fails', async () => {
      const { subject, refreshAccessoryForDevice } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });
      // Simulates a slave that was never discovered as its own standalone
      // accessory — the platform-level no-op case is covered in platform.test.ts;
      // here we confirm the zone characteristic itself never lets a rejection
      // from the refresh call block or fail the zone operation.
      refreshAccessoryForDevice.mockRejectedValueOnce(new Error('no wrapper'));

      await expect(subject.setOn(true)).resolves.toBeUndefined();
      await expect(settle()).resolves.toBeUndefined();
    });

    describe('when a single call is made (no burst)', () => {
      it('still activates the zone after the debounce window elapses', async () => {
        const { subject, setZone } = await build();

        await subject.setOn(true);

        // Not yet applied - still within the debounce window.
        expect(setZone).not.toHaveBeenCalled();

        await settle();

        expect(setZone).toHaveBeenCalledTimes(1);
      });

      it('still deactivates the zone after the debounce window elapses', async () => {
        const { subject, removeZoneSlave } = await build();

        await subject.setOn(false);

        expect(removeZoneSlave).not.toHaveBeenCalled();

        await settle();

        expect(removeZoneSlave).toHaveBeenCalledTimes(1);
      });
    });

    describe('when calls overlap (rapid slider-drag-driven taps without awaiting between them)', () => {
      it('coalesces N rapid calls into exactly ONE physical action, targeting the LAST requested value', async () => {
        const { subject, setZone, removeZoneSlave } = await build();

        // Fire a burst of taps in quick succession, each well inside the
        // debounce window, mirroring a Lightbulb Brightness-slider drag near
        // zero rapidly toggling the coupled On characteristic.
        const p1 = subject.setOn(true);
        await jest.advanceTimersByTimeAsync(SET_ZONE_ON_DEBOUNCE_MS / 4);
        const p2 = subject.setOn(false);
        await jest.advanceTimersByTimeAsync(SET_ZONE_ON_DEBOUNCE_MS / 4);
        const p3 = subject.setOn(true);

        await Promise.all([p1, p2, p3]);
        await settle();

        // Only one physical action runs for the whole burst - not one per
        // setOn call - and it targets the LAST requested value (true), not
        // an intermediate one (false).
        expect(setZone).toHaveBeenCalledTimes(1);
        expect(removeZoneSlave).not.toHaveBeenCalled();
      });

      it('does not block each individual setOn call on the debounced device action completing', async () => {
        const { subject, setZone } = await build();
        let setZoneResolved = false;
        setZone.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => {
                setZoneResolved = true;
                resolve(true);
              }, 5_000)
            )
        );

        const p1 = subject.setOn(false);
        const p2 = subject.setOn(true);
        const p3 = subject.setOn(false);

        // All three acks resolve immediately - well before the debounce
        // window even elapses, let alone the (delayed) setZone call.
        await Promise.all([p1, p2, p3]);

        expect(setZoneResolved).toBe(false);
        expect(setZone).not.toHaveBeenCalled();
      });
    });

    describe('closing the loop with a live re-read after the debounced action settles', () => {
      it('pushes updateValue with a live re-read mirroring _isZoneActive on the success path', async () => {
        const { subject, updateValue } = await build({
          primarySource: 'AUX',
          zoneResponse: {
            master: 'MASTER-1',
            members: [
              { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
              { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
            ],
          },
        });

        await subject.setOn(true);
        await settle();

        expect(updateValue).toHaveBeenCalledWith(true);
      });

      it('pushes updateValue with the live zone state and logs rather than throws when the device action fails', async () => {
        const { subject, updateValue, setZone } = await build({
          primarySource: 'STANDBY',
          zoneResponse: undefined,
        });
        setZone.mockRejectedValue(new Error('device unreachable'));

        await subject.setOn(true);

        // The debounced action's rejection must not become an unhandled
        // rejection or bubble out of the timer callback.
        await expect(settle()).resolves.toBeUndefined();

        // Live re-read still ran despite the setZone failure, and reports the
        // actual (still inactive) zone state - not the optimistic requested
        // value.
        expect(updateValue).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('#refresh', () => {
    it('updates the HAP value when the zone state has changed', async () => {
      const { subject, hapCharacteristic } = await build({
        primarySource: 'AUX',
        zoneResponse: {
          master: 'MASTER-1',
          members: [
            { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
            { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
          ],
        },
      });
      hapCharacteristic.value = false;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).toHaveBeenCalledWith(true);
    });

    it('does not update the HAP value when the zone state is unchanged', async () => {
      const { subject, hapCharacteristic } = await build({
        primarySource: 'AUX',
        zoneResponse: undefined,
      });
      hapCharacteristic.value = false;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).not.toHaveBeenCalled();
    });

    it('corrects a stale-on tile to false when the primary has gone to standby', async () => {
      const { subject, hapCharacteristic, getZone } = await build({
        primarySource: 'STANDBY',
        zoneResponse: {
          master: 'MASTER-1',
          members: [
            { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
            { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
          ],
        },
      });
      hapCharacteristic.value = true;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).toHaveBeenCalledWith(false);
      expect(getZone).not.toHaveBeenCalled();
    });
  });

  describe('#init', () => {
    it('performs an initial refresh from getZone', async () => {
      const { subject, getZone } = await build({ primarySource: 'AUX' });

      await subject.init();

      expect(getZone).toHaveBeenCalled();
    });
  });
});
