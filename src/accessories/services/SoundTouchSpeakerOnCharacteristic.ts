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

// After toggling power the speaker takes a moment to settle. Within this
// window a repeated press of the same desired state is ignored, so rapid
// HomeKit toggles don't hammer the device. This is a non-blocking cooldown —
// the setter returns immediately rather than stalling a concurrent volume set.
const POWER_SETTLE_MS = 5000;

export class SoundTouchSpeakerOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly service: Service;

  private characteristic: Characteristic;

  private settleUntil = 0;

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
      if (this.characteristic.value === desiredPowerStatus) {
        return;
      }

      if (Date.now() < this.settleUntil) {
        this.log.debug('power press ignored while settling');
        return;
      }

      await this.device.api.pressKey(KeyValue.power);
      this.settleUntil = Date.now() + POWER_SETTLE_MS;
      this.log.success('set status - %s', desiredPowerStatus ? 'on' : 'off');
    } catch (e: unknown) {
      this.log.error('error setting on status', e);
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
