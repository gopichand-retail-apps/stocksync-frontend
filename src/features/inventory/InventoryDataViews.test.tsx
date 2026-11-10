import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, LedgerEntry, Overview } from '../../api/client';
import { TestContentProvider } from '../../test/contentProvider';
import { InventoryTable, OverviewContent } from './InventoryDataViews';

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
  id: 'ledger-negative',
  locationId: item.locationId,
  locationName: item.locationName,
  skuId: item.skuId,
  sku: item.sku,
  productName: item.name,
  movementType: 'manual_adjustment',
  quantityDelta: -1,
  referenceId: 'adjustment-1',
  note: 'count correction',
  actorName: 'Morgan Patel',
  createdAt: '2026-10-30T12:00:00.000Z',
};

const emptyOverview: Overview = {
  metrics: { skuCount: 0, unitsOnHand: 0, reservedUnits: 0, lowStockCount: 0, activeTransfers: 0 },
  lowStock: [],
  activity: [],
};

function renderWithContent(element: ReactNode) {
  return render(<TestContentProvider>{element}</TestContentProvider>);
}

afterEach(cleanup);

describe('inventory data views', () => {
  it('renders no overview when the service has not returned summary data', () => {
    const { container } = renderWithContent(
      <OverviewContent canUpdate={false} ledger={[]} onOpenOperation={vi.fn()} overview={undefined} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows clear and no-movement states for an empty location', () => {
    renderWithContent(
      <OverviewContent canUpdate={false} ledger={[]} onOpenOperation={vi.fn()} overview={emptyOverview} />,
    );

    expect(screen.getByText('All clear at this location')).toBeInTheDocument();
    expect(screen.getByText('No stock movement yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Count House Blend Coffee' })).toBeNull();
  });

  it('uses recent ledger activity when the overview has none and exposes permitted counts', async () => {
    const user = userEvent.setup();
    const onOpenOperation = vi.fn();
    const overview: Overview = {
      ...emptyOverview,
      lowStock: [{ ...item, onHand: 2, available: 1 }],
    };
    renderWithContent(
      <OverviewContent canUpdate ledger={[entry]} onOpenOperation={onOpenOperation} overview={overview} />,
    );

    expect(screen.getAllByText('House Blend Coffee')).toHaveLength(2);
    expect(screen.getByText('-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Count House Blend Coffee' }));
    expect(onOpenOperation).toHaveBeenCalledWith('count', item.skuId);
  });

  it('renders low-stock status without row actions for a read-only user', () => {
    renderWithContent(
      <InventoryTable
        canManage={false}
        canUpdate={false}
        items={[{ ...item, onHand: 0, reserved: 0, available: 0, threshold: 0 }]}
        onOpenOperation={vi.fn()}
      />,
    );

    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: '0 available units' })).toBeInTheDocument();
  });
});
