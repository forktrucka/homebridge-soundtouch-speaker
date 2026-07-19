import { PlatformAccessory, Service } from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import {
  ContentItem,
  KeyValue,
  PlayStatus,
  SourceStatus,
} from '../devices/SoundTouch/api/index.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { PLUGIN_NAME } from '../settings.js';

interface SpikeInput {
  readonly name: string;
  readonly contentItem?: ContentItem;
  readonly presetSlot?: number;
}

const PRESET_KEYS_BY_SLOT: Record<number, KeyValue> = {
  1: KeyValue.preset1,
  2: KeyValue.preset2,
  3: KeyValue.preset3,
  4: KeyValue.preset4,
  5: KeyValue.preset5,
  6: KeyValue.preset6,
};

async function selectItem(
  device: SoundTouchDevice,
  item: SpikeInput
): Promise<void> {
  if (item.contentItem) {
    await device.api.selectSource(item.contentItem);
    return;
  }
  if (item.presetSlot) {
    await device.api.pressKey(PRESET_KEYS_BY_SLOT[item.presetSlot]);
  }
}

function mapPlayStatusToCurrentMediaState(
  platform: SoundTouchHomebridgePlatform,
  playStatus: PlayStatus | undefined
): number {
  const CurrentMediaState = platform.characteristic.CurrentMediaState;
  switch (playStatus) {
    case PlayStatus.play:
      return CurrentMediaState.PLAY;
    case PlayStatus.pause:
      return CurrentMediaState.PAUSE;
    case PlayStatus.stop:
      return CurrentMediaState.STOP;
    case PlayStatus.buffering:
      return CurrentMediaState.LOADING;
    default:
      return CurrentMediaState.INTERRUPTED;
  }
}

async function cycleSource(
  platform: SoundTouchHomebridgePlatform,
  device: SoundTouchDevice,
  tvService: Service,
  items: SpikeInput[],
  direction: 1 | -1
): Promise<void> {
  const current = await device.api.getSource();
  const currentIndex = items.findIndex(
    (i) => i.contentItem?.source === current
  );
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  const next = items[nextIndex];
  if (next) {
    await selectItem(device, next);
    tvService.updateCharacteristic(
      platform.characteristic.ActiveIdentifier,
      nextIndex
    );
  }
}

async function nudgeVolume(
  device: SoundTouchDevice,
  delta: number
): Promise<void> {
  const current = await device.api.getVolume();
  const next = Math.max(0, Math.min(100, (current?.actual ?? 0) + delta));
  await device.api.setVolume(next);
}

/**
 * Throwaway spike (see [03] source-selection plan) — publishes ONE external
 * Television + InputSource accessory for a single device, to check the
 * Home app UX and external-accessory publishing before committing to this
 * pattern for real. Not wired into normal discovery/cache lifecycle on
 * purpose — this never ships.
 */
export class SoundTouchTVSpikeAccessory {
  private constructor(private readonly accessory: PlatformAccessory) {}

