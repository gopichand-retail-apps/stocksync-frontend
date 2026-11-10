import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem, LedgerEntry, Overview, Reservation, Transfer } from '../../api/client';
import { TestContentProvider } from '../../test/contentProvider';
import { InventoryViews } from './InventoryViews';
import type { StockActionKind, StockView } from './types';

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

const ledgerEntry: LedgerEntry = {
  id: 'ledger-1',
  locationId: 'loc-central',
  locationName: 'Central Market',
  skuId: item.skuId,
  sku: item.sku,
  productName: item.name,
  movementType: 'receipt',
  quantityDelta: 4,
  referenceId: 'receipt-1',
  note: 'delivery',
  actorName: 'Morgan Patel',
  createdAt: '2026-10-30T12:00:00.000Z',
};

const overview: Overview = {
  metrics: { skuCount: 1, unitsOnHand: 42, reservedUnits: 3, lowStockCount: 1, activeTransfers: 1 },
  lowStock: [{ ...item, onHand: 20, reserved: 3, available: 17 }],
  activity: [ledgerEntry],
};

const transfer: Transfer = {
  id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
  skuId: item.skuId,
  sku: item.sku,
  productName: item.name,
  fromLocationId: 'loc-central',
  fromLocationName: 'Central Market',
  toLocationId: 'loc-north',
  toLocationName: 'Northline Store',
  quantity: 3,
  status: 'in_transit',
  note: null,
  createdBy: 'Morgan Patel',
  createdAt: '2026-10-30T12:00:00.000Z',
  receivedAt: null,
};

const reservation: Reservation = {
  id: '782163f7-b8d3-4e18-8944-df558e3e9ab2',
  locationId: item.locationId,
  locationName: item.locationName,
  skuId: item.skuId,
  sku: item.sku,
  productName: item.name,
  quantity: 2,
  status: 'active',
  note: 'order hold',
  createdBy: 'Morgan Patel',
  createdAt: '2026-10-30T12:00:00.000Z',
};

function renderView(overrides: Partial<React.ComponentProps<typeof InventoryViews>> = {}) {
  const props: React.ComponentProps<typeof InventoryViews> = {
    view: 'overview',
    items: [item],
    overview,
    ledger: [ledgerEntry],
    transfers: [transfer],
    reservations: [reservation],
    categories: ['Grocery'],
    search: '',
    category: '',
    canUpdate: true,
    canManage: true,
    homeLocationId: 'loc-central',
    isLoading: false,
    error: null,
    onSearchChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onOpenOperation: vi.fn(),
    onReceiveTransfer: vi.fn(),
    onReleaseReservation: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <TestContentProvider>
        <InventoryViews {...props} />
      </TestContentProvider>,
    ),
    props,
  };
}

describe('InventoryViews', () => {
  it('renders overview metrics, low stock, activity, and count action', async () => {
    const user = userEvent.setup();
    const { props } = renderView();

    expect(screen.getByRole('heading', { name: 'Stock overview' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Low-stock watch')).toBeInTheDocument();
    expect(screen.getAllByText('House Blend Coffee')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Count House Blend Coffee' }));
    expect(props.onOpenOperation).toHaveBeenCalledWith('count', item.skuId);
  });

  it('renders searchable inventory and role-gated row actions', async () => {
    const user = userEvent.setup();
    const { props } = renderView({ view: 'inventory', canManage: false });

    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search SKU, barcode, or product' }), {
      target: { value: 'coffee' },
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'Grocery');
    await user.click(screen.getByRole('button', { name: 'Count House Blend Coffee at Central Market' }));
    await user.click(screen.getByRole('button', { name: 'Reserve House Blend Coffee at Central Market' }));

    expect(props.onSearchChange).toHaveBeenCalledWith('coffee');
    expect(props.onCategoryChange).toHaveBeenLastCalledWith('Grocery');
    expect(props.onOpenOperation).toHaveBeenNthCalledWith(1, 'count', item.skuId);
    expect(props.onOpenOperation).toHaveBeenNthCalledWith(2, 'reserve', item.skuId);
    expect(screen.queryByRole('button', { name: 'Adjust House Blend Coffee at Central Market' })).toBeNull();
  });

  it('shows an empty inventory result when filters match no rows', () => {
    renderView({ view: 'inventory', items: [] });
    expect(screen.getByText('No matching stock')).toBeInTheDocument();
  });

  it('receives an in-transit transfer only for an authorized destination', async () => {
    const user = userEvent.setup();
    const onReceiveTransfer = vi.fn();
    renderView({
      view: 'transfers',
      canManage: false,
      homeLocationId: 'loc-north',
      onReceiveTransfer,
    });

    await user.click(screen.getByRole('button', { name: 'Receive' }));
    expect(onReceiveTransfer).toHaveBeenCalledWith(transfer.id);
  });

  it('does not expose transfer receipt to an associate at another location', () => {
    renderView({ view: 'transfers', canManage: false, homeLocationId: 'loc-central' });
    expect(screen.queryByRole('button', { name: 'Receive' })).toBeNull();
  });

  it('releases the current reservation and renders an empty state when none remain', async () => {
    const user = userEvent.setup();
    const onReleaseReservation = vi.fn();
    const { rerender } = renderView({ view: 'reservations', onReleaseReservation });
    await user.click(screen.getByRole('button', { name: 'Release' }));
    expect(onReleaseReservation).toHaveBeenCalledWith(reservation.id);

    rerender(
      <TestContentProvider>
        <InventoryViews {...renderViewProps({ view: 'reservations', reservations: [] })} />
      </TestContentProvider>,
    );
    expect(screen.getByText('No active reservations')).toBeInTheDocument();
  });

  it('renders ledger movements and the empty ledger state', () => {
    const { rerender } = renderView({ view: 'ledger' });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Receipt')).toBeInTheDocument();

    rerender(
      <TestContentProvider>
        <InventoryViews {...renderViewProps({ view: 'ledger', ledger: [] })} />
      </TestContentProvider>,
    );
    expect(screen.getByText('Ledger is quiet')).toBeInTheDocument();
  });

  it('shows loading and error states and retries the active view', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = renderView({ isLoading: true, onRetry });
    expect(screen.getByText('Loading inventory data')).toBeInTheDocument();

    rerender(
      <TestContentProvider>
        <InventoryViews {...renderViewProps({ error: 'API offline', onRetry })} />
      </TestContentProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('API offline');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function renderViewProps(overrides: Partial<React.ComponentProps<typeof InventoryViews>> = {}) {
  return {
    view: 'overview' as StockView,
    items: [item],
    overview,
    ledger: [ledgerEntry],
    transfers: [transfer],
    reservations: [reservation],
    categories: ['Grocery'],
    search: '',
    category: '',
    canUpdate: true,
    canManage: true,
    homeLocationId: 'loc-central',
    isLoading: false,
    error: null,
    onSearchChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onOpenOperation: vi.fn<(action: StockActionKind, skuId?: string) => void>(),
    onReceiveTransfer: vi.fn(),
    onReleaseReservation: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}
