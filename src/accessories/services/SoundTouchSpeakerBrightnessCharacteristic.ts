import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { SoundTouchSpeakerCharacteristic } from './SoundTouchSpeakerCharacteristic.js';

export class SoundTouchSpeakerBrightnessCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly service: Service;
  private characteristic: Characteristic;

  private constructor({
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
      this.platform.characteristic.Brightness
    );
    this.characteristic
      .onSet(this.wrapHapSet('SetBrightnessFailed', this.setBrightness.bind(this)))
      .onGet(this.wrapHapGet('GetBrightnessFailed', this.getBrightness.bind(this)));
  }

  async init(): Promise<void> {
    this.log.debug('initialising brightness characteristic');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const volume = await this.device.api.getVolume();
    if (!volume) {
      return;
    }
    this.log.debug('get brightness (volume)', volume.actual);
    if (volume.actual !== this.characteristic.value) {
      this.characteristic.updateValue(volume.actual);
    }
  }

  async getBrightness(): Promise<CharacteristicValue> {
    const volume = await this.device.api.getVolume();
    const actual = volume?.actual ?? 0;
    this.log.debug('get brightness', actual);
    return actual;
  }

  async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;
    if (brightness === 0) {
      // HomeKit always sends On=false alongside Brightness=0; setOn owns power-off.
      return;
    }
    await this.device.api.setVolume(brightness);
    this.log.debug('set brightness - %s', brightness);
  }

  static async create(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }): Promise<SoundTouchSpeakerBrightnessCharacteristic> {
    return new SoundTouchSpeakerBrightnessCharacteristic(props);
  }
}
