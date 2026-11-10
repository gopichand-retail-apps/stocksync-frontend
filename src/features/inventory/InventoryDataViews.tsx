import {
  Activity,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type { InventoryItem, LedgerEntry, Overview } from '../../api/client';
import { useContent } from '../../content-context';
import { dataStringAt, dataStringRecord } from '../../content-schema';
import { EmptyState, ProductSwatch } from './InventoryViewPrimitives';
import { formatNumber, formatTime } from './inventory-view-format';
import type { StockActionKind } from './types';

type OperationHandler = (action: StockActionKind, skuId?: string) => void;

type OverviewContentProps = {
  overview?: Overview;
  ledger: LedgerEntry[];
  canUpdate: boolean;
  onOpenOperation: OperationHandler;
};

type InventoryTableProps = {
  items: InventoryItem[];
  canUpdate: boolean;
  canManage: boolean;
  onOpenOperation: OperationHandler;
};

function ActivityRows({ entries }: { entries: LedgerEntry[] }) {
  const { model, t } = useContent();
  const actorNames = dataStringRecord(model, 'actorNames');
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={21} />}
        title={t('overview.noMovementTitle')}
        detail={t('overview.noMovementDescription')}
      />
    );
  }
  return (
    <div className="activity-list">
      {entries.slice(0, 6).map((entry) => (
        <div className={`activity-row${entry.quantityDelta < 0 ? ' is-negative' : ''}`} key={entry.id}>
          <span className="activity-icon">
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
          <div className="activity-copy">
            <strong>{dataStringAt(model, 'productLabels', entry.sku, 'name')}</strong>
            <span>
              {t(`movement.${entry.movementType}`)} · {actorNames[entry.actorName]} ·{' '}
              {formatTime(entry.createdAt, model.locale, t('time.unavailable'))}
            </span>
          </div>
          <span className="activity-quantity">
            {entry.quantityDelta > 0 ? '+' : ''}
            {formatNumber(entry.quantityDelta, model.locale)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OverviewContent({ overview, ledger, canUpdate, onOpenOperation }: OverviewContentProps) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  const units = dataStringRecord(model, 'units');
  if (!overview) return null;
  const metrics = overview.metrics;
  const values = [
    { label: t('metric.unitsOnHand'), value: metrics.unitsOnHand, note: t('metric.unitsOnHandNote'), icon: Boxes },
    {
      label: t('metric.available'),
      value: metrics.unitsOnHand - metrics.reservedUnits,
      note: t('metric.availableNote'),
      icon: ShieldCheck,
    },
    {
      label: t('metric.lowStock'),
      value: metrics.lowStockCount,
      note: t('metric.lowStockNote'),
      icon: CircleAlert,
      alert: metrics.lowStockCount > 0,
    },
    { label: t('metric.transfers'), value: metrics.activeTransfers, note: t('metric.transfersNote'), icon: Truck },
  ];
  return (
    <>
      <div aria-label={t('overview.summary')} className="metric-grid">
        {values.map((metric) => {
          const Icon = metric.icon;
          return (
            <div className={`metric-cell${metric.alert ? ' is-alert' : ''}`} key={metric.label}>
              <div className="metric-head">
                <span>{metric.label}</span>
                <span className="metric-icon">
                  <Icon size={15} aria-hidden="true" />
                </span>
              </div>
              <strong className="metric-value">{formatNumber(metric.value, model.locale)}</strong>
              <span className="metric-note">{metric.note}</span>
            </div>
          );
        })}
      </div>
      <div className="overview-grid">
        <section aria-labelledby="low-stock-title" className="content-panel">
          <header className="panel-heading">
            <div>
              <h2 id="low-stock-title">{t('overview.lowStockTitle')}</h2>
              <p>{t('overview.lowStockDescription')}</p>
            </div>
            <span className="panel-meta">{t('overview.itemCount', { count: overview.lowStock.length })}</span>
          </header>
          {overview.lowStock.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={21} />}
              title={t('overview.allClearTitle')}
              detail={t('overview.allClearDescription')}
            />
          ) : (
            <div className="low-stock-list">
              {overview.lowStock.map((item) => (
                <div className="low-stock-row" key={`${item.locationId}-${item.skuId}`}>
                  <div className="product-line">
                    <ProductSwatch item={item} />
                    <div className="product-copy">
                      <strong>{dataStringAt(model, 'productLabels', item.sku, 'name')}</strong>
                      <span>
                        {item.sku} · {locations[item.locationId]}
                      </span>
                    </div>
                  </div>
                  <div className="low-stock-quantity">
                    <span>
                      {formatNumber(item.onHand, model.locale)} / {formatNumber(item.threshold, model.locale)}{' '}
                      {units[item.unit]}
                    </span>
                    {canUpdate && (
                      <button
                        aria-label={t('inventory.countProduct', {
                          name: dataStringAt(model, 'productLabels', item.sku, 'name'),
                        })}
                        className="button-quiet"
                        onClick={() => onOpenOperation('count', item.skuId)}
                        type="button"
                      >
                        {t('inventory.count')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section aria-labelledby="movement-title" className="content-panel">
          <header className="panel-heading">
            <div>
              <h2 id="movement-title">{t('overview.latestMovement')}</h2>
              <p>{t('overview.latestMovementDescription')}</p>
            </div>
            <span className="panel-meta">
              <Clock3 size={12} aria-hidden="true" /> {t('overview.updatedLive')}
            </span>
          </header>
          <ActivityRows entries={overview.activity.length > 0 ? overview.activity : ledger} />
        </section>
      </div>
    </>
  );
}

function StockStatus({ item }: { item: InventoryItem }) {
  const { t } = useContent();
  const low = item.onHand <= item.threshold;
  return (
    <span className={`stock-status${low ? ' is-low' : ''}`}>
      {low ? <CircleAlert size={11} /> : <CheckCircle2 size={11} />}
      {low ? t('inventory.lowStock') : t('inventory.healthy')}
    </span>
  );
}

export function InventoryTable({ items, canUpdate, canManage, onOpenOperation }: InventoryTableProps) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  const units = dataStringRecord(model, 'units');
  if (items.length === 0)
    return (
      <EmptyState
        icon={<Search size={20} />}
        title={t('inventory.noMatchesTitle')}
        detail={t('inventory.noMatchesDescription')}
      />
    );
  return (
    <div className="table-frame">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('inventory.column.product')}</th>
            <th scope="col">{t('inventory.column.location')}</th>
            <th scope="col">{t('inventory.column.onHand')}</th>
            <th scope="col">{t('inventory.column.reserved')}</th>
            <th scope="col">{t('inventory.column.available')}</th>
            <th scope="col">{t('inventory.column.status')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('inventory.column.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const percent = Math.min(100, Math.round((item.available / Math.max(item.threshold * 2, 1)) * 100));
            const low = item.onHand <= item.threshold;
            return (
              <tr key={`${item.locationId}-${item.skuId}`}>
                <td>
                  <div className="table-product">
                    <ProductSwatch item={item} />
                    <div>
                      <strong>{dataStringAt(model, 'productLabels', item.sku, 'name')}</strong>
                      <span>
                        {item.sku} · {item.barcode}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  {item.locationCode} · {locations[item.locationId]}
                </td>
                <td className="numeric-cell">
                  {formatNumber(item.onHand, model.locale)} {units[item.unit]}
                </td>
                <td className="numeric-cell">{formatNumber(item.reserved, model.locale)}</td>
                <td className="available-cell">
                  <div className="availability-label">
                    <strong>{formatNumber(item.available, model.locale)}</strong>
                    <span>{t('inventory.threshold', { count: formatNumber(item.threshold, model.locale) })}</span>
                  </div>
                  <div
                    aria-label={t('inventory.availableUnits', { count: formatNumber(item.available, model.locale) })}
                    className={`stock-meter${low ? ' is-low' : ''}`}
                    role="img"
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </td>
                <td>
                  <StockStatus item={item} />
                </td>
                <td>
                  <div className="row-actions">
                    {canUpdate && (
                      <button
                        aria-label={t('inventory.countAtLocation', {
                          name: dataStringAt(model, 'productLabels', item.sku, 'name'),
                          location: locations[item.locationId],
                        })}
                        className="button-quiet"
                        onClick={() => onOpenOperation('count', item.skuId)}
                        type="button"
                      >
                        {t('inventory.count')}
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        aria-label={t('inventory.reserveAtLocation', {
                          name: dataStringAt(model, 'productLabels', item.sku, 'name'),
                          location: locations[item.locationId],
                        })}
                        className="button-quiet"
                        onClick={() => onOpenOperation('reserve', item.skuId)}
                        type="button"
                      >
                        {t('inventory.reserve')}
                      </button>
                    )}
                    {canManage && (
                      <button
                        aria-label={t('inventory.adjustAtLocation', {
                          name: dataStringAt(model, 'productLabels', item.sku, 'name'),
                          location: locations[item.locationId],
                        })}
                        className="button-quiet"
                        onClick={() => onOpenOperation('adjust', item.skuId)}
                        type="button"
                      >
                        {t('inventory.adjust')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
