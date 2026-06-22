export interface PresetStationData {
  slot: number;
  name: string;
  resolvedStreamUrl: string;
  imageUrl?: string;
}

export class PresetStation {
  private constructor(public readonly data: PresetStationData) {}

  static fromConfig(
    raw: {
      slot: number;
      name: string;
      streamUrl?: string;
      tuneInId?: string;
      imageUrl?: string;
    },
    resolvedUrl: string
  ): PresetStation {
    return new PresetStation({
      slot: raw.slot,
      name: raw.name,
      resolvedStreamUrl: resolvedUrl,
      imageUrl: raw.imageUrl,
    });
  }
}
