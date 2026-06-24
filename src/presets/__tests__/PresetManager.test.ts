import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PresetManager } from '../PresetManager.js';
import { PresetStation } from '../PresetStation.js';

function makeStation(
  slot: number,
  name = 'Radio',
  tuneInId = 's12345'
): PresetStation {
  return PresetStation.fromConfig({ slot, name, tuneInId });
}

function makeDevice(storePresetImpl?: () => Promise<boolean>) {
  return {
    api: {
      storePreset: jest.fn(storePresetImpl ?? (() => Promise.resolve(true))),
    },
  } as unknown as import('../../devices/SoundTouch/SoundTouchDevice.js').SoundTouchDevice;
}

describe('PresetManager', () => {
  describe('#sync', () => {
    it('calls storePreset for each configured slot on each device', async () => {
      const device = makeDevice();
      const stations = new Map([
        [1, makeStation(1, 'BBC', 's24861')],
        [2, makeStation(2, 'NPR', 's34090')],
      ]);
      const manager = PresetManager.create({ devices: [device], stations });

      await manager.sync();

      expect(device.api.storePreset).toHaveBeenCalledTimes(2);
      expect(device.api.storePreset).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          source: 'TUNEIN',
          type: 'stationurl',
          isPresetable: true,
          location: '/v1/playback/station/s24861',
          itemName: 'BBC',
        })
      );
      expect(device.api.storePreset).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ itemName: 'NPR' })
      );
    });

    it('calls storePreset on all devices for each slot', async () => {
      const device1 = makeDevice();
      const device2 = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const manager = PresetManager.create({
        devices: [device1, device2],
        stations,
      });

      await manager.sync();

      expect(device1.api.storePreset).toHaveBeenCalledTimes(1);
      expect(device2.api.storePreset).toHaveBeenCalledTimes(1);
    });

    it('does not abort other slots when one storePreset call fails', async () => {
      let callCount = 0;
      const device = makeDevice(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('device unreachable'));
        }
        return Promise.resolve(true);
      });

      const stations = new Map([
        [1, makeStation(1, 'Slot1')],
        [2, makeStation(2, 'Slot2')],
      ]);
      const manager = PresetManager.create({ devices: [device], stations });

      await expect(manager.sync()).resolves.not.toThrow();
      expect(device.api.storePreset).toHaveBeenCalledTimes(2);
    });
  });

  describe('#start and #stop', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls sync immediately on start', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const manager = PresetManager.create({ devices: [device], stations });

      manager.start('0 0 * * *');
      await Promise.resolve();

      expect(device.api.storePreset).toHaveBeenCalledTimes(1);
    });

    it('fires sync again after the cron delay elapses', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const manager = PresetManager.create({ devices: [device], stations });
      const schedule = '0 0 * * *';

      const delay = manager._msUntilNextCron(schedule);
      manager.start(schedule);
      await Promise.resolve();
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(delay);
      await Promise.resolve();

      expect(device.api.storePreset).toHaveBeenCalledTimes(2);
    });

    it('stop cancels the pending sync', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const manager = PresetManager.create({ devices: [device], stations });
      const schedule = '0 0 * * *';

      manager.start(schedule);
      await Promise.resolve();
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);

      manager.stop();
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      await Promise.resolve();

      expect(device.api.storePreset).toHaveBeenCalledTimes(1);
    });

    it('stop is a no-op when called before start', () => {
      const manager = PresetManager.create({
        devices: [],
        stations: new Map(),
      });

      expect(() => manager.stop()).not.toThrow();
    });
  });
});
