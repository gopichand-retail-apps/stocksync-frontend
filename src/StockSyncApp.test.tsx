import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError } from './api/client';
import { StockSyncApp } from './StockSyncApp';
import { TestContentProvider } from './test/contentProvider';

vi.mock('./features/workspace/AuthenticatedWorkspace', async () => {
  const { createElement } = await import('react');
  return {
    AuthenticatedWorkspace: ({ user }: { user: { displayName: string } }) =>
      createElement('div', { 'data-testid': 'authenticated-workspace' }, user.displayName),
  };
});

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContentProvider>
        <StockSyncApp />
      </TestContentProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(api, 'listSyntheticRoles').mockResolvedValue(['associate', 'inventory_manager', 'auditor']);
});

describe('StockSyncApp session gate', () => {
  it('shows a loading state while the server session is unresolved', async () => {
    let resolveSession: ((value: { user: null; csrfToken: null }) => void) | undefined;
    vi.spyOn(api, 'getSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );

    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to StockSync');
    resolveSession?.({ user: null, csrfToken: null });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows connection and login errors with a retry path', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });
    vi.spyOn(api, 'login').mockRejectedValue(new ApiClientError('Request failed', 'AUTH_REQUIRED'));

    renderApp();
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByText(/API connection unavailable/)).toBeNull();

    await user.type(screen.getByLabelText('Password'), 'entered-by-user');
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again to continue.');
  });

  it('shows the API unavailable state and retries session discovery', async () => {
    const user = userEvent.setup();
    const sessionRequest = vi
      .spyOn(api, 'getSession')
      .mockRejectedValueOnce(new Error('network offline'))
      .mockResolvedValue({ user: null, csrfToken: null });

    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(/API connection unavailable/);
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionRequest).toHaveBeenCalledTimes(2);
  });

  it('loads API role choices in default mock mode', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });
    const roleRequest = vi.mocked(api.listSyntheticRoles);

    renderApp();

    expect(await screen.findByRole('button', { name: 'Associate Central Market' })).toBeInTheDocument();
    expect(roleRequest).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.mode).toBe('mock');
  });

  it('uses API role codes and authenticates the selected seeded account', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });
    const roleRequest = vi.mocked(api.listSyntheticRoles).mockResolvedValue(['auditor']);
    const login = vi.spyOn(api, 'login').mockResolvedValue({
      user: {
        id: 'user-auditor',
        email: 'auditor@stocksync.test',
        displayName: 'Taylor Kim',
        role: 'auditor',
        homeLocationId: 'loc-central',
      },
      csrfToken: 'csrf-token',
    });

    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Auditor Read only' }));
    expect(screen.getByLabelText('Email')).toHaveValue('auditor@stocksync.test');
    expect(screen.queryByRole('button', { name: 'Associate Central Market' })).toBeNull();
    const password = screen.getByLabelText('Password');
    await user.clear(password);
    await user.type(password, 'entered-by-user');
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));

    expect(roleRequest).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith('auditor@stocksync.test', 'entered-by-user');
    expect(await screen.findByTestId('authenticated-workspace')).toHaveTextContent('Taylor Kim');
  });

  it('enters the authenticated workspace after a successful login', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });
    vi.spyOn(api, 'login').mockResolvedValue({
      user: {
        id: 'user-manager',
        email: 'manager@stocksync.test',
        displayName: 'Morgan Patel',
        role: 'inventory_manager',
        homeLocationId: 'loc-central',
      },
      csrfToken: 'csrf-token',
    });

    renderApp();
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Password'), 'entered-by-user');
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));

    expect(await screen.findByTestId('authenticated-workspace')).toHaveTextContent('Morgan Patel');
  });

  it('uses the generic copy for unmapped API error codes', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });
    vi.spyOn(api, 'login').mockRejectedValue(new ApiClientError('Private backend text', 'UNMAPPED_ERROR'));

    renderApp();
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Password'), 'entered-by-user');
    await user.click(screen.getByRole('button', { name: 'Open workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be completed.');
    expect(screen.queryByText('Private backend text')).toBeNull();
  });
});
