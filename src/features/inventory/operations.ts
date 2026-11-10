import { api } from '../../api/client';
import type { StockOperation } from './types';

export async function executeStockOperation(operation: StockOperation): Promise<unknown> {
  switch (operation.type) {
    case 'receive':
      return api.receiveStock({
        locationId: operation.locationId,
        skuId: operation.skuId,
        quantity: operation.quantity,
        note: operation.note,
      });
    case 'transfer':
      return api.createTransfer({
        fromLocationId: operation.fromLocationId,
        toLocationId: operation.toLocationId,
        skuId: operation.skuId,
        quantity: operation.quantity,
        note: operation.note,
      });
    case 'count':
      return api.reconcileCount({
        locationId: operation.locationId,
        skuId: operation.skuId,
        expectedVersion: operation.expectedVersion,
        countedQuantity: operation.countedQuantity,
      });
    case 'reserve':
      return api.reserveStock({
        locationId: operation.locationId,
        skuId: operation.skuId,
        quantity: operation.quantity,
        note: operation.note,
      });
    case 'adjust':
      return api.adjustStock({
        locationId: operation.locationId,
        skuId: operation.skuId,
        delta: operation.delta,
        note: operation.note,
      });
    case 'receive-transfer':
      return api.receiveTransfer(operation.transferId);
    case 'release-reservation':
      return api.releaseReservation(operation.reservationId);
  }
}

export function getOperationNotice(operation: StockOperation, translate: (key: string) => string): string {
  switch (operation.type) {
    case 'receive':
      return translate('notice.receive');
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
