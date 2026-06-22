import { describe, expect, it } from '@jest/globals';
import { AppError } from '../errors.js';

describe('AppError', () => {
  describe('.create', () => {
    it('sets name, message, and info', () => {
      const err = AppError.create({ name: 'NetworkRequestFailed', message: 'network request failed', info: { endpoint: '/volume' } });

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('NetworkRequestFailed');
      expect(err.message).toBe('network request failed');
      expect(err.info).toEqual({ endpoint: '/volume' });
    });

    it('attaches a cause', () => {
      const cause = new Error('ECONNREFUSED');
      const err = AppError.create({ name: 'NetworkRequestFailed', message: 'network request failed', cause });

      expect(err.cause).toBe(cause);
    });

    it('defaults info to an empty object when omitted', () => {
      const err = AppError.create({ name: 'SomethingBroke', message: 'it broke' });

      expect(err.info).toEqual({});
    });

    it('accepts a non-Error cause', () => {
      const err = AppError.create({ name: 'SomethingBroke', message: 'it broke', cause: 'string cause' });

      expect(err.cause).toBe('string cause');
    });
  });

  describe('.collect', () => {
    it('returns own info for a single AppError', () => {
      const err = AppError.create({ name: 'Foo', message: 'foo', info: { device: 'Kitchen' } });

      expect(AppError.collect(err)).toEqual({ device: 'Kitchen' });
    });

    it('merges info from every AppError in the cause chain', () => {
      const root = AppError.create({ name: 'NetworkRequestFailed', message: 'network request failed', info: { endpoint: '/volume' } });
      const wrapped = AppError.create({ name: 'PollingRefreshFailed', message: 'polling refresh failed', info: { device: 'Kitchen' }, cause: root });

      expect(AppError.collect(wrapped)).toEqual({ device: 'Kitchen', endpoint: '/volume' });
    });

    it('nearest error wins when keys overlap', () => {
      const root = AppError.create({ name: 'Root', message: 'root', info: { device: 'old' } });
      const top = AppError.create({ name: 'Top', message: 'top', info: { device: 'Kitchen' }, cause: root });

      expect(AppError.collect(top).device).toBe('Kitchen');
    });

    it('skips plain Errors in the chain', () => {
      const plain = new Error('ECONNREFUSED');
      const wrapped = AppError.create({ name: 'NetworkRequestFailed', message: 'network request failed', info: { endpoint: '/volume' }, cause: plain });

      expect(AppError.collect(wrapped)).toEqual({ endpoint: '/volume' });
    });
  });
});
