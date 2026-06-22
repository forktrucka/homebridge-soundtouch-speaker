import { describe, expect, it } from '@jest/globals';
import {
  ContextError,
  DeviceInfoError,
  DeviceNotFoundError,
  NetworkRequestError,
} from '../errors.js';

describe('ContextError', () => {
  describe('.wrap', () => {
    it('creates a ContextError with cause and context', () => {
      const cause = new Error('ECONNREFUSED');
      const err = ContextError.wrap('network request failed', { endpoint: '/volume' }, cause);

      expect(err).toBeInstanceOf(ContextError);
      expect(err.message).toBe('network request failed');
      expect(err.context).toEqual({ endpoint: '/volume' });
      expect(err.cause).toBe(cause);
    });

    it('wraps a non-Error cause without throwing', () => {
      const err = ContextError.wrap('failed', {}, 'string cause');

      expect(err.cause).toBe('string cause');
    });
  });
});

describe('NetworkRequestError', () => {
  it('is a ContextError with the endpoint in context', () => {
    const cause = new Error('socket hang up');
    const err = new NetworkRequestError('/volume', cause);

    expect(err).toBeInstanceOf(ContextError);
    expect(err.name).toBe('NetworkRequestError');
    expect(err.message).toBe('network request failed');
    expect(err.context).toEqual({ endpoint: '/volume' });
    expect(err.cause).toBe(cause);
  });
});

describe('DeviceNotFoundError', () => {
  it('is an Error with a descriptive message and correct name', () => {
    const err = new DeviceNotFoundError('Kitchen');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DeviceNotFoundError');
    expect(err.message).toContain('Kitchen');
  });
});

describe('DeviceInfoError', () => {
  it('is an Error with a descriptive message and correct name', () => {
    const err = new DeviceInfoError('Kitchen');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DeviceInfoError');
    expect(err.message).toContain('Kitchen');
  });
});
