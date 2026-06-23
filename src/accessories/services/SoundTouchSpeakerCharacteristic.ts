import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';
import { SoundTouchHomebridgePlatform } from '../../platform.js';
import { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { DeviceLogger, Logger } from '../../utils/FormattedLogger.js';
import { AppError } from '../../errors.js';
import type { GabboUpdateType } from '../../devices/SoundTouch/api/GabboClient.js';

export enum ServiceType {
  'ON_OFF' = 'ON',
  'LIGHTBULB' = 'LIGHTBULB',
}

export abstract class SoundTouchSpeakerCharacteristic {
  protected platform: SoundTouchHomebridgePlatform;
  protected accessory: PlatformAccessory;
  protected device: SoundTouchDevice;
  protected log: Logger;

  protected constructor({
    accessory,
    platform,
    device,
  }: {
    accessory: PlatformAccessory;
    device: SoundTouchDevice;
    platform: SoundTouchHomebridgePlatform;
  }) {
    this.accessory = accessory;
    this.platform = platform;
    this.device = device;
    this.log = DeviceLogger.fromLogger({ logger: platform.logger, device });
  }

  protected throwHapCommunicationFailure(appError: AppError): never {
    const hapError = new this.platform.api.hap.HapStatusError(
      this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
    );
    hapError.cause = appError;
    throw hapError;
  }

  protected wrapHapGet(
    fn: () => Promise<CharacteristicValue>
  ): () => Promise<CharacteristicValue> {
    return async (): Promise<CharacteristicValue> => {
      try {
        return await fn();
      } catch (e: unknown) {
        const appError =
          e instanceof AppError
            ? e
            : AppError.create({ name: 'CharacteristicGetFailed', cause: e });
        this.log.debug('characteristic get failed', appError);
        this.throwHapCommunicationFailure(appError);
      }
    };
  }

  protected wrapHapSet(
    fn: (value: CharacteristicValue) => Promise<void>
  ): (value: CharacteristicValue) => Promise<void> {
    return async (value: CharacteristicValue): Promise<void> => {
      try {
        await fn(value);
      } catch (e: unknown) {
        const appError =
          e instanceof AppError
            ? e
            : AppError.create({ name: 'CharacteristicSetFailed', cause: e });
        this.log.debug('characteristic set failed', appError);
        this.throwHapCommunicationFailure(appError);
      }
    };
  }

  readonly gabboEvents: readonly GabboUpdateType[] = [];

  init(): Promise<void> {
    return Promise.resolve();
  }
  refresh(): Promise<void> {
    return Promise.resolve();
  }
}

export function getServiceName({
  serviceType,
  device,
}: {
  serviceType: ServiceType;
  device: SoundTouchDevice;
}) {
  return `${device.name} ${serviceType} Service`;
}
