import type { InventoryItem, Location } from '../../api/client';
import { useContent } from '../../content-context';
import { dataStringAt, dataStringRecord } from '../../content-schema';
import type { StockActionKind } from './types';

export type ProductOption = Pick<InventoryItem, 'skuId' | 'sku' | 'name'>;

export function OperationLocationFields({
  action,
  locations,
  locationId,
  fromLocationId,
  toLocationId,
  onLocationChange,
  onFromLocationChange,
  onToLocationChange,
}: {
  action: StockActionKind;
  locations: Location[];
  locationId: string;
  fromLocationId: string;
  toLocationId: string;
  onLocationChange: (locationId: string) => void;
  onFromLocationChange: (locationId: string) => void;
  onToLocationChange: (locationId: string) => void;
}) {
  const { model, t } = useContent();
  const locationNames = dataStringRecord(model, 'locations');
  if (action !== 'transfer') {
    return (
      <div className="form-field">
        <label htmlFor="operation-location">{t('operation.location')}</label>
        <select
          className="form-control"
          id="operation-location"
          onChange={(event) => onLocationChange(event.target.value)}
          required
          value={locationId}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {locationNames[location.id]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="form-grid">
      <div className="form-field">
        <label htmlFor="from-location">{t('operation.fromLocation')}</label>
        <select
          className="form-control"
          id="from-location"
          onChange={(event) => onFromLocationChange(event.target.value)}
          required
          value={fromLocationId}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {locationNames[location.id]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="to-location">{t('operation.toLocation')}</label>
        <select
          className="form-control"
          id="to-location"
          onChange={(event) => onToLocationChange(event.target.value)}
          required
          value={toLocationId}
        >
          {locations
            .filter((location) => location.id !== fromLocationId)
            .map((location) => (
              <option key={location.id} value={location.id}>
                {locationNames[location.id]}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

export function ProductField({
  products,
  skuId,
  selectedItem,
  onSkuChange,
}: {
  products: ProductOption[];
  skuId: string;
  selectedItem: InventoryItem | undefined;
  onSkuChange: (skuId: string) => void;
}) {
  const { model, t } = useContent();
  const categories = dataStringRecord(model, 'categories');
  const units = dataStringRecord(model, 'units');
  return (
    <div className="form-field">
      <label htmlFor="operation-sku">{t('operation.product')}</label>
      <select
        autoFocus
        className="form-control"
        id="operation-sku"
        onChange={(event) => onSkuChange(event.target.value)}
        required
        value={skuId}
      >
        {products.map((product) => (
          <option key={product.skuId} value={product.skuId}>
            {t('operation.itemDetails', {
              sku: product.sku,
              name: dataStringAt(model, 'productLabels', product.sku, 'name'),
            })}
          </option>
        ))}
      </select>
      {selectedItem && (
        <p className="form-hint">
          {t('operation.itemHint', {
            category: categories[selectedItem.category],
            unit: units[selectedItem.unit],
          })}
        </p>
      )}
    </div>
  );
}

export function StockContext({
  action,
  selectedItem,
}: {
  action: StockActionKind;
  selectedItem: InventoryItem | undefined;
}) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  if (!selectedItem || !['count', 'reserve', 'transfer'].includes(action)) return null;
  return (
    <div className="stock-context">
      <span>{t('operation.currentStock', { location: locations[selectedItem.locationId] })}</span>
      <strong>
        {t('operation.availableOnHand', {
          available: new Intl.NumberFormat(model.locale).format(selectedItem.available),
          onHand: new Intl.NumberFormat(model.locale).format(selectedItem.onHand),
        })}
      </strong>
    </div>
  );
}

export function QuantityField({
  action,
  quantity,
  countedQuantity,
  countKey,
  onQuantityChange,
  onCountChange,
}: {
  action: StockActionKind;
  quantity: string;
  countedQuantity: string;
  countKey: string;
  onQuantityChange: (quantity: string) => void;
  onCountChange: (draft: { key: string; value: string }) => void;
}) {
  const { t } = useContent();
  if (action === 'count') {
    return (
      <div className="form-field">
        <label htmlFor="counted-quantity">{t('operation.countPhysical')}</label>
        <input
          className="form-control"
          id="counted-quantity"
          name="counted-quantity"
          max="100000"
          min="0"
          onChange={(event) => onCountChange({ key: countKey, value: event.target.value })}
          required
          step="1"
          type="number"
          value={countedQuantity}
        />
        <p className="form-hint">{t('operation.countVersionHint')}</p>
      </div>
    );
  }

  const isAdjustment = action === 'adjust';
  return (
    <div className="form-field">
      <label htmlFor="operation-quantity">
        {isAdjustment ? t('operation.adjustmentDelta') : t('operation.quantity')}
      </label>
      <input
        className="form-control"
        id="operation-quantity"
        name="operation-quantity"
        max="100000"
        min={isAdjustment ? '-100000' : '1'}
        onChange={(event) => onQuantityChange(event.target.value)}
        required
        step="1"
        type="number"
        value={quantity}
      />
      {isAdjustment && <p className="form-hint">{t('operation.positiveNegativeHint')}</p>}
    </div>
  );
}

export function NoteField({
  action,
  note,
  onNoteChange,
}: {
  action: StockActionKind;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const { t } = useContent();
  const supportsNote = ['receive', 'transfer', 'reserve', 'adjust'].includes(action);
  if (!supportsNote) return null;
  const isAdjustment = action === 'adjust';

  return (
    <div className="form-field">
      <label htmlFor="operation-note">
        {t('operation.referenceNote')}
        {isAdjustment ? '' : t('operation.optional')}
      </label>
      <textarea
        className="form-control"
        id="operation-note"
        name="operation-note"
        maxLength={180}
        minLength={isAdjustment ? 3 : undefined}
        onChange={(event) => onNoteChange(event.target.value)}
        required={isAdjustment}
        value={note}
      />
    </div>
  );
}

export function OperationFeedback({
  isLoadingItems,
  products,
  error,
}: {
  isLoadingItems: boolean;
  products: ProductOption[];
  error: string | null;
}) {
  const { t } = useContent();
  return (
    <>
      {isLoadingItems && (
        <p className="form-hint" role="status">
          {t('operation.loadingProducts')}
        </p>
      )}
      {!isLoadingItems && products.length === 0 && (
        <p className="dialog-error" role="alert">
          {t('operation.noProducts')}
        </p>
      )}
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
