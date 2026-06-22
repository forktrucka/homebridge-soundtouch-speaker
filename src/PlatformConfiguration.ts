import { LogLevel } from 'homebridge';
import {
  flattenAccessoryConfiguration,
  ExternalPlatformConfig,
  PresetConfig,
  PresetsServerConfig,
} from './ExternalPlatformConfig.js';
import { DeviceConfiguration } from './devices/SoundTouch/SoundTouchDeviceConfiguration.js';
import { PLATFORM_NAME } from './settings.js';
import { Logger } from './utils/FormattedLogger.js';

const DEFAULT_POLLING_INTERVAL = 0; // deprecated — reconciliation polling is now internal and fixed
const DEFAULT_DISCOVER_ALL_ACCESSORIES = false;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;
const DEFAULT_PRESETS_SERVER_PORT = 18090;
const DEFAULT_PRESET_SYNC_INTERVAL = 3_600_000; // 1 hour

function resolveLogLevel(
  logLevel?: 'debug' | 'info' | 'warn' | 'error',
  verbose?: boolean
): LogLevel {
  if (logLevel) {
    switch (logLevel) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
    }
  }
  if (verbose === true) {
    return LogLevel.DEBUG;
  }
  return DEFAULT_LOG_LEVEL;
}

function validatePresets(
  rawPresets: unknown[] | undefined,
  warn: (msg: string) => void
): PresetConfig[] {
  if (!rawPresets || rawPresets.length === 0) {
    return [];
  }
  const valid: PresetConfig[] = [];
  for (const raw of rawPresets) {
    const entry = raw as Record<string, unknown>;

    if (!entry.type) {
      warn(`preset entry is missing required field "type" — skipping`);
      continue;
    }

    if (entry.type !== 'station') {
      warn(`preset entry has unknown type "${String(entry.type)}" — skipping`);
      continue;
    }

    if (entry.slot === undefined || entry.slot === null) {
      warn(`preset entry is missing required field "slot" — skipping`);
      continue;
    }

    const slot = Number(entry.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) {
      warn(
        `preset entry has invalid slot "${String(entry.slot)}" (must be 1–6) — skipping`
      );
      continue;
    }

    if (!entry.name || typeof entry.name !== 'string') {
      warn(`preset entry for slot ${slot} is missing required field "name" — skipping`);
      continue;
    }

    if (!entry.tuneInId && !entry.streamUrl) {
      warn(
        `preset entry for slot ${slot} ("${entry.name}") must have at least one of tuneInId or streamUrl — skipping`
      );
      continue;
    }

    valid.push({
      type: 'station',
      slot,
      name: entry.name,
      tuneInId: typeof entry.tuneInId === 'string' ? entry.tuneInId : undefined,
      streamUrl:
        typeof entry.streamUrl === 'string' ? entry.streamUrl : undefined,
      imageUrl:
        typeof entry.imageUrl === 'string' ? entry.imageUrl : undefined,
    });
  }
  return valid;
}

export class PlatformConfiguration {
  name: string;
  discoverAllAccessories: boolean;
  accessories: DeviceConfiguration[];
  pollingInterval: number;
  logLevel: LogLevel;
  presets: PresetConfig[];
  presetsServer: Required<PresetsServerConfig>;
  presetSyncInterval: number;

  private constructor(props: {
    name: string;
    discoverAllAccessories: boolean;
    accessories: DeviceConfiguration[] | undefined;
    pollingInterval: number;
    logLevel: LogLevel;
    presets: PresetConfig[];
    presetsServer: Required<PresetsServerConfig>;
    presetSyncInterval: number;
  }) {
    this.name = props.name;
    this.discoverAllAccessories = props.discoverAllAccessories;
    this.accessories = props?.accessories ?? [];
    this.pollingInterval = props.pollingInterval;
    this.logLevel = props.logLevel;
    this.presets = props.presets;
    this.presetsServer = props.presetsServer;
    this.presetSyncInterval = props.presetSyncInterval;
  }

  toJson() {
    return JSON.stringify(this, null, 2);
  }

  static fromExternalConfiguration(
    props: ExternalPlatformConfig,
    logger?: Logger
  ) {
    const warn = (msg: string) => {
      if (logger) {
        logger.warn(`[PlatformConfiguration] ${msg}`);
      }
    };

    const rawPresets = props.global?.presets as unknown[] | undefined;
    const presets = validatePresets(rawPresets, warn);

    return new PlatformConfiguration({
      discoverAllAccessories:
        props.discoverAllAccessories ?? DEFAULT_DISCOVER_ALL_ACCESSORIES,
      logLevel: resolveLogLevel(
        props.global?.logLevel,
        props.global?.verbose
      ),
      // `??` (not `||`) so an explicit `0` survives as "polling disabled".
      pollingInterval: props.global?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
      accessories:
        props.accessories
          ?.map((accessory) => {
            const resultingConfig = flattenAccessoryConfiguration({
              accessory,
              globalConfig: props.global,
            });
            return resultingConfig
              ? DeviceConfiguration.fromAccessoryConfiguration({
                  accessoryConfig: resultingConfig,
                  name: accessory?.name,
                })
              : DeviceConfiguration.create({
                  name: accessory?.name,
                  verboseLogging: props.global?.verbose,
                  pollingInterval: props.global?.pollingInterval,
                });
          })
          ?.filter((d) => !!d) ?? [],
      name: props.name ?? PLATFORM_NAME,
      presets,
      presetsServer: {
        port: props.global?.presetsServer?.port ?? DEFAULT_PRESETS_SERVER_PORT,
        host: props.global?.presetsServer?.host ?? '',
      },
      presetSyncInterval:
        props.global?.presetSyncInterval ?? DEFAULT_PRESET_SYNC_INTERVAL,
    });
  }
}
