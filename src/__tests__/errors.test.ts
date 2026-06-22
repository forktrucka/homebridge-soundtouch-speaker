import { describe, expect, it } from '@jest/globals';
import { AppError } from '../errors.js';

describe('AppError', () => {
  describe('.create', () => {
    it('uses name as both error.name and error.message when msg is absent', () => {
      const err = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume' });

      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('NetworkRequestFailed');
      expect(err.message).toBe('NetworkRequestFailed');
    });

    it('uses msg as error.message when provided', () => {
      const err = AppError.create({ name: 'NetworkRequestFailed', msg: 'Could not reach device' });

      expect(err.name).toBe('NetworkRequestFailed');
      expect(err.message).toBe('Could not reach device');
    });

    it('stores all info fields including name and msg', () => {
      const err = AppError.create({ name: 'NetworkRequestFailed', msg: 'desc', endpoint: '/volume' });

      expect(err.info).toEqual({ name: 'NetworkRequestFailed', msg: 'desc', endpoint: '/volume' });
    });

    it('stores extra fields in info', () => {
      const err = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume' });

      expect(err.info).toEqual({ name: 'NetworkRequestFailed', endpoint: '/volume' });
    });

    it('attaches a cause', () => {
      const cause = new Error('ECONNREFUSED');
      const err = AppError.create({ name: 'NetworkRequestFailed', cause });

      expect(err.cause).toBe(cause);
    });

    it('accepts a non-Error cause', () => {
      const err = AppError.create({ name: 'SomethingBroke', cause: 'string cause' });

      expect(err.cause).toBe('string cause');
    });
  });

  describe('.collect', () => {
    it('returns own info for a single AppError', () => {
      const err = AppError.create({ name: 'Foo', device: 'Kitchen' });

      expect(AppError.collect(err)).toEqual({ name: 'Foo', device: 'Kitchen' });
    });

    it('merges info from every AppError in the cause chain', () => {
      const root = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume' });
      const wrapped = AppError.create({ name: 'PollingRefreshFailed', device: 'Kitchen', cause: root });

      expect(AppError.collect(wrapped)).toMatchObject({ device: 'Kitchen', endpoint: '/volume' });
    });

    it('nearest error wins when keys overlap', () => {
      const root = AppError.create({ name: 'Root', device: 'old' });
      const top = AppError.create({ name: 'Top', device: 'Kitchen', cause: root });

      expect(AppError.collect(top).device).toBe('Kitchen');
    });

    it('skips plain Errors in the chain', () => {
      const plain = new Error('ECONNREFUSED');
      const wrapped = AppError.create({ name: 'NetworkRequestFailed', endpoint: '/volume', cause: plain });

      expect(AppError.collect(wrapped)).toEqual({ name: 'NetworkRequestFailed', endpoint: '/volume' });
    });
  });
});
