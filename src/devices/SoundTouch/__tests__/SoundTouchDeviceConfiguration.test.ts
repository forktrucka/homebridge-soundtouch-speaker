import { describe, expect, test } from '@jest/globals';
import { DeviceConfiguration } from '../SoundTouchDeviceConfiguration.js';

const DEFAULT_POLLING_INTERVAL = 2000;

describe('DeviceConfiguration', () => {
  describe('createForRoom', () => {
    test('creates a room-type configuration', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        room: 'Kitchen',
      });

      expect(config.type).toBe('room');
      expect(config.room).toBe('Kitchen');
      expect(config.ip).toBeUndefined();
      expect(config.port).toBeUndefined();
    });

    test('applies default pollingInterval', () => {
      const config = DeviceConfiguration.createForRoom({ name: 'Kitchen' });
      expect(config.pollingInterval).toBe(DEFAULT_POLLING_INTERVAL);
    });

    test('uses provided pollingInterval', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        pollingInterval: 5000,
      });
      expect(config.pollingInterval).toBe(5000);
    });

    test('preserves a pollingInterval of 0 (disabled) rather than defaulting', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        pollingInterval: 0,
      });
      expect(config.pollingInterval).toBe(0);
    });
  });

  describe('createForIp', () => {
    test('creates an ip-type configuration', () => {
      const config = DeviceConfiguration.createForIp({
        name: 'Lounge',
        ip: '192.168.1.10',
        port: 8090,
      });

      expect(config.type).toBe('ip');
      expect(config.ip).toBe('192.168.1.10');
      expect(config.port).toBe(8090);
      expect(config.room).toBeUndefined();
    });

    test('applies default pollingInterval', () => {
      const config = DeviceConfiguration.createForIp({
        name: 'Lounge',
        ip: '192.168.1.10',
      });
      expect(config.pollingInterval).toBe(DEFAULT_POLLING_INTERVAL);
    });
  });

  describe('create', () => {
    test('creates a discovered-type configuration', () => {
      const config = DeviceConfiguration.create({ name: 'Office' });
      expect(config.type).toBe('discovered');
      expect(config.ip).toBeUndefined();
      expect(config.room).toBeUndefined();
    });

    test('applies default verboseLogging', () => {
      const config = DeviceConfiguration.create({ name: 'Office' });
      expect(config.verboseLogging).toBe(false);
    });

    test('uses provided verboseLogging', () => {
      const config = DeviceConfiguration.create({
        name: 'Office',
        verboseLogging: true,
      });
      expect(config.verboseLogging).toBe(true);
    });
  });

  describe('fromAccessoryConfiguration', () => {
    test('returns ip-type config when ip is present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1', port: 8090 },
      });

      expect(config?.type).toBe('ip');
      expect(config?.ip).toBe('10.0.0.1');
      expect(config?.port).toBe(8090);
    });

    test('prefers ip over room when both are present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1', room: 'Kitchen' },
      });

      expect(config?.type).toBe('ip');
    });

    test('returns room-type config when only room is present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Lounge',
        accessoryConfig: { room: 'Lounge' },
      });

      expect(config?.type).toBe('room');
      expect(config?.room).toBe('Lounge');
    });

    test('returns undefined when neither ip nor room provided', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Mystery',
        accessoryConfig: {},
      });

      expect(config).toBeUndefined();
    });

    test('name from props takes precedence over accessoryConfig name', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Override Name',
        accessoryConfig: { ip: '10.0.0.1', name: 'Config Name' },
      });

      expect(config?.name).toBe('Override Name');
    });

    test('falls back to accessoryConfig name when props name is absent', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        accessoryConfig: { ip: '10.0.0.1', name: 'Config Name' },
      });

      expect(config?.name).toBe('Config Name');
    });
  });

  describe('toJson', () => {
    test('serialises to valid JSON', () => {
      const config = DeviceConfiguration.create({ name: 'Test' });
      expect(() => JSON.parse(config.toJson())).not.toThrow();
    });
  });
});
