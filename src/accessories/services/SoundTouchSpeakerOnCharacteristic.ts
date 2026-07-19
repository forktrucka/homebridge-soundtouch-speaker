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

/**
 * Duration (ms) to hold the POWER key for when toggling power via HomeKit.
 *
 * Confirmed against real hardware: a bare press+release with ~0ms gap
 * (what `pressKey` sends) silently fails to toggle POWER on a real
 * SoundTouch speaker, while a ~300ms hold reliably toggles it. 300ms is
 * the shortest duration confirmed reliable in that testing.
 */
export const POWER_KEY_HOLD_DURATION_MS = 300;

/**
 * Debounce window (ms) for `setOn`.
 *
 * HAP does not serialize rapid `onSet` invocations from the Home app — a
 * burst of quick taps on a tile fires several overlapping `setOn` calls.
 * An earlier fix (#178) chained each call's full read-then-act sequence
 * (live read, 300ms POWER hold, optional resume) behind the previous one so
 * every call saw fresh post-settle state. That was REJECTED after
 * real-hardware re-verification: `wrapHapSet` awaits whatever `setOn`
 * returns, so chaining made a queued call's HAP ack wait for the entire
 * backlog ahead of it to drain (each hop is 300ms, plus ~1-2s more when
 * powering on for `resumeLastPlayedSource`'s two round-trips). Under a
 * realistic rapid-tap burst this blew well past HomeKit's set-response
 * window, producing a visible tile/device desync — arguably worse than the
 * drift bug it replaced.
 *
 * Debouncing instead decouples the HAP ack from the physical action: each
 * `setOn` call just records the latest desired value and (re)starts this
 * timer, resolving immediately so `wrapHapSet` never blocks on the device.
 * Only when the window elapses with no newer call does the real
 * live-read + hold + resume sequence run, once, against the last requested
 * value — collapsing an entire burst into a single physical action. 400ms
 * comfortably coalesces a realistic rapid-tap cadence (taps land well
 * under 400ms apart) while staying short enough that a single, deliberate
 * tap doesn't feel laggy before the speaker responds.
 */
export const SET_ON_DEBOUNCE_MS = 400;

export class SoundTouchSpeakerOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  override readonly gabboEvents: readonly GabboUpdateType[] = [
    'connectionStateUpdated',
  ];
  private readonly service: Service;

  private characteristic: Characteristic;

  /** Most recently requested power value, applied when the debounce timer fires. */
  private desiredPowerStatus: boolean | undefined;

  /** Handle for the pending debounce timer, if a `setOn` call is awaiting coalescing. */
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.desiredPowerStatus = desiredPowerStatus;

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.runDebouncedPowerAction().catch((e: unknown) => {
        this.log.error('debounced power action failed unexpectedly', e);
      });
    }, SET_ON_DEBOUNCE_MS);

    // Resolve promptly - do NOT wait on the debounced device action. This
    // is what lets wrapHapSet ack the HAP request immediately instead of
    // blocking on the (possibly several-second) physical action, which is
    // the specific regression the rejected chaining approach (#178) caused.
    return Promise.resolve();
  }

  // Runs the coalesced physical action for the last-requested value once
  // the debounce window has elapsed with no newer `setOn` call. Because the
  // HAP ack has already happened by this point, a failure here can't
  // propagate to the originating caller - catch and log it (this repo's
  // "catch and log own errors" pattern, e.g. PresetManager.sync()) rather
  // than letting it become an unhandled rejection in the timer callback.
  // Either way, once the action settles (success or caught failure), push
  // a live re-read of the actual device state so the HAP value reflects
  // reality immediately rather than waiting on the next reconciliation
  // poll (up to 5 minutes away) to correct a mismatch.
  private async runDebouncedPowerAction(): Promise<void> {
    const desiredPowerStatus = this.desiredPowerStatus;
    if (desiredPowerStatus === undefined) {
      return;
    }

    try {
      await this.applyPowerState(desiredPowerStatus);
    } catch (e: unknown) {
      this.log.error('failed to apply debounced power state', e);
    }

    try {
      const actualPowerStatus = await SoundTouchDevice.deviceIsOn(this.device);
      this.characteristic.updateValue(actualPowerStatus);
    } catch (e: unknown) {
      this.log.error(
        'failed to read live power state after debounced action',
        e
      );
    }
  }

  private async applyPowerState(desiredPowerStatus: boolean): Promise<void> {
    const actualPowerStatus = await SoundTouchDevice.deviceIsOn(this.device);
    if (actualPowerStatus !== desiredPowerStatus) {
      await this.device.api.holdKey(KeyValue.power, POWER_KEY_HOLD_DURATION_MS);
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
