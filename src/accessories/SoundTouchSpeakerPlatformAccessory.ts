import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { PlatformAccessory, type Service } from 'homebridge';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { AppError } from '../errors.js';
import {
  getServiceName,
  ServiceType,
  SoundTouchSpeakerCharacteristic,
} from './services/SoundTouchSpeakerCharacteristic.js';
import { SoundTouchSpeakerInformationCharacteristic } from './services/SoundTouchSpeakerInformationCharacteristic.js';
import { SoundTouchSpeakerOnCharacteristic } from './services/SoundTouchSpeakerOnCharacteristic.js';
import { SoundTouchSpeakerBrightnessCharacteristic } from './services/SoundTouchSpeakerBrightnessCharacteristic.js';

export class SoundTouchSpeakerPlatformAccessory extends SoundTouchSpeakerCharacteristic {
  private readonly speakerCharacteristics: SoundTouchSpeakerCharacteristic[];
  private _isPolling = false;

  private constructor({
    speakerCharacteristics,
    ...props
  }: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    speakerCharacteristics: SoundTouchSpeakerCharacteristic[];
  }) {
    super(props);
    this.speakerCharacteristics = speakerCharacteristics;
  }

  async init(): Promise<void> {
    for (const speakerCharacteristic of this.speakerCharacteristics) {
      if (speakerCharacteristic.init) {
        await speakerCharacteristic.init();
      }
    }

    if (this.device.configuration.pollingInterval > 0) {
      this._isPolling = true;
      this._refreshDeviceServices().then(() => {
        //no-op
      });
    }

    this.log.info(`Device ready`);
  }

  async refresh(): Promise<void> {
    for (const speakerCharacteristic of this.speakerCharacteristics) {
      if (speakerCharacteristic.refresh) {
        await speakerCharacteristic.refresh();
      }
    }
  }

  stopPolling(): void {
    this._isPolling = false;
  }

  private async _refreshDeviceServices(): Promise<void> {
    while (this._isPolling) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.device.configuration.pollingInterval)
      );
      try {
        await this.refresh();
      } catch (e: unknown) {
        this.log.warn(AppError.create({ name: 'PollingRefreshFailed', device: this.accessory.displayName, cause: e }));
      }
    }
  }

  static createWithCharacteristics(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    speakerCharacteristics: SoundTouchSpeakerCharacteristic[];
  }): SoundTouchSpeakerPlatformAccessory {
    return new SoundTouchSpeakerPlatformAccessory(props);
  }

  static async createAccessory(props: {
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    defaultCharacteristics: SoundTouchSpeakerCharacteristic[];
  }): Promise<SoundTouchSpeakerPlatformAccessory> {
    const { platform, accessory, device } = props;
    const isLightbulb = device.configuration.accessoryType === 'lightbulb';

    SoundTouchSpeakerPlatformAccessory.pruneOrphanService({
      accessory,
      platform,
      orphanServiceType: isLightbulb
        ? ServiceType.ON_OFF
        : ServiceType.LIGHTBULB,
      device,
    });

    const service = SoundTouchSpeakerPlatformAccessory.ensureAccessoryService({
      serviceType: isLightbulb ? ServiceType.LIGHTBULB : ServiceType.ON_OFF,
      service: isLightbulb
        ? platform.service.Lightbulb
        : platform.service.Switch,
      ...props,
    });

    const characteristics = [
      await SoundTouchSpeakerOnCharacteristic.create({
        service,
        ...props,
      }),
      ...(isLightbulb
        ? [
            await SoundTouchSpeakerBrightnessCharacteristic.create({
              service,
              ...props,
            }),
          ]
        : []),
      ...props.defaultCharacteristics,
    ];

    return new SoundTouchSpeakerPlatformAccessory({
      speakerCharacteristics: [...characteristics],
      ...props,
    });
  }

  static async create(props: {
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
  }): Promise<SoundTouchSpeakerPlatformAccessory> {
    const defaultCharacteristics: SoundTouchSpeakerCharacteristic[] = [
      await SoundTouchSpeakerInformationCharacteristic.create(props),
    ];

    const accessory = await SoundTouchSpeakerPlatformAccessory.createAccessory({
      defaultCharacteristics,
      ...props,
    });

    await accessory.init();

    return accessory;
  }

  private static pruneOrphanService({
    accessory,
    platform,
    orphanServiceType,
    device,
  }: {
    accessory: PlatformAccessory;
    platform: SoundTouchHomebridgePlatform;
    orphanServiceType: ServiceType;
    device: SoundTouchDevice;
  }): void {
    const orphanName = getServiceName({
      serviceType: orphanServiceType,
      device,
    });
    const orphan = accessory.getService(orphanName);
    if (orphan) {
      platform.logger.info(
        'Removing stale service after accessory type change:',
        orphanName
      );
      accessory.removeService(orphan);
    }
  }

  private static ensureAccessoryService({
    device,
    accessory,
    serviceType,
    service,
  }: {
    serviceType: ServiceType;
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    service: typeof Service;
  }) {
    const serviceName = getServiceName({
      device,
      serviceType,
    });

    let accessoryService = accessory.getService(serviceName);

    if (!accessoryService) {
      accessoryService = accessory.addService(
        service,
        serviceName,
        serviceType
      );
    }
    return accessoryService;
  }
}
