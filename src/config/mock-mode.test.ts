import { describe, expect, it } from 'vitest';
import { DEFAULT_IS_MOCK, parseIsMockValue, resolveApiBaseUrl, resolveSocketApiOrigin } from './mock-mode';

describe('StockSync API data mode', () => {
  it('defaults to mock mode and accepts only exact build-time values', () => {
    expect(DEFAULT_IS_MOCK).toBe(true);
    expect(parseIsMockValue(undefined)).toBe(true);
    expect(parseIsMockValue('true')).toBe(true);
    expect(parseIsMockValue('false')).toBe(false);
    expect(() => parseIsMockValue('yes')).toThrow('VITE_IS_MOCK');
  });

  it('selects separate API URLs for mock and live modes', () => {
    expect(
      resolveApiBaseUrl({
        isMock: true,
        mockApiBaseUrl: 'http://127.0.0.1:5404/api/v1',
        realApiBaseUrl: 'http://127.0.0.1:1/api/v1',
        isDevelopment: false,
      }),
    ).toBe('http://127.0.0.1:5404/api/v1');
    expect(
      resolveApiBaseUrl({
        isMock: false,
        mockApiBaseUrl: 'http://127.0.0.1:1/api/v1',
        realApiBaseUrl: 'https://inventory.example.test',
        isDevelopment: true,
      }),
    ).toBe('https://inventory.example.test/api/v1');
  });

  it('allows only a loopback fallback for local mock development', () => {
    expect(resolveApiBaseUrl({ isMock: true, isDevelopment: true })).toBe('/api/v1');
    expect(
      resolveApiBaseUrl({
        isMock: true,
        legacyApiBaseUrl: 'http://127.0.0.1:5402/api/v1',
        isDevelopment: true,
      }),
    ).toBe('http://127.0.0.1:5402/api/v1');
    expect(() =>
      resolveApiBaseUrl({
        isMock: true,
        legacyApiBaseUrl: 'https://inventory.example.test/api/v1',
        isDevelopment: true,
      }),
    ).toThrow('loopback API');
  });

  it('fails closed when the selected API URL is missing or invalid', () => {
    expect(() => resolveApiBaseUrl({ isMock: true, isDevelopment: false })).toThrow('VITE_MOCK_API_BASE_URL');
    expect(() => resolveApiBaseUrl({ isMock: false, isDevelopment: true })).toThrow('VITE_REAL_API_BASE_URL');
    expect(() =>
      resolveApiBaseUrl({
        isMock: true,
        mockApiBaseUrl: 'http://127.0.0.1:5404/orders',
        isDevelopment: false,
      }),
    ).toThrow('HTTP(S) origin');
    expect(() =>
      resolveApiBaseUrl({
        isMock: true,
        mockApiBaseUrl: 'not-an-absolute-url',
        isDevelopment: false,
      }),
    ).toThrow('absolute HTTP(S) URL');
    expect(() =>
      resolveApiBaseUrl({
        isMock: false,
        realApiBaseUrl: 'http://inventory.example.test',
        isDevelopment: false,
      }),
    ).toThrow('must use HTTPS');
  });

  it('uses the selected API origin for websocket updates', () => {
    expect(resolveSocketApiOrigin('/api/v1')).toBeUndefined();
    expect(resolveSocketApiOrigin('https://inventory.example.test/api/v1')).toBe('https://inventory.example.test');
  });
});
