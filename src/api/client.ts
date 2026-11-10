import { z } from 'zod';
import { isMock, resolveApiBaseUrl } from '../config/mock-mode';

function apiRoot(): string {
  return resolveApiBaseUrl({
    isMock,
    mockApiBaseUrl: import.meta.env.VITE_MOCK_API_BASE_URL,
    realApiBaseUrl: import.meta.env.VITE_REAL_API_BASE_URL,
    legacyApiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    isDevelopment: import.meta.env.DEV,
  });
}

export function apiSocketOrigin(): string | undefined {
  const root = apiRoot();
  return root.startsWith('/') ? undefined : new URL(root).origin;
}

export const UserRoleSchema = z.enum(['associate', 'inventory_manager', 'auditor']);
const ApiVersionSchema = z.object({
  service: z.literal('stocksync-api'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
const SyntheticRolesSchema = z
  .array(UserRoleSchema)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length);

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: UserRoleSchema,
  homeLocationId: z.string(),
});

export const SessionSchema = z.object({
  user: UserSchema.nullable(),
  csrfToken: z.string().nullable(),
});

export const LocationSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
});

export const InventoryItemSchema = z
  .object({
    skuId: z.string(),
    sku: z.string(),
    barcode: z.string(),
    name: z.string(),
    category: z.string(),
    unit: z.string(),
    threshold: z.number().int().nonnegative(),
    accent: z.string(),
    locationId: z.string(),
    locationCode: z.string(),
    locationName: z.string(),
    onHand: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: z.string(),
  })
  .superRefine((item, context) => {
    if (item.reserved > item.onHand || item.available !== item.onHand - item.reserved) {
      context.addIssue({ code: 'custom', message: 'Stock totals are inconsistent' });
    }
  });

export const LedgerEntrySchema = z.object({
  id: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  skuId: z.string(),
  sku: z.string(),
  productName: z.string(),
  movementType: z.string(),
  quantityDelta: z.number().int(),
  referenceId: z.string().nullable(),
  note: z.string().nullable(),
  actorName: z.string(),
  createdAt: z.string(),
});

export const OverviewSchema = z.object({
  metrics: z.object({
    skuCount: z.number().int().nonnegative(),
    unitsOnHand: z.number().int().nonnegative(),
    reservedUnits: z.number().int().nonnegative(),
    lowStockCount: z.number().int().nonnegative(),
    activeTransfers: z.number().int().nonnegative(),
  }),
  lowStock: z.array(InventoryItemSchema),
  activity: z.array(LedgerEntrySchema),
});

export const TransferSchema = z.object({
  id: z.string().uuid(),
  skuId: z.string(),
  sku: z.string(),
  productName: z.string(),
  fromLocationId: z.string(),
  fromLocationName: z.string(),
  toLocationId: z.string(),
  toLocationName: z.string(),
  quantity: z.number().int().positive(),
  status: z.enum(['in_transit', 'received', 'cancelled']),
  note: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  receivedAt: z.string().nullable(),
});

export const ReservationSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  locationName: z.string(),
  skuId: z.string(),
  sku: z.string(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  status: z.literal('active'),
  note: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

const MutationResultSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  skuId: z.string(),
  quantity: z.number().int(),
  onHand: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  movementType: z.string(),
});

const TransferResultSchema = z.object({
  id: z.string().uuid(),
  skuId: z.string(),
  fromLocationId: z.string(),
  toLocationId: z.string(),
  quantity: z.number().int().positive(),
  status: z.literal('in_transit'),
  fromOnHand: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

const ReceivedTransferSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  skuId: z.string(),
  quantity: z.number().int().positive(),
  status: z.literal('received'),
  onHand: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

const CountResultSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  skuId: z.string(),
  expectedQuantity: z.number().int().nonnegative(),
  countedQuantity: z.number().int().nonnegative(),
  variance: z.number().int(),
  version: z.number().int().positive(),
});

const ReservationResultSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  skuId: z.string(),
  quantity: z.number().int().positive(),
  status: z.literal('active'),
  available: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

const ReleaseResultSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  skuId: z.string(),
  status: z.literal('released'),
  version: z.number().int().positive(),
});

const ErrorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  requestId: z.string().nullable().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type SessionData = z.infer<typeof SessionSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type Overview = z.infer<typeof OverviewSchema>;
export type Transfer = z.infer<typeof TransferSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, code: string, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.requestId = requestId;
  }
}

