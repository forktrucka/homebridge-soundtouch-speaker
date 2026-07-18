import type { PlatformConfig } from 'homebridge';

interface BasePlatformConfig extends PlatformConfig {
  readonly global?: BaseGlobalConfig;
}

interface BaseGlobalConfig {
  readonly verbose?: boolean; // deprecated alias for logLevel: 'debug'
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

interface StationPresetConfig {
  readonly type: 'station';
  readonly slot: number;
  readonly name: string;
  readonly tuneInId: string;
  readonly imageUrl?: string;
}

export type PresetConfig = StationPresetConfig;

interface ServerConfig {
  readonly enabled?: boolean;
  readonly host?: string;
  readonly port?: number;
}

interface GlobalConfig extends BaseGlobalConfig {
  readonly pollingInterval?: number;
  readonly accessoryType?: 'switch' | 'lightbulb';
  readonly server?: ServerConfig;
  readonly presets?: PresetConfig[];
  readonly presetSyncSchedule?: string;
  readonly presetSyncEnabled?: boolean;
}

export interface AccessoryConfig extends GlobalConfig {
  readonly name?: string;
  readonly room?: string;
  readonly ip?: string;
  readonly port?: number;
  readonly disabled?: boolean;
}

interface ZonePresetDefaultSourceConfig {
  readonly type: 'preset';
  readonly slot: number;
}

// v1 ships the `preset` variant only; modeled as a union so an inline-
// ContentItem variant (`type: 'source'`) can be added later without a
// breaking schema change.
export type ZoneDefaultSourceConfig = ZonePresetDefaultSourceConfig;

export interface ZoneConfig {
  readonly name: string;
  readonly primary: string;
  readonly slaves: string[];
  readonly accessoryType?: 'switch' | 'lightbulb';
  readonly defaultSource?: ZoneDefaultSourceConfig;
}

export interface ExternalPlatformConfig extends BasePlatformConfig {
  readonly discoverAllAccessories?: boolean;
  readonly accessories?: AccessoryConfig[];
  readonly global?: GlobalConfig;
  readonly presets?: PresetConfig[];
  readonly zones?: ZoneConfig[];
}

export function flattenAccessoryConfiguration(props: {
  accessory?: AccessoryConfig;
  globalConfig?: GlobalConfig;
}): AccessoryConfig | undefined {
  const configs = [];

  if (props.globalConfig) {
    configs.push(props.globalConfig);
  }

  if (props.accessory) {
    configs.push(props.accessory);
  }

  if (configs.length === 0) {
    return undefined;
  }

  return configs.reduce((acc, config) => {
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined) {
        // @ts-expect-error only overwriting non-undefined values
        acc[key] = value;
      }
    });
    return acc;
  }, {} as AccessoryConfig);
}
