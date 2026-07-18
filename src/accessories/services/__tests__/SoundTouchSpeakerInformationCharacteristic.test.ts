import { describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerInformationCharacteristic } from '../SoundTouchSpeakerInformationCharacteristic.js';

function build({
  isNewAccessory,
  deviceName = 'Kitchen',
  version,
}: {
  isNewAccessory: boolean;
  deviceName?: string;
  version?: string;
}) {
  const setCharacteristic = jest.fn().mockReturnThis();
  const informationService = { setCharacteristic };
  const getService = jest.fn().mockReturnValue(informationService);
  const accessory = { getService };

  const device = {
    name: deviceName,
    model: 'SoundTouch 10',
    id: 'DEVICE-ID',
    version,
  };

  const platform = {
    service: { AccessoryInformation: 'AccessoryInformationUUID' },
    characteristic: {
      Name: 'NameUUID',
      Manufacturer: 'ManufacturerUUID',
      Model: 'ModelUUID',
      SerialNumber: 'SerialNumberUUID',
      FirmwareRevision: 'FirmwareRevisionUUID',
    },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
  };

  return {
    setCharacteristic,
    getService,
    accessory,
    device,
    platform,
    isNewAccessory,
  };
}

async function buildSubject(props: Parameters<typeof build>[0]): Promise<{
  subject: SoundTouchSpeakerInformationCharacteristic;
  setCharacteristic: ReturnType<typeof jest.fn>;
  platform: ReturnType<typeof build>['platform'];
}> {
  const { setCharacteristic, accessory, device, platform, isNewAccessory } =
    build(props);

  const subject = await SoundTouchSpeakerInformationCharacteristic.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessory: accessory as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    device: device as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    isNewAccessory,
  });

  return { subject, setCharacteristic, platform };
}

describe('SoundTouchSpeakerInformationCharacteristic', () => {
  describe('#init', () => {
    describe('when the accessory is newly created', () => {
      it('sets the Name characteristic to the computed device name', async () => {
        const { subject, setCharacteristic, platform } = await buildSubject({
          isNewAccessory: true,
          deviceName: 'Kitchen',
        });

        await subject.init();

        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.Name,
          'Kitchen Speaker'
        );
      });

      it('sets Manufacturer, Model, and SerialNumber', async () => {
        const { subject, setCharacteristic, platform } = await buildSubject({
          isNewAccessory: true,
        });

        await subject.init();

        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.Manufacturer,
          'Bose'
        );
        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.Model,
          'SoundTouch 10'
        );
        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.SerialNumber,
          'DEVICE-ID'
        );
      });
    });

    describe('when the accessory is restored from the Homebridge cache', () => {
      it('does not set the Name characteristic', async () => {
        const { subject, setCharacteristic, platform } = await buildSubject({
          isNewAccessory: false,
        });

        await subject.init();

        expect(setCharacteristic).not.toHaveBeenCalledWith(
          platform.characteristic.Name,
          expect.anything()
        );
      });

      it('still sets Manufacturer, Model, and SerialNumber', async () => {
        const { subject, setCharacteristic, platform } = await buildSubject({
          isNewAccessory: false,
        });

        await subject.init();

        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.Manufacturer,
          'Bose'
        );
        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.Model,
          'SoundTouch 10'
        );
        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.SerialNumber,
          'DEVICE-ID'
        );
      });

      it('still sets FirmwareRevision when the device reports a version', async () => {
        const { subject, setCharacteristic, platform } = await buildSubject({
          isNewAccessory: false,
          version: '1.2.3',
        });

        await subject.init();

        expect(setCharacteristic).toHaveBeenCalledWith(
          platform.characteristic.FirmwareRevision,
          '1.2.3'
        );
      });
    });
  });

  describe('#calculateDeviceName', () => {
    it('appends " Speaker" when the device name does not already end in it', async () => {
      const { subject } = await buildSubject({
        isNewAccessory: true,
        deviceName: 'Kitchen',
      });

      expect(subject.calculateDeviceName()).toBe('Kitchen Speaker');
    });

    it('does not append " Speaker" again when the device name already ends in it', async () => {
      const { subject } = await buildSubject({
        isNewAccessory: true,
        deviceName: 'Kitchen Speaker',
      });

      expect(subject.calculateDeviceName()).toBe('Kitchen Speaker');
    });
  });
});
