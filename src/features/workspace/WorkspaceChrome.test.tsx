import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Location, User } from '../../api/client';
import { TestContentProvider } from '../../test/contentProvider';
import type { StockView } from '../inventory/types';
import { WorkspaceSidebar, WorkspaceTopbar } from './WorkspaceChrome';

const manager: User = {
  id: 'user-manager',
  email: 'manager@stocksync.test',
  displayName: 'Morgan Patel',
  role: 'inventory_manager',
  homeLocationId: 'loc-central',
};

const associate: User = {
  id: 'user-associate',
  email: 'associate@stocksync.test',
  displayName: 'Jamie Lee',
  role: 'associate',
  homeLocationId: 'loc-central',
};

const centralLocation: Location = {
  id: 'loc-central',
  code: 'CTR-01',
  name: 'Central Market',
  region: 'Bay Area',
};
const northLocation: Location = {
  id: 'loc-north',
  code: 'NTH-02',
  name: 'Northline Store',
  region: 'North Bay',
};
const locations = [centralLocation, northLocation];

function renderWithContent(element: ReactNode) {
  return render(<TestContentProvider>{element}</TestContentProvider>);
}

afterEach(cleanup);

describe('WorkspaceChrome', () => {
  it('renders the open manager sidebar and dispatches navigation and close actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onLogout = vi.fn();
    const onSelectView = vi.fn<(view: StockView) => void>();
    renderWithContent(
      <WorkspaceSidebar
        activeLocation={centralLocation}
        activeTransfers={2}
        isLogoutPending
        onClose={onClose}
        onLogout={onLogout}
        onSelectView={onSelectView}
        sidebarOpen
        user={manager}
        view="overview"
      />,
    );

    expect(screen.getByText('Central Market')).toBeInTheDocument();
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Inventory' }));
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(onSelectView).toHaveBeenCalledWith('inventory');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('shows the location loading state and allows a non-pending sign out', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderWithContent(
      <WorkspaceSidebar
        activeTransfers={0}
        isLogoutPending={false}
        onClose={vi.fn()}
        onLogout={onLogout}
        onSelectView={vi.fn()}
        sidebarOpen={false}
        user={associate}
        view="transfers"
      />,
    );

    expect(screen.getByText('Loading locations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('shows polling for associates and lets them open navigation and refresh', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onToggleSidebar = vi.fn();
    renderWithContent(
      <WorkspaceTopbar
        isRefreshing={false}
        locationId="loc-central"
        locations={locations}
        onLocationChange={vi.fn()}
        onRefresh={onRefresh}
        onToggleSidebar={onToggleSidebar}
        realtimeConnected={false}
        sidebarOpen={false}
        user={associate}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Polling');
    expect(screen.queryByRole('combobox', { name: 'Select location' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Refresh current view' }));
    expect(onToggleSidebar).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('shows connected manager controls and disables refresh while data is loading', async () => {
    const user = userEvent.setup();
    const onLocationChange = vi.fn();
    const onToggleSidebar = vi.fn();
    const onRefresh = vi.fn();
    renderWithContent(
      <WorkspaceTopbar
        isRefreshing
        locationId="loc-central"
        locations={locations}
        onLocationChange={onLocationChange}
        onRefresh={onRefresh}
        onToggleSidebar={onToggleSidebar}
        realtimeConnected
        sidebarOpen
        user={manager}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Live updates');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh current view' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select location' }), 'loc-north');
    expect(onLocationChange).toHaveBeenCalledWith('loc-north');
    expect(onToggleSidebar).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
