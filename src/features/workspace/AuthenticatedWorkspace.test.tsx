import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

const socket = vi.hoisted(() => ({
  on: vi.fn<(event: string, handler: () => void) => void>(),
  disconnect: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io: () => socket }));

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
  vi.spyOn(api, 'getLedgerMovement').mockResolvedValue(entry);
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

afterEach(() => {
  vi.restoreAllMocks();
  socket.on.mockClear();
});

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
      id: entry.id,
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
      expect(receipt).toHaveBeenCalledWith(
        { locationId: 'loc-central', skuId: 'sku-coffee', quantity: 3, note: undefined },
        { idempotencyKey: expect.any(String), signal: expect.any(AbortSignal) },
      ),
    );
    expect(await screen.findByText('Recorded: 3 units at Central Market.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'View stock movement' }));
    await waitFor(() => expect(document.getElementById(`movement-${entry.id}`)).toHaveFocus());
  });

  it('lets the operator inspect the ledger while a rejected retry remains unconfirmed', async () => {
    prepareApi();
    const ledger = vi.mocked(api.listLedger);
    const receive = vi
      .spyOn(api, 'receiveStock')
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockRejectedValue(new ApiClientError('Retry rejected', 'REQUEST_REJECTED', undefined, 409));
    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);
    await user.click(await screen.findByRole('button', { name: 'Receive stock' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Receive stock' }));
    await user.click(await dialog.findByRole('button', { name: 'Retry receipt' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('The original attempt may still have been recorded.');
    ledger.mockRejectedValueOnce(new Error('Ledger unavailable'));
    await user.click(dialog.getByText('Inspect recent receipts'));
    expect(await dialog.findByText(/The stock ledger is unavailable/)).toBeVisible();
    await user.click(dialog.getByText('Inspect recent receipts'));
    await waitFor(() => expect(dialog.queryByText(/The stock ledger is unavailable/)).toBeNull());
    await user.click(dialog.getByText('Inspect recent receipts'));
    expect(await dialog.findByRole('row', { name: /House Blend Coffee/ })).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Retry receipt' }));
    expect(new Set(receive.mock.calls.map(([, options]) => options.idempotencyKey)).size).toBe(1);
  });

  it('retries an old movement lookup and focuses the returned movement outside the recent list', async () => {
    prepareApi();
    const oldEntry = { ...entry, id: 'old-receipt' };
    vi.mocked(api.getLedgerMovement).mockResolvedValueOnce(entry).mockResolvedValueOnce(oldEntry);
    vi.spyOn(api, 'receiveStock').mockResolvedValue({
      id: oldEntry.id,
      locationId: oldEntry.locationId,
      skuId: oldEntry.skuId,
      quantity: 1,
      onHand: 43,
      version: 5,
      movementType: 'receipt',
    });
    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);
    await user.click(await screen.findByRole('button', { name: 'Receive stock' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Receive stock' }));
    await user.click(await screen.findByRole('link', { name: 'View stock movement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This stock movement could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Retry lookup' }));
    await waitFor(() => expect(document.getElementById(`movement-${oldEntry.id}`)).toHaveFocus());
  });

  it('refreshes the operation catalog after confirming an adjustment', async () => {
    prepareApi();
    const inventory = vi.mocked(api.listInventory);
    vi.spyOn(api, 'adjustStock').mockResolvedValue({
      id: entry.id,
      locationId: entry.locationId,
      skuId: entry.skuId,
      quantity: 1,
      onHand: 43,
      version: 5,
      movementType: 'manual_adjustment',
    });
    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);
    await screen.findByRole('heading', { name: 'Stock overview' });
    await user.click(screen.getByRole('button', { name: 'Inventory' }));
    await user.click(await screen.findByRole('button', { name: 'Adjust House Blend Coffee at Central Market' }));
    const dialog = within(await screen.findByRole('dialog'));
    const before = inventory.mock.calls.filter((args) => args.length === 0).length;
    await user.type(dialog.getByLabelText('Reference note'), 'Count adjustment');
    await user.click(dialog.getByRole('button', { name: 'Adjust stock' }));
    expect(await screen.findByText('Stock adjustment recorded in the ledger.')).toBeVisible();
    expect(inventory.mock.calls.filter((args) => args.length === 0)).toHaveLength(before + 1);
  });

  it('refreshes the operation catalog on inventory events', async () => {
    prepareApi();
    const inventory = vi.mocked(api.listInventory);
    renderWorkspace(users.inventory_manager);
    await screen.findByRole('heading', { name: 'Stock overview' });
    const before = inventory.mock.calls.filter((args) => args.length === 0).length;
    const inventoryUpdated = socket.on.mock.calls.find(([name]) => name === 'inventory.updated')?.[1];
    if (!inventoryUpdated) throw new Error('Expected a stock event listener');
    act(() => inventoryUpdated());
    await waitFor(() => expect(inventory.mock.calls.filter((args) => args.length === 0)).toHaveLength(before + 1));
  });

  it('keeps a later receipt open when a row action completes', async () => {
    prepareApi();
    vi.mocked(api.listTransfers).mockResolvedValue([
      {
        id: 'transfer-1',
        skuId: item.skuId,
        sku: item.sku,
        productName: item.name,
        fromLocationId: 'loc-north',
        fromLocationName: 'Northline Store',
        toLocationId: item.locationId,
        toLocationName: item.locationName,
        quantity: 1,
        status: 'in_transit',
        note: null,
        createdBy: 'Morgan Patel',
        createdAt: item.updatedAt,
        receivedAt: null,
      },
    ]);
    const result = {
      id: 'transfer-1',
      locationId: item.locationId,
      skuId: item.skuId,
      quantity: 1,
      status: 'received' as const,
      onHand: 43,
      version: 5,
    };
    let complete = () => {};
    const received = new Promise<typeof result>((resolve) => {
      complete = () => resolve(result);
    });
    const receive = vi.spyOn(api, 'receiveTransfer').mockReturnValue(received);
    const user = userEvent.setup();
    renderWorkspace(users.inventory_manager);
    await screen.findByRole('heading', { name: 'Stock overview' });
    await user.click(screen.getByRole('button', { name: 'Transfers' }));
    await user.click(await screen.findByRole('button', { name: /^Receive$/ }));
    expect(receive).toHaveBeenCalledWith('transfer-1');
    await user.click(screen.getByRole('button', { name: /^Overview$/ }));
    await user.click(await screen.findByRole('button', { name: 'Receive stock' }));
    await act(async () => {
      complete();
      await received;
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByText('Transfer received. Destination inventory is updated.')).toBeNull();
  });

  it.each(['Cancel', 'Sign out'])('starts a fresh receipt after %s', async (control) => {
    prepareApi();
    const receive = vi.spyOn(api, 'receiveStock').mockRejectedValue(new TypeError('Network failure'));
    const logout = vi.spyOn(api, 'logout').mockResolvedValue();
    const user = userEvent.setup();
    const workspace = renderWorkspace(users.inventory_manager);
    const submitReceipt = async () => {
      await user.click(await screen.findByRole('button', { name: 'Receive stock' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Receive stock' }));
      expect(await within(dialog).findByText('Awaiting confirmation')).toBeInTheDocument();
    };

    await submitReceipt();
    await user.click(screen.getByRole('button', { name: control }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    if (control === 'Sign out') {
      await waitFor(() => expect(logout).toHaveBeenCalledOnce());
      workspace.unmount();
      renderWorkspace(users.inventory_manager);
    }
    await submitReceipt();
    expect(receive.mock.calls[1]?.[1].idempotencyKey).not.toBe(receive.mock.calls[0]?.[1].idempotencyKey);
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
