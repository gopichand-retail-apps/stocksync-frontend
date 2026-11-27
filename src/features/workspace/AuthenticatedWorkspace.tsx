import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { skipToken, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { WifiOff, X } from 'lucide-react';
import { io } from 'socket.io-client';
import {
  api,
  apiSocketOrigin,
  ApiClientError,
  type LedgerEntry,
  type ReceiptResult,
  type User,
} from '../../api/client';
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
    ['inventory', 'inventory-catalog', 'overview', 'ledger', 'transfers', 'reservations'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

function includeMovement(entries: LedgerEntry[] = [], movement?: LedgerEntry) {
  if (!movement || entries.some((entry) => entry.id === movement.id)) return entries;
  return [movement, ...entries];
}

function useLinkedMovement(receipt: ReceiptResult | null) {
  return useQuery({
    queryKey: ['ledger-movement', receipt?.id],
    queryFn: receipt
      ? async ({ signal }) => {
          const entry = await api.getLedgerMovement(receipt.id, signal);
          if (entry.id !== receipt.id || entry.locationId !== receipt.locationId) {
            throw new ApiClientError('The ledger response does not match the linked movement', 'INVALID_RESPONSE');
          }
          return entry;
        }
      : skipToken,
    networkMode: 'always',
    retry: false,
  });
}

function MovementLookupStatus({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useContent();
  if (loading)
    return (
      <p className="notice-bar" role="status">
        {t('operation.receipt.loadingLedger')}
      </p>
    );
  if (!failed) return null;
  return (
    <div className="notice-bar is-error" role="alert">
      <span>{t('operation.receipt.movementUnavailable')}</span>
      <button className="receipt-lookup-retry" onClick={onRetry} type="button">
        {t('operation.receipt.retryLookup')}
      </button>
    </div>
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
  const [dialog, setDialog] = useState<{ id: number; action: StockActionKind; skuId?: string } | null>(null);
  const dialogSequence = useRef(0);
  const [notice, setNotice] = useState('');
  const [recordedReceipt, setRecordedReceipt] = useState<ReceiptResult | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [linkedReceipt, setLinkedReceipt] = useState<ReceiptResult | null>(null);
  const focusedMovement = useRef<string | null>(null);

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
  const linkedMovement = useLinkedMovement(linkedReceipt);
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
    mutationFn: ({ operation }: { operation: StockOperation; generation: number }) => executeStockOperation(operation),
    onSuccess: (_result, { operation, generation }) => {
      void refreshStockViews(queryClient);
      if (generation !== dialogSequence.current) return;
      setRecordedReceipt(null);
      setNotice(getOperationNotice(operation, t));
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
    if (dialog) return;
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [dialog]);

  useEffect(() => {
    const id = linkedMovement.data?.id;
    if (view !== 'ledger' || !id || focusedMovement.current === id) return;
    const movement = document.getElementById(`movement-${id}`);
    if (movement) {
      movement.focus();
      focusedMovement.current = id;
    }
  }, [view, linkedMovement.data, ledgerQuery.data, ledgerQuery.isPending]);

  function closeDialog() {
    dialogSequence.current += 1;
    setDialog(null);
  }

  function recordReceipt(dialogId: number, receipt: ReceiptResult) {
    void refreshStockViews(queryClient);
    if (dialogId !== dialogSequence.current) return;
    const location =
      dataStringRecord(model, 'locations')[receipt.locationId] ?? t('operation.receipt.selectedLocation');
    setNotice(t('operation.receipt.recorded', { quantity: receipt.quantity, location }));
    setRecordedReceipt(receipt);
    closeDialog();
  }

  function recordOperation(dialogId: number, operation: StockOperation) {
    void refreshStockViews(queryClient);
    if (dialogId !== dialogSequence.current) return;
    setRecordedReceipt(null);
    setNotice(getOperationNotice(operation, t));
    closeDialog();
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
    const id = ++dialogSequence.current;
    setDialog({ id, action: nextAction, skuId });
    if (nextAction === 'count') void catalogQuery.refetch();
    if (nextAction === 'receive') {
      setNotice('');
      setRecordedReceipt(null);
    }
    operationMutation.reset();
  }

  function selectView(nextView: StockView) {
    setLinkedReceipt(null);
    focusedMovement.current = null;
    setView(nextView);
    setSidebarOpen(false);
    setNotice('');
    setRecordedReceipt(null);
  }

  function openReceiptMovement(receipt: ReceiptResult) {
    selectView('ledger');
    setLocationPreference(receipt.locationId);
    setLinkedReceipt(receipt);
  }

  function runRowOperation(operation: StockOperation) {
    if (dialog) return;
    operationMutation.mutate({ operation, generation: dialogSequence.current });
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
          closeDialog();
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
          onLocationChange={(location) => {
            setLinkedReceipt(null);
            setLocationPreference(location);
          }}
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
          <MovementLookupStatus
            loading={linkedMovement.isFetching}
            failed={linkedMovement.isError}
            onRetry={() => {
              void linkedMovement.refetch();
            }}
          />
          <InventoryViews
            canManage={canManage}
            canUpdate={canUpdate}
            categories={categoriesQuery.data ?? []}
            category={category}
            error={contentError}
            homeLocationId={user.homeLocationId}
            isLoading={currentQuery.isPending}
            items={inventoryQuery.data ?? []}
            ledger={includeMovement(ledgerQuery.data, linkedMovement.data)}
            onCategoryChange={setCategory}
            onOpenOperation={openOperation}
            onReceiveTransfer={(transferId) => runRowOperation({ type: 'receive-transfer', transferId })}
            onReleaseReservation={(reservationId) => runRowOperation({ type: 'release-reservation', reservationId })}
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
      {dialog && (
        <OperationDialog
          key={dialog.id}
          action={dialog.action}
          defaultLocationId={locationId}
          defaultSkuId={dialog.skuId}
          isLoadingItems={catalogQuery.isPending}
          isRefreshingCatalog={catalogQuery.isFetching}
          catalogRefreshFailed={catalogQuery.isError}
          items={catalogQuery.data ?? []}
          locations={locations}
          onClose={closeDialog}
          onRefreshCatalog={() => {
            void catalogQuery.refetch();
          }}
          onReceiptRecorded={(receipt) => recordReceipt(dialog.id, receipt)}
          onOperationRecorded={(operation) => recordOperation(dialog.id, operation)}
          onSubmit={executeStockOperation}
        />
      )}
    </div>
  );
}
