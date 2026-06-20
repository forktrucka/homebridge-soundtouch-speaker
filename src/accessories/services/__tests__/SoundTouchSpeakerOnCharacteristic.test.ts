import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SoundTouchSpeakerOnCharacteristic } from '../SoundTouchSpeakerOnCharacteristic.js';
import { KeyValue } from '../../../devices/SoundTouch/api/index.js';

class FakeCharacteristic {
  value: unknown = null;
  readonly updateValue = jest.fn((value: unknown) => {
    this.value = value;
    return this;
  });
  readonly onSet = jest.fn(() => this);
  readonly onGet = jest.fn(() => this);
}

class HapStatusError extends Error {
  constructor(readonly hapStatus: number) {
    super(`HapStatusError ${hapStatus}`);
  }
}

function build() {
  const characteristic = new FakeCharacteristic();
  const OnIdentifier = { name: 'On' };
  const service = {
    getCharacteristic: jest.fn(() => characteristic),
  };
  const api = {
    pressKey: jest.fn<(key: KeyValue) => Promise<boolean>>(),
    getSource: jest.fn<() => Promise<string | undefined>>(),
  };
  const device = { name: 'Kitchen', api };
  const platform = {
    characteristic: { On: OnIdentifier },
    logger: { homebridgeLogger: { log: jest.fn() }, requiredLogLevel: 'debug' },
    api: {
      hap: {
        HapStatusError,
        HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any = { service, device, platform, accessory: {} };
  const subject = new SoundTouchSpeakerOnCharacteristic(props);

  return { subject, characteristic, api };
}

describe('SoundTouchSpeakerOnCharacteristic', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  describe('#setOn', () => {
    it('presses the power key when the desired state differs from the current value', async () => {
      harness.characteristic.value = false;
      harness.api.pressKey.mockResolvedValue(true);

      await harness.subject.setOn(true);

      expect(harness.api.pressKey).toHaveBeenCalledWith(KeyValue.power);
    });

    it('does not press the power key when the desired state already matches', async () => {
      harness.characteristic.value = true;
      harness.api.pressKey.mockResolvedValue(true);

      await harness.subject.setOn(true);

      expect(harness.api.pressKey).not.toHaveBeenCalled();
    });

    it('throws a HAP communication error when the key press fails', async () => {
      harness.characteristic.value = false;
      harness.api.pressKey.mockRejectedValue(new Error('unreachable'));

      await expect(harness.subject.setOn(true)).rejects.toBeInstanceOf(
        HapStatusError
      );
    });

    // Guards the power/volume race: the setter used to block for 5s in a
    // `finally`, which stalled a near-simultaneous volume set. Under fake
    // timers a blocking `setTimeout(5000)` would never resolve, so awaiting
    // the setter would hang and this test would time out.
    it('resolves without blocking on a settle delay', async () => {
      jest.useFakeTimers();
      try {
        harness.characteristic.value = false;
        harness.api.pressKey.mockResolvedValue(true);

        await harness.subject.setOn(true);

        expect(harness.api.pressKey).toHaveBeenCalledWith(KeyValue.power);
      } finally {
        jest.useRealTimers();
      }
    });

    it('skips a repeated power press while the device is still settling', async () => {
      jest.useFakeTimers();
      try {
        harness.characteristic.value = false;
        harness.api.pressKey.mockResolvedValue(true);

        await harness.subject.setOn(true);
        // HomeKit reflects the new state; a rapid re-trigger of the same
        // desired state must not hammer the power key mid-settle.
        harness.characteristic.value = false;
        await harness.subject.setOn(true);

        expect(harness.api.pressKey).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('#getOn', () => {
    it('reports on when the device is not in standby', async () => {
      harness.api.getSource.mockResolvedValue('SPOTIFY');

      await expect(harness.subject.getOn()).resolves.toBe(true);
    });

    it('reports off when the device is in standby', async () => {
      harness.api.getSource.mockResolvedValue('STANDBY');

      await expect(harness.subject.getOn()).resolves.toBe(false);
    });
  });
});
