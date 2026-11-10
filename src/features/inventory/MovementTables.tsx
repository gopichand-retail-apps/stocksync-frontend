import { Activity, ArrowLeftRight, ArrowUpRight, Package, ShieldCheck, Truck } from 'lucide-react';
import type { LedgerEntry, Reservation, Transfer } from '../../api/client';
import { useContent } from '../../content-context';
import { dataStringAt, dataStringRecord } from '../../content-schema';
import { EmptyState } from './InventoryViewPrimitives';
import { formatNumber, formatTime } from './inventory-view-format';

type TransferTableProps = {
  transfers: Transfer[];
  canUpdate: boolean;
  canManage: boolean;
  homeLocationId: string;
  onReceiveTransfer: (transferId: string) => void;
};

type ReservationTableProps = {
  reservations: Reservation[];
  canUpdate: boolean;
  canManage: boolean;
  homeLocationId: string;
  onReleaseReservation: (reservationId: string) => void;
};

export function TransferTable({
  transfers,
  canUpdate,
  canManage,
  homeLocationId,
  onReceiveTransfer,
}: TransferTableProps) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  if (transfers.length === 0)
    return (
      <EmptyState
        icon={<ArrowLeftRight size={21} />}
        title={t('transfers.noTransfersTitle')}
        detail={t('transfers.noTransfersDescription')}
      />
    );
  return (
    <div className="table-frame">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('inventory.column.product')}</th>
            <th scope="col">{t('transfers.column.route')}</th>
            <th scope="col">{t('transfers.column.quantity')}</th>
            <th scope="col">{t('transfers.column.created')}</th>
            <th scope="col">{t('transfers.column.status')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('inventory.column.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => {
            const canReceive =
              canUpdate && transfer.status === 'in_transit' && (canManage || transfer.toLocationId === homeLocationId);
            const statusClass =
              transfer.status === 'received' ? ' is-complete' : transfer.status === 'cancelled' ? ' is-cancelled' : '';
            return (
              <tr key={transfer.id}>
                <td>
                  <div className="table-product">
                    <span aria-hidden="true" className="product-swatch">
                      <Truck size={15} />
                    </span>
                    <div>
                      <strong>{dataStringAt(model, 'productLabels', transfer.sku, 'name')}</strong>
                      <span>{transfer.sku}</span>
                    </div>
                  </div>
                </td>
                <td>
                  {locations[transfer.fromLocationId]} <ArrowLeftRight size={12} aria-hidden="true" />{' '}
                  {locations[transfer.toLocationId]}
                </td>
                <td className="numeric-cell">{formatNumber(transfer.quantity, model.locale)}</td>
                <td>{formatTime(transfer.createdAt, model.locale, t('time.unavailable'))}</td>
                <td>
                  <span className={`status-pill${statusClass}`}>{t(`transfers.status.${transfer.status}`)}</span>
                </td>
                <td>
                  {canReceive && (
                    <button className="button-quiet" onClick={() => onReceiveTransfer(transfer.id)} type="button">
                      {t('transfers.receive')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReservationTable({
  reservations,
  canUpdate,
  canManage,
  homeLocationId,
  onReleaseReservation,
}: ReservationTableProps) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  if (reservations.length === 0)
    return (
      <EmptyState
        icon={<ShieldCheck size={21} />}
        title={t('reservations.noActiveTitle')}
        detail={t('reservations.noActiveDescription')}
      />
    );
  return (
    <div className="table-frame">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('inventory.column.product')}</th>
            <th scope="col">{t('inventory.column.location')}</th>
            <th scope="col">{t('reservations.column.reserved')}</th>
            <th scope="col">{t('reservations.column.reference')}</th>
            <th scope="col">{t('transfers.column.created')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('inventory.column.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((reservation) => {
            const canRelease = canUpdate && (canManage || reservation.locationId === homeLocationId);
            return (
              <tr key={reservation.id}>
                <td>
                  <div className="table-product">
                    <span aria-hidden="true" className="product-swatch">
                      <ShieldCheck size={15} />
                    </span>
                    <div>
                      <strong>{dataStringAt(model, 'productLabels', reservation.sku, 'name')}</strong>
                      <span>{reservation.sku}</span>
                    </div>
                  </div>
                </td>
                <td>{locations[reservation.locationId]}</td>
                <td className="numeric-cell">{formatNumber(reservation.quantity, model.locale)}</td>
                <td className="table-note">{reservation.note || '—'}</td>
                <td>{formatTime(reservation.createdAt, model.locale, t('time.unavailable'))}</td>
                <td>
                  {canRelease && (
                    <button
                      className="button-danger-quiet"
                      onClick={() => onReleaseReservation(reservation.id)}
                      type="button"
                    >
                      {t('reservations.release')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  const actorNames = dataStringRecord(model, 'actorNames');
  if (entries.length === 0)
    return (
      <EmptyState
        icon={<Activity size={21} />}
        title={t('ledger.noEntriesTitle')}
        detail={t('ledger.noEntriesDescription')}
      />
    );
  return (
    <div className="table-frame">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('ledger.column.movement')}</th>
            <th scope="col">{t('inventory.column.product')}</th>
            <th scope="col">{t('inventory.column.location')}</th>
            <th scope="col">{t('ledger.column.change')}</th>
            <th scope="col">{t('ledger.column.reference')}</th>
            <th scope="col">{t('ledger.column.actor')}</th>
            <th scope="col">{t('ledger.column.recorded')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <span className="ledger-type">
                  <ArrowUpRight size={12} aria-hidden="true" />
                  {t(`movement.${entry.movementType}`)}
                </span>
              </td>
              <td>
                <div className="table-product">
                  <span aria-hidden="true" className="product-swatch">
                    <Package size={15} />
                  </span>
                  <div>
                    <strong>{dataStringAt(model, 'productLabels', entry.sku, 'name')}</strong>
                    <span>{entry.sku}</span>
                  </div>
                </div>
              </td>
              <td>{locations[entry.locationId]}</td>
              <td>
                <span className={`ledger-delta ${entry.quantityDelta >= 0 ? 'is-positive' : 'is-negative'}`}>
                  {entry.quantityDelta > 0 ? '+' : ''}
                  {formatNumber(entry.quantityDelta, model.locale)}
                </span>
              </td>
              <td className="table-note">{entry.note || entry.referenceId || '—'}</td>
              <td>{actorNames[entry.actorName]}</td>
              <td>{formatTime(entry.createdAt, model.locale, t('time.unavailable'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
