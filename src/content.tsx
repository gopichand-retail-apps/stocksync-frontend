import { useEffect, useState, type ReactNode } from 'react';
import { ContentContext } from './content-context';
import type { ContentContextValue } from './content-context';
import { contentModelSchema, type ContentModel } from './content-schema';
import './content-model.css';

type ContentProviderProps = { appId: string; modelUrl: string; children: ReactNode };

type ContentModelRequest = {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
  abortTimer: ReturnType<typeof setTimeout> | null;
};

const contentModelRequests = new Map<string, ContentModelRequest>();

function acquireContentModel(modelUrl: string) {
  let request = contentModelRequests.get(modelUrl);
  if (!request) {
    const controller = new AbortController();
    const promise = fetch(modelUrl, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('CONTENT_MODEL_REQUEST_FAILED');
      return response.json();
    });
    request = { controller, promise, subscribers: 0, abortTimer: null };
    contentModelRequests.set(modelUrl, request);
    const createdRequest = request;
    void promise.then(
      () => {
        if (contentModelRequests.get(modelUrl) === createdRequest) contentModelRequests.delete(modelUrl);
      },
      () => {
        if (contentModelRequests.get(modelUrl) === createdRequest) contentModelRequests.delete(modelUrl);
      },
    );
  }

  const activeRequest = request;
  if (activeRequest.abortTimer !== null) {
    clearTimeout(activeRequest.abortTimer);
    activeRequest.abortTimer = null;
  }
  activeRequest.subscribers += 1;

  let released = false;
  return {
    promise: activeRequest.promise,
    release() {
      if (released) return;
      released = true;
      activeRequest.subscribers -= 1;
      if (activeRequest.subscribers === 0) {
        activeRequest.abortTimer = setTimeout(() => {
          activeRequest.abortTimer = null;
          if (activeRequest.subscribers === 0) {
            activeRequest.controller.abort();
            if (contentModelRequests.get(modelUrl) === activeRequest) {
              contentModelRequests.delete(modelUrl);
            }
          }
        }, 0);
      }
    },
  };
}

export function ContentProvider({ appId, modelUrl, children }: ContentProviderProps) {
  const [model, setModel] = useState<ContentModel | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const request = acquireContentModel(modelUrl);
    let active = true;

    void request.promise
      .then((payload) => {
        const parsed = contentModelSchema.safeParse(payload);
        if (!parsed.success || parsed.data.appId !== appId) throw new Error('CONTENT_MODEL_INVALID');
        if (!parsed.data.messages['meta.title'] || !parsed.data.messages['meta.description']) {
          throw new Error('CONTENT_MODEL_METADATA_MISSING');
        }
        return parsed.data;
      })
      .then((contentModel) => {
        if (!active) return;
        document.documentElement.lang = contentModel.locale;
        document.title = contentModel.messages['meta.title'];
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        if (description) description.content = contentModel.messages['meta.description'];
        setModel(contentModel);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
      request.release();
    };
  }, [appId, modelUrl]);

  if (!model) {
    return (
      <main className="content-model-state" role={loadFailed ? 'alert' : 'status'} aria-busy={!loadFailed}>
        {!loadFailed && <span className="content-model-spinner" aria-hidden="true" />}
      </main>
    );
  }

  const value: ContentContextValue = {
    model,
    t: (key, values = {}) => {
      const template = model.messages[key];
      if (template === undefined) throw new Error(`CONTENT_KEY_MISSING:${key}`);
      return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, name: string) => {
        const replacement = values[name];
        if (replacement === undefined) throw new Error(`CONTENT_VALUE_MISSING:${name}`);
        return String(replacement);
      });
    },
  };

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
