import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PresetManager } from '../PresetManager.js';
import { PresetServer } from '../PresetServer.js';
import { PresetStation } from '../PresetStation.js';

function makeStation(slot: number, name = 'Radio'): PresetStation {
  return PresetStation.fromConfig(
    { slot, name, streamUrl: 'http://stream.example.com/radio' },
    'http://stream.example.com/radio'
  );
}

function makeDevice(storePresetImpl?: () => Promise<boolean>) {
  return {
    api: {
      storePreset: jest.fn(storePresetImpl ?? (() => Promise.resolve(true))),
    },
  } as unknown as import('../../devices/SoundTouch/SoundTouchDevice.js').SoundTouchDevice;
}

function makeServer(getPresetUrlImpl?: (slot: number) => string) {
  return {
    getPresetUrl:
      getPresetUrlImpl ??
      ((slot: number) => `http://127.0.0.1:18090/preset/${slot}.json`),
  } as unknown as PresetServer;
}

describe('PresetManager', () => {
  describe('#sync', () => {
    it('calls storePreset for each configured slot on each device', async () => {
      const device = makeDevice();
      const stations = new Map([
        [1, makeStation(1, 'BBC')],
        [2, makeStation(2, 'NPR')],
      ]);
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

      await manager.sync();

      expect(device.api.storePreset).toHaveBeenCalledTimes(2);
      expect(device.api.storePreset).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          source: 'LOCAL_INTERNET_RADIO',
          type: 'stationurl',
          isPresetable: true,
          location: 'http://127.0.0.1:18090/preset/1.json',
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
      const server = makeServer();
      const manager = PresetManager.create({
        devices: [device1, device2],
        server,
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
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

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
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

      manager.start(0);
      // Let any microtasks (the fire-and-forget Promise) flush
      await Promise.resolve();

      expect(device.api.storePreset).toHaveBeenCalledTimes(1);
    });

    it('does not set an interval when intervalMs is 0', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

      manager.start(0);
      await Promise.resolve();

      jest.advanceTimersByTime(100_000);
      await Promise.resolve();

      // Still only called once (the immediate call)
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);
    });

    it('calls sync on each interval tick when intervalMs > 0', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

      manager.start(5000);
      await Promise.resolve();

      // After initial call
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);

      // Advance one interval
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(device.api.storePreset).toHaveBeenCalledTimes(2);
    });

    it('stop cancels the interval', async () => {
      const device = makeDevice();
      const stations = new Map([[1, makeStation(1)]]);
      const server = makeServer();
      const manager = PresetManager.create({ devices: [device], server, stations });

      manager.start(5000);
      await Promise.resolve();
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);

      manager.stop();
      jest.advanceTimersByTime(20_000);
      await Promise.resolve();

      // Still only the initial call
      expect(device.api.storePreset).toHaveBeenCalledTimes(1);
    });
  });
});
