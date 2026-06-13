import { describe, expect, test } from '@jest/globals';
import { Logger } from '../FormattedLogger';
import { LogLevel } from 'homebridge';

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
      test(`returns ${c.outcome} when log level is '${c.level}' and required level is '${c.requiredLevel}'`, () => {
        const result = Logger.excludeLog(c.level, c.requiredLevel);
        expect(result).toBe(c.outcome);
      });
    });
  });
});
