import { Logging, LogLevel } from 'homebridge';
import { formatError } from 'homebridge-lib';
import { SoundTouchDevice } from '../devices/SoundTouch/SoundTouchDevice.js';
import { AppError } from '../errors.js';

const logLevelSeverityMap = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.SUCCESS]: 2,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

function renderContext(err: Error): string {
  if (err instanceof AppError) {
    const entries = Object.entries(err.info).filter(([k]) => k !== 'name' && k !== 'msg');
    if (entries.length > 0) {
      return ` [${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}]`;
    }
  }
  return '';
}

function stackSnippet(err: Error): string {
  if (!err.stack) return '';
  const lines = err.stack.split('\n').slice(1, 4);
  return lines.length > 0 ? `\n  ${lines.join('\n  ')}` : '';
}

export class Logger implements Partial<Logging> {
  readonly homebridgeLogger: Logging;
  readonly requiredLogLevel: LogLevel;

  protected constructor({
    homebridgeLogger,
    level,
  }: {
    homebridgeLogger: Logging;
    level: LogLevel;
  }) {
    this.homebridgeLogger = homebridgeLogger;
    this.requiredLogLevel = level;
  }

  static excludeLog(level: LogLevel, requiredLevel: LogLevel): boolean {
    return logLevelSeverityMap[level] < logLevelSeverityMap[requiredLevel];
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(level: LogLevel, message: string, ...parameters: any[]): void {
    if (Logger.excludeLog(level, this.requiredLogLevel)) return;
    this.homebridgeLogger.log(level, message, ...parameters);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  success(message: string, ...parameters: any[]): void {
    this.log(LogLevel.SUCCESS, message, ...parameters);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters);
  }

  error(messageOrErr: string | Error, err?: unknown): void {
    if (messageOrErr instanceof Error) {
      this._logError(messageOrErr, undefined);
      return;
    }
    const message = messageOrErr;
    if (!(err instanceof Error)) {
      this.log(LogLevel.ERROR, message);
      return;
    }
    this._logError(err, message);
  }

  private _logError(err: Error, prefix: string | undefined): void {
    const isDebug = !Logger.excludeLog(LogLevel.DEBUG, this.requiredLogLevel);

    if (isDebug) {
      const lines: string[] = [];
      let node: unknown = err;
      while (node instanceof Error) {
        lines.push(`${formatError(node)}${renderContext(node)}${stackSnippet(node)}`);
        node = node.cause;
      }
      const chain = lines.join('\n  caused by:\n  ');
      this.log(LogLevel.ERROR, prefix ? `${prefix}:\n  ${chain}` : chain);
    } else {
      const ctx = renderContext(err);
      const cause =
        err.cause instanceof Error
          ? `\n  caused by: ${formatError(err.cause)}`
          : '';
      const formatted = `${formatError(err)}${ctx}${cause}`;
      this.log(LogLevel.ERROR, prefix ? `${prefix}: ${formatted}` : formatted);
    }
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...parameters: any[]): void {
    if (parameters.length === 1 && parameters[0] instanceof Error) {
      const lines: string[] = [];
      let node: unknown = parameters[0];
      while (node instanceof Error) {
        lines.push(`${formatError(node)}${renderContext(node)}${stackSnippet(node)}`);
        node = node.cause;
      }
      this.log(LogLevel.DEBUG, `${message}:\n  ${lines.join('\n  caused by:\n  ')}`);
    } else {
      this.log(LogLevel.DEBUG, message, ...parameters);
    }
  }

  static forHomebridgeLogger({
    logger,
    level,
  }: {
    logger: Logging;
    level: LogLevel;
  }): Logger {
    return new Logger({ homebridgeLogger: logger, level });
  }
}

export class DeviceLogger extends Logger {
  readonly device: SoundTouchDevice;

  private constructor({
    homebridgeLogger,
    level,
    device,
  }: {
    homebridgeLogger: Logging;
    level: LogLevel;
    device: SoundTouchDevice;
  }) {
    super({ homebridgeLogger, level });
    this.device = device;
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(level: LogLevel, message: string, ...parameters: any[]): void {
    const formattedMsg = `[${this.device.name}] - ${message}`;

    super.log(level, formattedMsg, ...parameters);
  }

  static fromLogger({
    logger,
    device,
  }: {
    logger: Logger;
    device: SoundTouchDevice;
  }): DeviceLogger {
    return new DeviceLogger({
      homebridgeLogger: logger.homebridgeLogger,
      level: logger.requiredLogLevel,
      device,
    });
  }
}
