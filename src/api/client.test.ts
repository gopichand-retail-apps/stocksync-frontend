import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, InventoryItemSchema, SessionSchema } from './client';

const inventoryItem = {
  skuId: 'sku-coffee',
  sku: 'BEV-1042',
  barcode: '850010420001',
  name: 'House Blend Coffee',
  category: 'Grocery',
  unit: 'bag',
  threshold: 24,
  accent: 'copper',
  locationId: 'loc-central',
  locationCode: 'CTR-01',
  locationName: 'Central Market',
  onHand: 42,
  reserved: 3,
  available: 39,
  version: 1,
  updatedAt: '2026-10-30T12:00:00.000Z',
};

const managerSession = {
  user: {
    id: 'user-manager',
    email: 'manager@stocksync.test',
    displayName: 'Morgan Patel',
    role: 'inventory_manager',
    homeLocationId: 'loc-central',
  },
  csrfToken: 'csrf-token-for-test',
};

function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'request-id-for-test' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('StockSync API contracts', () => {
  it('accepts a consistent inventory balance from the API', () => {
    expect(InventoryItemSchema.parse(inventoryItem)).toEqual(inventoryItem);
  });

  it('rejects contradictory available and reserved quantities', () => {
    const parsed = InventoryItemSchema.safeParse({ ...inventoryItem, available: 42 });
    expect(parsed.success).toBe(false);
  });

  it('accepts only known server roles in the session contract', () => {
    expect(
      SessionSchema.safeParse({
        user: { id: 'user-1', email: 'a@example.test', displayName: 'A', role: 'root', homeLocationId: 'loc-1' },
        csrfToken: 'token',
      }).success,
    ).toBe(false);
  });

  it('loads only role codes from the synthetic role discovery endpoint', async () => {
    const roleCodes = ['associate', 'auditor', 'inventory_manager'];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(roleCodes));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.listSyntheticRoles()).resolves.toEqual(roleCodes);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/synthetic-roles',
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
    );
  });

  it('rejects identity or credential objects from synthetic role discovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ role: 'associate', email: 'person@test' }])));

    await expect(api.listSyntheticRoles()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts the received-transfer response returned after destination posting', async () => {
    const transferId = '682163f7-b8d3-4e18-8944-df558e3e9ab2';
    const payload = {
      id: transferId,
      locationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 2,
      status: 'received',
      onHand: 19,
      version: 2,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.receiveTransfer(transferId)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/transfers/${transferId}/receive`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('calls all read endpoints and encodes location/search filters', async () => {
    const overview = {
      metrics: { skuCount: 0, unitsOnHand: 0, reservedUnits: 0, lowStockCount: 0, activeTransfers: 0 },
      lowStock: [],
      activity: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(overview))
      .mockResolvedValueOnce(jsonResponse(overview))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await api.listLocations();
    await api.listInventory({ locationId: 'loc north', search: 'coffee & tea', category: 'Dairy & Alt' });
    await api.listInventory();
    await api.listCategories();
    await api.getOverview('loc north');
    await api.getOverview();
    await api.listLedger('loc north');
    await api.listLedger();
    await api.listTransfers();
    await api.listReservations('loc north');
    await api.listReservations();

    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('locationId=loc+north');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('search=coffee+%26+tea');
    expect(String(fetchMock.mock.calls[4]?.[0])).toBe('/api/v1/overview?locationId=loc%20north');
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('/api/v1/inventory');
    expect(String(fetchMock.mock.calls[5]?.[0])).toBe('/api/v1/overview');
    expect(String(fetchMock.mock.calls[7]?.[0])).toBe('/api/v1/ledger');
    expect(String(fetchMock.mock.calls[10]?.[0])).toBe('/api/v1/reservations');
  });

  it('hydrates and clears the CSRF token from the current session response', async () => {
    const anonymousSession = { user: null, csrfToken: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(managerSession))
      .mockResolvedValueOnce(jsonResponse({ loggedOut: true }))
      .mockResolvedValueOnce(jsonResponse(anonymousSession))
      .mockResolvedValueOnce(jsonResponse({ loggedOut: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getSession()).resolves.toEqual(managerSession);
    await api.logout();
    await expect(api.getSession()).resolves.toEqual(anonymousSession);
    await api.logout();

    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('X-CSRF-Token')).toBe(managerSession.csrfToken);
    expect(new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get('X-CSRF-Token')).toBeNull();
  });

  it('sends CSRF and idempotency headers for mutations and clears the token on logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(managerSession))
      .mockResolvedValueOnce(jsonResponse({ loggedOut: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.login(managerSession.user.email, 'stock-demo-only');
    await api.logout();

    const mutationHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(mutationHeaders.get('X-CSRF-Token')).toBe(managerSession.csrfToken);
    expect(mutationHeaders.get('Idempotency-Key')).toBe('request-id-for-test');
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('include');
  });

  it('maps server errors to safe API errors with the request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { code: 'LOCATION_FORBIDDEN', message: 'Location is unavailable', requestId: 'server-request-1' },
            403,
            { 'X-Request-ID': 'header-request-1' },
          ),
        ),
    );

    await expect(api.listLocations()).rejects.toMatchObject({
      code: 'LOCATION_FORBIDDEN',
      message: 'Location is unavailable',
      requestId: 'server-request-1',
    });
  });

  it('rejects unreadable JSON and payloads that violate the API schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse([{ unexpected: true }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.listLocations()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(api.listLocations()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('sends and validates all stock mutation request contracts', async () => {
    const operationId = '682163f7-b8d3-4e18-8944-df558e3e9ab2';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          locationId: 'loc-central',
          skuId: 'sku-coffee',
          quantity: 3,
          onHand: 45,
          version: 2,
          movementType: 'receipt',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          skuId: 'sku-coffee',
          fromLocationId: 'loc-central',
          toLocationId: 'loc-north',
          quantity: 2,
          status: 'in_transit',
          fromOnHand: 40,
          version: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          locationId: 'loc-central',
          skuId: 'sku-coffee',
          expectedQuantity: 42,
          countedQuantity: 41,
          variance: -1,
          version: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          locationId: 'loc-central',
          skuId: 'sku-coffee',
          quantity: -1,
          onHand: 41,
          version: 3,
          movementType: 'manual_adjustment',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          locationId: 'loc-central',
          skuId: 'sku-coffee',
          quantity: 1,
          status: 'active',
          available: 40,
          version: 4,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: operationId,
          locationId: 'loc-central',
          skuId: 'sku-coffee',
          status: 'released',
          version: 5,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await api.receiveStock({ locationId: 'loc-central', skuId: 'sku-coffee', quantity: 3 });
    await api.createTransfer({
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 2,
    });
    await api.reconcileCount({
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedVersion: 1,
      countedQuantity: 41,
    });
    await api.adjustStock({ locationId: 'loc-central', skuId: 'sku-coffee', delta: -1, note: 'count correction' });
    await api.reserveStock({ locationId: 'loc-central', skuId: 'sku-coffee', quantity: 1 });
    await api.releaseReservation(operationId);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/receipts',
      '/api/v1/transfers',
      '/api/v1/cycle-counts',
      '/api/v1/adjustments',
      '/api/v1/reservations',
      `/api/v1/reservations/${operationId}/release`,
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedVersion: 1,
      countedQuantity: 41,
    });
  });
});
