import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeftRight, Boxes, ClipboardCheck, PackageCheck, X, type LucideIcon } from 'lucide-react';
import type { InventoryItem, Location, ReceiptResult, StockWriteOptions } from '../../api/client';
import { useContent } from '../../content-context';
import type { StockActionKind, StockOperation } from './types';
import {
  NoteField,
  OperationFeedback,
  OperationLocationFields,
  ProductField,
  QuantityField,
  StockContext,
} from './OperationFields';
import { confirmReceipt } from './operations';
import { ReceiptLedgerPreview } from './ReceiptLedgerPreview';
import { useStockWrite } from './useStockWrite';

type OperationDialogProps = {
  action: StockActionKind;
  locations: Location[];
  items: InventoryItem[];
  defaultLocationId: string;
  defaultSkuId?: string;
  isLoadingItems: boolean;
  isRefreshingCatalog: boolean;
  catalogRefreshFailed: boolean;
  onClose: () => void;
  onRefreshCatalog: () => void;
  onSubmit: (operation: StockOperation, options: StockWriteOptions) => Promise<unknown> | void;
  onOperationRecorded: (operation: StockOperation) => void;
  onReceiptRecorded: (receipt: ReceiptResult) => void;
};

const actionIcons: Record<StockActionKind, LucideIcon> = {
  receive: ArrowDownToLine,
  transfer: ArrowLeftRight,
  count: ClipboardCheck,
  reserve: Boxes,
  adjust: PackageCheck,
};

function captureActiveElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function OperationFooter({
  action,
  hasSelectedItem,
  isAwaiting,
  isBlocked,
  isSubmitting,
  toLocationId,
  onClose,
}: {
  action: StockActionKind;
  hasSelectedItem: boolean;
  isAwaiting: boolean;
  isBlocked: boolean;
  isSubmitting: boolean;
  toLocationId: string;
  onClose: () => void;
}) {
  const { t } = useContent();
  const submitKey = isSubmitting
    ? 'operation.submitting'
    : isAwaiting
      ? retryKey(action)
      : `operation.action.${action}.title`;
  return (
    <footer className="dialog-footer">
      <button className="button-secondary" onClick={onClose} type="button">
        {t('operation.cancel')}
      </button>
      <button
        aria-disabled={isSubmitting || undefined}
        className="button-primary"
        disabled={isBlocked || !hasSelectedItem || (action === 'transfer' && !toLocationId)}
        type="submit"
      >
        {t(submitKey)}
      </button>
    </footer>
  );
}

function retryKey(action: StockActionKind) {
  return action === 'receive' ? 'operation.receipt.retry' : 'operation.retry';
}

function WriteRecovery({ action, locationId }: { action: StockActionKind; locationId: string }) {
  const { t } = useContent();
  return (
    <div className="receipt-recovery">
      <div role="status">
        <strong>{t('operation.receipt.awaiting')}</strong>
        <p>{t(action === 'receive' ? 'operation.receipt.recovery' : 'operation.writeRecovery')}</p>
      </div>
      {action === 'receive' && <ReceiptLedgerPreview locationId={locationId} />}
    </div>
  );
}

function wrapDialogFocus(event: KeyboardEvent, dialog: HTMLElement) {
  const controls = dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary',
  );
  const focusable = Array.from(controls).filter((control) => !control.closest('fieldset[disabled]'));
  const first = focusable[0];
  const last = focusable.at(-1);
  const focused = document.activeElement;
  if (event.shiftKey && (focused === first || focused === dialog)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && focused === last) {
    event.preventDefault();
    first?.focus();
  }
}

function useCountEntry({
  countKey,
  item,
  isRefreshing,
  refreshFailed,
}: {
  countKey: string;
  item?: InventoryItem;
  isRefreshing?: boolean;
  refreshFailed?: boolean;
}) {
  const [draft, setDraft] = useState<{ key: string; value: string; version: number }>();
  const [recountKey, setRecountKey] = useState<string>();
  const currentDraft = draft?.key === countKey ? draft : undefined;
  const needsRecount = recountKey === countKey;

  return {
    value: currentDraft?.value ?? String(item?.onHand ?? 0),
    version: currentDraft?.version ?? item?.version,
    refreshing: Boolean(isRefreshing) && (needsRecount || !currentDraft),
    refreshFailed: needsRecount && Boolean(refreshFailed),
    requireRecount(version: number) {
      setRecountKey(countKey);
      setDraft({ key: countKey, value: '', version });
    },
    rememberSubmitted(value: number, version: number) {
      setDraft({ key: countKey, value: String(value), version });
    },
    change(next: { key: string; value: string }) {
      if (!item) return;
      const version = needsRecount ? item.version : (currentDraft?.version ?? item.version);
      setDraft({ ...next, version });
      setRecountKey(undefined);
    },
  };
}

function stockOperation(
  fields: {
    action: Exclude<StockActionKind, 'receive'>;
    locationId: string;
    fromLocationId: string;
    toLocationId: string;
    skuId: string;
    version: number;
  },
  form: FormData,
): StockOperation {
  const { action, locationId, skuId } = fields;
  const amount = Number(form.get('operation-quantity'));
  const note = String(form.get('operation-note') ?? '').trim();
  switch (action) {
    case 'transfer':
      return {
        type: action,
        fromLocationId: fields.fromLocationId,
        toLocationId: fields.toLocationId,
        skuId,
        quantity: amount,
        note: note || undefined,
      };
    case 'count':
      return {
        type: action,
        locationId,
        skuId,
        expectedVersion: fields.version,
        countedQuantity: Number(form.get('counted-quantity')),
      };
    case 'reserve':
      return { type: action, locationId, skuId, quantity: amount, note: note || undefined };
    case 'adjust':
      return { type: action, locationId, skuId, delta: amount, note };
  }
}

