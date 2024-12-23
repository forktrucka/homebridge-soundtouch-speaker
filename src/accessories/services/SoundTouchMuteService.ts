import { SoundTouchService } from './ServiceType.js';
import {
  Characteristic,
  CharacteristicValue,
  Logging,
  Nullable,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { FormattedLogger } from '../../utils/FormattedLogger.js';
import { KeyValue } from '../../devices/SoundTouch/api/index.js';

export class SoundTouchMuteService implements SoundTouchService {
  private service: Service;
  private platform: SoundTouchHomebridgePlatform;
  private log: FormattedLogger;
  private device: SoundTouchDevice;
  private characteristic: Characteristic;

  constructor({
    service,
    platform,
    log,
    device,
  }: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    service: Service;
    platform: SoundTouchHomebridgePlatform;
    log: Logging;
  }) {
    this.service = service;
    this.platform = platform;
    this.device = device;
    this.log = FormattedLogger.create(log, device);
    this.characteristic = this.service.getCharacteristic(
      this.platform.Characteristic.Mute
    );
    this.characteristic
      .onSet(this.setMute.bind(this))
      .onGet(this.getMute.bind(this));
  }

  async init(): Promise<void> {
    this.log.debug('initialising mute');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const volume = await this.device.api.getVolume();
    const isMuted = volume?.isMuted ?? false;
    if (volume) {
      this.characteristic.updateValue(isMuted);
    }
  }

  async getMute(): Promise<Nullable<CharacteristicValue>> {
    this.log.debug('getting mute status');
    const isOn = await SoundTouchDevice.deviceIsOn(this.device);

    if (isOn) {
      const volume = await this.device.api.getVolume();
      return !volume?.isMuted;
    }
    return false;
  }

  async setMute(value: CharacteristicValue): Promise<void> {
    this.log.debug('setting mute status');
    const unmute = value as boolean;
    const isOn = await SoundTouchDevice.deviceIsOn(this.device);

    if (isOn) {
      const volume = await this.device.api.getVolume();
      if ((unmute && volume?.isMuted) || (!unmute && !volume?.isMuted)) {
        this.log.debug(`${unmute ? 'Unmuted' : 'Muted'}`);
        await this.device.api.pressKey(KeyValue.mute);
      }
    } else if (unmute) {
      await this.device.api.pressKey(KeyValue.power);
    }
  }

  static async create(props: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }) {
    return new SoundTouchMuteService({
      log: props.platform.log,
      ...props,
    });
  }
}