  static async create({
    platform,
    device,
  }: {
    platform: SoundTouchHomebridgePlatform;
    device: SoundTouchDevice;
  }): Promise<SoundTouchTVSpikeAccessory> {
    const uuid = platform.api.hap.uuid.generate(`${device.id}-tv-spike`);
    const accessory = new platform.api.platformAccessory(
      device.model,
      uuid,
      platform.api.hap.Categories.TELEVISION
    );

    const infoService =
      accessory.getService(platform.service.AccessoryInformation) ??
      accessory.addService(platform.service.AccessoryInformation);
    infoService
      .setCharacteristic(platform.characteristic.Manufacturer, 'Bose')
      .setCharacteristic(platform.characteristic.Model, device.model)
      .setCharacteristic(
        platform.characteristic.SerialNumber,
        `${device.id}-tv-spike`
      );

    const tvService = accessory.addService(
      platform.service.Television,
      device.model,
      'tv-spike'
    );
    tvService.setCharacteristic(
      platform.characteristic.ConfiguredName,
      device.model
    );
    tvService.setCharacteristic(
      platform.characteristic.SleepDiscoveryMode,
      platform.characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
    );

    tvService
      .getCharacteristic(platform.characteristic.Active)
      .onGet(async () => ((await SoundTouchDevice.deviceIsOn(device)) ? 1 : 0))
      .onSet(async (value) => {
        const desired = value === 1;
        const actual = await SoundTouchDevice.deviceIsOn(device);
        if (actual !== desired) {
          await device.api.pressKey(KeyValue.power);
        }
      });

    const sources = await device.api.getSources();
    const sourceItems: SpikeInput[] = (sources?.items ?? [])
      .filter(
        (source) =>
          (source.status === SourceStatus.ready ||
            source.source === 'BLUETOOTH') &&
          source.source !== 'SPOTIFY' &&
          source.source !== 'ALEXA'
      )
      .map((source) => ({
        name: source.name,
        contentItem: {
          source: source.source,
          sourceAccount: source.sourceAccount,
        },
      }));

    // TEMPORARY (test only, per user request): always expose all 6 preset
    // slots as selectable inputs (matching the physical device's preset
    // buttons), regardless of whether a slot currently has anything stored.
    const presets = await device.api.getPresets();
    const presetsBySlot = new Map((presets ?? []).map((p) => [p.id, p]));
    const presetItems: SpikeInput[] = [1, 2, 3, 4, 5, 6].map((slot) => ({
      name: `Preset ${slot}`,
      contentItem: presetsBySlot.get(slot)?.contentItem,
      presetSlot: slot,
    }));

    const items: SpikeInput[] = [...sourceItems, ...presetItems];

    items.forEach((item, index) => {
      const inputService = accessory.addService(
        platform.service.InputSource,
        item.name,
        `input-${index}`
      );
      inputService
        .setCharacteristic(platform.characteristic.Identifier, index)
        .setCharacteristic(platform.characteristic.ConfiguredName, item.name)
        .setCharacteristic(
          platform.characteristic.IsConfigured,
          platform.characteristic.IsConfigured.CONFIGURED
        )
        .setCharacteristic(
          platform.characteristic.InputSourceType,
          platform.characteristic.InputSourceType.APPLICATION
        )
        .setCharacteristic(
          platform.characteristic.CurrentVisibilityState,
          platform.characteristic.CurrentVisibilityState.SHOWN
        );
      tvService.addLinkedService(inputService);
    });

    tvService
      .getCharacteristic(platform.characteristic.ActiveIdentifier)
      .onSet(async (value) => {
        const item = items[value as number];
        if (item) {
          await selectItem(device, item);
        }
      })
      .onGet(async () => {
        const current = await device.api.getSource();
        const index = items.findIndex((i) => i.contentItem?.source === current);
        return index >= 0 ? index : 0;
      });

    // TEMPORARY (test only, per user request): wire up RemoteKey so the
    // Home app / Control Center remote's transport buttons and arrow pad do
    // something, to check what that UX looks like against a real speaker.
    tvService
      .getCharacteristic(platform.characteristic.RemoteKey)
      .onSet(async (value) => {
        const RemoteKey = platform.characteristic.RemoteKey;
        switch (value) {
          case RemoteKey.REWIND:
            await device.api.pressKey(KeyValue.prevTrack);
            break;
          case RemoteKey.FAST_FORWARD:
            await device.api.pressKey(KeyValue.nextTrack);
            break;
          case RemoteKey.PLAY_PAUSE:
            await device.api.pressKey(KeyValue.playPause);
            break;
          case RemoteKey.NEXT_TRACK:
            await device.api.pressKey(KeyValue.nextTrack);
            break;
          case RemoteKey.PREVIOUS_TRACK:
            await device.api.pressKey(KeyValue.prevTrack);
            break;
          case RemoteKey.ARROW_UP:
            await cycleSource(platform, device, tvService, items, 1);
            break;
          case RemoteKey.ARROW_DOWN:
            await cycleSource(platform, device, tvService, items, -1);
            break;
          case RemoteKey.ARROW_LEFT:
            await device.api.pressKey(KeyValue.prevTrack);
            break;
          case RemoteKey.ARROW_RIGHT:
            await device.api.pressKey(KeyValue.nextTrack);
            break;
          case RemoteKey.SELECT:
            await device.api.pressKey(KeyValue.playPause);
            break;
          default:
            platform.logger.debug(
              `[TV Spike] RemoteKey ${value} has no SoundTouch equivalent — ignoring`
            );
        }
      });

    // TEMPORARY (test only, per user request): wire up CurrentMediaState so
    // the remote UI's play/pause indicator reflects real playback state.
    tvService.addOptionalCharacteristic(
      platform.characteristic.CurrentMediaState
    );
    tvService
      .getCharacteristic(platform.characteristic.CurrentMediaState)
      .onGet(async () => {
        const nowPlaying = await device.api.getNowPlaying();
        return mapPlayStatusToCurrentMediaState(
          platform,
          nowPlaying?.playStatus
        );
      });

    // TEMPORARY (test only, per user request): linked TelevisionSpeaker
    // service, to check what real volume/mute controls look like in the
    // Home app / Control Center remote UX.
    const speakerService = accessory.addService(
      platform.service.TelevisionSpeaker,
      `${device.name} Volume`,
      'tv-spike-speaker'
    );
    speakerService.setCharacteristic(
      platform.characteristic.VolumeControlType,
      platform.characteristic.VolumeControlType.ABSOLUTE
    );
    speakerService
      .getCharacteristic(platform.characteristic.Volume)
      .onGet(async () => (await device.api.getVolume())?.actual ?? 0)
      .onSet(async (value) => {
        await device.api.setVolume(value as number);
      });
    speakerService
      .getCharacteristic(platform.characteristic.Mute)
      .onGet(async () => (await device.api.getVolume())?.isMuted ?? false)
      .onSet(async () => {
        await device.api.pressKey(KeyValue.mute);
      });
    speakerService
      .getCharacteristic(platform.characteristic.VolumeSelector)
      .onSet(async (value) => {
        const VolumeSelector = platform.characteristic.VolumeSelector;
        await nudgeVolume(device, value === VolumeSelector.INCREMENT ? 5 : -5);
      });
    tvService.addLinkedService(speakerService);

    platform.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    platform.logger.info(
      `[TV Spike] Published external Television accessory for ${device.name} with ${sourceItems.length} source(s) + ${presetItems.length} preset(s)`
    );

    return new SoundTouchTVSpikeAccessory(accessory);
  }
}
