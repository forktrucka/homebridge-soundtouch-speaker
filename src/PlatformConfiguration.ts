import { LogLevel } from 'homebridge';
import {
  flattenAccessoryConfiguration,
  ExternalPlatformConfig,
} from './ExternalPlatformConfig.js';
import { DeviceConfiguration } from './devices/SoundTouch/SoundTouchDeviceConfiguration.js';
import { PLATFORM_NAME } from './settings.js';

const DEFAULT_POLLING_INTERVAL = 30 * 1000; // 30 seconds — WebSocket handles real-time; polling is the fallback reconciler
const DEFAULT_DISCOVER_ALL_ACCESSORIES = false;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;

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

export class PlatformConfiguration {
  name: string;
  discoverAllAccessories: boolean;
  accessories: DeviceConfiguration[];
  pollingInterval: number;
  logLevel: LogLevel;

  private constructor(props: {
    name: string;
    discoverAllAccessories: boolean;
    accessories: DeviceConfiguration[] | undefined;
    pollingInterval: number;
    logLevel: LogLevel;
  }) {
    this.name = props.name;
    this.discoverAllAccessories = props.discoverAllAccessories;
    this.accessories = props?.accessories ?? [];
    this.pollingInterval = props.pollingInterval;
    this.logLevel = props.logLevel;
  }

  toJson() {
    return JSON.stringify(this, null, 2);
  }

  static fromExternalConfiguration(props: ExternalPlatformConfig) {
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
    });
  }
}
