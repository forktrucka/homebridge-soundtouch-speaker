import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { SoundTouchSpeakerCharacteristic } from '../accessories/services/SoundTouchSpeakerCharacteristic.js';
import type { GabboUpdateType } from '../devices/SoundTouch/api/GabboClient.js';

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export class SoundTouchZoneVolumeCharacteristic extends SoundTouchSpeakerCharacteristic {
  override readonly gabboEvents: readonly GabboUpdateType[] = ['volumeUpdated'];
  private readonly service: Service;
  private readonly slaves: SoundTouchDevice[];
  private characteristic: Characteristic;

  private constructor({
    service,
    slaves,
    ...props
  }: {
    device: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    service: Service;
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
  }) {
    super(props);

    this.service = service;
    this.slaves = slaves;
    this.characteristic = this.service.getCharacteristic(
      this.platform.characteristic.Brightness
    );

    this.characteristic
      .onSet(this.wrapHapSet(this.setBrightness.bind(this)))
      .onGet(this.wrapHapGet(this.getBrightness.bind(this)));
  }

  async init(): Promise<void> {
    this.log.debug('initialising zone brightness characteristic');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const volume = await this.device.api.getVolume();
    if (!volume) {
      return;
    }
    this.log.debug('get zone brightness (volume)', volume.actual);
    if (volume.actual !== this.characteristic.value) {
      this.characteristic.updateValue(volume.actual);
    }
  }

  async getBrightness(): Promise<CharacteristicValue> {
    const volume = await this.device.api.getVolume();
    const actual = volume?.actual ?? 0;
    this.log.debug('get zone brightness', actual);
    return actual;
  }

  /**
   * Zone volume moves every member speaker by the same relative offset,
   * mirroring the real Bose app's zone volume behaviour — it preserves
   * whatever balance already existed between the primary and its slaves
   * rather than forcing them all to the same level.
   */
  async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;
    if (brightness === 0) {
      // HomeKit always sends On=false alongside Brightness=0; setOn owns power-off.
      return;
    }

    const primaryVolume = await this.device.api.getVolume();
    const currentPrimaryVolume = primaryVolume?.actual ?? 0;
    const delta = brightness - currentPrimaryVolume;

    const devices = [this.device, ...this.slaves];
    await Promise.all(
      devices.map(async (device) => {
        const volume = await device.api.getVolume();
        const currentVolume = volume?.actual ?? 0;
        await device.api.setVolume(clampVolume(currentVolume + delta));
      })
    );

    this.log.debug('set zone brightness - %s', brightness);
  }

  static async create(props: {
    accessory: PlatformAccessory;
    primary: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }): Promise<SoundTouchZoneVolumeCharacteristic> {
    const { primary, ...rest } = props;
    return new SoundTouchZoneVolumeCharacteristic({ device: primary, ...rest });
  }
}