export function OperationDialog({
  action,
  locations,
  items,
  defaultLocationId,
  defaultSkuId,
  isLoadingItems,
  isRefreshingCatalog,
  catalogRefreshFailed,
  onClose,
  onRefreshCatalog,
  onSubmit,
  onOperationRecorded,
  onReceiptRecorded,
}: OperationDialogProps) {
  const { t } = useContent();
  const write = useStockWrite(action === 'receive');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [fromLocationId, setFromLocationId] = useState(defaultLocationId);
  const [toLocationId, setToLocationId] = useState(
    locations.find((location) => location.id !== defaultLocationId)?.id ?? '',
  );
  const [skuId, setSkuId] = useState(defaultSkuId ?? items[0]?.skuId ?? '');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(captureActiveElement());

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = previousFocusRef.current;
    dialog.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === 'Tab') wrapDialogFocus(event, dialog);
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const products = Array.from(
    new Map(items.map((item) => [item.skuId, { skuId: item.skuId, sku: item.sku, name: item.name }])).values(),
  );
  const stockLocationId = action === 'transfer' ? fromLocationId : locationId;
  const selectedItem = items.find((item) => item.locationId === stockLocationId && item.skuId === skuId);
  const countKey = `${stockLocationId}:${skuId}`;
  const count = useCountEntry({
    countKey,
    item: selectedItem,
    isRefreshing: action === 'count' && isRefreshingCatalog,
    refreshFailed: catalogRefreshFailed,
  });
  const countBlocked = count.refreshing || count.refreshFailed;
  const Icon = actionIcons[action];

  function submitOperation(operation: StockOperation) {
    if (operation.type === 'count') {
      count.rememberSubmitted(operation.countedQuantity, operation.expectedVersion);
    }
    void write.submit({
      input: operation,
      execute: onSubmit,
      onConfirmed: () => onOperationRecorded(operation),
      onRejected: (code) => {
        if (operation.type !== 'count' || code !== 'COUNT_STALE') return;
        count.requireRecount(operation.expectedVersion);
        onRefreshCatalog();
      },
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem || write.isSubmitting || countBlocked) return;
    const form = new FormData(event.currentTarget);
    if (action === 'receive') {
      const note = String(form.get('operation-note') ?? '').trim();
      void write.submit({
        input: { locationId, skuId, quantity: Number(form.get('operation-quantity')), note: note || undefined },
        execute: confirmReceipt,
        onConfirmed: onReceiptRecorded,
      });
      return;
    }
    if (action === 'count' && !count.value) return;
    submitOperation(
      stockOperation(
        { action, locationId, fromLocationId, toLocationId, skuId, version: count.version ?? selectedItem.version },
        form,
      ),
    );
  }

  function changeFromLocation(nextLocationId: string) {
    setFromLocationId(nextLocationId);
    if (nextLocationId === toLocationId) {
      setToLocationId(locations.find((location) => location.id !== nextLocationId)?.id ?? '');
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="operation-title"
        aria-modal="true"
        className="operation-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div className="dialog-mark">
            <Icon size={18} aria-hidden="true" />
          </div>
          <div className="dialog-title-copy">
            <h2 id="operation-title">{t(`operation.action.${action}.title`)}</h2>
            <p>{t(`operation.action.${action}.description`)}</p>
          </div>
          <button
            aria-label={t('operation.close')}
            className="icon-button dialog-close"
            onClick={onClose}
            title={t('operation.close')}
            type="button"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <form className="operation-form" onSubmit={handleSubmit} onChangeCapture={write.resetIntent}>
          <fieldset className="operation-form operation-fields" disabled={write.isSubmitting || countBlocked}>
            <OperationLocationFields
              action={action}
              fromLocationId={fromLocationId}
              locations={locations}
              locationId={locationId}
              onFromLocationChange={changeFromLocation}
              onLocationChange={setLocationId}
              onToLocationChange={setToLocationId}
              toLocationId={toLocationId}
            />
            <ProductField products={products} onSkuChange={setSkuId} selectedItem={selectedItem} skuId={skuId} />
            <StockContext action={action} selectedItem={selectedItem} />
            <QuantityField
              action={action}
              countKey={countKey}
              countedQuantity={count.value}
              onCountChange={count.change}
              onQuantityChange={setQuantity}
              quantity={quantity}
            />
            <NoteField action={action} note={note} onNoteChange={setNote} />
          </fieldset>
          {write.isUnconfirmed && <WriteRecovery action={action} locationId={locationId} />}
          {count.refreshFailed && (
            <button className="button-secondary" onClick={onRefreshCatalog} type="button">
              {t('operation.refreshCount')}
            </button>
          )}
          <OperationFeedback error={write.error} isLoadingItems={isLoadingItems} products={products} />
          <OperationFooter
            action={action}
            hasSelectedItem={Boolean(selectedItem)}
            isAwaiting={write.isUnconfirmed}
            isBlocked={countBlocked}
            isSubmitting={write.isSubmitting}
            onClose={onClose}
            toLocationId={toLocationId}
          />
        </form>
      </section>
    </div>
  );
}
