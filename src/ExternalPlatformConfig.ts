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

export interface PresetsServerConfig {
  readonly port?: number;
  readonly host?: string;
}

interface GlobalConfig extends BaseGlobalConfig {
  readonly pollingInterval?: number;
  readonly accessoryType?: 'switch' | 'lightbulb';
  readonly presetsServer?: PresetsServerConfig;
  readonly presets?: PresetConfig[];
  readonly presetSyncInterval?: number;
}

export interface AccessoryConfig extends GlobalConfig {
  readonly name?: string;
  readonly room?: string;
  readonly ip?: string;
  readonly port?: number;
  readonly disabled?: boolean;
}

export interface ExternalPlatformConfig extends BasePlatformConfig {
  readonly discoverAllAccessories?: boolean;
  readonly accessories?: AccessoryConfig[];
  readonly global?: GlobalConfig;
  readonly presets?: PresetConfig[];
  readonly presetSyncInterval?: number;
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
