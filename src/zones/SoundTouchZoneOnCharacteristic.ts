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

/**
 * Debounce window (ms) for `setOn`.
 *
 * HomeKit couples a Lightbulb's Brightness and On characteristics, so
 * dragging a zone's brightness slider near zero fires the zone's own `setOn`
 * rapidly — a realistic rapid-burst trigger, not just deliberate tile-tapping.
 * `setOn` calls `_ensureDevicesPowered`, which loops the primary and every
 * slave and, per device, does a live read (`SoundTouchDevice.deviceIsOn`)
 * then holds POWER if it differs. Each device's read-then-act is unserialized
 * against the others AND uncoordinated against any overlapping `setOn` call
 * on this same instance — real-device QA confirmed a rapid burst can leave
 * zone members in DIFFERENT power states after settling.
 *
 * Debouncing decouples the HAP ack from the physical action, mirroring the
 * `setOn` fix in `SoundTouchSpeakerOnCharacteristic` (#179) and the
 * `setBrightness` fix in `SoundTouchZoneVolumeCharacteristic` (#181): each
 * `setOn` call just records the latest desired value and (re)starts this
 * timer, resolving immediately. Only when the window elapses with no newer
 * call does the real activate/deactivate sequence run, once, against the
 * last requested value - collapsing an entire burst into a single physical
 * action. 400ms matches the other two debounces.
 */
export const SET_ZONE_ON_DEBOUNCE_MS = 400;

export class SoundTouchZoneOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  private readonly service: Service;
  private readonly slaves: SoundTouchDevice[];
  private readonly defaultSource?: ZoneDefaultSourceConfig;
  private characteristic: Characteristic;

  /** Most recently requested zone power value, applied when the debounce timer fires. */
  private desiredZoneOn: boolean | undefined;

  /** Handle for the pending debounce timer, if a `setOn` call is awaiting coalescing. */
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.desiredZoneOn = value as boolean;

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.runDebouncedZoneOnAction().catch((e: unknown) => {
        this.log.error('debounced zone on action failed unexpectedly', e);
      });
    }, SET_ZONE_ON_DEBOUNCE_MS);

    // Resolve promptly - do NOT wait on the debounced device action. This
    // decouples the HAP ack from the physical action, mirroring
    // SoundTouchSpeakerOnCharacteristic#setOn (#179).
    return Promise.resolve();
  }

  // Runs the coalesced physical action for the last-requested value once the
  // debounce window has elapsed with no newer `setOn` call. The HAP ack has
  // already happened by this point, so a failure here can't propagate to the
  // originating caller - catch and log it rather than letting it become an
  // unhandled rejection in the timer callback. Either way, once the action
  // settles (success or caught failure), push a live re-read of the actual
  // zone state (mirroring `_isZoneActive`) so the HAP value reflects reality
  // immediately rather than waiting on the next reconciliation poll.
  private async runDebouncedZoneOnAction(): Promise<void> {
    const desired = this.desiredZoneOn;
    if (desired === undefined) {
      return;
    }

    try {
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
    } catch (e: unknown) {
      this.log.error('failed to apply debounced zone on state', e);
    }

    try {
      const actualZoneOn = await this._isZoneActive();
      this.characteristic.updateValue(actualZoneOn);
    } catch (e: unknown) {
      this.log.error(
        'failed to read live zone state after debounced action',
        e
      );
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
