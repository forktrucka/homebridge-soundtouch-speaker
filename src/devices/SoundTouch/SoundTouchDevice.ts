import { BaseDevice } from 'homebridge-base-platform';
import { LogLevel } from 'homebridge';
import { AppError } from '../../errors.js';
import {
  API as SoundTouchApi,
  APIDiscovery as SoundTouchDiscovery,
  GabboClient,
  Info,
  SourceStatus,
  NetworkInfo,
} from './api/index.js';
import { DeviceConfiguration } from './SoundTouchDeviceConfiguration.js';
import { Logger } from '../../utils/FormattedLogger.js';
import { PlatformConfiguration } from '../../PlatformConfiguration.js';
import { flattenAccessoryConfiguration } from '../../ExternalPlatformConfig.js';

interface SoundTouchSpeakerPlatformAccessoryProps {
  api: SoundTouchApi;
  model: string;
  configuration: DeviceConfiguration;
  version?: string | undefined;
  id: string;
  name: string;
}

export class SoundTouchDevice implements BaseDevice {
  api: SoundTouchApi;
  model: string;
  configuration: DeviceConfiguration;
  version?: string | undefined;
  id: string;
  name: string;
  readonly gabbo: GabboClient;

  private constructor(props: SoundTouchSpeakerPlatformAccessoryProps) {
    this.api = props.api;
    this.model = props.model;
    this.version = props.version;
    this.id = props.id;
    this.name = props.name;
    this.configuration = props.configuration;
    this.gabbo = GabboClient.create(props.api.host);
  }

  connectGabbo(): void {
    this.gabbo.connect();
  }

  disconnectGabbo(): void {
    this.gabbo.disconnect();
  }

  static getOrCreateDeviceConfiguration({
    config,
    networkInfo,
    name,
    logger,
  }: {
    networkInfo: NetworkInfo[];
    name: string;
    config: PlatformConfiguration;
    logger: Logger;
  }) {
    const matchedConfig = config.accessories.find(
      (ac) => ac.room === name || networkInfo.some((i) => i.ipAddress === ac.ip)
    );

    if (matchedConfig) {
      logger.debug('found matching config - %s', matchedConfig.toJson());

      const resultingAccessoryConfig = flattenAccessoryConfiguration({
        globalConfig: {
          pollingInterval: config.pollingInterval,
          verbose: config.logLevel === LogLevel.DEBUG,
        },
        accessory: matchedConfig,
      });

      const deviceConfig = resultingAccessoryConfig
        ? DeviceConfiguration.fromAccessoryConfiguration({
            accessoryConfig: resultingAccessoryConfig,
            name,
          })
        : DeviceConfiguration.create({
            name,
            verboseLogging: config.logLevel === LogLevel.DEBUG,
            pollingInterval: config.pollingInterval,
          });

      if (deviceConfig) {
        logger.debug(
          'created device configuration - %s',
          deviceConfig.toJson()
        );
        return deviceConfig;
      }
      logger.debug('could not create device config for accessory - %s', name);
    }

    logger.debug('creating default config', {
      name,
    });

    return DeviceConfiguration.create({
      name,
      verboseLogging: config.logLevel === LogLevel.DEBUG,
      pollingInterval: config.pollingInterval,
    });
  }

  static async discoverAllAccessories({
    config,
    logger,
  }: {
    config: PlatformConfiguration;
    logger: Logger;
  }): Promise<SoundTouchDevice[]> {
    const soundtouchApiInstances = await SoundTouchDiscovery.search();

    const devices: SoundTouchDevice[] = [];

    for (const api of soundtouchApiInstances) {
      try {
        const info = await api.getInfo();

        if (!info) {
          continue;
        }

        const accessoryConfig = SoundTouchDevice.getOrCreateDeviceConfiguration(
          {
            config,
            logger,
            ...info,
          }
        );

        if (accessoryConfig.disabled) {
          logger.info(`[${info.name}] Skipping disabled accessory`);
          continue;
        }

        const device = await SoundTouchDevice.fromDiscoveredAccessory({
          api,
          info,
          accessoryConfig,
          logger,
        });

        if (!device) continue;

        devices.push(device);
      } catch (e) {
        logger.error(AppError.create({ name: 'CreateDeviceFailed', cause: e }));
      }
    }

    return devices;
  }

  static async fromConfiguredAccessory({
    accessoryConfig,
    logger,
  }: {
    accessoryConfig: DeviceConfiguration;
    logger: Logger;
  }): Promise<SoundTouchDevice> {
    let api;
    if (accessoryConfig.ip) {
      api = SoundTouchApi.create(accessoryConfig.ip, accessoryConfig.port);
    } else if (accessoryConfig.room) {
      api = await SoundTouchDiscovery.find(accessoryConfig.room);
      if (!api) {
        throw AppError.create({  name: 'DeviceNotFound', device: accessoryConfig.name || '(undefined)' });
      }
    }
    if (!api) {
      throw AppError.create({  name: 'DeviceNotFound', device: accessoryConfig.name ?? '(undefined)' });
    }
    const info = await api.getInfo();
    if (!info) {
      throw AppError.create({  name: 'DeviceInfoFailed', device: accessoryConfig.name ?? '(undefined)' });
    }
    return SoundTouchDevice.fromDiscoveredAccessory({
      api,
      info,
      accessoryConfig,
      logger,
    });
  }

  static async fromDiscoveredAccessory({
    api,
    info,
    accessoryConfig,
    logger,
  }: {
    api: SoundTouchApi;
    info: Info;
    accessoryConfig: DeviceConfiguration;
    logger: Logger;
  }): Promise<SoundTouchDevice> {
    const displayName = accessoryConfig.name || info.name;

    logger.info(`[${displayName}] Found device`);

    const component =
      info.components.find((c) => c.category === 'SCM') ?? info.components[0];

    return new SoundTouchDevice({
      api: api,
      name: displayName,
      id: info.deviceId,
      model: info.type,
      version: component ? component.softwareVersion.split(' ')[0] : undefined,
      configuration: accessoryConfig,
    });
  }

  static async deviceIsOn(device: SoundTouchDevice): Promise<boolean> {
    const source = await device.api.getSource();

    if (!source) {
      return false;
    }

    switch (source) {
      case SourceStatus.standBy:
        return false;
      case SourceStatus.invalid:
        return true;
      default:
        return true;
    }
  }
}
