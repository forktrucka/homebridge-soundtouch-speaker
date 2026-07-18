import { SoundTouchSpeakerCharacteristic } from './SoundTouchSpeakerCharacteristic.js';
import { PlatformAccessory } from 'homebridge';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { AppError } from '../../errors.js';

const SOUNDTOUCH_MANUFACTURER = 'Bose';

export class SoundTouchSpeakerInformationCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly isNewAccessory: boolean;

  private constructor(props: {
    device: SoundTouchDevice;
    accessory: PlatformAccessory;
    platform: SoundTouchHomebridgePlatform;
    isNewAccessory: boolean;
  }) {
    super(props);
    this.isNewAccessory = props.isNewAccessory;
  }

  async init(): Promise<void> {
    this.log.debug('initialising info');

    const informationService = this.accessory.getService(
      this.platform.service.AccessoryInformation
    );
    if (!informationService) {
      throw AppError.create({
        name: 'AccessoryInformationServiceMissing',
        device: this.device.name,
      });
    }

    // Only set Name on a genuinely new accessory. Re-pushing it on every
    // restart (including cache-restores) is a known HomeKit anti-pattern:
    // HomeKit treats the pushed value as authoritative and silently reverts
    // any rename the user made in the Home app.
    if (this.isNewAccessory) {
      informationService.setCharacteristic(
        this.platform.characteristic.Name,
        this.calculateDeviceName()
      );
    }

    informationService
      .setCharacteristic(
        this.platform.characteristic.Manufacturer,
        SOUNDTOUCH_MANUFACTURER
      )
      .setCharacteristic(this.platform.characteristic.Model, this.device.model)
      .setCharacteristic(
        this.platform.characteristic.SerialNumber,
        this.device.id
      );
    if (this.device.version) {
      informationService.setCharacteristic(
        this.platform.characteristic.FirmwareRevision,
        this.device.version
      );
    }
  }

  calculateDeviceName(): string {
    return this.device.name.toLowerCase().endsWith('speaker')
      ? this.device.name
      : `${this.device.name} Speaker`;
  }

  static async create(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    isNewAccessory: boolean;
  }): Promise<SoundTouchSpeakerInformationCharacteristic> {
    return new SoundTouchSpeakerInformationCharacteristic(props);
  }
}
