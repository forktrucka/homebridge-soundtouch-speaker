import { LogLevel } from 'homebridge';
import {
  flattenAccessoryConfiguration,
  ExternalPlatformConfig,
  PresetConfig,
  ZoneConfig,
  ZoneDefaultSourceConfig,
} from './ExternalPlatformConfig.js';
import {
  AccessoryType,
  DeviceConfiguration,
} from './devices/SoundTouch/SoundTouchDeviceConfiguration.js';
import { PLATFORM_NAME } from './settings.js';
import { Logger } from './utils/FormattedLogger.js';

const DEFAULT_POLLING_INTERVAL = 0; // deprecated — reconciliation polling is now internal and fixed
const DEFAULT_DISCOVER_ALL_ACCESSORIES = false;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;
const DEFAULT_PRESET_SYNC_SCHEDULE = '0 0 * * *'; // midnight daily
const DEFAULT_SERVER_HOST = 'homebridge.local';
const DEFAULT_SERVER_PORT = 8000;
const DEFAULT_PRESET_SYNC_ENABLED = false;
const DEFAULT_ZONE_ACCESSORY_TYPE: AccessoryType = 'switch';

export class ZoneConfiguration {
  readonly name: string;
  readonly primary: string;
  readonly slaves: string[];
  readonly accessoryType: AccessoryType;
  readonly defaultSource?: ZoneDefaultSourceConfig;

  private constructor(props: {
    name: string;
    primary: string;
    slaves: string[];
    accessoryType: AccessoryType;
    defaultSource?: ZoneDefaultSourceConfig;
  }) {
    this.name = props.name;
    this.primary = props.primary;
    this.slaves = props.slaves;
    this.accessoryType = props.accessoryType;
    this.defaultSource = props.defaultSource;
  }

  toJson() {
    return JSON.stringify(this, null, 2);
  }

  static create(props: {
    name: string;
    primary: string;
    slaves: string[];
    accessoryType?: AccessoryType;
    defaultSource?: ZoneDefaultSourceConfig;
  }): ZoneConfiguration {
    return new ZoneConfiguration({
      name: props.name,
      primary: props.primary,
      slaves: props.slaves,
      accessoryType: props.accessoryType ?? DEFAULT_ZONE_ACCESSORY_TYPE,
      defaultSource: props.defaultSource,
    });
  }
}

function validateZoneDefaultSource(
  raw: unknown,
  zoneName: string,
  warn: (msg: string) => void
): ZoneDefaultSourceConfig | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const entry = raw as Record<string, unknown>;

  if (entry.type !== 'preset') {
    warn(
      `zone "${zoneName}" has a defaultSource with unknown type "${String(entry.type)}" — dropping defaultSource`
    );
    return undefined;
  }

  if (entry.slot === undefined || entry.slot === null) {
    warn(
      `zone "${zoneName}" defaultSource is missing required field "slot" — dropping defaultSource`
    );
    return undefined;
  }

  const slot = Number(entry.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) {
    warn(
      `zone "${zoneName}" defaultSource has invalid slot "${String(entry.slot)}" (must be 1–6) — dropping defaultSource`
    );
    return undefined;
  }

  return { type: 'preset', slot };
}

function validateZones(
  rawZones: ZoneConfig[] | undefined,
  warn: (msg: string) => void
): ZoneConfiguration[] {
  if (!rawZones || rawZones.length === 0) {
    return [];
  }
  const valid: ZoneConfiguration[] = [];
  for (const raw of rawZones) {
    const entry = raw as unknown as Record<string, unknown>;

    if (!entry.name || typeof entry.name !== 'string') {
      warn('zone entry is missing required field "name" — skipping');
      continue;
    }

    if (!entry.primary || typeof entry.primary !== 'string') {
      warn(
        `zone "${entry.name}" is missing required field "primary" — skipping`
      );
      continue;
    }

    if (!Array.isArray(entry.slaves) || entry.slaves.length === 0) {
      warn(
        `zone "${entry.name}" is missing required field "slaves" (must be a non-empty array) — skipping`
      );
      continue;
    }

    const slaves = entry.slaves.filter(
      (slave): slave is string => typeof slave === 'string' && slave.length > 0
    );
    if (slaves.length === 0) {
      warn(`zone "${entry.name}" has no valid entries in "slaves" — skipping`);
      continue;
    }

    const accessoryType =
      entry.accessoryType === 'lightbulb' || entry.accessoryType === 'switch'
        ? entry.accessoryType
        : undefined;

    const defaultSource = validateZoneDefaultSource(
      entry.defaultSource,
      entry.name,
      warn
    );

    valid.push(
      ZoneConfiguration.create({
        name: entry.name,
        primary: entry.primary,
        slaves,
        accessoryType,
        defaultSource,
      })
    );
  }
  return valid;
}

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
      warn(
        `preset entry for slot ${slot} is missing required field "name" — skipping`
      );
      continue;
    }

    if (!entry.tuneInId || typeof entry.tuneInId !== 'string') {
      warn(
        `preset entry for slot ${slot} ("${entry.name}") is missing required field "tuneInId" — skipping`
      );
      continue;
    }

    valid.push({
      type: 'station',
      slot,
      name: entry.name,
      tuneInId: entry.tuneInId,
      imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : undefined,
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
  serverEnabled: boolean;
  serverHost: string;
  serverPort: number;
  presets: PresetConfig[];
  presetSyncSchedule: string;
  presetSyncEnabled: boolean;
  zones: ZoneConfiguration[];

  private constructor(props: {
    name: string;
    discoverAllAccessories: boolean;
    accessories: DeviceConfiguration[] | undefined;
    pollingInterval: number;
    logLevel: LogLevel;
    serverEnabled: boolean;
    serverHost: string;
    serverPort: number;
    presets: PresetConfig[];
    presetSyncSchedule: string;
    presetSyncEnabled: boolean;
    zones: ZoneConfiguration[];
  }) {
    this.name = props.name;
    this.discoverAllAccessories = props.discoverAllAccessories;
    this.accessories = props?.accessories ?? [];
    this.pollingInterval = props.pollingInterval;
    this.logLevel = props.logLevel;
    this.serverEnabled = props.serverEnabled;
    this.serverHost = props.serverHost;
    this.serverPort = props.serverPort;
    this.presets = props.presets;
    this.presetSyncSchedule = props.presetSyncSchedule;
    this.presetSyncEnabled = props.presetSyncEnabled;
    this.zones = props.zones;
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

    const rawPresets = (props.presets ?? props.global?.presets) as
      unknown[] | undefined;
    const presets = validatePresets(rawPresets, warn);

    const zones = validateZones(props.zones, warn);

    return new PlatformConfiguration({
      discoverAllAccessories:
        props.discoverAllAccessories ?? DEFAULT_DISCOVER_ALL_ACCESSORIES,
      logLevel: resolveLogLevel(props.global?.logLevel, props.global?.verbose),
      // `??` (not `||`) so an explicit `0` survives as "polling disabled".
      pollingInterval:
        props.global?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
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
      serverEnabled: props.global?.server?.enabled ?? false,
      serverHost: props.global?.server?.host ?? DEFAULT_SERVER_HOST,
      serverPort: props.global?.server?.port ?? DEFAULT_SERVER_PORT,
      presets,
      presetSyncSchedule:
        props.global?.presetSyncSchedule ?? DEFAULT_PRESET_SYNC_SCHEDULE,
      presetSyncEnabled:
        props.global?.presetSyncEnabled ?? DEFAULT_PRESET_SYNC_ENABLED,
      zones,
    });
  }
}
