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
import type { GabboUpdateType } from '../../devices/SoundTouch/api/GabboClient.js';

export class SoundTouchSpeakerOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  override readonly gabboEvents: readonly GabboUpdateType[] = [
    'connectionStateUpdated',
  ];
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
      .onSet(this.wrapHapSet(this.setOn.bind(this)))
      .onGet(this.wrapHapGet(this.getOn.bind(this)));
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
    const actualPowerStatus = await SoundTouchDevice.deviceIsOn(this.device);
    if (actualPowerStatus !== desiredPowerStatus) {
      await this.device.api.pressKey(KeyValue.power);
      if (desiredPowerStatus) {
        await this.resumeLastPlayedSource();
      }
    }
    this.log.debug('set status - %s', desiredPowerStatus ? 'on' : 'off');
  }

  /**
   * Mimics the on-device behavior of resuming whatever was last playing
   * (preset, streaming source, AUX input) when powering on, rather than
   * leaving the speaker idle. Uses the device's own `/recents` list — the
   * same firmware-maintained state the physical power button relies on —
   * so this stays in sync with the device's own notion of "most recent"
   * rather than reconstructing it from `nowPlaying` polling.
   */
  private async resumeLastPlayedSource(): Promise<void> {
    const recents = await this.device.api.getRecents();
    const mostRecent = recents?.[0];
    if (mostRecent) {
      await this.device.api.selectSource(mostRecent.contentItem);
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
