import { Cron } from 'croner';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { Logger } from '../utils/FormattedLogger.js';
import { PresetStation } from './PresetStation.js';

export class PresetManager {
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly devices: SoundTouchDevice[],
    private readonly stations: Map<number, PresetStation>,
    private readonly logger?: Logger
  ) {}

  static create(props: {
    devices: SoundTouchDevice[];
    stations: Map<number, PresetStation>;
    logger?: Logger;
  }): PresetManager {
    return new PresetManager(props.devices, props.stations, props.logger);
  }

  async sync(): Promise<void> {
    const slotEntries = Array.from(this.stations.entries());

    await Promise.all(
      this.devices.map(async (device) => {
        try {
          const sources = await device.api.getSources();
          const availableSources = new Set(
            sources?.items.map((s) => s.source) ?? []
          );

          await Promise.all(
            slotEntries.map(async ([slot, station]) => {
              const source = 'TUNEIN';
              if (!availableSources.has(source)) {
                this.logger?.warn(
                  `[Presets] ${device.name} does not support ${source} — skipping slot ${slot} (${station.data.name})`
                );
                return;
              }
              const contentItem = {
                source,
                sourceAccount: '',
                type: 'stationurl',
                isPresetable: true,
                location: `/v1/playback/station/${station.data.tuneInId}`,
                itemName: station.data.name,
              };
              try {
                this.logger?.debug(
                  `[Presets] Pushing slot ${slot} (${station.data.name}) to ${device.name}`
                );
                await device.api.storePreset(slot, contentItem);
              } catch {
                // Failure on one slot does not abort others
              }
            })
          );
        } catch {
          // Failure on one device does not abort others
        }
      })
    );
  }

  start(schedule: string): void {
    this.sync().catch(() => undefined);
    this._scheduleNext(schedule);
  }

  stop(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  private _scheduleNext(schedule: string): void {
    const ms = this._msUntilNextCron(schedule);
    this.timeoutId = setTimeout(() => {
      this.sync().catch(() => undefined);
      this._scheduleNext(schedule);
    }, ms);
  }

  _msUntilNextCron(schedule: string): number {
    let next: Date | null;
    try {
      next = new Cron(schedule).nextRun();
    } catch {
      // Unparseable schedule — fall back to a daily retry
      return 24 * 60 * 60 * 1000;
    }

    if (!next) {
      // No future run computable (e.g. schedule already past) — fall back to a daily retry
      return 24 * 60 * 60 * 1000;
    }

    return next.getTime() - Date.now();
  }
}
