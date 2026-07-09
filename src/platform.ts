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
import { PlatformConfiguration } from './PlatformConfiguration.js';
import { AppError } from './errors.js';
import { PresetManager, PresetStation } from './presets/index.js';
import { BoseCloudServer } from './server/BoseCloudServer.js';

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
          });
          this._accessoryWrappers.set(uuid, wrapper);

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
          });
          this._accessoryWrappers.set(uuid, wrapper);

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

        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
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
