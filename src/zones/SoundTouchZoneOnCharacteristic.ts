import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { SoundTouchSpeakerCharacteristic } from '../accessories/services/SoundTouchSpeakerCharacteristic.js';
import { KeyValue } from '../devices/SoundTouch/api/index.js';
import type { Zone } from '../devices/SoundTouch/api/index.js';

export class SoundTouchZoneOnCharacteristic extends SoundTouchSpeakerCharacteristic {
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
      this.platform.characteristic.On
    );

    this.characteristic
      .onSet(this.wrapHapSet(this.setOn.bind(this)))
      .onGet(this.wrapHapGet(this.getOn.bind(this)));
  }

  async init(): Promise<void> {
    this.log.debug('initialising zone on characteristic');
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const isOn = await this._isZoneActive();
    this.log.debug('get zone on', isOn);
    if (isOn !== this.characteristic.value) {
      this.characteristic.updateValue(isOn);
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    const isOn = await this._isZoneActive();
    this.log.debug('get zone on', isOn);
    return isOn;
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const desired = value as boolean;
    if (desired) {
      await this._ensureDevicesPowered(true);
      await this.device.api.setZone(this._buildZone());
      this.log.debug('zone activated');
    } else {
      await this.device.api.removeZoneSlave(this._buildZone());
      await this._ensureDevicesPowered(false);
      this.log.debug('zone deactivated');
    }
  }

  private async _ensureDevicesPowered(desired: boolean): Promise<void> {
    const devices = [this.device, ...this.slaves];
    await Promise.all(
      devices.map(async (device) => {
        const isOn = await SoundTouchDevice.deviceIsOn(device);
        if (isOn !== desired) {
          await device.api.pressKey(KeyValue.power);
          await this._refreshOwnAccessory(device);
        }
      })
    );
  }

  /**
   * Powering a device via a raw pressKey call (above) bypasses that device's
   * own SoundTouchSpeakerOnCharacteristic entirely, so its standalone speaker
   * accessory's On tile in the Home app never learns the state changed —
   * neither the gabbo push event nor the 5-minute reconciliation poll fires
   * promptly from this code path. Trigger an immediate refresh of that
   * device's own registered accessory so the Home app reflects reality right
   * away. Failures here must not block or fail the zone operation.
   */
  private async _refreshOwnAccessory(device: SoundTouchDevice): Promise<void> {
    try {
      await this.platform.refreshAccessoryForDevice(device.id);
    } catch (e: unknown) {
      this.log.debug(
        'failed to refresh own accessory after zone power change',
        e
      );
    }
  }

  private _buildZone(): Zone {
    return {
      master: this.device.id,
      senderIpAddress: this.device.api.host,
      members: this.slaves.map((slave) => ({
        deviceId: slave.id,
        ipAddress: slave.api.host,
      })),
    };
  }

  private async _isZoneActive(): Promise<boolean> {
    const zone = await this.device.api.getZone();
    if (!zone) {
      return false;
    }
    const memberIds = new Set(zone.members.map((member) => member.deviceId));
    return this.slaves.every((slave) => memberIds.has(slave.id));
  }

  static async create(props: {
    accessory: PlatformAccessory;
    primary: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    platform: SoundTouchHomebridgePlatform;
    service: Service;
  }): Promise<SoundTouchZoneOnCharacteristic> {
    const { primary, ...rest } = props;
    return new SoundTouchZoneOnCharacteristic({ device: primary, ...rest });
  }
}
