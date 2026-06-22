import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';
import { ExternalPlatformConfig } from './ExternalPlatformConfig.js';
import { SoundTouchDevice } from './devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchSpeakerPlatformAccessory } from './accessories/SoundTouchSpeakerPlatformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { Logger } from './utils/FormattedLogger.js';
import { PlatformConfiguration } from './PlatformConfiguration.js';
import { AppError } from './errors.js';

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

  constructor(
    homebridgeLogger: Logging,
    homebridgeConfig: ExternalPlatformConfig,
    homebridgeApi: API
  ) {
    this.api = homebridgeApi;
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;

    this.configuration =
      PlatformConfiguration.fromExternalConfiguration(homebridgeConfig);

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
      await this.discoverDevices();
      this.logger.debug('Finished didFinishLaunching callback');
    });

    this.api.on('shutdown', () => {
      this.logger.debug('Stopping polling on shutdown');
      for (const wrapper of this._accessoryWrappers.values()) {
        wrapper.stopPolling();
      }
    });
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

    const results = await Promise.allSettled(
      this.configuration.accessories.map((accessoryConfig) =>
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
      const name = this.configuration.accessories[index]?.name ?? '(unknown)';
      this.logger.error(AppError.create({ name: 'LoadAccessoryFailed', accessory: name, cause: result.reason }));
      return [];
    });
  }

  async discoverDevices() {
    this.logger.debug('searching for devices', this.configuration);

    let accessories: SoundTouchDevice[];
    try {
      accessories = await this.searchDevices();
    } catch (e: unknown) {
      this.logger.error(AppError.create({ name: 'DeviceDiscoveryFailed', cause: e }));
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

          const wrapper = await SoundTouchSpeakerPlatformAccessory.create({
            platform: this,
            accessory: existingAccessory,
            device,
          });
          this._accessoryWrappers.set(uuid, wrapper);
        } else {
          this.logger.info('Adding new accessory:', device.name);

          const accessory = new this.api.platformAccessory(device.name, uuid);

          accessory.context.device = device;

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
}
