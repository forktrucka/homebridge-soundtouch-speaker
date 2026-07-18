import { PlatformAccessory } from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { ZoneConfiguration } from '../PlatformConfiguration.js';
import { SoundTouchZoneOnCharacteristic } from './SoundTouchZoneOnCharacteristic.js';
import { Logger } from '../utils/FormattedLogger.js';

const SOUNDTOUCH_MANUFACTURER = 'Bose';
const ZONE_MODEL = 'SoundTouch Zone';

function zoneServiceName(props: {
  config: ZoneConfiguration;
  isLightbulb: boolean;
}): string {
  return `${props.config.name} Zone ${props.isLightbulb ? 'LIGHTBULB' : 'ON'} Service`;
}

export class SoundTouchZoneAccessory {
  private readonly onCharacteristic: SoundTouchZoneOnCharacteristic;
  private readonly log: Logger;

  private constructor(props: {
    onCharacteristic: SoundTouchZoneOnCharacteristic;
    log: Logger;
  }) {
    this.onCharacteristic = props.onCharacteristic;
    this.log = props.log;
  }

  async init(): Promise<void> {
    await this.onCharacteristic.init();
  }

  async refresh(): Promise<void> {
    await this.onCharacteristic.refresh();
  }

  // No independent polling loop today — zone state is refreshed at startup and
  // on demand. Kept for interface parity with SoundTouchSpeakerPlatformAccessory
  // so platform shutdown can iterate zone wrappers uniformly.
  stopPolling(): void {
    // no-op
  }

  static async create(props: {
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
    config: ZoneConfiguration;
    primary: SoundTouchDevice;
    slaves: SoundTouchDevice[];
  }): Promise<SoundTouchZoneAccessory> {
    const { platform, accessory, config, primary, slaves } = props;
    const isLightbulb = config.accessoryType === 'lightbulb';

    SoundTouchZoneAccessory._pruneOrphanService({
      accessory,
      platform,
      config,
      isLightbulb,
    });

    const serviceName = zoneServiceName({ config, isLightbulb });
    let service = accessory.getService(serviceName);
    if (!service) {
      service = accessory.addService(
        isLightbulb ? platform.service.Lightbulb : platform.service.Switch,
        serviceName,
        'ZONE'
      );
    }

    SoundTouchZoneAccessory._setInformation({ accessory, platform, config });

    const onCharacteristic = await SoundTouchZoneOnCharacteristic.create({
      accessory,
      primary,
      slaves,
      platform,
      service,
    });

    const zoneAccessory = new SoundTouchZoneAccessory({
      onCharacteristic,
      log: platform.logger,
    });

    await zoneAccessory.init();

    zoneAccessory.log.info(`[${config.name}] Zone accessory ready`);

    return zoneAccessory;
  }

  private static _pruneOrphanService(props: {
    accessory: PlatformAccessory;
    platform: SoundTouchHomebridgePlatform;
    config: ZoneConfiguration;
    isLightbulb: boolean;
  }): void {
    const { accessory, platform, config, isLightbulb } = props;
    const orphanName = zoneServiceName({ config, isLightbulb: !isLightbulb });
    const orphan = accessory.getService(orphanName);
    if (orphan) {
      platform.logger.info(
        'Removing stale zone service after accessory type change:',
        orphanName
      );
      accessory.removeService(orphan);
    }
  }

  private static _setInformation(props: {
    accessory: PlatformAccessory;
    platform: SoundTouchHomebridgePlatform;
    config: ZoneConfiguration;
  }): void {
    const { accessory, platform, config } = props;
    const informationService = accessory.getService(
      platform.service.AccessoryInformation
    );
    if (!informationService) {
      return;
    }
    informationService
      .setCharacteristic(platform.characteristic.Name, config.name)
      .setCharacteristic(
        platform.characteristic.Manufacturer,
        SOUNDTOUCH_MANUFACTURER
      )
      .setCharacteristic(platform.characteristic.Model, ZONE_MODEL)
      .setCharacteristic(
        platform.characteristic.SerialNumber,
        `zone::${config.name}`
      );
  }
}
