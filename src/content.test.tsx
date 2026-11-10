import { StrictMode, useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentProvider } from './content';
import { useContent } from './content-context';
import { contentModelSchema, dataString, type Translate } from './content-schema';
import modelJson from '../public/stocksync-model.json?raw';

const validModel: unknown = JSON.parse(modelJson);

function ContentProbe() {
  const { model, t } = useContent();
  return (
    <output>
      {t('app.name')} · {dataString(model, 'api.port')}
    </output>
  );
}

function TranslationProbe({ onTranslate }: { onTranslate: (translate: Translate) => void }) {
  const { t } = useContent();
  useEffect(() => onTranslate(t), [onTranslate, t]);
  return <span>Translations ready</span>;
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('ContentProvider', () => {
  it('loads the validated model and exposes translation/data helpers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validModel)));
    render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );

    expect(await screen.findByText('StockSync · 5402')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.title).toBe('StockSync | Inventory operations');
  });

  it('shares the initial model request across StrictMode effect replay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validModel));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <StrictMode>
        <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
          <ContentProbe />
        </ContentProvider>
      </StrictMode>,
    );

    expect(await screen.findByText('StockSync · 5402')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('updates rendered copy and document metadata when the model locale changes', async () => {
    const model = contentModelSchema.parse(validModel);
    const localizedModel = {
      ...model,
      locale: 'fr-FR',
      messages: {
        ...model.messages,
        'app.name': 'StockSync FR',
        'meta.title': 'StockSync | Operations de stock',
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(localizedModel)));

    render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );

    expect(await screen.findByText('StockSync FR · 5402')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr-FR');
    expect(document.title).toBe(localizedModel.messages['meta.title']);
  });

  it.each([
    ['wrong app id', { ...contentModelSchema.parse(validModel), appId: 'other-app' }],
    ['missing metadata', { ...contentModelSchema.parse(validModel), messages: {} }],
  ])('rejects a content model with %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText(/StockSync · 5402/)).toBeNull();
  });

  it('shows a failure state for non-success and unreadable responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveAttribute('aria-busy', 'false');
    first.unmount();

    render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveAttribute('aria-busy', 'false');
  });

  it('aborts the content request on unmount', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal instanceof AbortSignal) requestSignal = init.signal;
        return new Promise<Response>(() => undefined);
      }),
    );
    const { unmount } = render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <ContentProbe />
      </ContentProvider>,
    );
    await waitFor(() => expect(requestSignal).toBeDefined());

    unmount();
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
  });

  it('reports missing translation keys and placeholder values', async () => {
    let translate: Translate | undefined;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(validModel)));
    render(
      <ContentProvider appId="stocksync" modelUrl="/stocksync-model.json">
        <TranslationProbe
          onTranslate={(value) => {
            translate = value;
          }}
        />
      </ContentProvider>,
    );
    await screen.findByText('Translations ready');

    expect(() => translate?.('missing.key')).toThrow('CONTENT_KEY_MISSING:missing.key');
    expect(() => translate?.('login.connectionUnavailable')).toThrow('CONTENT_VALUE_MISSING:port');
  });
});
