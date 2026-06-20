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
  nowPlayingXml,
} from './helpers/fake-soundtouch-server.js';
import { FakeGabboServer } from './helpers/fake-gabbo-server.js';
import { HomebridgeApiStub } from './helpers/homebridge-stub.js';

const DEVICE_ID = 'DEV-GABBO-1';

function volumeXml(options: {
  actual: number;
  target: number;
  deviceId?: string;
}): string {
  const { actual, target, deviceId = DEVICE_ID } = options;
  return (
    `<volume deviceID="${deviceId}">` +
    `<targetvolume>${target}</targetvolume>` +
    `<actualvolume>${actual}</actualvolume>` +
    `<muteenabled>false</muteenabled>` +
    '</volume>'
  );
}

/**
 * Spike: end-to-end volume tickle → Brightness characteristic update.
 *
 * Spins up both FakeSoundTouchServer (HTTP) and FakeGabboServer (WebSocket),
 * configures the platform with a `lightbulb` accessory, then pushes a
 * `volumeUpdated` tickle and asserts that the Brightness characteristic
 * reflects the re-fetched volume.
 */
describe('gabbo volumeUpdated tickle → Brightness characteristic', () => {
  let httpServer: FakeSoundTouchServer;
  let gabboServer: FakeGabboServer;
  let httpPort: number;
  let gabboPort: number;
  let api: HomebridgeApiStub;

  beforeEach(async () => {
    httpServer = new FakeSoundTouchServer();
    gabboServer = new FakeGabboServer();

    httpPort = await httpServer.start();
    gabboPort = await gabboServer.start();

    httpServer.setResponse(
      '/info',
      infoXml({ deviceId: DEVICE_ID, name: 'Gabbo Test Speaker' })
    );
    httpServer.setResponse('/nowPlaying', nowPlayingXml('SPOTIFY', DEVICE_ID));
    httpServer.setResponse('/volume', volumeXml({ actual: 20, target: 20 }));

    // Fake timers keep the polling loop parked while real I/O (HTTP + WS) runs.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });

    api = new HomebridgeApiStub();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await httpServer.stop();
    await gabboServer.stop();
  });

  function createPlatform(): SoundTouchHomebridgePlatform {
    const config = {
      platform: 'SoundTouchSpeaker',
      global: { accessoryType: 'lightbulb' },
      accessories: [{ ip: '127.0.0.1', port: httpPort, gabboPort }],
    } as ExternalPlatformConfig;

    return new SoundTouchHomebridgePlatform(
      api.logger,
      config,
      api.asHomebridgeApi()
    );
  }

  /**
   * Poll `condition` using setImmediate (not faked by jest.useFakeTimers here)
   * until it's true or `timeoutMs` real-clock milliseconds elapse.
   */
  function waitFor(
    condition: () => boolean,
    timeoutMs = 3000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;

      const tick = (): void => {
        if (condition()) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(`waitFor: condition not met within ${timeoutMs}ms`));
          return;
        }
        setImmediate(tick);
      };

      setImmediate(tick);
    });
  }

  it('updates the Brightness characteristic when a volumeUpdated tickle arrives', async () => {
    createPlatform();
    await api.emitDidFinishLaunching();

    // Initial Brightness should be the volume from the fake HTTP server (20).
    expect(api.getCharacteristicValue('Lightbulb', 'Brightness')).toBe(20);

    // Update the HTTP server so the re-fetch returns 55.
    httpServer.setResponse('/volume', volumeXml({ actual: 55, target: 55 }));

    // Wait for the GabboClient to connect to the fake gabbo server.
    await waitFor(() => gabboServer.connectionCount > 0);

    // Push the volumeUpdated tickle to all connected clients.
    gabboServer.push(
      `<updates deviceID="${DEVICE_ID}"><volumeUpdated/></updates>`
    );

    // Wait for the Brightness characteristic to reflect the new volume (55).
    await waitFor(
      () => api.getCharacteristicValue('Lightbulb', 'Brightness') === 55
    );

    expect(api.getCharacteristicValue('Lightbulb', 'Brightness')).toBe(55);
  });
});
