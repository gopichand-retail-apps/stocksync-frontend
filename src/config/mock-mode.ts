const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const DEFAULT_IS_MOCK = true;

export function parseIsMockValue(value: string | undefined): boolean {
  if (value === undefined) return DEFAULT_IS_MOCK;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('VITE_IS_MOCK must be exactly "true" or "false".');
}

export const isMock = parseIsMockValue(import.meta.env.VITE_IS_MOCK);

interface ApiModeConfiguration {
  isMock: boolean;
  mockApiBaseUrl?: string;
  realApiBaseUrl?: string;
  legacyApiBaseUrl?: string;
  isDevelopment: boolean;
}

interface SelectedApiBaseUrl {
  value: string;
  localMockFallback: boolean;
}

function selectApiBaseUrl(config: ApiModeConfiguration): SelectedApiBaseUrl {
  if (config.isMock) {
    const configuredMockApiBaseUrl = config.mockApiBaseUrl?.trim();
    if (configuredMockApiBaseUrl) {
      return { value: configuredMockApiBaseUrl, localMockFallback: false };
    }
    if (!config.isDevelopment) {
      throw new Error('VITE_MOCK_API_BASE_URL is required for production mock mode.');
    }

    return {
      value: config.legacyApiBaseUrl?.trim() || '/api/v1',
      localMockFallback: true,
    };
  }

  const configuredRealApiBaseUrl = config.realApiBaseUrl?.trim();
  if (!configuredRealApiBaseUrl) {
    throw new Error('VITE_REAL_API_BASE_URL is required when VITE_IS_MOCK=false.');
  }
  return { value: configuredRealApiBaseUrl, localMockFallback: false };
}

function normalizeApiBaseUrl(value: string, allowRelative: boolean): string {
  const trimmedValue = value.trim();
  if (allowRelative && trimmedValue.replace(/\/+$/, '') === '/api/v1') return '/api/v1';

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error('The selected StockSync API must be an absolute HTTP(S) URL.');
  }

  const apiPath = parsedUrl.pathname.replace(/\/+$/, '');
  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
    (apiPath !== '' && apiPath !== '/api/v1') ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('The selected StockSync API must be an HTTP(S) origin or /api/v1 base without credentials.');
  }

  return `${parsedUrl.origin}/api/v1`;
}

export function resolveApiBaseUrl(config: ApiModeConfiguration): string {
  const selectedApiBaseUrl = selectApiBaseUrl(config);
  const apiBaseUrl = normalizeApiBaseUrl(selectedApiBaseUrl.value, selectedApiBaseUrl.localMockFallback);

  if (selectedApiBaseUrl.localMockFallback && !apiBaseUrl.startsWith('/')) {
    const apiUrl = new URL(apiBaseUrl);
    if (!LOOPBACK_HOSTS.has(apiUrl.hostname)) {
      throw new Error('Local mock mode may only fall back to a loopback API.');
    }
  }

  if (!config.isDevelopment && !apiBaseUrl.startsWith('/')) {
    const apiUrl = new URL(apiBaseUrl);
    if (!LOOPBACK_HOSTS.has(apiUrl.hostname) && apiUrl.protocol !== 'https:') {
      throw new Error('Production StockSync API URLs must use HTTPS.');
    }
  }

  return apiBaseUrl;
}

export function resolveSocketApiOrigin(apiBaseUrl: string): string | undefined {
  return apiBaseUrl.startsWith('/') ? undefined : new URL(apiBaseUrl).origin;
}
