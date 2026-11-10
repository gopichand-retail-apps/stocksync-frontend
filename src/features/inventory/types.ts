export type StockView = 'overview' | 'inventory' | 'transfers' | 'reservations' | 'ledger';

export type StockActionKind = 'receive' | 'transfer' | 'count' | 'reserve' | 'adjust';

export type StockOperation =
  | { type: 'receive'; locationId: string; skuId: string; quantity: number; note?: string }
  | {
      type: 'transfer';
      fromLocationId: string;
      toLocationId: string;
      skuId: string;
      quantity: number;
      note?: string;
    }
  | {
      type: 'count';
      locationId: string;
      skuId: string;
      expectedVersion: number;
      countedQuantity: number;
    }
  | { type: 'reserve'; locationId: string; skuId: string; quantity: number; note?: string }
  | { type: 'adjust'; locationId: string; skuId: string; delta: number; note: string }
  | { type: 'receive-transfer'; transferId: string }
  | { type: 'release-reservation'; reservationId: string };
