import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { PresetServer } from './PresetServer.js';
import { PresetStation } from './PresetStation.js';

export class PresetManager {
  private intervalId: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly devices: SoundTouchDevice[],
    private readonly server: PresetServer,
    private readonly stations: Map<number, PresetStation>
  ) {}

  static create(props: {
    devices: SoundTouchDevice[];
    server: PresetServer;
    stations: Map<number, PresetStation>;
  }): PresetManager {
    return new PresetManager(props.devices, props.server, props.stations);
  }

  async sync(): Promise<void> {
    const slotEntries = Array.from(this.stations.entries());

    await Promise.all(
      slotEntries.map(async ([slot, station]) => {
        const contentItem = {
          source: 'LOCAL_INTERNET_RADIO',
          sourceAccount: '',
          type: 'stationurl',
          isPresetable: true,
          location: this.server.getPresetUrl(slot),
          itemName: station.data.name,
        };

        await Promise.all(
          this.devices.map(async (device) => {
            try {
              await device.api.storePreset(slot, contentItem);
            } catch {
              // Failure on one device does not abort others
            }
          })
        );
      })
    );
  }

  start(intervalMs: number): void {
    // Fire immediately, fire-and-forget
    this.sync().catch(() => undefined);

    if (intervalMs > 0) {
      this.intervalId = setInterval(() => {
        this.sync().catch(() => undefined);
      }, intervalMs);
    }
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
