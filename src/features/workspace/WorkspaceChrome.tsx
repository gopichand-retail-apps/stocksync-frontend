import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Gauge,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Warehouse,
  X,
} from 'lucide-react';
import type { Location, User } from '../../api/client';
import { APP_VERSION } from '../../app-version';
import { useContent } from '../../content-context';
import { dataStringRecord } from '../../content-schema';
import type { StockView } from '../inventory/types';

const navigation: Array<{ id: StockView; key: string; icon: typeof Gauge }> = [
  { id: 'overview', key: 'navigation.overview', icon: Gauge },
  { id: 'inventory', key: 'navigation.inventory', icon: Boxes },
  { id: 'transfers', key: 'navigation.transfers', icon: ArrowLeftRight },
  { id: 'reservations', key: 'navigation.reservations', icon: ShieldCheck },
  { id: 'ledger', key: 'navigation.ledger', icon: ClipboardList },
];

function avatarInitials(displayName: string): string {
  return displayName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

type WorkspaceSidebarProps = {
  user: User;
  view: StockView;
  sidebarOpen: boolean;
  activeLocation?: Location;
  activeTransfers: number;
  apiVersion?: string;
  isLogoutPending: boolean;
  onSelectView: (view: StockView) => void;
  onClose: () => void;
  onLogout: () => void;
};

export function WorkspaceSidebar({
  user,
  view,
  sidebarOpen,
  activeLocation,
  activeTransfers,
  apiVersion,
  isLogoutPending,
  onSelectView,
  onClose,
  onLogout,
}: WorkspaceSidebarProps) {
  const { model, t } = useContent();
  const locations = dataStringRecord(model, 'locations');
  const userNames = dataStringRecord(model, 'userNames');
  const displayName = userNames[user.id];
  if (!displayName) throw new Error(`CONTENT_USER_MISSING:${user.id}`);
  return (
    <>
      {sidebarOpen && (
        <button aria-label={t('app.closeNavigation')} className="mobile-scrim" onClick={onClose} type="button" />
      )}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark">
            <Boxes size={19} aria-hidden="true" />
          </span>
          <div>
            <span className="brand-name">{t('app.name')}</span>
            <span className="brand-caption">{t('app.caption')}</span>
          </div>
        </div>
        <div className="sidebar-location">
          <Warehouse size={16} aria-hidden="true" />
          <div>
            <strong>{activeLocation ? locations[activeLocation.id] : t('app.loadingLocations')}</strong>
            <span>{activeLocation?.code ?? t('app.locationWorkspace')}</span>
          </div>
        </div>
        <p className="sidebar-label">{t('app.workspace')}</p>
        <nav aria-label={t('navigation.primary')} className="side-nav">
          {navigation.map(({ id, key, icon: Icon }) => (
            <button
              aria-current={view === id ? 'page' : undefined}
              className="nav-item"
              key={id}
              onClick={() => onSelectView(id)}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(key)}</span>
              {id === 'transfers' && activeTransfers > 0 && <span className="nav-count">{activeTransfers}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="environment-note">
          <span className="environment-dot" /> {t('app.synthetic')}
        </div>
        <div className="user-card">
          <span aria-hidden="true" className="user-avatar">
            {avatarInitials(displayName)}
          </span>
          <div className="user-info">
            <small>{t('app.versionLabel', { version: APP_VERSION })}</small>
            {apiVersion ? <small>{t('app.apiVersionLabel', { version: apiVersion })}</small> : null}
            <strong>{displayName}</strong>
            <span>{t(`role.${user.role}`)}</span>
          </div>
          <button
            aria-label={t('app.signOut')}
            className="logout-button"
            disabled={isLogoutPending}
            onClick={onLogout}
            title={t('app.signOut')}
            type="button"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}

type WorkspaceTopbarProps = {
  user: User;
  locations: Location[];
  locationId: string;
  sidebarOpen: boolean;
  realtimeConnected: boolean;
  isRefreshing: boolean;
  onToggleSidebar: () => void;
  onLocationChange: (locationId: string) => void;
  onRefresh: () => void;
};

export function WorkspaceTopbar({
  user,
  locations,
  locationId,
  sidebarOpen,
  realtimeConnected,
  isRefreshing,
  onToggleSidebar,
  onLocationChange,
  onRefresh,
}: WorkspaceTopbarProps) {
  const { model, t } = useContent();
  const locationNames = dataStringRecord(model, 'locations');
  return (
    <header className="topbar">
      <div className="topbar-start">
        <button
          aria-label={sidebarOpen ? t('app.closeNavigation') : t('app.openNavigation')}
          className="icon-button mobile-menu-button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? t('app.closeNavigation') : t('app.openNavigation')}
          type="button"
        >
          {sidebarOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
        </button>
        <div className="workspace-kicker">
          {t('app.name')} <span>/</span>
          <strong>{t('app.workspace')}</strong>
        </div>
      </div>
      <div className="topbar-end">
        <span className={`live-status${realtimeConnected ? '' : ' is-polling'}`} role="status">
          <span className="live-dot" />
          {realtimeConnected ? t('app.connected') : t('app.polling')}
        </span>
        {user.role !== 'associate' && (
          <label className="location-control">
            <MapPin size={14} aria-hidden="true" />
            <span className="visually-hidden">{t('role.select')}</span>
            <select
              aria-label={t('role.select')}
              onChange={(event) => onLocationChange(event.target.value)}
              value={locationId}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {locationNames[location.id]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          aria-label={t('app.refresh')}
          className="icon-button"
          disabled={isRefreshing}
          onClick={onRefresh}
          title={t('app.refresh')}
          type="button"
        >
          <RefreshCw className={isRefreshing ? 'spinner' : ''} size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
