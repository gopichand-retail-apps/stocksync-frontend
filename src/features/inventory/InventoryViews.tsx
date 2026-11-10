import { ArrowDownToLine, CircleAlert, Clock3, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { InventoryItem, LedgerEntry, Overview, Reservation, Transfer } from '../../api/client';
import { useContent } from '../../content-context';
import { dataStringRecord } from '../../content-schema';
import { InventoryTable, OverviewContent } from './InventoryDataViews';
import { LedgerTable, ReservationTable, TransferTable } from './MovementTables';
import type { StockActionKind, StockView } from './types';

const viewDetails: Record<StockView, { titleKey: string; descriptionKey: string; eyebrowKey: string }> = {
  overview: {
    titleKey: 'page.title.overview',
    descriptionKey: 'page.description.overview',
    eyebrowKey: 'page.eyebrow.overview',
  },
  inventory: {
    titleKey: 'page.title.inventory',
    descriptionKey: 'page.description.inventory',
    eyebrowKey: 'page.eyebrow.inventory',
  },
  transfers: {
    titleKey: 'page.title.transfers',
    descriptionKey: 'page.description.transfers',
    eyebrowKey: 'page.eyebrow.transfers',
  },
  reservations: {
    titleKey: 'page.title.reservations',
    descriptionKey: 'page.description.reservations',
    eyebrowKey: 'page.eyebrow.reservations',
  },
  ledger: {
    titleKey: 'page.title.ledger',
    descriptionKey: 'page.description.ledger',
    eyebrowKey: 'page.eyebrow.ledger',
  },
};

type InventoryViewsProps = {
  view: StockView;
  items: InventoryItem[];
  overview?: Overview;
  ledger: LedgerEntry[];
  transfers: Transfer[];
  reservations: Reservation[];
  categories: string[];
  search: string;
  category: string;
  canUpdate: boolean;
  canManage: boolean;
  homeLocationId: string;
  isLoading: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onOpenOperation: (action: StockActionKind, skuId?: string) => void;
  onReceiveTransfer: (transferId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onRetry: () => void;
};

function PageActions({
  view,
  canUpdate,
  canManage,
  onOpenOperation,
}: Pick<InventoryViewsProps, 'view' | 'canUpdate' | 'canManage' | 'onOpenOperation'>) {
  const { t } = useContent();
  const canReceive = (view === 'overview' || view === 'inventory') && canUpdate;
  const canTransfer = view === 'transfers' && canManage;

  return (
    <div className="page-actions">
      {canTransfer && (
        <button className="button-primary" onClick={() => onOpenOperation('transfer')} type="button">
          <Plus size={14} /> {t('inventory.newTransfer')}
        </button>
      )}
      {canReceive && (
        <button className="button-primary" onClick={() => onOpenOperation('receive')} type="button">
          <ArrowDownToLine size={14} /> {t('inventory.receive')}
        </button>
      )}
    </div>
  );
}

function InventoryListView(props: InventoryViewsProps) {
  const { model, t } = useContent();
  const categories = dataStringRecord(model, 'categories');
  return (
    <>
      <div className="table-toolbar">
        <div className="table-filters">
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">{t('inventory.search')}</span>
            <input
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder={t('inventory.search')}
              type="search"
              value={props.search}
            />
          </label>
          <label>
            <span className="visually-hidden">{t('inventory.categoryFilter')}</span>
            <select
              className="filter-select"
              onChange={(event) => props.onCategoryChange(event.target.value)}
              value={props.category}
            >
              <option value="">{t('inventory.allCategories')}</option>
              {props.categories.map((value) => (
                <option key={value} value={value}>
                  {categories[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="result-count">{t('inventory.stockRecordCount', { count: props.items.length })}</span>
      </div>
      <InventoryTable
        canManage={props.canManage}
        canUpdate={props.canUpdate}
        items={props.items}
        onOpenOperation={props.onOpenOperation}
      />
    </>
  );
}

function viewContent(props: InventoryViewsProps) {
  switch (props.view) {
    case 'overview':
      return <OverviewContent {...props} />;
    case 'inventory':
      return <InventoryListView {...props} />;
    case 'transfers':
      return (
        <TransferTable
          canManage={props.canManage}
          canUpdate={props.canUpdate}
          homeLocationId={props.homeLocationId}
          onReceiveTransfer={props.onReceiveTransfer}
          transfers={props.transfers}
        />
      );
    case 'reservations':
      return (
        <ReservationTable
          canManage={props.canManage}
          canUpdate={props.canUpdate}
          homeLocationId={props.homeLocationId}
          onReleaseReservation={props.onReleaseReservation}
          reservations={props.reservations}
        />
      );
    case 'ledger':
      return <LedgerTable entries={props.ledger} />;
  }
}

function ViewError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useContent();
  if (!error) return null;
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={17} aria-hidden="true" />
      <div>
        <strong>{t('inventory.refreshError')}</strong>
        <span>{error}</span>
      </div>
      <button className="button-secondary" onClick={onRetry} type="button">
        <RefreshCw size={13} /> {t('inventory.retry')}
      </button>
    </div>
  );
}

function LoadingState() {
  const { t } = useContent();
  return (
    <div className="loading-state" role="status">
      <RefreshCw className="spinner" size={18} />
      <strong>{t('inventory.loadingTitle')}</strong>
      <span>{t('inventory.loadingDescription')}</span>
    </div>
  );
}

export function InventoryViews(props: InventoryViewsProps) {
  const { t } = useContent();
  const details = viewDetails[props.view];
  const content = props.isLoading ? <LoadingState /> : viewContent(props);

  return (
    <div className="workspace-content">
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">{t(details.eyebrowKey)}</p>
          <h1>{t(details.titleKey)}</h1>
          <p>{t(details.descriptionKey)}</p>
        </div>
        <PageActions
          canManage={props.canManage}
          canUpdate={props.canUpdate}
          onOpenOperation={props.onOpenOperation}
          view={props.view}
        />
      </header>
      <ViewError error={props.error} onRetry={props.onRetry} />
      {content}
      <footer className="workspace-footer">
        <span>
          <ShieldCheck size={12} aria-hidden="true" /> {t('inventory.serverNote')}
        </span>
        <span>
          <Clock3 size={12} aria-hidden="true" /> {t('inventory.refreshNote')}
        </span>
      </footer>
    </div>
  );
}
