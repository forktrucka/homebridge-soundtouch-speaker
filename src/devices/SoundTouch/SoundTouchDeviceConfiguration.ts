import { AccessoryConfig } from '../../ExternalPlatformConfig.js';

const DEFAULT_POLLING_INTERVAL = 2 * 1000; // 2 Seconds
const DEFAULT_VERBOSE_LOGGING = false;
const DEFAULT_ACCESSORY_TYPE = 'switch' as const;

export type AccessoryType = 'switch' | 'lightbulb';

interface BaseDeviceConfiguration {
  name: string;
  pollingInterval?: number;
  verbose?: boolean;
  accessoryType?: AccessoryType;
  disabled?: boolean;
}

interface DeviceViaRoomConfigurationProps extends BaseDeviceConfiguration {
  room?: string;
}

interface DeviceViaIpConfigurationProps extends BaseDeviceConfiguration {
  ip?: string;
  port?: number;
}

export class DeviceConfiguration {
  readonly type: 'room' | 'ip' | 'discovered';
  readonly name?: string;

  readonly room?: string;
  readonly ip?: string;
  readonly port?: number;

  readonly pollingInterval: number;
  readonly verboseLogging: boolean;
  readonly accessoryType: AccessoryType;
  readonly disabled: boolean;

  private constructor(props: {
    type: 'room' | 'ip' | 'discovered';
    name?: string;
    room?: string;
    ip?: string;
    port?: number;
    pollingInterval?: number;
    verboseLogging?: boolean;
    accessoryType?: AccessoryType;
    disabled?: boolean;
  }) {
    this.type = props.type;
    this.name = props.name;
    this.verboseLogging = props.verboseLogging ?? DEFAULT_VERBOSE_LOGGING;
    this.pollingInterval = props.pollingInterval ?? DEFAULT_POLLING_INTERVAL;
    this.accessoryType = props.accessoryType ?? DEFAULT_ACCESSORY_TYPE;
    this.disabled = props.disabled ?? false;

    if (props.type === 'room') {
      this.room = props.room;
    }
    if (props.type === 'ip') {
      this.ip = props.ip;
      this.port = props.port;
    }
  }

  toJson() {
    return JSON.stringify(this, null, 2);
  }

  static createForRoom(props: DeviceViaRoomConfigurationProps) {
    return new DeviceConfiguration({ ...props, type: 'room' });
  }

  static createForIp(props: DeviceViaIpConfigurationProps) {
    return new DeviceConfiguration({ ...props, type: 'ip' });
  }

  static fromAccessoryConfiguration(props: {
    name?: string;
    accessoryConfig: AccessoryConfig;
  }): DeviceConfiguration | undefined {
    if (props.accessoryConfig?.ip) {
      return DeviceConfiguration.createForIp({
        name: props?.name || props.accessoryConfig.name || '',
        ip: props.accessoryConfig.ip,
        port: props.accessoryConfig.port,
        pollingInterval: props.accessoryConfig.pollingInterval,
        accessoryType: props.accessoryConfig.accessoryType,
        disabled: props.accessoryConfig.disabled,
      });
    } else if (props.accessoryConfig?.room) {
      return DeviceConfiguration.createForRoom({
        name: props?.name || props.accessoryConfig.name || '',
        room: props.accessoryConfig.room,
        pollingInterval: props.accessoryConfig.pollingInterval,
        accessoryType: props.accessoryConfig.accessoryType,
        disabled: props.accessoryConfig.disabled,
      });
    }
    return undefined;
  }

  static create({
    name,
    verboseLogging,
    pollingInterval,
    accessoryType,
    disabled,
  }: {
    name?: string;
    verboseLogging?: boolean;
    pollingInterval?: number;
    accessoryType?: AccessoryType;
    disabled?: boolean;
  }) {
    return new DeviceConfiguration({
      name,
      verboseLogging,
      pollingInterval,
      accessoryType,
      disabled,
      type: 'discovered',
    });
  }
}
