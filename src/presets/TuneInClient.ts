import { create as axiosCreate, type AxiosInstance } from 'axios';

const RADIOTIME_OPML_URL =
  'https://opml.radiotime.com/Tune.ashx?render=json&formats=mp3,aac&partnerId=RadioTime&id=';

interface RadioTimeBody {
  url?: string;
}

interface RadioTimeResponse {
  body?: RadioTimeBody[];
}

export class TuneInClient {
  private constructor(private readonly axiosInstance: AxiosInstance) {}

  static create(axiosInstance?: AxiosInstance): TuneInClient {
    return new TuneInClient(
      axiosInstance ??
        axiosCreate({
          timeout: 10_000,
        })
    );
  }

  async resolveStationUrl(tuneInId: string): Promise<string | undefined> {
    try {
      const response = await this.axiosInstance.get<RadioTimeResponse>(
        `${RADIOTIME_OPML_URL}${tuneInId}`
      );
      const body = response.data?.body;
      if (!body || body.length === 0) {
        return undefined;
      }
      return body[0]?.url;
    } catch {
      return undefined;
    }
  }
}
