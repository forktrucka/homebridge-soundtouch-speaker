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

export class SoundTouchSpeakerOnCharacteristic extends SoundTouchSpeakerCharacteristic {
  override readonly gabboEvents: readonly GabboUpdateType[] = [
    'connectionStateUpdated',
  ];
  private readonly service: Service;

  private characteristic: Characteristic;

  /**
   * Serializes `setOn` against overlapping calls on this device.
   *
   * HAP does not serialize rapid `onSet` invocations from the Home app —
   * a few quick taps on a tile can produce overlapping `setOn` calls. Each
   * call does a live read (`SoundTouchDevice.deviceIsOn`) before deciding
   * whether to press the POWER toggle key; without serialization, a later
   * call's read can land while an earlier call's 300ms hold is still
   * in-flight and see stale state, wrongly concluding no press is needed.
   *
   * Chaining every `setOn` off this promise ensures each call's full
   * read-then-act sequence (read, hold, optional resume) completes before
   * the next one starts its own read, so every call sees fresh
   * post-settle state and the device ends in the state requested by the
   * last call. Kept as an instance field (one characteristic instance per
   * device) so different devices are never serialized against each other.
   */
  private pendingSetOn: Promise<void> = Promise.resolve();

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

    // Chain this call after any in-flight setOn for this device settles
    // (successfully or not), then run this call's read-then-act sequence.
    // Swallowing the predecessor's rejection here only unblocks the chain
    // for the *next* call - this call's own errors still propagate via
    // `run`, which is what's returned/thrown to the caller (and on to
    // `wrapHapSet`).
    const run = this.pendingSetOn
      .catch(() => undefined)
      .then(() => this.applyPowerState(desiredPowerStatus));
    this.pendingSetOn = run.catch(() => undefined);

    return run;
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
