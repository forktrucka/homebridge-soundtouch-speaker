import { describe, expect, it } from '@jest/globals';
import { flattenAccessoryConfiguration } from '../ExternalPlatformConfig.js';

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
