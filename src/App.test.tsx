import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from './api/client';
import App from './App';
import { TestContentProvider } from './test/contentProvider';

describe('StockSync app shell', () => {
  it('mounts the session-aware application inside the query client', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ user: null, csrfToken: null });

    render(
      <TestContentProvider>
        <App />
      </TestContentProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