let csrfToken: string | null = null;

function requestHeaders(method: string, body: string | undefined): Headers {
  const headers = new Headers({ Accept: 'application/json', 'X-Request-ID': crypto.randomUUID() });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') {
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  return headers;
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError('The API returned an unreadable response', 'INVALID_RESPONSE');
  }
}

function apiError(payload: unknown, response: Response): ApiClientError {
  const parsedError = ErrorResponseSchema.safeParse(payload);
  return new ApiClientError(
    parsedError.data?.message ?? 'The request could not be completed',
    parsedError.data?.code ?? 'REQUEST_FAILED',
    parsedError.data?.requestId ?? response.headers.get('X-Request-ID') ?? undefined,
  );
}

function validatedResponse<Response>(payload: unknown, schema: z.ZodType<Response>): Response {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError('The API response did not match the StockSync contract', 'INVALID_RESPONSE');
  }
  return parsed.data;
}

async function request<Response>(
  path: string,
  responseSchema: z.ZodType<Response>,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<Response> {
  const method = options.method ?? 'GET';
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);

  const response = await fetch(`${apiRoot()}${path}`, {
    method,
    headers: requestHeaders(method, body),
    body,
    credentials: 'include',
    cache: 'no-store',
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw apiError(payload, response);
  return validatedResponse(payload, responseSchema);
}

export const api = {
  getVersion() {
    return request('/version', ApiVersionSchema);
  },

  async getSession(): Promise<SessionData> {
    const result = await request('/auth/session', SessionSchema);
    csrfToken = result.csrfToken;
    return result;
  },

  listSyntheticRoles(): Promise<UserRole[]> {
    return request('/auth/synthetic-roles', SyntheticRolesSchema);
  },

  async login(email: string, password: string): Promise<SessionData> {
    const result = await request('/auth/login', SessionSchema, {
      method: 'POST',
      body: { email, password },
    });
    csrfToken = result.csrfToken;
    return result;
  },

  async logout(): Promise<void> {
    await request('/auth/logout', z.object({ loggedOut: z.literal(true) }), { method: 'POST' });
    csrfToken = null;
  },

  listLocations(): Promise<Location[]> {
    return request('/locations', z.array(LocationSchema));
  },

  listInventory(filters: { locationId?: string; search?: string; category?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.locationId) params.set('locationId', filters.locationId);
    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    return request(`/inventory${query}`, z.array(InventoryItemSchema));
  },

  listCategories(): Promise<string[]> {
    return request('/inventory/categories', z.array(z.string()));
  },

  getOverview(locationId?: string): Promise<Overview> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return request(`/overview${query}`, OverviewSchema);
  },

  listLedger(locationId?: string): Promise<LedgerEntry[]> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return request(`/ledger${query}`, z.array(LedgerEntrySchema));
  },

  listTransfers(): Promise<Transfer[]> {
    return request('/transfers', z.array(TransferSchema));
  },

  listReservations(locationId?: string): Promise<Reservation[]> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return request(`/reservations${query}`, z.array(ReservationSchema));
  },

  receiveStock(input: { locationId: string; skuId: string; quantity: number; note?: string }) {
    return request('/receipts', MutationResultSchema, { method: 'POST', body: input });
  },

  createTransfer(input: {
    fromLocationId: string;
    toLocationId: string;
    skuId: string;
    quantity: number;
    note?: string;
  }) {
    return request('/transfers', TransferResultSchema, { method: 'POST', body: input });
  },

  receiveTransfer(transferId: string) {
    return request(`/transfers/${transferId}/receive`, ReceivedTransferSchema, { method: 'PATCH' });
  },

  reconcileCount(input: { locationId: string; skuId: string; expectedVersion: number; countedQuantity: number }) {
    return request('/cycle-counts', CountResultSchema, { method: 'POST', body: input });
  },

  adjustStock(input: { locationId: string; skuId: string; delta: number; note: string }) {
    return request('/adjustments', MutationResultSchema, { method: 'POST', body: input });
  },

  reserveStock(input: { locationId: string; skuId: string; quantity: number; note?: string }) {
    return request('/reservations', ReservationResultSchema, { method: 'POST', body: input });
  },

  releaseReservation(reservationId: string) {
    return request(`/reservations/${reservationId}/release`, ReleaseResultSchema, { method: 'PATCH' });
  },
};
