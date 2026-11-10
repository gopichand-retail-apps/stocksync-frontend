import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiClientError,
  type InventoryItem,
  type LedgerEntry,
  type Location,
  type Overview,
  type User,
} from '../../api/client';
import { TestContentProvider } from '../../test/contentProvider';
import { AuthenticatedWorkspace } from './AuthenticatedWorkspace';

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: () => undefined,
    disconnect: () => undefined,
  }),
}));

const users: Record<User['role'], User> = {
  associate: {
    id: 'user-associate',
    email: 'associate@stocksync.test',
    displayName: 'Jamie Lee',
    role: 'associate',
    homeLocationId: 'loc-central',
  },
  inventory_manager: {
    id: 'user-manager',
    email: 'manager@stocksync.test',
    displayName: 'Morgan Patel',
    role: 'inventory_manager',
    homeLocationId: 'loc-central',
  },
  auditor: {
    id: 'user-auditor',
    email: 'auditor@stocksync.test',
    displayName: 'Taylor Kim',
    role: 'auditor',
    homeLocationId: 'loc-central',
  },
};

const locations: Location[] = [
  { id: 'loc-central', code: 'CTR-01', name: 'Central Market', region: 'Bay Area' },
  { id: 'loc-north', code: 'NTH-02', name: 'Northline Store', region: 'North Bay' },
];

const item: InventoryItem = {
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
  version: 4,
  updatedAt: '2026-10-30T12:00:00.000Z',
};

const entry: LedgerEntry = {
  id: 'ledger-1',
  locationId: item.locationId,
  locationName: item.locationName,
  skuId: item.skuId,
  sku: item.sku,
  productName: item.name,
  movementType: 'receipt',
  quantityDelta: 1,
  referenceId: 'receipt-1',
  note: null,
  actorName: 'Morgan Patel',
  createdAt: '2026-10-30T12:00:00.000Z',
};

const overview: Overview = {
  metrics: { skuCount: 1, unitsOnHand: 42, reservedUnits: 3, lowStockCount: 0, activeTransfers: 0 },
  lowStock: [],
  activity: [entry],
};

function prepareApi() {
  vi.spyOn(api, 'listLocations').mockResolvedValue(locations);
  vi.spyOn(api, 'listInventory').mockResolvedValue([item]);
  vi.spyOn(api, 'listCategories').mockResolvedValue(['Grocery']);
  vi.spyOn(api, 'getOverview').mockResolvedValue(overview);
  vi.spyOn(api, 'listLedger').mockResolvedValue([entry]);
  vi.spyOn(api, 'listTransfers').mockResolvedValue([]);
  vi.spyOn(api, 'listReservations').mockResolvedValue([]);
}

function renderWorkspace(user: User) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContentProvider>
        <AuthenticatedWorkspace user={user} />
      </TestContentProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('AuthenticatedWorkspace', () => {
  it('loads manager inventory and switches views', async () => {
    prepareApi();
    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);

    expect(await screen.findByRole('heading', { name: 'Stock overview' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select location' })).toBeInTheDocument();
    expect(await screen.findByText('House Blend Coffee')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(await screen.findByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('keeps associates at their home location and hides manager-only transfers', async () => {
    prepareApi();
    const user = userEvent.setup();
    renderWorkspace(users.associate);

    await screen.findByRole('heading', { name: 'Stock overview' });
    expect(screen.queryByRole('combobox', { name: 'Select location' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Transfers' }));
    expect(await screen.findByRole('heading', { name: 'Transfers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New transfer' })).toBeNull();
  });

  it('keeps auditors read-only and submits a receipt for managers', async () => {
    prepareApi();
    const receipt = vi.spyOn(api, 'receiveStock').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 3,
      onHand: 45,
      version: 5,
      movementType: 'receipt',
    });
    const auditor = renderWorkspace(users.auditor);
    await screen.findByRole('heading', { name: 'Stock overview' });
    expect(screen.queryByRole('button', { name: 'Receive stock' })).toBeNull();
    auditor.unmount();

    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);
    await screen.findByRole('heading', { name: 'Stock overview' });
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Quantity'));
    await user.type(within(dialog).getByLabelText('Quantity'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Receive stock' }));

    await waitFor(() =>
      expect(receipt).toHaveBeenCalledWith({
        locationId: 'loc-central',
        skuId: 'sku-coffee',
        quantity: 3,
        note: undefined,
      }),
    );
    expect(await screen.findByText('Stock receipt recorded. On-hand quantity is updated.')).toBeInTheDocument();
  });

  it.each([
    [
      new ApiClientError('private server detail', 'API_UNAVAILABLE'),
      'The StockSync API is unavailable. Check the local service and retry.',
    ],
    [new ApiClientError('private server detail', 'UNKNOWN_ERROR'), 'The request could not be completed.'],
    [new Error('private server detail'), 'The request could not be completed.'],
  ])('shows a safe message for failed inventory requests', async (error, message) => {
    prepareApi();
    vi.spyOn(api, 'getOverview').mockRejectedValue(error);
    renderWorkspace(users.inventory_manager);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('private server detail')).toBeNull();
  });

  it('announces browser offline state and clears the notice after reconnecting', async () => {
    prepareApi();
    renderWorkspace(users.inventory_manager);
    await screen.findByRole('heading', { name: 'Stock overview' });

    const offlineMessage =
      'Your device is offline. Stock data may be out of date; inventory changes are not saved offline.';
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText(offlineMessage)).toBeVisible();

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(screen.queryByText(offlineMessage)).toBeNull());
  });

  it('changes location, toggles navigation, refreshes the current view, and signs out', async () => {
    prepareApi();
    const listInventory = vi.spyOn(api, 'listInventory').mockResolvedValue([item]);
    const getOverview = vi.spyOn(api, 'getOverview').mockResolvedValue(overview);
    const logout = vi.spyOn(api, 'logout').mockResolvedValue();
    const user = userEvent.setup();
    const { container } = renderWorkspace(users.inventory_manager);

    await screen.findByRole('heading', { name: 'Stock overview' });
    await screen.findByRole('option', { name: 'Northline Store' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select location' }), 'loc-north');
    await waitFor(() =>
      expect(listInventory).toHaveBeenCalledWith({
        locationId: 'loc-north',
        search: undefined,
        category: undefined,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const topbar = container.querySelector<HTMLElement>('header.topbar');
    if (!topbar) throw new Error('The authenticated workspace must render its topbar');
    expect(within(topbar).getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    await user.click(within(topbar).getByRole('button', { name: 'Close navigation' }));
    const callsBeforeRefresh = getOverview.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Refresh current view' }));
    await waitFor(() => expect(getOverview).toHaveBeenCalledTimes(callsBeforeRefresh + 1));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
