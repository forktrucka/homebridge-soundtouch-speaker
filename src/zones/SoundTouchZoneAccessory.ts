import { PlatformAccessory } from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { ZoneConfiguration } from '../PlatformConfiguration.js';
import { SoundTouchZoneOnCharacteristic } from './SoundTouchZoneOnCharacteristic.js';
import { SoundTouchZoneVolumeCharacteristic } from './SoundTouchZoneVolumeCharacteristic.js';
import { Logger } from '../utils/FormattedLogger.js';
import { AppError } from '../errors.js';

const SOUNDTOUCH_MANUFACTURER = 'Bose';
const ZONE_MODEL = 'SoundTouch Zone';
const ZONE_RECONCILIATION_INTERVAL_MS = 60 * 1000;

function zoneServiceName(props: {
  config: ZoneConfiguration;
  isLightbulb: boolean;
}): string {
  return `${props.config.name} Zone ${props.isLightbulb ? 'LIGHTBULB' : 'ON'} Service`;
}

export class SoundTouchZoneAccessory {
  private readonly onCharacteristic: SoundTouchZoneOnCharacteristic;
  private readonly volumeCharacteristic?: SoundTouchZoneVolumeCharacteristic;
  private readonly primary: SoundTouchDevice;
  private readonly name: string;
  private readonly log: Logger;
  private _isPolling = false;

  private constructor(props: {
    onCharacteristic: SoundTouchZoneOnCharacteristic;
    volumeCharacteristic?: SoundTouchZoneVolumeCharacteristic;
    primary: SoundTouchDevice;
    name: string;
    log: Logger;
  }) {
    this.onCharacteristic = props.onCharacteristic;
    this.volumeCharacteristic = props.volumeCharacteristic;
    this.primary = props.primary;
    this.name = props.name;
    this.log = props.log;
  }

  async init(): Promise<void> {
    await this.onCharacteristic.init();
    await this.volumeCharacteristic?.init();

    this._isPolling = true;
    this._reconcile().then(() => {
      //no-op
    });
  }

  async refresh(): Promise<void> {
    await this.onCharacteristic.refresh();
    await this.volumeCharacteristic?.refresh();
  }

  stopPolling(): void {
    this._isPolling = false;
  }

  private async _reconcile(): Promise<void> {
    while (this._isPolling) {
      await new Promise((resolve) =>
        setTimeout(resolve, ZONE_RECONCILIATION_INTERVAL_MS)
      );
      if (!this.primary.gabbo.isConnected) {
        this.log.debug(
          `[${this.name}] primary offline — skipping zone reconciliation poll`
        );
        continue;
      }
      try {
        await this.refresh();
      } catch (e: unknown) {
        this.log.warn(
          AppError.create({
            name: 'PollingRefreshFailed',
            device: this.name,
            cause: e,
          })
        );
      }
    }
  }

  static createWithCharacteristics(props: {
    onCharacteristic: SoundTouchZoneOnCharacteristic;
    volumeCharacteristic?: SoundTouchZoneVolumeCharacteristic;
    primary: SoundTouchDevice;
    name: string;
    log: Logger;
  }): SoundTouchZoneAccessory {
    return new SoundTouchZoneAccessory(props);
  }

  static async create(props: {
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
    config: ZoneConfiguration;
    primary: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    isNewAccessory: boolean;
  }): Promise<SoundTouchZoneAccessory> {
    const { platform, accessory, config, primary, slaves, isNewAccessory } =
      props;
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

    SoundTouchZoneAccessory._setInformation({
      accessory,
      platform,
      config,
      isNewAccessory,
    });

    const onCharacteristic = await SoundTouchZoneOnCharacteristic.create({
      accessory,
      primary,
      slaves,
      platform,
      service,
      defaultSource: config.defaultSource,
    });

    const volumeCharacteristic = isLightbulb
      ? await SoundTouchZoneVolumeCharacteristic.create({
          accessory,
          primary,
          slaves,
          platform,
          service,
        })
      : undefined;

    const zoneAccessory = new SoundTouchZoneAccessory({
      onCharacteristic,
      volumeCharacteristic,
      primary,
      name: config.name,
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
    isNewAccessory: boolean;
  }): void {
    const { accessory, platform, config, isNewAccessory } = props;
    const informationService = accessory.getService(
      platform.service.AccessoryInformation
    );
    if (!informationService) {
      return;
    }

    // Only set Name on a genuinely new accessory. Re-pushing it on every
    // restart (including cache-restores) is a known HomeKit anti-pattern:
    // HomeKit treats the pushed value as authoritative and silently reverts
    // any rename the user made in the Home app.
    if (isNewAccessory) {
      informationService.setCharacteristic(
        platform.characteristic.Name,
        config.name
      );
    }

    informationService
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
