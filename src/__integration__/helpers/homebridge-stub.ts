import { createHash } from 'node:crypto';
import type { API, CharacteristicValue, Logging } from 'homebridge';

/**
 * In-process Homebridge/HAP stub for integration tests.
 *
 * The manual `__mocks__/homebridge.js` only provides `LogLevel`, so this stub
 * supplies the slice of the `API` surface the platform actually touches:
 * `hap` (Service/Characteristic identifiers, `uuid`, HAP status), a
 * `platformAccessory` constructor, accessory (un)registration tracking, and the
 * `didFinishLaunching` lifecycle hook. Characteristic values are stored so
 * tests can read them back without a running HAP server.
 */

interface Identifier {
  readonly name: string;
}

const ServiceTypes = {
  Switch: { name: 'Switch' },
  Lightbulb: { name: 'Lightbulb' },
  AccessoryInformation: { name: 'AccessoryInformation' },
} satisfies Record<string, Identifier>;

const CharacteristicTypes = {
  On: { name: 'On' },
  Brightness: { name: 'Brightness' },
  Name: { name: 'Name' },
  Manufacturer: { name: 'Manufacturer' },
  Model: { name: 'Model' },
  SerialNumber: { name: 'SerialNumber' },
  FirmwareRevision: { name: 'FirmwareRevision' },
} satisfies Record<string, Identifier>;

class StubCharacteristic {
  value: CharacteristicValue | undefined = undefined;
  private setHandler?: (value: CharacteristicValue) => unknown;
  private getHandler?: () => unknown;

  onSet(handler: (value: CharacteristicValue) => unknown): this {
    this.setHandler = handler;
    return this;
  }

  onGet(handler: () => unknown): this {
    this.getHandler = handler;
    return this;
  }

  updateValue(value: CharacteristicValue): this {
    this.value = value;
    return this;
  }

  /** Invokes the bound `onSet` handler, as HAP would on a HomeKit write. */
  async invokeSet(value: CharacteristicValue): Promise<void> {
    await this.setHandler?.(value);
  }

  /** Invokes the bound `onGet` handler, as HAP would on a HomeKit read. */
  async invokeGet(): Promise<CharacteristicValue | undefined> {
    if (!this.getHandler) {
      return this.value;
    }
    return (await this.getHandler()) as CharacteristicValue;
  }
}

class StubService {
  readonly characteristics = new Map<string, StubCharacteristic>();

  constructor(
    readonly type: Identifier,
    readonly displayName: string,
    readonly subtype?: string
  ) {}

  getCharacteristic(identifier: Identifier): StubCharacteristic {
    let characteristic = this.characteristics.get(identifier.name);
    if (!characteristic) {
      characteristic = new StubCharacteristic();
      this.characteristics.set(identifier.name, characteristic);
    }
    return characteristic;
  }

  setCharacteristic(identifier: Identifier, value: CharacteristicValue): this {
    this.getCharacteristic(identifier).updateValue(value);
    return this;
  }
}

export class StubPlatformAccessory {
  readonly UUID: string;
  readonly displayName: string;
  readonly context: Record<string, unknown> = {};
  readonly services: StubService[] = [];

  constructor(displayName: string, uuid: string) {
    this.displayName = displayName;
    this.UUID = uuid;
    // Homebridge always provides an AccessoryInformation service.
    this.services.push(
      new StubService(ServiceTypes.AccessoryInformation, 'AccessoryInformation')
    );
  }

  getService(query: string | Identifier): StubService | undefined {
    if (typeof query === 'string') {
      return this.services.find((service) => service.displayName === query);
    }
    return this.services.find((service) => service.type.name === query.name);
  }

  addService(
    type: Identifier,
    displayName: string,
    subtype?: string
  ): StubService {
    const service = new StubService(type, displayName, subtype);
    this.services.push(service);
    return service;
  }

  removeService(service: StubService): void {
    const index = this.services.indexOf(service);
    if (index !== -1) {
      this.services.splice(index, 1);
    }
  }
}

const noop = (): void => {};

class HapStatusError extends Error {
  constructor(readonly hapStatus: number) {
    super(`HapStatusError ${hapStatus}`);
  }
}

export class HomebridgeApiStub {
  readonly registeredAccessories: StubPlatformAccessory[] = [];
  readonly unregisteredAccessories: StubPlatformAccessory[] = [];
  readonly updatedAccessories: StubPlatformAccessory[] = [];

  readonly platformAccessory = StubPlatformAccessory;

  readonly hap = {
    Service: ServiceTypes,
    Characteristic: CharacteristicTypes,
    uuid: {
      generate: (data: string): string =>
        createHash('sha1').update(data).digest('hex'),
    },
    HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
    HapStatusError,
  };

  readonly logger: Logging = {
    log: noop,
    info: noop,
    success: noop,
    warn: noop,
    error: noop,
    debug: noop,
  } as unknown as Logging;

  private didFinishLaunching?: () => unknown;
  private shutdown?: () => unknown;

  on(event: string, callback: () => unknown): this {
    if (event === 'didFinishLaunching') {
      this.didFinishLaunching = callback;
    }
    if (event === 'shutdown') {
      this.shutdown = callback;
    }
    return this;
  }

  registerPlatformAccessories(
    _pluginName: string,
    _platformName: string,
    accessories: StubPlatformAccessory[]
  ): void {
    this.registeredAccessories.push(...accessories);
  }

  unregisterPlatformAccessories(
    _pluginName: string,
    _platformName: string,
    accessories: StubPlatformAccessory[]
  ): void {
    this.unregisteredAccessories.push(...accessories);
  }

  updatePlatformAccessories(accessories: StubPlatformAccessory[]): void {
    this.updatedAccessories.push(...accessories);
  }

  async emitDidFinishLaunching(): Promise<void> {
    await this.didFinishLaunching?.();
  }

  emitShutdown(): void {
    this.shutdown?.();
  }

  asHomebridgeApi(): API {
    return this as unknown as API;
  }

  getCharacteristicValue(
    serviceType: string,
    characteristicName: string
  ): CharacteristicValue | undefined {
    for (const accessory of this.registeredAccessories) {
      const service = accessory.services.find(
        (candidate) => candidate.type.name === serviceType
      );
      const characteristic = service?.characteristics.get(characteristicName);
      if (characteristic) {
        return characteristic.value;
      }
    }
    return undefined;
  }
}
