import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchZoneOnCharacteristic } from '../SoundTouchZoneOnCharacteristic.js';
import type { Zone } from '../../devices/SoundTouch/api/index.js';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super('HAP error');
  }
}

function fakeDevice(props: {
  id: string;
  host: string;
  source?: string | undefined;
}) {
  const pressKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const getSource = jest
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValue(props.source ?? 'STANDBY');
  return {
    id: props.id,
    name: props.id,
    api: {
      host: props.host,
      pressKey,
      getSource,
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
}: {
  zoneResponse?: Zone | undefined;
  primarySource?: string | undefined;
  slave1Source?: string | undefined;
  slave2Source?: string | undefined;
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
  };
}

describe('SoundTouchZoneOnCharacteristic', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('#getOn', () => {
    it('returns true when getZone reports all configured slaves as members', async () => {
      const { subject } = await build({
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

    it('returns false when a configured slave is missing from the zone', async () => {
      const { subject } = await build({
        zoneResponse: {
          master: 'MASTER-1',
          members: [{ deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' }],
        },
      });

      const result = await subject.getOn();

      expect(result).toBe(false);
    });

    it('returns false when there is no active zone', async () => {
      const { subject } = await build({ zoneResponse: undefined });

      const result = await subject.getOn();

      expect(result).toBe(false);
    });

    it('throws HapStatusError via HAP binding when the device is unreachable', async () => {
      const { hapCharacteristic, getZone } = await build();
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

      expect(removeZoneSlave).toHaveBeenCalledWith({
        master: 'MASTER-1',
        senderIpAddress: '10.0.0.1',
        members: [
          { deviceId: 'SLAVE-1', ipAddress: '10.0.0.2' },
          { deviceId: 'SLAVE-2', ipAddress: '10.0.0.3' },
        ],
      });
    });

    it('throws HapStatusError via HAP binding when the device is unreachable', async () => {
      const { hapCharacteristic, setZone } = await build();
      setZone.mockRejectedValue(new Error('network error'));

      const handler = hapCharacteristic.onSet.mock.calls[0]?.[0] as (
        value: unknown
      ) => Promise<unknown>;
      await expect(handler(true)).rejects.toBeInstanceOf(FakeHapStatusError);
    });

    it('powers on the primary and every slave that is in standby before activating the zone', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);

      expect(primary.api.pressKey).toHaveBeenCalledWith('POWER');
      expect(slave1.api.pressKey).toHaveBeenCalledWith('POWER');
      expect(slave2.api.pressKey).toHaveBeenCalledWith('POWER');
    });

    it('does not re-send a power command to a device that is already on when activating', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'AUX',
        slave1Source: 'AUX',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(true);

      expect(primary.api.pressKey).not.toHaveBeenCalled();
      expect(slave1.api.pressKey).not.toHaveBeenCalled();
      expect(slave2.api.pressKey).toHaveBeenCalledWith('POWER');
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

      expect(removeZoneSlave).toHaveBeenCalled();
      expect(primary.api.pressKey).toHaveBeenCalledWith('POWER');
      expect(slave1.api.pressKey).toHaveBeenCalledWith('POWER');
      expect(slave2.api.pressKey).toHaveBeenCalledWith('POWER');
    });

    it('does not send a power command to a device that is already off when deactivating', async () => {
      const { subject, primary, slave1, slave2 } = await build({
        primarySource: 'STANDBY',
        slave1Source: 'STANDBY',
        slave2Source: 'STANDBY',
      });

      await subject.setOn(false);

      expect(primary.api.pressKey).not.toHaveBeenCalled();
      expect(slave1.api.pressKey).not.toHaveBeenCalled();
      expect(slave2.api.pressKey).not.toHaveBeenCalled();
    });
  });

  describe('#refresh', () => {
    it('updates the HAP value when the zone state has changed', async () => {
      const { subject, hapCharacteristic } = await build({
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
        zoneResponse: undefined,
      });
      hapCharacteristic.value = false;

      await subject.refresh();

      expect(hapCharacteristic.updateValue).not.toHaveBeenCalled();
    });
  });

  describe('#init', () => {
    it('performs an initial refresh from getZone', async () => {
      const { subject, getZone } = await build();

      await subject.init();

      expect(getZone).toHaveBeenCalled();
    });
  });
});
