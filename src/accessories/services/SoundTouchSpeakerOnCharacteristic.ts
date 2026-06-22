import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { KeyValue } from '../../devices/SoundTouch/api/index.js';
import { SoundTouchSpeakerCharacteristic } from './SoundTouchSpeakerCharacteristic.js';
import { ContextError } from '../../errors.js';

export class SoundTouchSpeakerOnCharacteristic extends SoundTouchSpeakerCharacteristic {
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
      this.platform.characteristic.On
    );

    this.characteristic
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  async init(): Promise<void> {
    this.log.debug('initialising on characteristic');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const isOn = await SoundTouchDevice.deviceIsOn(this.device);
    this.log.debug('get on', isOn);
    if (isOn !== this.characteristic.value) {
      this.characteristic.updateValue(isOn);
    }
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const desiredPowerStatus = value as boolean;

    try {
      if (this.characteristic.value !== desiredPowerStatus) {
        await this.device.api.pressKey(KeyValue.power);
      }
      this.log.debug('set status - %s', desiredPowerStatus ? 'on' : 'off');
    } catch (e: unknown) {
      this.log.debug(
        'error setting on status',
        ContextError.wrap('set on', { device: this.device.name }, e)
      );
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    const isOn = await SoundTouchDevice.deviceIsOn(this.device);
    this.log.debug('get on', isOn);
    return isOn;
  }

  static async create(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }): Promise<SoundTouchSpeakerOnCharacteristic> {
    return new SoundTouchSpeakerOnCharacteristic(props);
  }
}
