import { z } from 'zod';

export const contentModelSchema = z
  .object({
    version: z.literal(1),
    appId: z.string().min(1),
    locale: z.string().min(2),
    messages: z.record(z.string(), z.string()),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export type ContentModel = z.infer<typeof contentModelSchema>;
export type MessageValues = Record<string, string | number>;
export type Translate = (key: string, values?: MessageValues) => string;

function valueAtPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    const record = z.record(z.string(), z.unknown()).safeParse(value);
    return record.success ? record.data[segment] : undefined;
  }, root);
}

export function dataString(model: ContentModel, key: string): string {
  const value = valueAtPath(model.data, key);
  if (typeof value !== 'string') throw new Error(`CONTENT_DATA_INVALID:${key}`);
  return value;
}

export function dataStringRecord(model: ContentModel, key: string): Record<string, string> {
  const parsed = z.record(z.string(), z.string()).safeParse(model.data[key]);
  if (!parsed.success) throw new Error(`CONTENT_DATA_INVALID:${key}`);
  return parsed.data;
}

export function dataStringAt(model: ContentModel, key: string, itemKey: string, field: string): string {
  const record = z.record(z.string(), z.unknown()).safeParse(model.data[key]);
  const item = record.success ? z.record(z.string(), z.unknown()).safeParse(record.data[itemKey]) : null;
  const value = item?.success ? item.data[field] : undefined;
  if (typeof value !== 'string') {
    throw new Error(`CONTENT_DATA_INVALID:${key}.${itemKey}.${field}`);
  }
  return value;
}
