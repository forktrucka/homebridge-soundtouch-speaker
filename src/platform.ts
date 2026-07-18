import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { networkInterfaces } from 'node:os';
import { ExternalPlatformConfig } from './ExternalPlatformConfig.js';
import { SoundTouchDevice } from './devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchSpeakerPlatformAccessory } from './accessories/SoundTouchSpeakerPlatformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { Logger } from './utils/FormattedLogger.js';
import {
  PlatformConfiguration,
  ZoneConfiguration,
} from './PlatformConfiguration.js';
import { AppError } from './errors.js';
import { PresetManager, PresetStation } from './presets/index.js';
import { BoseCloudServer } from './server/BoseCloudServer.js';
import { SoundTouchZoneAccessory } from './zones/SoundTouchZoneAccessory.js';
import { SoundTouchTVSpikeAccessory } from './accessories/SoundTouchTVSpikeAccessory.js';

/**
 * Shallow-compares two zone member-device-id maps for equality, ignoring key
 * insertion order. Used to decide whether a zone accessory's persisted
 * `context.memberDeviceIds` actually changed and needs to be written back via
 * `updatePlatformAccessories`.
 */
function memberDeviceIdsEqual(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
}

export class SoundTouchHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly service: typeof Service;
  public readonly characteristic: typeof Characteristic;
  public readonly configuration: PlatformConfiguration;
  public readonly logger: Logger;
  public readonly api: API;

  private readonly _accessories: Map<string, PlatformAccessory> = new Map();
  private readonly _accessoryWrappers: Map<
    string,
    SoundTouchSpeakerPlatformAccessory
  > = new Map();
  private readonly _accessoryWrappersByDeviceId: Map<
    string,
    SoundTouchSpeakerPlatformAccessory
  > = new Map();
  private readonly _zoneWrappers: Map<string, SoundTouchZoneAccessory> =
    new Map();
  private readonly _discoveredCacheUUIDs: string[] = [];
  private readonly _discoveredDevices: SoundTouchDevice[] = [];

  private _presetManager: PresetManager | undefined;
  private _boseCloudServer: BoseCloudServer | undefined;

  constructor(
    homebridgeLogger: Logging,
    homebridgeConfig: ExternalPlatformConfig,
    homebridgeApi: API
  ) {
    this.api = homebridgeApi;
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;

    this.configuration = PlatformConfiguration.fromExternalConfiguration(
      homebridgeConfig,
      // Logger not yet initialised at this point; warnings emitted after logger is ready
      undefined
    );

    this.logger = Logger.forHomebridgeLogger({
      logger: homebridgeLogger,
      level: this.configuration.logLevel,
    });

    this.logger.info(
      'Finished initializing platform:',
      this.configuration.toJson()
    );

    this.api.on('didFinishLaunching', async () => {
      this.logger.debug('Started didFinishLaunching callback');
      try {
        this.logNetworkInterfaces();
        await this.discoverDevices();
        if (this.configuration.serverEnabled) {
          await this._startBoseCloudServer();
          await this._setupPresets();
        }
        await this._maybeRunTVSpike();
        this.logger.debug('Finished didFinishLaunching callback');
      } catch (e: unknown) {
        this.logger.error(
          AppError.create({ name: 'DidFinishLaunchingFailed', cause: e })
        );
      }
    });

    this.api.on('shutdown', () => {
      this.logger.debug('Stopping polling on shutdown');
      for (const wrapper of this._accessoryWrappers.values()) {
        wrapper.stopPolling();
      }
      for (const wrapper of this._zoneWrappers.values()) {
        wrapper.stopPolling();
      }
      if (this._presetManager) {
        this._presetManager.stop();
      }
      if (this._boseCloudServer) {
        this._boseCloudServer.stop().catch(() => undefined);
      }
    });
  }

  private logNetworkInterfaces() {
    const addresses = Object.entries(networkInterfaces()).flatMap(
      ([iface, infos]) =>
        (infos ?? [])
          .filter((i) => i.family === 'IPv4' && !i.internal)
          .map((i) => `${iface}: ${i.address}`)
    );
    this.logger.info(
      'Network interfaces:',
      addresses.length > 0 ? addresses.join(', ') : '(none found)'
    );
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.logger.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the _accessories cache, so we can track if it has already been registered
    this._accessories.set(accessory.UUID, accessory);
  }

  async searchDevices(): Promise<SoundTouchDevice[]> {
    if (this.configuration.discoverAllAccessories) {
      return SoundTouchDevice.discoverAllAccessories({
        config: this.configuration,
        logger: this.logger,
      });
    }

    const enabledAccessories = this.configuration.accessories.filter((a) => {
      if (a.disabled) {
        this.logger.info('Skipping disabled accessory:', a.name ?? '(unnamed)');
        return false;
      }
      return true;
    });

    const results = await Promise.allSettled(
      enabledAccessories.map((accessoryConfig) =>
        SoundTouchDevice.fromConfiguredAccessory({
          accessoryConfig,
          logger: this.logger,
        })
      )
    );

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [result.value];
      }
      const name = enabledAccessories[index]?.name ?? '(unknown)';
      this.logger.error(
        AppError.create({
          name: 'LoadAccessoryFailed',
          accessory: name,
          cause: result.reason,
        })
      );
      return [];
    });
  }

  async discoverDevices() {
    this.logger.debug('searching for devices', this.configuration);

    let accessories: SoundTouchDevice[];
    try {
      accessories = await this.searchDevices();
    } catch (e: unknown) {
      this.logger.error(
        AppError.create({ name: 'DeviceDiscoveryFailed', cause: e })
      );
      return;
    }

    this.logger.debug('loaded devices', accessories);

    for (const device of accessories) {
      const uuid = this.api.hap.uuid.generate(device.id);

      const existingAccessory = this._accessories.get(uuid);

      try {
        if (existingAccessory) {
          this.logger.info(
            'Restoring existing accessory from cache:',
            existingAccessory.displayName
          );

          const contextChanged =
            existingAccessory.context.deviceId !== device.id ||
            existingAccessory.displayName !== device.name;

          existingAccessory.context.deviceId = device.id;
          existingAccessory.displayName = device.name;

          const wrapper = await SoundTouchSpeakerPlatformAccessory.create({
            platform: this,
            accessory: existingAccessory,
            device,
            isNewAccessory: false,
          });
          this._accessoryWrappers.set(uuid, wrapper);
          this._accessoryWrappersByDeviceId.set(device.id, wrapper);

          if (contextChanged) {
            this.api.updatePlatformAccessories([existingAccessory]);
          }
        } else {
          this.logger.info('Adding new accessory:', device.name);

          const accessory = new this.api.platformAccessory(device.name, uuid);

          accessory.context.deviceId = device.id;

          const wrapper = await SoundTouchSpeakerPlatformAccessory.create({
            platform: this,
            accessory,
            device,
            isNewAccessory: true,
          });
          this._accessoryWrappers.set(uuid, wrapper);
          this._accessoryWrappersByDeviceId.set(device.id, wrapper);

          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);
        }

        this._discoveredCacheUUIDs.push(uuid);
        this._discoveredDevices.push(device);
      } catch (e: unknown) {
        this.logger.error(`Failed to initialise accessory: ${device.name}`, e);
      }
    }

    await this._resolveZones();

    for (const [uuid, accessory] of this._accessories) {
      if (!this._discoveredCacheUUIDs.includes(uuid)) {
        this.logger.info(
          'Removing existing accessory from cache:',
          accessory.displayName
        );

        // Stop the orphaned wrapper's polling loop before it's unregistered,
        // otherwise it keeps firing requests at a device that's gone.
        const wrapper = this._accessoryWrappers.get(uuid);
        if (wrapper) {
          wrapper.stopPolling();
          this._accessoryWrappers.delete(uuid);
        }
        const deviceId = accessory.context.deviceId as string | undefined;
        if (deviceId) {
          this._accessoryWrappersByDeviceId.delete(deviceId);
        }
        const zoneWrapper = this._zoneWrappers.get(uuid);
        if (zoneWrapper) {
          zoneWrapper.stopPolling();
          this._zoneWrappers.delete(uuid);
        }

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }

  /**
   * Triggers an immediate refresh of the given device's own registered
   * speaker accessory (its standalone On tile in the Home app), if one is
   * registered. Used by code paths — e.g. zone activation/deactivation —
   * that power a device via a raw pressKey call bypassing that device's own
   * SoundTouchSpeakerOnCharacteristic, so the Home app doesn't have to wait
   * on a gabbo push event or the background reconciliation poll to catch up.
   * No-ops when the device has no registered wrapper (e.g. a zone slave that
   * was never discovered as its own standalone accessory). Never throws —
   * refresh failures are logged and swallowed so callers aren't blocked.
   */
  async refreshAccessoryForDevice(deviceId: string): Promise<void> {
    const wrapper = this._accessoryWrappersByDeviceId.get(deviceId);
    if (!wrapper) {
      return;
    }
    try {
      await wrapper.refresh();
    } catch (e: unknown) {
      this.logger.error(
        AppError.create({
          name: 'RefreshAccessoryForDeviceFailed',
          deviceId,
          cause: e,
        })
      );
    }
  }

  private _findDeviceByName(name: string): SoundTouchDevice | undefined {
    return this._discoveredDevices.find((device) => device.name === name);
  }

  private _findDeviceById(id: string): SoundTouchDevice | undefined {
    return this._discoveredDevices.find((device) => device.id === id);
  }

  /**
   * Resolves a single zone member reference (the configured `primary` string
   * or one of the `slaves[]` strings) to a live device. Name-match is tried
   * first — so an intentional config re-point (editing the name to aim at a
   * different speaker) takes effect immediately — and a persisted device id
   * from a prior successful resolution is tried second, so a speaker rename
   * (config override edited, or its device-reported name changed) doesn't
   * silently orphan the zone.
   */
  private _resolveZoneMember(props: {
    reference: string;
    persistedIds: Record<string, string>;
  }): { device: SoundTouchDevice; id: string } | undefined {
    const byName = this._findDeviceByName(props.reference);
    if (byName) {
      return { device: byName, id: byName.id };
    }

    const persistedId = props.persistedIds[props.reference];
    if (persistedId) {
      const byId = this._findDeviceById(persistedId);
      if (byId) {
        return { device: byId, id: persistedId };
      }
    }

    return undefined;
  }

  private async _resolveZones(): Promise<void> {
    for (const zoneConfig of this.configuration.zones) {
      const uuid = this.api.hap.uuid.generate(`zone::${zoneConfig.name}`);
      const existingAccessory = this._accessories.get(uuid);
      const persistedIds =
        (existingAccessory?.context.memberDeviceIds as
          Record<string, string> | undefined) ?? {};
      const resolvedIds: Record<string, string> = {};

      const primaryResolution = this._resolveZoneMember({
        reference: zoneConfig.primary,
        persistedIds,
      });
      if (!primaryResolution) {
        this.logger.warn(
          `[Zones] Zone "${zoneConfig.name}": primary speaker "${zoneConfig.primary}" could not be resolved (no longer discoverable — it may have been renamed, replaced, reset, or is offline) — skipping zone`
        );
        continue;
      }
      resolvedIds[zoneConfig.primary] = primaryResolution.id;

      const slaves: SoundTouchDevice[] = [];
      for (const slaveName of zoneConfig.slaves) {
        const slaveResolution = this._resolveZoneMember({
          reference: slaveName,
          persistedIds,
        });
        if (!slaveResolution) {
          this.logger.warn(
            `[Zones] Zone "${zoneConfig.name}": slave speaker "${slaveName}" could not be resolved (no longer discoverable — it may have been renamed, replaced, reset, or is offline) — skipping that slave`
          );
          continue;
        }
        slaves.push(slaveResolution.device);
        resolvedIds[slaveName] = slaveResolution.id;
      }

      if (slaves.length === 0) {
        this.logger.warn(
          `[Zones] Zone "${zoneConfig.name}": no slave speakers could be resolved (none are discoverable — they may have been renamed, replaced, reset, or are offline) — skipping zone`
        );
        continue;
      }

      await this._registerZoneAccessory({
        zoneConfig,
        primary: primaryResolution.device,
        slaves,
        uuid,
        existingAccessory,
        memberDeviceIds: { ...persistedIds, ...resolvedIds },
      });
    }
  }

  private async _registerZoneAccessory(props: {
    zoneConfig: ZoneConfiguration;
    primary: SoundTouchDevice;
    slaves: SoundTouchDevice[];
    uuid: string;
    existingAccessory: PlatformAccessory | undefined;
    memberDeviceIds: Record<string, string>;
  }): Promise<void> {
    const {
      zoneConfig,
      primary,
      slaves,
      uuid,
      existingAccessory,
      memberDeviceIds,
    } = props;

    try {
      let accessory: PlatformAccessory;

      if (existingAccessory) {
        this.logger.info(
          'Restoring existing zone accessory from cache:',
          existingAccessory.displayName
        );
        existingAccessory.displayName = zoneConfig.name;
        accessory = existingAccessory;
      } else {
        this.logger.info('Adding new zone accessory:', zoneConfig.name);
        accessory = new this.api.platformAccessory(zoneConfig.name, uuid);
      }

      const persistedMemberDeviceIds =
        (accessory.context.memberDeviceIds as
          Record<string, string> | undefined) ?? {};
      const memberDeviceIdsChanged = !memberDeviceIdsEqual(
        persistedMemberDeviceIds,
        memberDeviceIds
      );
      accessory.context.memberDeviceIds = memberDeviceIds;

      const wrapper = await SoundTouchZoneAccessory.create({
        platform: this,
        accessory,
        config: zoneConfig,
        primary,
        slaves,
        isNewAccessory: existingAccessory === undefined,
      });
      this._zoneWrappers.set(uuid, wrapper);

      if (!existingAccessory) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      } else if (memberDeviceIdsChanged) {
        this.api.updatePlatformAccessories([accessory]);
      }

      this._discoveredCacheUUIDs.push(uuid);
    } catch (e: unknown) {
      this.logger.error(
        `Failed to initialise zone accessory: ${zoneConfig.name}`,
        e
      );
    }
  }

  private async _startBoseCloudServer(): Promise<void> {
    const server = BoseCloudServer.create({
      host: this.configuration.serverHost,
      port: this.configuration.serverPort,
      logger: this.logger,
    });
    try {
      await server.start();
      this._boseCloudServer = server;
    } catch (e: unknown) {
      this.logger.error('[FakeBoseCloudServer] Failed to start server', e);
    }
  }

  private async _maybeRunTVSpike(): Promise<void> {
    if (!process.env.TV_SPIKE) {
      return;
    }

    const wantedName = process.env.TV_SPIKE_DEVICE_NAME?.toLowerCase();
    const device = wantedName
      ? this._discoveredDevices.find((d) => d.name.toLowerCase() === wantedName)
      : this._discoveredDevices[0];

    if (!device) {
      this.logger.warn(
        '[TV Spike] TV_SPIKE set but no matching discovered device found'
      );
      return;
    }

    try {
      await SoundTouchTVSpikeAccessory.create({ platform: this, device });
    } catch (e: unknown) {
      this.logger.error(AppError.create({ name: 'TVSpikeFailed', cause: e }));
    }
  }

  private async _setupPresets(): Promise<void> {
    const { presets, presetSyncSchedule, presetSyncEnabled } =
      this.configuration;

    if (!presetSyncEnabled) {
      return;
    }

    if (!presets || presets.length === 0) {
      return;
    }

    const stations = new Map<number, PresetStation>();

    for (const preset of presets) {
      if (preset.type !== 'station') {
        continue;
      }
      stations.set(preset.slot, PresetStation.fromConfig(preset));
    }

    if (stations.size === 0) {
      this.logger.warn(
        '[Presets] No stations could be resolved — skipping preset sync'
      );
      return;
    }

    const syncableDevices = this._discoveredDevices.filter(
      (d) => d.configuration.presetSyncEnabled !== false
    );

    if (syncableDevices.length === 0) {
      this.logger.debug(
        '[Presets] No devices have presetSyncEnabled — skipping'
      );
      return;
    }

    const presetManager = PresetManager.create({
      devices: syncableDevices,
      stations,
      logger: this.logger,
    });

    this._presetManager = presetManager;
    presetManager.start(presetSyncSchedule);
  }
}
