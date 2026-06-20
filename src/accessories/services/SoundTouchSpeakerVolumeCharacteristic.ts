import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { SoundTouchSpeakerCharacteristic } from './SoundTouchSpeakerCharacteristic.js';

export class SoundTouchSpeakerVolumeCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly service: Service;

  private characteristic: Characteristic;

  constructor({
    service,
    ...props
  }: {
    device: SoundTouchDevice;
    service: Service;
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
  }) {
    super(props);

    this.service = service;
    this.characteristic = this.service.getCharacteristic(
      this.platform.characteristic.Volume
    );

    this.characteristic
      .onSet(this.setVolume.bind(this))
      .onGet(this.getVolume.bind(this));
  }

  async init(): Promise<void> {
    this.log.debug('initialising volume characteristic');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const volume = await this.device.api.getVolume();
    if (volume === undefined) {
      return;
    }
    this.log.debug('get volume', volume.actual);
    if (volume.actual !== this.characteristic.value) {
      this.characteristic.updateValue(volume.actual);
    }
  }

  async setVolume(value: CharacteristicValue): Promise<void> {
    const desiredVolume = value as number;

    try {
      await this.device.api.setVolume(desiredVolume);
      this.log.success('set volume - %d', desiredVolume);
    } catch (e: unknown) {
      this.log.error('error setting volume', e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async getVolume(): Promise<CharacteristicValue> {
    const volume = await this.device.api.getVolume();
    const actual = volume?.actual ?? 0;
    this.log.debug('get volume', actual);
    return actual;
  }

  static async create(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }): Promise<SoundTouchSpeakerVolumeCharacteristic> {
    return new SoundTouchSpeakerVolumeCharacteristic(props);
  }
}
