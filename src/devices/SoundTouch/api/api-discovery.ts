import initBonjour, { Bonjour } from 'bonjour';
import { API } from './api.js';

//eslint-disable-next-line  @typescript-eslint/no-explicit-any
function _APIFromService(service?: any): API | undefined {
  if (
    service &&
    service.addresses instanceof Array &&
    service.addresses.length > 0
  ) {
    const ipAddress = service.addresses[0];
    return API.create(ipAddress, service.port);
  }
  return undefined;
}

export class APIDiscovery {
  private constructor() {}

  static async search(duration: number = 5000): Promise<API[]> {
    const apis: API[] = [];
    const bonjour: Bonjour = initBonjour();
    bonjour.find(
      {
        type: 'soundtouch',
        protocol: 'tcp',
      },
      (service) => {
        const api = _APIFromService(service);
        if (api) {
          apis.push(api);
        }
      }
    );
    await new Promise((resolve) => setTimeout(resolve, duration));
    bonjour.destroy();
    return apis;
  }

  static async find(
    name: string,
    duration: number = 5000
  ): Promise<API | undefined> {
    return new Promise<API | undefined>((resolve) => {
      const bonjour: Bonjour = initBonjour();
      const timer = setTimeout(() => {
        bonjour.destroy();
        resolve(undefined);
      }, duration);
      bonjour.find(
        {
          type: 'soundtouch',
          protocol: 'tcp',
        },
        (service) => {
          if (service && service.name === name) {
            const api = _APIFromService(service);
            if (api) {
              clearTimeout(timer);
              bonjour.destroy();
              resolve(api);
            }
          }
        }
      );
    });
  }
}
