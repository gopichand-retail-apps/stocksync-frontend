import type { ReactNode } from 'react';
import { ContentContext } from '../content-context';
import type { ContentContextValue } from '../content-context';
import { testContentModel } from './contentModel';

const contentValue: ContentContextValue = {
  model: testContentModel,
  t: (key, values = {}) => {
    const template = testContentModel.messages[key];
    if (template === undefined) throw new Error(`CONTENT_KEY_MISSING:${key}`);
    return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, name: string) => {
      const replacement = values[name];
      if (replacement === undefined) throw new Error(`CONTENT_VALUE_MISSING:${name}`);
      return String(replacement);
    });
  },
};

export function TestContentProvider({ children }: { children: ReactNode }) {
  return <ContentContext.Provider value={contentValue}>{children}</ContentContext.Provider>;
}
