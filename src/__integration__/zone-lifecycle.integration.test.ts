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

const PRIMARY_DEVICE_ID = 'MASTER-MAC';
const SLAVE_DEVICE_ID = 'SLAVE-MAC';

function zoneXml(
  members: { deviceId: string; ipAddress: string }[] = []
): string {
  const memberXml = members
    .map((m) => `<member ipaddress="${m.ipAddress}">${m.deviceId}</member>`)
    .join('');
  return `<zone master="${PRIMARY_DEVICE_ID}">${memberXml}</zone>`;
}

const OK_STATUS_XML = '<status>OK</status>';

describe('Zone lifecycle', () => {
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
    primaryServer.setResponse('/getZone', zoneXml());
    primaryServer.setResponse('/setZone', OK_STATUS_XML);
    primaryServer.setResponse('/removeZoneSlave', OK_STATUS_XML);

    // The accessory reconciliation loop polls on an interval; faking timers
    // keeps it parked so the suite leaves no open handles.
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
      zones: [{ name: 'Downstairs', primary: 'Kitchen', slaves: ['Lounge'] }],
      ...overrides,
    } as ExternalPlatformConfig;

    return new SoundTouchHomebridgePlatform(
      api.logger,
      config,
      api.asHomebridgeApi()
    );
  }

  it('registers a zone accessory alongside the individual speaker accessories', async () => {
    createPlatform();

    await api.emitDidFinishLaunching();

    expect(api.registeredAccessories.map((a) => a.displayName)).toEqual(
      expect.arrayContaining(['Kitchen', 'Lounge', 'Downstairs'])
    );
  });

  it('initialises the zone On characteristic to false when getZone reports no matching members', async () => {
    createPlatform();

    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    expect(service?.characteristics.get('On')?.value).toBe(false);
  });

  it('initialises the zone On characteristic to true when getZone already reports the configured slave as a member', async () => {
    primaryServer.setResponse(
      '/getZone',
      zoneXml([{ deviceId: SLAVE_DEVICE_ID, ipAddress: '127.0.0.1' }])
    );
    createPlatform();

    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    expect(service?.characteristics.get('On')?.value).toBe(true);
  });

  it('activating the zone calls setZone on the primary with the master and slave MAC/IP', async () => {
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await onCharacteristic?.invokeSet(true);

    const setZoneRequest = primaryServer.requests.find(
      (r) => r.path === '/setZone'
    );
    expect(setZoneRequest).toBeDefined();
    expect(setZoneRequest?.body).toContain(`master="${PRIMARY_DEVICE_ID}"`);
    expect(setZoneRequest?.body).toContain(`>${SLAVE_DEVICE_ID}<`);
  });

  it('deactivating the zone calls removeZoneSlave on the primary', async () => {
    primaryServer.setResponse(
      '/getZone',
      zoneXml([{ deviceId: SLAVE_DEVICE_ID, ipAddress: '127.0.0.1' }])
    );
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await onCharacteristic?.invokeSet(false);

    const removeZoneSlaveRequest = primaryServer.requests.find(
      (r) => r.path === '/removeZoneSlave'
    );
    expect(removeZoneSlaveRequest).toBeDefined();
    expect(removeZoneSlaveRequest?.body).toContain(
      `master="${PRIMARY_DEVICE_ID}"`
    );
  });

  it('keeps the slave speaker accessory independently controllable while the zone is active', async () => {
    primaryServer.setResponse(
      '/getZone',
      zoneXml([{ deviceId: SLAVE_DEVICE_ID, ipAddress: '127.0.0.1' }])
    );
    createPlatform();
    await api.emitDidFinishLaunching();

    const slaveAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Lounge'
    );
    const switchService = slaveAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );

    expect(switchService?.characteristics.get('On')).toBeDefined();
  });

  it('skips the zone and does not register it when the primary cannot be resolved', async () => {
    createPlatform({
      zones: [
        { name: 'Downstairs', primary: 'Unknown Speaker', slaves: ['Lounge'] },
      ],
    });

    await api.emitDidFinishLaunching();

    expect(
      api.registeredAccessories.some((a) => a.displayName === 'Downstairs')
    ).toBe(false);
  });
});
