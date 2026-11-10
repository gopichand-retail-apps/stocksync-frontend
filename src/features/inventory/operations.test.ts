import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { StockOperation } from './types';
import { executeStockOperation, getOperationNotice } from './operations';

afterEach(() => vi.restoreAllMocks());

const noticeCases: Array<[StockOperation, string]> = [
  [{ type: 'receive', locationId: 'loc-central', skuId: 'sku-soap', quantity: 1 }, 'notice.receive'],
  [
    {
      type: 'transfer',
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      skuId: 'sku-soap',
      quantity: 1,
    },
    'notice.transfer',
  ],
  [
    { type: 'count', locationId: 'loc-central', skuId: 'sku-soap', expectedVersion: 1, countedQuantity: 1 },
    'notice.count',
  ],
  [{ type: 'reserve', locationId: 'loc-central', skuId: 'sku-soap', quantity: 1 }, 'notice.reserve'],
  [{ type: 'adjust', locationId: 'loc-central', skuId: 'sku-soap', delta: 1, note: 'correction' }, 'notice.adjust'],
  [{ type: 'receive-transfer', transferId: '682163f7-b8d3-4e18-8944-df558e3e9ab2' }, 'notice.receiveTransfer'],
  [{ type: 'release-reservation', reservationId: '782163f7-b8d3-4e18-8944-df558e3e9ab2' }, 'notice.releaseReservation'],
];

describe('executeStockOperation request contracts', () => {
  it('omits the UI discriminator from a receipt request', async () => {
    const receipt = vi.spyOn(api, 'receiveStock').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-soap',
      quantity: 1,
      onHand: 10,
      version: 2,
      movementType: 'receipt',
    });

    await executeStockOperation({
      type: 'receive',
      locationId: 'loc-central',
      skuId: 'sku-soap',
      quantity: 1,
      note: 'delivery',
    });

    expect(receipt).toHaveBeenCalledOnce();
    expect(receipt).toHaveBeenCalledWith({
      locationId: 'loc-central',
      skuId: 'sku-soap',
      quantity: 1,
      note: 'delivery',
    });
  });

  it('sends only the transfer contract fields', async () => {
    const transfer = vi.spyOn(api, 'createTransfer').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      skuId: 'sku-coffee',
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      quantity: 2,
      status: 'in_transit',
      fromOnHand: 40,
      version: 2,
    });

    await executeStockOperation({
      type: 'transfer',
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 2,
      note: 'replenishment',
    });

    expect(transfer).toHaveBeenCalledWith({
      fromLocationId: 'loc-central',
      toLocationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 2,
      note: 'replenishment',
    });
  });

  it('sends only the cycle-count contract fields', async () => {
    const count = vi.spyOn(api, 'reconcileCount').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedQuantity: 40,
      countedQuantity: 39,
      variance: -1,
      version: 3,
    });

    await executeStockOperation({
      type: 'count',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedVersion: 2,
      countedQuantity: 39,
    });

    expect(count).toHaveBeenCalledWith({
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      expectedVersion: 2,
      countedQuantity: 39,
    });
  });

  it('sends only the reservation contract fields', async () => {
    const reservation = vi.spyOn(api, 'reserveStock').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 2,
      status: 'active',
      available: 38,
      version: 2,
    });

    await executeStockOperation({
      type: 'reserve',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 2,
      note: 'order hold',
    });

    expect(reservation).toHaveBeenCalledWith({
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: 2,
      note: 'order hold',
    });
  });

  it('sends only the adjustment contract fields', async () => {
    const adjustment = vi.spyOn(api, 'adjustStock').mockResolvedValue({
      id: '682163f7-b8d3-4e18-8944-df558e3e9ab2',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      quantity: -1,
      onHand: 38,
      version: 3,
      movementType: 'manual_adjustment',
    });

    await executeStockOperation({
      type: 'adjust',
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      delta: -1,
      note: 'cycle count correction',
    });

    expect(adjustment).toHaveBeenCalledWith({
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      delta: -1,
      note: 'cycle count correction',
    });
  });

  it('routes transfer receipt and reservation release actions', async () => {
    const transferId = '682163f7-b8d3-4e18-8944-df558e3e9ab2';
    const reservationId = '782163f7-b8d3-4e18-8944-df558e3e9ab2';
    const transferReceipt = vi.spyOn(api, 'receiveTransfer').mockResolvedValue({
      id: transferId,
      locationId: 'loc-north',
      skuId: 'sku-coffee',
      quantity: 2,
      status: 'received',
      onHand: 19,
      version: 2,
    });
    const reservationRelease = vi.spyOn(api, 'releaseReservation').mockResolvedValue({
      id: reservationId,
      locationId: 'loc-central',
      skuId: 'sku-coffee',
      status: 'released',
      version: 3,
    });

    await executeStockOperation({ type: 'receive-transfer', transferId });
    await executeStockOperation({ type: 'release-reservation', reservationId });

    expect(transferReceipt).toHaveBeenCalledWith(transferId);
    expect(reservationRelease).toHaveBeenCalledWith(reservationId);
  });

  it.each(noticeCases)('maps every stock operation to its content key', (operation, expectedKey) => {
    expect(getOperationNotice(operation, (key) => key)).toBe(expectedKey);
  });
});
