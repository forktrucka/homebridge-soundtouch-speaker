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

/**
 * Debounce window (ms) for `setBrightness`.
 *
 * `setBrightness` computes a RELATIVE delta: it reads the primary's current
 * volume, computes `target - currentPrimary`, then applies `current + delta`
 * to every member device. HAP does not serialize rapid `onSet` invocations —
 * a Home-app slider drag fires many `setBrightness` calls in quick
 * succession. Because each call is an unserialized read-then-act, overlapping
 * calls each read a stale base and apply a delta on top of it; since the
 * writes are relative, the errors compound rather than converging, and the
 * zone can settle on a volume matching neither the released slider position
 * nor any coherent state.
 *
 * Debouncing decouples the HAP ack from the physical action, mirroring the
 * `setOn` fix in `SoundTouchSpeakerOnCharacteristic` (#179): each
 * `setBrightness` call just records the latest desired brightness and
 * (re)starts this timer, resolving immediately. Only when the window elapses
 * with no newer call does the real read-then-act run, once, against the last
 * requested value - collapsing an entire slider drag into a single delta
 * computed from a single fresh read. 400ms matches the `setOn` debounce and
 * comfortably coalesces a realistic drag cadence.
 */
export const SET_ZONE_VOLUME_DEBOUNCE_MS = 400;

export class SoundTouchZoneVolumeCharacteristic extends SoundTouchSpeakerCharacteristic {
  override readonly gabboEvents: readonly GabboUpdateType[] = ['volumeUpdated'];
  private readonly service: Service;
  private readonly slaves: SoundTouchDevice[];
  private characteristic: Characteristic;

  /** Most recently requested brightness, applied when the debounce timer fires. */
  private desiredBrightness: number | undefined;

  /** Handle for the pending debounce timer, if a `setBrightness` call is awaiting coalescing. */
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

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
      // HomeKit always sends On=false alongside Brightness=0; setOn owns
      // power-off. Return without scheduling or clearing any pending timer
      // for a previously-requested non-zero brightness.
      return;
    }

    this.desiredBrightness = brightness;

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.runDebouncedZoneVolumeAction().catch((e: unknown) => {
        this.log.error('debounced zone volume action failed unexpectedly', e);
      });
    }, SET_ZONE_VOLUME_DEBOUNCE_MS);

    // Resolve promptly - do NOT wait on the debounced device action, so
    // wrapHapSet acks the HAP request immediately instead of blocking on the
    // physical action.
    return Promise.resolve();
  }

  // Runs the coalesced read-then-act for the last-requested brightness once
  // the debounce window has elapsed with no newer `setBrightness` call. The
  // HAP ack has already happened by this point, so a failure here can't
  // propagate to the originating caller - catch and log it rather than
  // letting it become an unhandled rejection in the timer callback. Either
  // way, once the apply settles (success or caught failure), push a live
  // re-read of the primary's actual volume so the HAP value reflects reality
  // immediately rather than waiting on the next reconciliation poll.
  private async runDebouncedZoneVolumeAction(): Promise<void> {
    const desiredBrightness = this.desiredBrightness;
    if (desiredBrightness === undefined) {
      return;
    }

    try {
      const primaryVolume = await this.device.api.getVolume();
      const currentPrimaryVolume = primaryVolume?.actual ?? 0;
      const delta = desiredBrightness - currentPrimaryVolume;

      const devices = [this.device, ...this.slaves];
      await Promise.all(
        devices.map(async (device) => {
          const volume = await device.api.getVolume();
          const currentVolume = volume?.actual ?? 0;
          await device.api.setVolume(clampVolume(currentVolume + delta));
        })
      );

      this.log.debug('set zone brightness - %s', desiredBrightness);
    } catch (e: unknown) {
      this.log.error('failed to apply debounced zone brightness', e);
    }

    try {
      const liveVolume = await this.device.api.getVolume();
      this.characteristic.updateValue(liveVolume?.actual ?? 0);
    } catch (e: unknown) {
      this.log.error(
        'failed to read live zone volume after debounced action',
        e
      );
    }
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
