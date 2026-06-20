import { describe, expect, test } from '@jest/globals';
import { PlatformConfiguration } from '../PlatformConfiguration.js';
import { PLATFORM_NAME } from '../settings.js';

describe('PlatformConfiguration', () => {
  describe('fromExternalConfiguration', () => {
    test('applies defaults when no config is provided', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
      });

      expect(config.discoverAllAccessories).toBe(false);
      expect(config.verbose).toBe(false);
      expect(config.pollingInterval).toBe(2000);
      expect(config.accessories).toEqual([]);
      expect(config.name).toBe(PLATFORM_NAME);
    });

    test('uses provided name over default', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        name: 'My Speaker Hub',
      });

      expect(config.name).toBe('My Speaker Hub');
    });

    test('sets discoverAllAccessories when provided', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        discoverAllAccessories: true,
      });

      expect(config.discoverAllAccessories).toBe(true);
    });

    test('builds IP-based accessory from config', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Kitchen', ip: '192.168.1.10', port: 8090 }],
      });

      expect(config.accessories).toHaveLength(1);
      expect(config.accessories[0].type).toBe('ip');
      expect(config.accessories[0].ip).toBe('192.168.1.10');
      expect(config.accessories[0].port).toBe(8090);
      expect(config.accessories[0].name).toBe('Kitchen');
    });

    test('builds room-based accessory from config', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Living Room', room: 'Living Room' }],
      });

      expect(config.accessories).toHaveLength(1);
      expect(config.accessories[0].type).toBe('room');
      expect(config.accessories[0].room).toBe('Living Room');
    });

    test('merges global config into accessories', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
        accessories: [{ name: 'Bedroom', ip: '192.168.1.11' }],
      });

      expect(config.accessories[0].pollingInterval).toBe(5000);
    });

    test('honours global.pollingInterval at the platform level', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
      });

      expect(config.pollingInterval).toBe(5000);
    });

    test('honours global.verbose at the platform level', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { verbose: true },
      });

      expect(config.verbose).toBe(true);
    });

    test('preserves an explicit pollingInterval of 0 (disabled)', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 0 },
      });

      expect(config.pollingInterval).toBe(0);
    });

    test('accessory-level pollingInterval overrides global', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
        accessories: [
          { name: 'Office', ip: '192.168.1.12', pollingInterval: 1000 },
        ],
      });

      expect(config.accessories[0].pollingInterval).toBe(1000);
    });

    test('accessories without ip or room are excluded', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Mystery' }],
      });

      expect(config.accessories).toHaveLength(0);
    });

    test('handles multiple accessories', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [
          { name: 'Kitchen', ip: '192.168.1.10' },
          { name: 'Lounge', room: 'Lounge' },
        ],
      });

      expect(config.accessories).toHaveLength(2);
      expect(config.accessories[0].type).toBe('ip');
      expect(config.accessories[1].type).toBe('room');
    });
  });

  describe('toJson', () => {
    test('serialises to valid JSON', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
      });

      expect(() => JSON.parse(config.toJson())).not.toThrow();
    });
  });
});
