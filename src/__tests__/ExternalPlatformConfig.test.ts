import { describe, expect, it } from '@jest/globals';
import {
  ExternalPlatformConfig,
  flattenAccessoryConfiguration,
} from '../ExternalPlatformConfig.js';

describe('calculateResultingAccessoryConfiguration', () => {
  it('it merges accessory and global configurations', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: {
        verbose: true,
        pollingInterval: 5000,
      },
      accessory: {
        verbose: false,
        pollingInterval: 2000,
      },
    });
    expect(result).toEqual({
      verbose: false,
      pollingInterval: 2000,
    });
  });
  it('it ignores undefined values in the global config', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: {
        verbose: undefined,
        pollingInterval: undefined,
      },
      accessory: {
        verbose: false,
        pollingInterval: 2000,
      },
    });
    expect(result).toEqual({
      verbose: false,
      pollingInterval: 2000,
    });
  });
  it('it ignores undefined values in the accessory config', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: {
        verbose: true,
        pollingInterval: 5000,
      },
      accessory: {
        verbose: undefined,
        pollingInterval: undefined,
      },
    });
    expect(result).toEqual({
      verbose: true,
      pollingInterval: 5000,
    });
  });
  it('it ignores undefined value for global config', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: undefined,
      accessory: {
        verbose: true,
        pollingInterval: 5000,
      },
    });
    expect(result).toEqual({
      verbose: true,
      pollingInterval: 5000,
    });
  });
  it('it returns undefined when no config is specified', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: undefined,
      accessory: undefined,
    });
    expect(result).toEqual(undefined);
  });

  it('global accessoryType flows into accessory when accessory does not override', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: { accessoryType: 'lightbulb' },
      accessory: { ip: '10.0.0.1' },
    });
    expect(result?.accessoryType).toBe('lightbulb');
  });

  it('per-accessory accessoryType overrides global', () => {
    const result = flattenAccessoryConfiguration({
      globalConfig: { accessoryType: 'lightbulb' },
      accessory: { ip: '10.0.0.1', accessoryType: 'switch' },
    });
    expect(result?.accessoryType).toBe('switch');
  });
});

describe('ZoneConfig shape', () => {
  it('accepts a top-level zones array with name, primary, and slaves', () => {
    const config: ExternalPlatformConfig = {
      platform: 'SoundTouchHomebridgePlugin',
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge', 'Hallway'],
        },
      ],
    };

    expect(config.zones).toHaveLength(1);
    expect(config.zones?.[0]).toEqual({
      name: 'Downstairs',
      primary: 'Kitchen',
      slaves: ['Lounge', 'Hallway'],
    });
  });

  it('accepts an optional per-zone accessoryType override', () => {
    const config: ExternalPlatformConfig = {
      platform: 'SoundTouchHomebridgePlugin',
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
          accessoryType: 'lightbulb',
        },
      ],
    };

    expect(config.zones?.[0].accessoryType).toBe('lightbulb');
  });

  it('accepts an optional per-zone defaultSource preset reference', () => {
    const config: ExternalPlatformConfig = {
      platform: 'SoundTouchHomebridgePlugin',
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
          defaultSource: { type: 'preset', slot: 2 },
        },
      ],
    };

    expect(config.zones?.[0].defaultSource).toEqual({
      type: 'preset',
      slot: 2,
    });
  });

  it('omits defaultSource when not configured', () => {
    const config: ExternalPlatformConfig = {
      platform: 'SoundTouchHomebridgePlugin',
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
        },
      ],
    };

    expect(config.zones?.[0].defaultSource).toBeUndefined();
  });
});
