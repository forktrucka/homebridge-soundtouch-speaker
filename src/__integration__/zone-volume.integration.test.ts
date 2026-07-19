import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { ExternalPlatformConfig } from '../ExternalPlatformConfig.js';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import {
  FakeSoundTouchServer,
  infoXml,
} from './helpers/fake-soundtouch-server.js';
import { HomebridgeApiStub } from './helpers/homebridge-stub.js';
import { SET_ZONE_VOLUME_DEBOUNCE_MS } from '../zones/SoundTouchZoneVolumeCharacteristic.js';

const PRIMARY_DEVICE_ID = 'MASTER-MAC';
const SLAVE_DEVICE_ID = 'SLAVE-MAC';

function volumeXml(deviceId: string, actual: number): string {
  return (
    `<volume deviceID="${deviceId}">` +
    `<targetvolume>${actual}</targetvolume>` +
    `<actualvolume>${actual}</actualvolume>` +
    '<muteenabled>false</muteenabled>' +
    '</volume>'
  );
}

describe('Zone volume', () => {
  let primaryServer: FakeSoundTouchServer;
  let slaveServer: FakeSoundTouchServer;
  let primaryPort: number;
  let slavePort: number;
  let api: HomebridgeApiStub;

  beforeEach(async () => {
    primaryServer = new FakeSoundTouchServer();
    slaveServer = new FakeSoundTouchServer();
    primaryPort = await primaryServer.start();
    slavePort = await slaveServer.start();

    primaryServer.setResponse(
      '/info',
      infoXml({ deviceId: PRIMARY_DEVICE_ID, name: 'Kitchen' })
    );
    slaveServer.setResponse(
      '/info',
      infoXml({ deviceId: SLAVE_DEVICE_ID, name: 'Lounge' })
    );
    primaryServer.setResponse('/volume', volumeXml(PRIMARY_DEVICE_ID, 20));
    slaveServer.setResponse('/volume', volumeXml(SLAVE_DEVICE_ID, 30));
    primaryServer.setResponse(
      '/getZone',
      `<zone master="${PRIMARY_DEVICE_ID}"></zone>`
    );

    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    api = new HomebridgeApiStub();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await primaryServer.stop();
    await slaveServer.stop();
  });

  function createPlatform(
    overrides: Partial<ExternalPlatformConfig> = {}
  ): SoundTouchHomebridgePlatform {
    const config = {
      platform: 'SoundTouchSpeaker',
      accessories: [
        { name: 'Kitchen', ip: '127.0.0.1', port: primaryPort },
        { name: 'Lounge', ip: '127.0.0.1', port: slavePort },
      ],
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
          accessoryType: 'lightbulb',
        },
      ],
      ...overrides,
    } as ExternalPlatformConfig;

    return new SoundTouchHomebridgePlatform(
      api.logger,
      config,
      api.asHomebridgeApi()
    );
  }

  it('setting Brightness on a lightbulb zone shifts the primary and slave volume by the same delta', async () => {
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Lightbulb'
    );
    const brightnessCharacteristic = service?.characteristics.get('Brightness');
    expect(brightnessCharacteristic).toBeDefined();

    // primary starts at 20; moving to 30 is a delta of +10. setBrightness is
    // now debounced (mirrors the zone on characteristic's setOn fix) - the
    // HAP set handler acks immediately, and the real read-then-act only
    // runs once the debounce window elapses. The request/response round
    // trip to the fake server happens over a real socket, so advance the
    // fake timer in small increments while yielding to the real event loop
    // between them, rather than a single fixed-size jump.
    await brightnessCharacteristic?.invokeSet(30);
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(SET_ZONE_VOLUME_DEBOUNCE_MS / 4);
      await new Promise((resolve) => setImmediate(resolve));
    }

    const primaryVolumeRequest = primaryServer.requests.find(
      (r) => r.path === '/volume' && r.method === 'POST'
    );
    const slaveVolumeRequest = slaveServer.requests.find(
      (r) => r.path === '/volume' && r.method === 'POST'
    );

    expect(primaryVolumeRequest?.body).toContain('<volume>30</volume>');
    expect(slaveVolumeRequest?.body).toContain('<volume>40</volume>');
  });
});
