import { describe, expect, it } from '@jest/globals';
import { DeviceConfiguration } from '../SoundTouchDeviceConfiguration.js';

const DEFAULT_POLLING_INTERVAL = 0;

describe('DeviceConfiguration', () => {
  describe('createForRoom', () => {
    it('creates a room-type configuration', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        room: 'Kitchen',
      });

      expect(config.type).toBe('room');
      expect(config.room).toBe('Kitchen');
      expect(config.ip).toBeUndefined();
      expect(config.port).toBeUndefined();
    });

    it('applies default pollingInterval', () => {
      const config = DeviceConfiguration.createForRoom({ name: 'Kitchen' });
      expect(config.pollingInterval).toBe(DEFAULT_POLLING_INTERVAL);
    });

    it('uses provided pollingInterval', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        pollingInterval: 5000,
      });
      expect(config.pollingInterval).toBe(5000);
    });

    it('preserves a pollingInterval of 0 (disabled) rather than defaulting', () => {
      const config = DeviceConfiguration.createForRoom({
        name: 'Kitchen',
        pollingInterval: 0,
      });
      expect(config.pollingInterval).toBe(0);
    });
  });

  describe('createForIp', () => {
    it('creates an ip-type configuration', () => {
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

    it('applies default pollingInterval', () => {
      const config = DeviceConfiguration.createForIp({
        name: 'Lounge',
        ip: '192.168.1.10',
      });
      expect(config.pollingInterval).toBe(DEFAULT_POLLING_INTERVAL);
    });
  });

  describe('create', () => {
    it('creates a discovered-type configuration', () => {
      const config = DeviceConfiguration.create({ name: 'Office' });
      expect(config.type).toBe('discovered');
      expect(config.ip).toBeUndefined();
      expect(config.room).toBeUndefined();
    });

    it('applies default verboseLogging', () => {
      const config = DeviceConfiguration.create({ name: 'Office' });
      expect(config.verboseLogging).toBe(false);
    });

    it('uses provided verboseLogging', () => {
      const config = DeviceConfiguration.create({
        name: 'Office',
        verboseLogging: true,
      });
      expect(config.verboseLogging).toBe(true);
    });

    it('defaults accessoryType to switch', () => {
      const config = DeviceConfiguration.create({ name: 'Office' });
      expect(config.accessoryType).toBe('switch');
    });

    it('uses provided accessoryType', () => {
      const config = DeviceConfiguration.create({
        name: 'Office',
        accessoryType: 'lightbulb',
      });
      expect(config.accessoryType).toBe('lightbulb');
    });
  });

  describe('fromAccessoryConfiguration', () => {
    it('returns ip-type config when ip is present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1', port: 8090 },
      });

      expect(config?.type).toBe('ip');
      expect(config?.ip).toBe('10.0.0.1');
      expect(config?.port).toBe(8090);
    });

    it('prefers ip over room when both are present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1', room: 'Kitchen' },
      });

      expect(config?.type).toBe('ip');
    });

    it('returns room-type config when only room is present', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Lounge',
        accessoryConfig: { room: 'Lounge' },
      });

      expect(config?.type).toBe('room');
      expect(config?.room).toBe('Lounge');
    });

    it('returns undefined when neither ip nor room provided', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Mystery',
        accessoryConfig: {},
      });

      expect(config).toBeUndefined();
    });

    it('name from props takes precedence over accessoryConfig name', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Override Name',
        accessoryConfig: { ip: '10.0.0.1', name: 'Config Name' },
      });

      expect(config?.name).toBe('Override Name');
    });

    it('falls back to accessoryConfig name when props name is absent', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        accessoryConfig: { ip: '10.0.0.1', name: 'Config Name' },
      });

      expect(config?.name).toBe('Config Name');
    });

    it('defaults accessoryType to switch when not in accessoryConfig', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1' },
      });
      expect(config?.accessoryType).toBe('switch');
    });

    it('threads accessoryType from accessoryConfig (ip path)', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Kitchen',
        accessoryConfig: { ip: '10.0.0.1', accessoryType: 'lightbulb' },
      });
      expect(config?.accessoryType).toBe('lightbulb');
    });

    it('threads accessoryType from accessoryConfig (room path)', () => {
      const config = DeviceConfiguration.fromAccessoryConfiguration({
        name: 'Lounge',
        accessoryConfig: { room: 'Lounge', accessoryType: 'lightbulb' },
      });
      expect(config?.accessoryType).toBe('lightbulb');
    });
  });

  describe('toJson', () => {
    it('serialises to valid JSON', () => {
      const config = DeviceConfiguration.create({ name: 'Test' });
      expect(() => JSON.parse(config.toJson())).not.toThrow();
    });
  });
});
