import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, type InventoryItem, type Location, type ReceiptResult } from '../../api/client';
import { TestContentProvider } from '../../test/contentProvider';
import { OperationDialog } from './OperationDialog';
import type { StockActionKind, StockOperation } from './types';

const locations: Location[] = [
  { id: 'loc-central', code: 'CTR-01', name: 'Central Market', region: 'Bay Area' },
  { id: 'loc-north', code: 'NTH-02', name: 'Northline Store', region: 'North Bay' },
];

const inventoryItem: InventoryItem = {
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

function renderDialog(action: StockActionKind, overrides: Partial<React.ComponentProps<typeof OperationDialog>> = {}) {
  const props: React.ComponentProps<typeof OperationDialog> = {
    action,
    locations,
    items: [inventoryItem],
    defaultLocationId: 'loc-central',
    isPending: false,
    isLoadingItems: false,
    error: null,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onReceiptRecorded: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <TestContentProvider>
        <OperationDialog {...props} />
      </TestContentProvider>,
    ),
    props,
  };
}

describe('OperationDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('submits a stock receipt with only server contract fields', async () => {
    const received = {
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 5,
      onHand: 47,
      version: 5,
      movementType: 'receipt',
    };
    const receive = vi.spyOn(api, 'receiveStock').mockResolvedValue(received);
    const user = userEvent.setup();
    const { props } = renderDialog('receive');
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '5');
    expect(quantity).toHaveValue(5);
    await user.type(screen.getByLabelText('Reference note (optional)'), 'delivery');
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));

    expect(receive).toHaveBeenCalledWith(
      { locationId: 'loc-central', skuId: 'sku-coffee', quantity: 5, note: 'delivery' },
      { idempotencyKey: expect.any(String), signal: expect.any(AbortSignal) },
    );
    expect(props.onReceiptRecorded).toHaveBeenCalledWith(received);
  });

  it.each([
    new TypeError('Network connection lost'),
    new ApiClientError('server failure', 'INTERNAL_ERROR', undefined, 503),
    new ApiClientError('timeout', 'REQUEST_TIMEOUT', undefined, 408),
    new ApiClientError('unreadable reply', 'INVALID_RESPONSE'),
  ])('retries an ambiguous receipt with the same in-memory key', async (failure) => {
    const receive = vi.spyOn(api, 'receiveStock').mockRejectedValue(failure);
    const user = userEvent.setup();
    renderDialog('receive');

    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Awaiting confirmation');
    await user.click(screen.getByRole('button', { name: 'Retry receipt' }));
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[1]?.[0]).toEqual(receive.mock.calls[0]?.[0]);
    expect(receive.mock.calls[1]?.[1].idempotencyKey).toBe(receive.mock.calls[0]?.[1].idempotencyKey);
  });

  it.each([
    ['ROLE_NOT_ALLOWED', 403, 'The selected role cannot perform this action.'],
    ['UNRECOGNIZED', 409, 'The receipt request was rejected.'],
  ])('shows a safe rejection after a definitive HTTP failure', async (code, status, message) => {
    vi.spyOn(api, 'receiveStock').mockRejectedValue(new ApiClientError('private details', code, undefined, status));
    const user = userEvent.setup();
    renderDialog('receive');

    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent('private details');
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeEnabled();
  });

  it.each([
    ['Quantity', '2'],
    ['Product', 'sku-soap'],
    ['Location', 'loc-north'],
    ['Reference note (optional)', 'another delivery'],
  ])('discards an unresolved key when %s changes', async (label, value) => {
    const receive = vi.spyOn(api, 'receiveStock').mockRejectedValue(new TypeError('Network failure'));
    const user = userEvent.setup();
    renderDialog('receive', {
      items: [
        inventoryItem,
        { ...inventoryItem, skuId: 'sku-soap', sku: 'HOM-0812' },
        { ...inventoryItem, locationId: 'loc-north', locationName: 'Northline Store' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    expect(await screen.findByText('Awaiting confirmation')).toBeVisible();
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[1]?.[1].idempotencyKey).not.toBe(receive.mock.calls[0]?.[1].idempotencyKey);
  });

  it('blocks duplicate submission while saving and releases the same key after the deadline', async () => {
    vi.useFakeTimers();
    const receive = vi.spyOn(api, 'receiveStock').mockImplementation(
      (_input, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const { unmount, props } = renderDialog('receive');
    const form = screen.getByRole('button', { name: 'Receive stock' }).closest('form');
    if (!form) throw new Error('The receipt submit button must belong to the receipt form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(receive).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true');
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting confirmation');
    fireEvent.submit(form);
    expect(receive.mock.calls[1]?.[1].idempotencyKey).toBe(receive.mock.calls[0]?.[1].idempotencyKey);
    unmount();
    expect(receive.mock.calls[1]?.[1].signal.aborted).toBe(true);
    expect(props.onReceiptRecorded).not.toHaveBeenCalled();
  });

  it('ignores a confirmation that arrives after its form was abandoned', async () => {
    const deferred: { resolve?: (receipt: ReceiptResult) => void } = {};
    const reply = new Promise<ReceiptResult>((resolve) => {
      deferred.resolve = resolve;
    });
    vi.spyOn(api, 'receiveStock').mockReturnValue(reply);
    const user = userEvent.setup();
    const { props, unmount } = renderDialog('receive');

    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    unmount();
    await act(async () => {
      if (!deferred.resolve) throw new Error('The receipt promise resolver is missing');
      deferred.resolve({
        id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
        locationId: 'loc-central',
        skuId: 'sku-coffee',
        quantity: 1,
        onHand: 43,
        version: 5,
        movementType: 'receipt',
      });
      await reply;
    });
    expect(props.onReceiptRecorded).not.toHaveBeenCalled();
  });

  it('requires distinct source and destination locations for transfers', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog('transfer');

    await user.selectOptions(screen.getByLabelText('To location'), 'loc-north');
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '3');
    expect(quantity).toHaveValue(3);
    await user.click(screen.getByRole('button', { name: 'Create transfer' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      type: 'transfer',
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 3,
      note: undefined,
    });
  });

  it('preloads the physical count and submits the current inventory version', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog('count');
    const countField = screen.getByLabelText('Physical count');

    expect(countField).toHaveValue(42);
    await user.clear(countField);
    await user.type(countField, '40');
    await user.click(screen.getByRole('button', { name: 'Reconcile cycle count' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      type: 'count',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedVersion: 4,
      countedQuantity: 40,
    });
  });

  it('submits a reservation with an optional reference note', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog('reserve');
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '2');
    expect(quantity).toHaveValue(2);
    await user.click(screen.getByRole('button', { name: 'Reserve stock' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      type: 'reserve',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 2,
      note: undefined,
    });
  });

  it('requires an audit note for adjustments and restores focus on Escape', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const props = {
      action: 'adjust' as const,
      locations,
      items: [inventoryItem],
      defaultLocationId: 'loc-central',
      isPending: false,
      isLoadingItems: false,
      error: null,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
      onReceiptRecorded: vi.fn(),
    };
    render(
      <TestContentProvider>
        <OperationDialog {...props} />
      </TestContentProvider>,
    );

    await user.clear(screen.getByLabelText('Adjustment delta'));
    await user.type(screen.getByLabelText('Adjustment delta'), '-1');
    await user.type(screen.getByLabelText('Reference note'), 'count correction');
    expect(screen.getByLabelText('Adjustment delta')).toHaveValue(-1);
    expect(screen.getByLabelText('Reference note')).toHaveValue('count correction');
    await user.click(screen.getByRole('button', { name: 'Adjust stock' }));

    expect(props.onSubmit).toHaveBeenCalledWith({
      type: 'adjust',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      delta: -1,
      note: 'count correction',
    } satisfies StockOperation);
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledOnce();
    opener.remove();
  });

  it('shows loading and empty-catalog feedback and disables submission', () => {
    renderDialog('receive', { items: [], isLoadingItems: true });

    expect(screen.getByRole('status')).toHaveTextContent('Loading product catalog');
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeDisabled();
  });

  it('shows an empty catalog error when loading finishes without products', () => {
    renderDialog('receive', { items: [], isLoadingItems: false });

    expect(screen.getByRole('alert')).toHaveTextContent('No inventory products are available');
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeDisabled();
  });

  it('shows operation errors and prevents a transfer to the source location', async () => {
    const user = userEvent.setup();
    renderDialog('transfer', { error: 'There is not enough available stock' });

    expect(screen.getByRole('alert')).toHaveTextContent('There is not enough available stock');
    await user.selectOptions(screen.getByLabelText('From location'), 'loc-north');
    expect(screen.getByLabelText('To location')).toHaveValue('loc-central');
  });

  it('traps keyboard focus and restores the opener when the dialog closes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderDialog('receive');
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    if (!first || !last) throw new Error('The operation dialog must have focusable controls');

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('does not submit an operation when the selected product is unavailable', () => {
    const { props } = renderDialog('receive', { defaultSkuId: 'sku-unavailable' });
    const form = screen.getByRole('dialog').querySelector('form');
    if (!form) throw new Error('The operation dialog must contain a form');

    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeDisabled();
    fireEvent.submit(form);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('disables transfers when there is no distinct destination location', () => {
    renderDialog('transfer', { locations: locations.slice(0, 1) });

    expect(screen.getByRole('button', { name: 'Create transfer' })).toBeDisabled();
  });
});
