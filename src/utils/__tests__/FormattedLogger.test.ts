import { describe, expect, jest, it } from '@jest/globals';
import { DeviceLogger, Logger } from '../FormattedLogger.js';
import { LogLevel, type Logging } from 'homebridge';
import { AppError } from '../../errors.js';
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
  return { name } as unknown as SoundTouchDevice;
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

  describe('Logger.error', () => {
    it('logs message only when no error argument is provided', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });

      logger.error('something went wrong');

      expect(homebridgeLogger.log).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'something went wrong'
      );
    });

    it('logs concise message + formatError at INFO level with a plain Error', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });
      const err = new Error('connection refused');

      logger.error('request failed', err);

      const [level, msg] = (homebridgeLogger.log as jest.MockedFunction<typeof homebridgeLogger.log>).mock.calls[0] as [LogLevel, string];
      expect(level).toBe(LogLevel.ERROR);
      expect(msg).toContain('request failed');
      expect(msg).toContain('connection refused');
      expect(msg).not.toContain('caused by:\n');
    });

    it('includes context fields in output for ContextError at INFO level', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });
      const err = AppError.create({ name: 'GetVolumeFailed', device: 'Kitchen', endpoint: '/volume', cause: new Error('ECONNREFUSED') });

      logger.error('polling failed', err);

      const [level, msg] = (homebridgeLogger.log as jest.MockedFunction<typeof homebridgeLogger.log>).mock.calls[0] as [LogLevel, string];
      expect(level).toBe(LogLevel.ERROR);
      expect(msg).toContain('device: Kitchen');
      expect(msg).toContain('endpoint: /volume');
    });

    it('shows full cause chain at DEBUG level', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });
      const root = new Error('ECONNREFUSED');
      const wrapped = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume', cause: root });

      logger.error('polling failed', wrapped);

      const [level, msg] = (homebridgeLogger.log as jest.MockedFunction<typeof homebridgeLogger.log>).mock.calls[0] as [LogLevel, string];
      expect(level).toBe(LogLevel.ERROR);
      expect(msg).toContain('NetworkRequestFailed');
      expect(msg).toContain('endpoint: /volume');
      expect(msg).toContain('caused by:');
      expect(msg).toContain('ECONNREFUSED');
    });

    it('shows only top message and immediate cause at INFO level for two-level chain', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });
      const root = new Error('ECONNREFUSED');
      const mid = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume', cause: root });
      const top = AppError.create({ name: 'PollingRefreshFailed', device: 'Kitchen', cause: mid });

      logger.error('device error', top);

      const [level, msg] = (homebridgeLogger.log as jest.MockedFunction<typeof homebridgeLogger.log>).mock.calls[0] as [LogLevel, string];
      expect(level).toBe(LogLevel.ERROR);
      expect(msg).toContain('PollingRefreshFailed');
      expect(msg).toContain('device: Kitchen');
      // The immediate cause appears
      expect(msg).toContain('NetworkRequestFailed');
      // But NOT the deep root cause message (only one level of cause shown)
      expect(msg).not.toMatch(/caused by:.*caused by:/s);
    });
  });

  describe('Logger.debug', () => {
    it('passes non-error arguments through unchanged', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });

      logger.debug('get volume', 42);

      expect(homebridgeLogger.log).toHaveBeenCalledWith(LogLevel.DEBUG, 'get volume', 42);
    });

    it('formats an Error argument with cause chain at DEBUG level', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.DEBUG,
      });
      const root = new Error('ECONNREFUSED');
      const err = AppError.create({ name: 'GetBrightnessFailed', device: 'Kitchen', cause: root });

      logger.debug('error getting brightness', err);

      const [level, msg] = (homebridgeLogger.log as jest.MockedFunction<typeof homebridgeLogger.log>).mock.calls[0] as [LogLevel, string];
      expect(level).toBe(LogLevel.DEBUG);
      expect(msg).toContain('GetBrightnessFailed');
      expect(msg).toContain('device: Kitchen');
      expect(msg).toContain('caused by:');
      expect(msg).toContain('ECONNREFUSED');
    });

    it('suppresses the debug call when level is above DEBUG', () => {
      const homebridgeLogger = makeMockLogger();
      const logger = Logger.forHomebridgeLogger({
        logger: homebridgeLogger,
        level: LogLevel.INFO,
      });

      logger.debug('error getting brightness', new Error('oops'));

      expect(homebridgeLogger.log).not.toHaveBeenCalled();
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
