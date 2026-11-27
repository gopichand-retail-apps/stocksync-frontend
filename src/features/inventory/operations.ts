import { api, ApiClientError, type ReceiptInput, type StockWriteOptions } from '../../api/client';
import type { StockOperation } from './types';

export async function confirmReceipt(input: ReceiptInput, options: StockWriteOptions) {
  const receipt = await api.receiveStock(input, options);
  if (
    receipt.movementType !== 'receipt' ||
    receipt.quantity <= 0 ||
    receipt.skuId !== input.skuId ||
    receipt.locationId !== input.locationId ||
    receipt.quantity !== input.quantity
  ) {
    throw new ApiClientError('The response does not confirm the submitted receipt', 'INVALID_RESPONSE');
  }
  return receipt;
}

export async function executeStockOperation(
  operation: StockOperation,
  ...options: [write?: StockWriteOptions]
): Promise<unknown> {
  switch (operation.type) {
    case 'transfer':
      return api.createTransfer(
        {
          fromLocationId: operation.fromLocationId,
          toLocationId: operation.toLocationId,
          skuId: operation.skuId,
          quantity: operation.quantity,
          note: operation.note,
        },
        ...options,
      );
    case 'count':
      return api.reconcileCount(
        {
          locationId: operation.locationId,
          skuId: operation.skuId,
          expectedVersion: operation.expectedVersion,
          countedQuantity: operation.countedQuantity,
        },
        ...options,
      );
    case 'reserve':
      return api.reserveStock(
        {
          locationId: operation.locationId,
          skuId: operation.skuId,
          quantity: operation.quantity,
          note: operation.note,
        },
        ...options,
      );
    case 'adjust':
      return api.adjustStock(
        {
          locationId: operation.locationId,
          skuId: operation.skuId,
          delta: operation.delta,
          note: operation.note,
        },
        ...options,
      );
    case 'receive-transfer':
      return api.receiveTransfer(operation.transferId);
    case 'release-reservation':
      return api.releaseReservation(operation.reservationId);
  }
}

export function getOperationNotice(operation: StockOperation, translate: (key: string) => string): string {
  switch (operation.type) {
    case 'transfer':
      return translate('notice.transfer');
    case 'count':
      return translate('notice.count');
    case 'reserve':
      return translate('notice.reserve');
    case 'adjust':
      return translate('notice.adjust');
    case 'receive-transfer':
      return translate('notice.receiveTransfer');
    case 'release-reservation':
      return translate('notice.releaseReservation');
  }
}
