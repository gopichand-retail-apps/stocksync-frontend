import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { WifiOff, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { api, apiSocketOrigin, ApiClientError, type ReceiptResult, type User } from '../../api/client';
import { useContent } from '../../content-context';
import { dataStringRecord } from '../../content-schema';
import { InventoryViews } from '../inventory/InventoryViews';
import { OperationDialog } from '../inventory/OperationDialog';
import { executeStockOperation, getOperationNotice } from '../inventory/operations';
import type { StockActionKind, StockOperation, StockView } from '../inventory/types';
import { WorkspaceSidebar, WorkspaceTopbar } from './WorkspaceChrome';

type AuthenticatedWorkspaceProps = {
  user: User;
};

function locationForUser(user: User, preference: string): string {
  if (user.role === 'associate') return user.homeLocationId;
  return preference || user.homeLocationId;
}

function optionalError(
  error: unknown,
  translate: (key: string) => string,
  messages: Record<string, string>,
): string | null {
  if (!error) return null;
  if (error instanceof ApiClientError) {
    const key = `errors.${error.code}`;
    return Object.hasOwn(messages, key) ? translate(key) : translate('errors.requestFailed');
  }
  return translate('errors.requestFailed');
}

function refreshStockViews(queryClient: QueryClient) {
  return Promise.all(
    ['inventory', 'overview', 'ledger', 'transfers', 'reservations'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

function ReceiptMovementLink({
  receipt,
  onOpen,
}: {
  receipt: ReceiptResult | null;
  onOpen: (receipt: ReceiptResult) => void;
}) {
  const { t } = useContent();
  if (!receipt) return null;
  return (
    <a
      className="receipt-ledger-link"
      href={`#movement-${receipt.id}`}
      onClick={(event) => {
        event.preventDefault();
        onOpen(receipt);
      }}
    >
      {t('operation.receipt.viewMovement')}
    </a>
  );
}

export function AuthenticatedWorkspace({ user }: AuthenticatedWorkspaceProps) {
  const { model, t } = useContent();
  const queryClient = useQueryClient();
  const apiVersionQuery = useQuery({
    queryKey: ['api-version'],
    queryFn: api.getVersion,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [view, setView] = useState<StockView>('overview');
  const [locationPreference, setLocationPreference] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState('');
  const [action, setAction] = useState<StockActionKind | null>(null);
  const [preselectedSkuId, setPreselectedSkuId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [recordedReceipt, setRecordedReceipt] = useState<ReceiptResult | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const ledgerFocusRef = useRef<string | null>(null);

  const locationId = locationForUser(user, locationPreference);
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: api.listLocations });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', locationId, deferredSearch, category],
    queryFn: () =>
      api.listInventory({
        locationId,
        search: deferredSearch.trim() || undefined,
        category: category || undefined,
      }),
    refetchInterval: 30_000,
  });
  const catalogQuery = useQuery({
    queryKey: ['inventory-catalog'],
    queryFn: () => api.listInventory(),
  });
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: api.listCategories });
  const overviewQuery = useQuery({
    queryKey: ['overview', locationId],
    queryFn: () => api.getOverview(locationId),
    refetchInterval: 30_000,
  });
  const ledgerQuery = useQuery({
    queryKey: ['ledger', locationId],
    queryFn: () => api.listLedger(locationId),
    refetchInterval: 30_000,
  });
  const transfersQuery = useQuery({
    queryKey: ['transfers'],
    queryFn: api.listTransfers,
    refetchInterval: 30_000,
  });
  const reservationsQuery = useQuery({
    queryKey: ['reservations', locationId],
    queryFn: () => api.listReservations(locationId),
    refetchInterval: 30_000,
  });
  const currentQuery = {
    overview: overviewQuery,
    inventory: inventoryQuery,
    transfers: transfersQuery,
    reservations: reservationsQuery,
    ledger: ledgerQuery,
  }[view];

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const operationMutation = useMutation({
    mutationFn: (operation: StockOperation) => executeStockOperation(operation),
    onSuccess: async (_result, operation) => {
      await refreshStockViews(queryClient);
      setRecordedReceipt(null);
      setNotice(getOperationNotice(operation, t));
      setAction(null);
      setPreselectedSkuId(undefined);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      queryClient.setQueryData(['session'], { user: null, csrfToken: null });
      setLocationPreference('');
      setSearch('');
      setCategory('');
      setAction(null);
      setNotice('');
      setRecordedReceipt(null);
    },
  });

  useEffect(() => {
    const socketOrigin = apiSocketOrigin();
    const socket = socketOrigin
      ? io(socketOrigin, { path: '/socket.io', withCredentials: true })
      : io({ path: '/socket.io', withCredentials: true });
    socket.on('connect', () => setRealtimeConnected(true));
    socket.on('disconnect', () => setRealtimeConnected(false));
    socket.on('connect_error', () => setRealtimeConnected(false));
    socket.on('inventory.updated', () => {
      void refreshStockViews(queryClient);
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient, user.id]);

  useEffect(() => {
    if (action) return;
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [action]);

  useEffect(() => {
    if (view !== 'ledger' || !ledgerFocusRef.current) return;
    const movement = document.getElementById(ledgerFocusRef.current);
    if (!movement) return;
    movement.focus();
    ledgerFocusRef.current = null;
  }, [view, locationId, ledgerQuery.data, recordedReceipt]);

  function confirmReceipt(receipt: ReceiptResult) {
    const location =
      dataStringRecord(model, 'locations')[receipt.locationId] ?? t('operation.receipt.selectedLocation');
    setNotice(t('operation.receipt.recorded', { quantity: receipt.quantity, location }));
    setRecordedReceipt(receipt);
    setAction(null);
    setPreselectedSkuId(undefined);
    void refreshStockViews(queryClient);
  }

  const locations = locationsQuery.data ?? [];
  const activeLocation = locations.find((location) => location.id === locationId);
  const canUpdate = user.role !== 'auditor';
  const canManage = user.role === 'inventory_manager';
  const isRefreshing = [inventoryQuery, overviewQuery, ledgerQuery, transfersQuery, reservationsQuery].some(
    (query) => query.isFetching,
  );
  const contentError = optionalError(currentQuery.error, t, model.messages);
  const requestError = optionalError(operationMutation.error, t, model.messages);

  function openOperation(nextAction: StockActionKind, skuId?: string) {
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setPreselectedSkuId(skuId);
    setAction(nextAction);
    if (nextAction === 'receive') {
      setNotice('');
      setRecordedReceipt(null);
    }
    operationMutation.reset();
  }

  function selectView(nextView: StockView) {
    ledgerFocusRef.current = null;
    setView(nextView);
    setSidebarOpen(false);
    setNotice('');
    setRecordedReceipt(null);
  }

  function openReceiptMovement(receipt: ReceiptResult) {
    selectView('ledger');
    setLocationPreference(receipt.locationId);
    ledgerFocusRef.current = `movement-${receipt.id}`;
  }

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        activeLocation={activeLocation}
        activeTransfers={overviewQuery.data?.metrics.activeTransfers ?? 0}
        apiVersion={apiVersionQuery.data?.version}
        isLogoutPending={logoutMutation.isPending}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => {
          if (action === 'receive') setAction(null);
          logoutMutation.mutate();
        }}
        onSelectView={selectView}
        sidebarOpen={sidebarOpen}
        user={user}
        view={view}
      />
      <div className="main-column">
        <WorkspaceTopbar
          isRefreshing={isRefreshing}
          locationId={locationId}
          locations={locations}
          onLocationChange={setLocationPreference}
          onRefresh={() => {
            void currentQuery.refetch();
          }}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          realtimeConnected={realtimeConnected}
          sidebarOpen={sidebarOpen}
          user={user}
        />
        <main>
          {offline && (
            <div className="notice-bar is-offline" role="status">
              <WifiOff size={16} aria-hidden="true" />
              <span>{t('app.offlineNotice')}</span>
            </div>
          )}
          {notice && (
            <div className="notice-bar" role="status">
              <span>
                {notice}
                <ReceiptMovementLink receipt={recordedReceipt} onOpen={openReceiptMovement} />
              </span>
              <button aria-label={t('app.dismiss')} onClick={() => setNotice('')} type="button">
                <X size={14} />
              </button>
            </div>
          )}
          {requestError && (
            <div className="notice-bar is-error" role="alert">
              <span>{requestError}</span>
              <button aria-label={t('app.dismiss')} onClick={() => operationMutation.reset()} type="button">
                <X size={14} />
              </button>
            </div>
          )}
          <InventoryViews
            canManage={canManage}
            canUpdate={canUpdate}
            categories={categoriesQuery.data ?? []}
            category={category}
            error={contentError}
            homeLocationId={user.homeLocationId}
            isLoading={currentQuery.isPending}
            items={inventoryQuery.data ?? []}
            ledger={ledgerQuery.data ?? []}
            onCategoryChange={setCategory}
            onOpenOperation={openOperation}
            onReceiveTransfer={(transferId) => operationMutation.mutate({ type: 'receive-transfer', transferId })}
            onReleaseReservation={(reservationId) =>
              operationMutation.mutate({ type: 'release-reservation', reservationId })
            }
            onRetry={() => {
              void currentQuery.refetch();
            }}
            onSearchChange={setSearch}
            overview={overviewQuery.data}
            reservations={reservationsQuery.data ?? []}
            search={search}
            transfers={transfersQuery.data ?? []}
            view={view}
          />
        </main>
      </div>
      {action && (
        <OperationDialog
          action={action}
          defaultLocationId={locationId}
          defaultSkuId={preselectedSkuId}
          error={requestError}
          isLoadingItems={catalogQuery.isPending}
          isPending={operationMutation.isPending}
          items={catalogQuery.data ?? []}
          locations={locations}
          onClose={() => setAction(null)}
          onReceiptRecorded={confirmReceipt}
          onSubmit={(operation) => operationMutation.mutate(operation)}
        />
      )}
    </div>
  );
}
