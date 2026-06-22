import { describe, expect, it } from '@jest/globals';
import { PlatformConfiguration } from '../PlatformConfiguration.js';
import { PLATFORM_NAME } from '../settings.js';
import { LogLevel } from 'homebridge';

describe('PlatformConfiguration', () => {
  describe('fromExternalConfiguration', () => {
    it('applies defaults when no config is provided', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
      });

      expect(config.discoverAllAccessories).toBe(false);
      expect(config.logLevel).toBe(LogLevel.INFO);
      expect(config.pollingInterval).toBe(30000);
      expect(config.accessories).toEqual([]);
      expect(config.name).toBe(PLATFORM_NAME);
    });

    it('uses provided name over default', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        name: 'My Speaker Hub',
      });

      expect(config.name).toBe('My Speaker Hub');
    });

    it('sets discoverAllAccessories when provided', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        discoverAllAccessories: true,
      });

      expect(config.discoverAllAccessories).toBe(true);
    });

    it('builds IP-based accessory from config', () => {
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

    it('builds room-based accessory from config', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Living Room', room: 'Living Room' }],
      });

      expect(config.accessories).toHaveLength(1);
      expect(config.accessories[0].type).toBe('room');
      expect(config.accessories[0].room).toBe('Living Room');
    });

    it('merges global config into accessories', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
        accessories: [{ name: 'Bedroom', ip: '192.168.1.11' }],
      });

      expect(config.accessories[0].pollingInterval).toBe(5000);
    });

    it('honours global.pollingInterval at the platform level', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
      });

      expect(config.pollingInterval).toBe(5000);
    });

    it('maps logLevel: warn to LogLevel.WARN', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { logLevel: 'warn' },
      });

      expect(config.logLevel).toBe(LogLevel.WARN);
    });

    it('maps verbose: true to LogLevel.DEBUG (backward compat alias)', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { verbose: true },
      });

      expect(config.logLevel).toBe(LogLevel.DEBUG);
    });

    it('logLevel takes precedence over verbose when both are set', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { logLevel: 'error', verbose: true },
      });

      expect(config.logLevel).toBe(LogLevel.ERROR);
    });

    it('maps logLevel: debug to LogLevel.DEBUG', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { logLevel: 'debug' },
      });

      expect(config.logLevel).toBe(LogLevel.DEBUG);
    });

    it('maps logLevel: info to LogLevel.INFO', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { logLevel: 'info' },
      });

      expect(config.logLevel).toBe(LogLevel.INFO);
    });

    it('maps logLevel: error to LogLevel.ERROR', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { logLevel: 'error' },
      });

      expect(config.logLevel).toBe(LogLevel.ERROR);
    });

    it('preserves an explicit pollingInterval of 0 (disabled)', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 0 },
      });

      expect(config.pollingInterval).toBe(0);
    });

    it('accessory-level pollingInterval overrides global', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { pollingInterval: 5000 },
        accessories: [
          { name: 'Office', ip: '192.168.1.12', pollingInterval: 1000 },
        ],
      });

      expect(config.accessories[0].pollingInterval).toBe(1000);
    });

    it('accessory defaults to switch accessoryType', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Kitchen', ip: '192.168.1.10' }],
      });

      expect(config.accessories[0].accessoryType).toBe('switch');
    });

    it('global accessoryType is applied to all accessories', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { accessoryType: 'lightbulb' },
        accessories: [
          { name: 'Kitchen', ip: '192.168.1.10' },
          { name: 'Lounge', room: 'Lounge' },
        ],
      });

      expect(config.accessories[0].accessoryType).toBe('lightbulb');
      expect(config.accessories[1].accessoryType).toBe('lightbulb');
    });

    it('per-accessory accessoryType overrides global', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        global: { accessoryType: 'lightbulb' },
        accessories: [
          { name: 'Kitchen', ip: '192.168.1.10', accessoryType: 'switch' },
        ],
      });

      expect(config.accessories[0].accessoryType).toBe('switch');
    });

    it('propagates disabled: true to the accessory config', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Kitchen', ip: '192.168.1.10', disabled: true }],
      });

      expect(config.accessories[0].disabled).toBe(true);
    });

    it('defaults disabled to false when not set', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Kitchen', ip: '192.168.1.10' }],
      });

      expect(config.accessories[0].disabled).toBe(false);
    });

    it('accessories without ip or room are excluded', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
        accessories: [{ name: 'Mystery' }],
      });

      expect(config.accessories).toHaveLength(0);
    });

    it('handles multiple accessories', () => {
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
    it('serialises to valid JSON', () => {
      const config = PlatformConfiguration.fromExternalConfiguration({
        platform: PLATFORM_NAME,
      });

      expect(() => JSON.parse(config.toJson())).not.toThrow();
    });
  });
});
