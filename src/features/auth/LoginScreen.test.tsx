import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { testContentModel } from '../../test/contentModel';
import { TestContentProvider } from '../../test/contentProvider';
import { LoginScreen } from './LoginScreen';
import { roleOptionsForCodes } from './role-options';

const roleOptions = roleOptionsForCodes(testContentModel, ['associate', 'inventory_manager', 'auditor']);

function renderLogin(overrides: Partial<React.ComponentProps<typeof LoginScreen>> = {}) {
  const props: React.ComponentProps<typeof LoginScreen> = {
    isPending: false,
    error: null,
    connectionError: false,
    roleOptions,
    rolesPending: false,
    onLogin: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <TestContentProvider>
        <LoginScreen {...props} />
      </TestContentProvider>,
    ),
    props,
  };
}

describe('LoginScreen', () => {
  it('announces loading and unavailable role choices', () => {
    const { rerender } = renderLogin({ roleOptions: [], rolesPending: true });

    expect(screen.getByRole('status')).toHaveTextContent('Loading available roles');

    rerender(
      <TestContentProvider>
        <LoginScreen
          connectionError
          error={null}
          isPending={false}
          onLogin={vi.fn()}
          onRetry={vi.fn()}
          roleOptions={[]}
          rolesPending={false}
        />
      </TestContentProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No roles are currently available');
  });

  it('starts with a blank password and fills the synthetic password for each role', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText('Password');

    expect(password).toHaveValue('');
    expect(screen.queryByText(/demo password/i)).toBeNull();

    const roleButtons = screen.getAllByRole('button').filter((button) => button.classList.contains('role-option'));
    for (const roleButton of roleButtons) {
      await user.click(roleButton);
      expect(password).toHaveValue('stock-demo-only');
    }
  });

  it('selects a seeded role and submits normalized credentials', async () => {
    const user = userEvent.setup();
    const { props } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Associate Central Market' }));
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), ' demo-pass ');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), ' ASSOCIATE@STOCKSYNC.TEST ');
    await user.click(screen.getByRole('button', { name: /open workspace/i }));

    expect(props.onLogin).toHaveBeenCalledWith({
      email: 'associate@stocksync.test',
      password: ' demo-pass ',
    });
  });

  it('reports sign-in and API connection errors with a retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderLogin({ error: 'Sign in failed', connectionError: true, onRetry });

    expect(screen.getByText('Sign in failed')).toBeInTheDocument();
    expect(screen.getByText(/API connection unavailable/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
