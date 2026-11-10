import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeftRight, Boxes, ClipboardCheck, PackageCheck, X, type LucideIcon } from 'lucide-react';
import type { InventoryItem, Location } from '../../api/client';
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

const actionDetailKeys: Record<StockActionKind, string> = {
  receive: 'receive',
  transfer: 'transfer',
  count: 'count',
  reserve: 'reserve',
  adjust: 'adjust',
};

type OperationDialogProps = {
  action: StockActionKind;
  locations: Location[];
  items: InventoryItem[];
  defaultLocationId: string;
  defaultSkuId?: string;
  isPending: boolean;
  isLoadingItems: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (operation: StockOperation) => void;
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

export function OperationDialog({
  action,
  locations,
  items,
  defaultLocationId,
  defaultSkuId,
  isPending,
  isLoadingItems,
  error,
  onClose,
  onSubmit,
}: OperationDialogProps) {
  const { t } = useContent();
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [fromLocationId, setFromLocationId] = useState(defaultLocationId);
  const [toLocationId, setToLocationId] = useState(
    locations.find((location) => location.id !== defaultLocationId)?.id ?? '',
  );
  const [skuId, setSkuId] = useState(defaultSkuId ?? items[0]?.skuId ?? '');
  const [quantity, setQuantity] = useState('1');
  const [countDraft, setCountDraft] = useState<{ key: string; value: string } | null>(null);
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
      if (event.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
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
  const countedQuantity = countDraft?.key === countKey ? countDraft.value : String(selectedItem?.onHand ?? 0);
  const Icon = actionIcons[action];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get('operation-quantity'));
    const countedAmount = Number(formData.get('counted-quantity'));
    const submittedNote = String(formData.get('operation-note') ?? '').trim();
    if (!selectedItem) return;
    switch (action) {
      case 'receive':
        onSubmit({ type: 'receive', locationId, skuId, quantity: amount, note: submittedNote || undefined });
        break;
      case 'transfer':
        onSubmit({
          type: 'transfer',
          fromLocationId,
          toLocationId,
          skuId,
          quantity: amount,
          note: submittedNote || undefined,
        });
        break;
      case 'count':
        onSubmit({
          type: 'count',
          locationId,
          skuId,
          expectedVersion: selectedItem.version,
          countedQuantity: countedAmount,
        });
        break;
      case 'reserve':
        onSubmit({ type: 'reserve', locationId, skuId, quantity: amount, note: submittedNote || undefined });
        break;
      case 'adjust':
        onSubmit({ type: 'adjust', locationId, skuId, delta: amount, note: submittedNote });
        break;
    }
  }

  function changeFromLocation(nextLocationId: string) {
    setFromLocationId(nextLocationId);
    if (nextLocationId === toLocationId) {
      setToLocationId(locations.find((location) => location.id !== nextLocationId)?.id ?? '');
    }
  }

  const actionKey = actionDetailKeys[action];

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
            <h2 id="operation-title">{t(`operation.action.${actionKey}.title`)}</h2>
            <p>{t(`operation.action.${actionKey}.description`)}</p>
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
        <form className="operation-form" onSubmit={handleSubmit}>
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
            countedQuantity={countedQuantity}
            onCountChange={setCountDraft}
            onQuantityChange={setQuantity}
            quantity={quantity}
          />
          <NoteField action={action} note={note} onNoteChange={setNote} />
          <OperationFeedback error={error} isLoadingItems={isLoadingItems} products={products} />
          <footer className="dialog-footer">
            <button className="button-secondary" onClick={onClose} type="button">
              {t('operation.cancel')}
            </button>
            <button
              className="button-primary"
              disabled={isPending || !selectedItem || (action === 'transfer' && !toLocationId)}
              type="submit"
            >
              {isPending ? t('operation.submitting') : t(`operation.action.${actionKey}.title`)}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
