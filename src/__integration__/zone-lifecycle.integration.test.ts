import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { ExternalPlatformConfig } from '../ExternalPlatformConfig.js';
import type { PlatformAccessory } from 'homebridge';
import { SoundTouchHomebridgePlatform } from '../platform.js';
import {
  FakeSoundTouchServer,
  infoXml,
  nowPlayingXml,
  presetsXml,
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

/**
 * Zone power-on/off now holds the POWER key for a deliberate 300ms (see
 * SoundTouchZoneOnCharacteristic) rather than pressing and releasing
 * instantly. That hold uses a real setTimeout while this suite fakes
 * timers (to keep the accessory reconciliation interval parked), and the
 * key press/release themselves round-trip over a real socket to the fake
 * server — so a single fixed-size `advanceTimersByTimeAsync` call can race
 * ahead of the timer actually being scheduled. Poll in small increments,
 * yielding to the real event loop between them via `setImmediate` (not
 * faked), until the characteristic's own promise settles.
 */
async function invokeSetAndSettle(
  characteristic: { invokeSet(value: boolean): Promise<void> } | undefined,
  value: boolean
): Promise<void> {
  const promise = characteristic?.invokeSet(value);
  if (!promise) {
    return;
  }
  let settled = false;
  promise.finally(() => {
    settled = true;
  });
  for (let i = 0; i < 50 && !settled; i++) {
    await jest.advanceTimersByTimeAsync(50);
    await new Promise((resolve) => setImmediate(resolve));
  }
  await promise;
}

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
    primaryServer.setResponse('/key', OK_STATUS_XML);
    slaveServer.setResponse('/key', OK_STATUS_XML);

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
    // The zone only reads "on" when its primary is powered on — see
    // SoundTouchZoneOnCharacteristic._isZoneActive's primary-power gate.
    primaryServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
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

    await invokeSetAndSettle(onCharacteristic, true);

    const setZoneRequest = primaryServer.requests.find(
      (r) => r.path === '/setZone'
    );
    expect(setZoneRequest).toBeDefined();
    expect(setZoneRequest?.body).toContain(`master="${PRIMARY_DEVICE_ID}"`);
    expect(setZoneRequest?.body).toContain(`>${SLAVE_DEVICE_ID}<`);
  });

  it('activating the zone powers on a primary and slave that start in standby', async () => {
    // Default /nowPlaying response on both fakes reports STANDBY.
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await invokeSetAndSettle(onCharacteristic, true);

    expect(
      primaryServer.requests.filter((r) => r.path === '/key')
    ).toHaveLength(2);
    expect(slaveServer.requests.filter((r) => r.path === '/key')).toHaveLength(
      2
    );
  });

  it('activating the zone does not re-send a power command to a device that is already on', async () => {
    primaryServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
    slaveServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
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

    expect(
      primaryServer.requests.filter((r) => r.path === '/key')
    ).toHaveLength(0);
    expect(slaveServer.requests.filter((r) => r.path === '/key')).toHaveLength(
      0
    );
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

  it('deactivating the zone ungroups and powers off a primary and slave that are on', async () => {
    primaryServer.setResponse(
      '/getZone',
      zoneXml([{ deviceId: SLAVE_DEVICE_ID, ipAddress: '127.0.0.1' }])
    );
    primaryServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
    slaveServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await invokeSetAndSettle(onCharacteristic, false);

    const removeZoneSlaveRequest = primaryServer.requests.find(
      (r) => r.path === '/removeZoneSlave'
    );
    expect(removeZoneSlaveRequest).toBeDefined();
    expect(
      primaryServer.requests.filter((r) => r.path === '/key')
    ).toHaveLength(2);
    expect(slaveServer.requests.filter((r) => r.path === '/key')).toHaveLength(
      2
    );
  });

  it('deactivating the zone does not error when the primary and slave are already off', async () => {
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

    await expect(onCharacteristic?.invokeSet(false)).resolves.not.toThrow();
    expect(
      primaryServer.requests.filter((r) => r.path === '/key')
    ).toHaveLength(0);
    expect(slaveServer.requests.filter((r) => r.path === '/key')).toHaveLength(
      0
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

  it('refreshes the primary and slave standalone accessory On characteristics after activating the zone powers them on', async () => {
    // Default /nowPlaying response on both fakes reports STANDBY, so both
    // devices need powering on to activate the zone.
    createPlatform();
    await api.emitDidFinishLaunching();

    // init() already issued one /nowPlaying GET per device on startup; a
    // successful refresh after the zone's power-on issues another.
    const primaryNowPlayingCountBefore = primaryServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    const slaveNowPlayingCountBefore = slaveServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const zoneOn = zoneAccessory?.services
      .find((s) => s.type.name === 'Switch')
      ?.characteristics.get('On');

    await invokeSetAndSettle(zoneOn, true);

    // Each device gets one /nowPlaying GET from the zone's own `deviceIsOn`
    // power check, plus one more from the standalone accessory's own On
    // characteristic refresh triggered after the power-on — two beyond the
    // baseline, not just one.
    const primaryNowPlayingCountAfter = primaryServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    const slaveNowPlayingCountAfter = slaveServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    expect(primaryNowPlayingCountAfter).toBe(primaryNowPlayingCountBefore + 2);
    expect(slaveNowPlayingCountAfter).toBe(slaveNowPlayingCountBefore + 2);
  });

  it('refreshes the primary and slave standalone accessory On characteristics after deactivating the zone powers them off', async () => {
    primaryServer.setResponse(
      '/getZone',
      zoneXml([{ deviceId: SLAVE_DEVICE_ID, ipAddress: '127.0.0.1' }])
    );
    primaryServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
    slaveServer.setResponse('/nowPlaying', nowPlayingXml('AUX'));
    createPlatform();
    await api.emitDidFinishLaunching();

    const primaryNowPlayingCountBefore = primaryServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    const slaveNowPlayingCountBefore = slaveServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const zoneOn = zoneAccessory?.services
      .find((s) => s.type.name === 'Switch')
      ?.characteristics.get('On');

    await invokeSetAndSettle(zoneOn, false);

    const primaryNowPlayingCountAfter = primaryServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    const slaveNowPlayingCountAfter = slaveServer.requests.filter(
      (r) => r.path === '/nowPlaying'
    ).length;
    expect(primaryNowPlayingCountAfter).toBe(primaryNowPlayingCountBefore + 2);
    expect(slaveNowPlayingCountAfter).toBe(slaveNowPlayingCountBefore + 2);
  });

  it('selects the configured default source preset on the primary before setZone when activating an idle zone', async () => {
    primaryServer.setResponse(
      '/presets',
      presetsXml([{ slot: 2, source: 'TUNEIN', location: 'station-2' }])
    );
    primaryServer.setResponse('/select', OK_STATUS_XML);
    createPlatform({
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
          defaultSource: { type: 'preset', slot: 2 },
        },
      ],
    });
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await invokeSetAndSettle(onCharacteristic, true);

    const selectIndex = primaryServer.requests.findIndex(
      (r) => r.path === '/select'
    );
    const setZoneIndex = primaryServer.requests.findIndex(
      (r) => r.path === '/setZone'
    );
    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(setZoneIndex).toBeGreaterThan(selectIndex);
    const selectRequest = primaryServer.requests[selectIndex];
    expect(selectRequest?.body).toContain('source="TUNEIN"');
  });

  it('does not select a default source when the primary is already playing', async () => {
    primaryServer.setResponse(
      '/nowPlaying',
      nowPlayingXml('AUX', PRIMARY_DEVICE_ID, 'aux-in')
    );
    primaryServer.setResponse(
      '/presets',
      presetsXml([{ slot: 2, source: 'TUNEIN', location: 'station-2' }])
    );
    primaryServer.setResponse('/select', OK_STATUS_XML);
    createPlatform({
      zones: [
        {
          name: 'Downstairs',
          primary: 'Kitchen',
          slaves: ['Lounge'],
          defaultSource: { type: 'preset', slot: 2 },
        },
      ],
    });
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const service = zoneAccessory?.services.find(
      (s) => s.type.name === 'Switch'
    );
    const onCharacteristic = service?.characteristics.get('On');

    await invokeSetAndSettle(onCharacteristic, true);

    expect(primaryServer.requests.some((r) => r.path === '/select')).toBe(
      false
    );
  });

  it('does not revert a zone Name characteristic changed in the Home app when the accessory is restored from cache', async () => {
    createPlatform();
    await api.emitDidFinishLaunching();

    const zoneAccessory = api.registeredAccessories.find(
      (a) => a.displayName === 'Downstairs'
    );
    const informationService = zoneAccessory?.services.find(
      (s) => s.type.name === 'AccessoryInformation'
    );
    const nameCharacteristic = informationService?.characteristics.get('Name');
    expect(nameCharacteristic?.value).toBe('Downstairs');

    // Simulate a rename performed in the Home app.
    nameCharacteristic?.updateValue('Downstairs Zone');

    // Simulate a Homebridge restart: a fresh platform instance restores the
    // (renamed) zone accessory from the cache, then discoverDevices() runs
    // again down the zone restore branch.
    const restartedPlatform = createPlatform();
    restartedPlatform.configureAccessory(
      zoneAccessory as unknown as PlatformAccessory
    );

    await api.emitDidFinishLaunching();

    expect(nameCharacteristic?.value).toBe('Downstairs Zone');
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
