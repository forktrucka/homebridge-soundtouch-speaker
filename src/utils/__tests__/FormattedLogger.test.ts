import { describe, expect, jest, it } from '@jest/globals';
import { DeviceLogger, Logger } from '../FormattedLogger.js';
import { LogLevel, type Logging } from 'homebridge';
import { DeviceConfiguration } from '../../devices/SoundTouch/SoundTouchDeviceConfiguration.js';
import { API as SoundTouchApi } from '../../devices/SoundTouch/api/index.js';
import { SoundTouchDevice } from '../../devices/SoundTouch/SoundTouchDevice.js';

function makeMockLogger(): jest.Mocked<Logging> {
  return {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    prefix: 'test',
  } as unknown as jest.Mocked<Logging>;
}

function makeDevice(name: string): SoundTouchDevice {
  return new SoundTouchDevice({
    api: new SoundTouchApi('192.168.1.1'),
    model: 'SoundTouch 10',
    id: 'test-id',
    name,
    configuration: DeviceConfiguration.create({ name }),
  });
}

describe('FormattedLogger', () => {
  describe('excludeLog', () => {
    const testLevels = [
      // When required level is DEBUG, nothing is excluded
      { level: LogLevel.DEBUG, requiredLevel: LogLevel.DEBUG, outcome: false },
      { level: LogLevel.INFO, requiredLevel: LogLevel.DEBUG, outcome: false },
      {
        level: LogLevel.SUCCESS,
        requiredLevel: LogLevel.DEBUG,
        outcome: false,
      },
      { level: LogLevel.WARN, requiredLevel: LogLevel.DEBUG, outcome: false },
      { level: LogLevel.ERROR, requiredLevel: LogLevel.DEBUG, outcome: false },
      // When required level is INFO, only DEBUG is excluded
      { level: LogLevel.DEBUG, requiredLevel: LogLevel.INFO, outcome: true },
      { level: LogLevel.INFO, requiredLevel: LogLevel.INFO, outcome: false },
      { level: LogLevel.SUCCESS, requiredLevel: LogLevel.INFO, outcome: false },
      { level: LogLevel.WARN, requiredLevel: LogLevel.INFO, outcome: false },
      { level: LogLevel.ERROR, requiredLevel: LogLevel.INFO, outcome: false },
      // When required level is ERROR, only ERROR passes through
      { level: LogLevel.DEBUG, requiredLevel: LogLevel.ERROR, outcome: true },
      { level: LogLevel.INFO, requiredLevel: LogLevel.ERROR, outcome: true },
      { level: LogLevel.SUCCESS, requiredLevel: LogLevel.ERROR, outcome: true },
      { level: LogLevel.WARN, requiredLevel: LogLevel.ERROR, outcome: true },
      { level: LogLevel.ERROR, requiredLevel: LogLevel.ERROR, outcome: false },
    ];

    testLevels.forEach((c) => {
      it(`returns ${c.outcome} when log level is '${c.level}' and required level is '${c.requiredLevel}'`, () => {
        const result = Logger.excludeLog(c.level, c.requiredLevel);
        expect(result).toBe(c.outcome);
      });
    });
  });

  describe('Logger.log', () => {
    it('passes message to homebridge logger when level meets threshold', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });

      logger.log(LogLevel.INFO, 'hello');

      expect(homebridgeLogger.log).toHaveBeenCalledWith(LogLevel.INFO, 'hello');
    });

    it('suppresses message when level is below threshold', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });

      logger.log(LogLevel.DEBUG, 'hidden');

      expect(homebridgeLogger.log).not.toHaveBeenCalled();
    });

    it('convenience methods delegate to log with correct level', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });

      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      logger.debug('debug msg');
      logger.success('success msg');

      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        'info msg'
      );
      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.WARN,
        'warn msg'
      );
      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'error msg'
      );
      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        'debug msg'
      );
      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.SUCCESS,
        'success msg'
      );
    });
  });

  describe('DeviceLogger', () => {
    it('prefixes messages with device name', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });
      const device = makeDevice('Kitchen Speaker');
      const deviceLogger = DeviceLogger.fromLogger({ logger, device });

      deviceLogger.info('ready');

      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        '[Kitchen Speaker] - ready'
      );
    });

    it('inherits log level filtering from parent logger', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });
      const device = makeDevice('Kitchen Speaker');
      const deviceLogger = DeviceLogger.fromLogger({ logger, device });

      deviceLogger.debug('should be hidden');

      expect(homebridgeLogger.log).not.toHaveBeenCalled();
    });
  });
});
