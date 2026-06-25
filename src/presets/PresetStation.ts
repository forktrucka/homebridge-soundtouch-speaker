export interface PresetStationData {
  slot: number;
  name: string;
  tuneInId: string;
  imageUrl?: string;
}

export class PresetStation {
  private constructor(public readonly data: PresetStationData) {}

  static fromConfig(raw: {
    slot: number;
    name: string;
    tuneInId: string;
    imageUrl?: string;
  }): PresetStation {
    return new PresetStation({
      slot: raw.slot,
      name: raw.name,
      tuneInId: raw.tuneInId,
      imageUrl: raw.imageUrl,
    });
  }
}
