import {
  Characteristic,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { SoundTouchSpeakerCharacteristic } from '../accessories/services/SoundTouchSpeakerCharacteristic.js';
import { KeyValue, SourceStatus } from '../devices/SoundTouch/api/index.js';
import type { NowPlaying, Zone } from '../devices/SoundTouch/api/index.js';
import type { ZoneDefaultSourceConfig } from '../ExternalPlatformConfig.js';

export class SoundTouchZoneOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly service: Service;
  private readonly slaves: SoundTouchDevice[];
  private readonly defaultSource?: ZoneDefaultSourceConfig;
  private characteristic: Characteristic;

  private constructor({
    service,
    slaves,
    defaultSource,
    ...props
  }: {
    device: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    service: Service;
    platform: SoundTouchHomebridgePlatform;
    accessory: PlatformAccessory;
    defaultSource?: ZoneDefaultSourceConfig;
  }) {
    super(props);

    this.service = service;
    this.slaves = slaves;
    this.defaultSource = defaultSource;
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
      await this._applyDefaultSourceIfIdle();
      await this.device.api.setZone(this._buildZone());
      this.log.debug('zone activated');
    } else {
      await this.device.api.removeZoneSlave(this._buildZone());
      await this._ensureDevicesPowered(false);
      this.log.debug('zone deactivated');
    }
  }

  /**
   * A press+release with no deliberate gap between them (i.e. `pressKey`,
   * which holds for 0ms) has been confirmed on real hardware to silently
   * fail to toggle the POWER key — the device stays in whatever state it
   * was in. A short deliberate hold reliably toggles power. 300ms is the
   * duration confirmed reliable in that testing.
   */
  private static readonly POWER_HOLD_DURATION_MS = 300;

  private async _ensureDevicesPowered(desired: boolean): Promise<void> {
    const devices = [this.device, ...this.slaves];
    await Promise.all(
      devices.map(async (device) => {
        const isOn = await SoundTouchDevice.deviceIsOn(device);
        if (isOn !== desired) {
          await device.api.holdKey(
            KeyValue.power,
            SoundTouchZoneOnCharacteristic.POWER_HOLD_DURATION_MS
          );
          await this._refreshOwnAccessory(device);
        }
      })
    );
  }

  /**
   * Powering a device via a raw holdKey call (above) bypasses that device's
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

  /**
   * Fill-if-empty: selects the configured default source on the primary
   * only when the primary has nothing meaningful playing. Never overrides
   * an already-playing primary — this is what makes it compose cleanly
   * with the primary's own resume-last-played-source (triggered from its
   * own On tile, a separate code path) and with a session started before
   * the zone was activated.
   */
  private async _applyDefaultSourceIfIdle(): Promise<void> {
    if (!this.defaultSource) {
      return;
    }

    const nowPlaying = await this.device.api.getNowPlaying();
    if (!this._isPrimaryIdle(nowPlaying)) {
      return;
    }

    const presets = await this.device.api.getPresets();
    const preset = presets?.find(
      (candidate) => candidate.id === this.defaultSource?.slot
    );
    if (!preset) {
      this.log.warn(
        `configured zone default source preset slot ${this.defaultSource.slot} is empty on the device — skipping`
      );
      return;
    }

    await this.device.api.selectSource(preset.contentItem);
  }

  private _isPrimaryIdle(nowPlaying: NowPlaying | undefined): boolean {
    if (!nowPlaying) {
      return true;
    }
    if (
      nowPlaying.source === SourceStatus.standBy ||
      nowPlaying.source === SourceStatus.invalid
    ) {
      return true;
    }
    if (!nowPlaying.contentItem.source || !nowPlaying.contentItem.location) {
      return true;
    }
    return false;
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
    const primaryIsOn = await SoundTouchDevice.deviceIsOn(this.device);
    if (!primaryIsOn) {
      return false;
    }
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
    defaultSource?: ZoneDefaultSourceConfig;
  }): Promise<SoundTouchZoneOnCharacteristic> {
    const { primary, ...rest } = props;
    return new SoundTouchZoneOnCharacteristic({ device: primary, ...rest });
  }
}
