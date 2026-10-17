import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUUID } from './uuid';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('compatible UUID generation', () => {
  it('uses the native implementation with its Crypto receiver', () => {
    const cryptoApi = {
      randomUUID: vi.fn(function () {
        expect(this).toBe(cryptoApi);
        return 'b02d274b-b569-48b5-98c4-881bd417d1d4';
      }),
    };
    vi.stubGlobal('crypto', cryptoApi);
    expect(generateUUID()).toBe('b02d274b-b569-48b5-98c4-881bd417d1d4');
    expect(cryptoApi.randomUUID).toHaveBeenCalledOnce();
  });

  it('uses secure random bytes when randomUUID is unavailable, including production', () => {
    vi.stubEnv('DEV', false);
    const getRandomValues = vi.fn(bytes => bytes.fill(255));
    vi.stubGlobal('crypto', { getRandomValues });
    expect(generateUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('allows development-only IDs when Web Crypto is missing', () => {
    vi.stubEnv('DEV', true);
    vi.stubGlobal('crypto', undefined);
    const ids = Array.from({ length: 100 }, () => generateUUID());
    expect(ids.every(id => uuidV4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not silently use insecure randomness in production', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('crypto', {});
    const random = vi.spyOn(Math, 'random');
    expect(() => generateUUID()).toThrow('Web Crypto support');
    expect(random).not.toHaveBeenCalled();
  });
});
