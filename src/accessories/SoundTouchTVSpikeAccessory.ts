import { PlatformAccessory } from 'homebridge';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import {
  ContentItem,
  KeyValue,
  SourceStatus,
} from '../devices/SoundTouch/api/index.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import { PLUGIN_NAME } from '../settings.js';

interface SpikeInput {
  readonly name: string;
  readonly contentItem: ContentItem;
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
      `${device.name} TV Spike`,
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
      `${device.name} Input`,
      'tv-spike'
    );
    tvService.setCharacteristic(
      platform.characteristic.ConfiguredName,
      `${device.name} Input`
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
          source.status === SourceStatus.ready && source.source !== 'SPOTIFY'
      )
      .map((source) => ({
        name: source.name,
        contentItem: {
          source: source.source,
          sourceAccount: source.sourceAccount,
        },
      }));

    // TEMPORARY (test only, per user request): also expose the device's
    // stored presets (TuneIn stations etc.) as selectable inputs, to check
    // whether presets work as HomeKit TV inputs alongside plain sources.
    const presets = await device.api.getPresets();
    const presetItems: SpikeInput[] = (presets ?? []).map((preset) => ({
      name: preset.contentItem.itemName || `Preset ${preset.id}`,
      contentItem: preset.contentItem,
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
          await device.api.selectSource(item.contentItem);
        }
      })
      .onGet(async () => {
        const current = await device.api.getSource();
        const index = items.findIndex((i) => i.contentItem.source === current);
        return index >= 0 ? index : 0;
      });

    platform.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    platform.logger.info(
      `[TV Spike] Published external Television accessory for ${device.name} with ${sourceItems.length} source(s) + ${presetItems.length} preset(s)`
    );

    return new SoundTouchTVSpikeAccessory(accessory);
  }
}
