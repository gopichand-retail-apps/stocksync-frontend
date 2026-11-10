import { describe, expect, it } from 'vitest';
import modelJson from '../public/stocksync-model.json?raw';
import { contentModelSchema, dataString, dataStringAt, dataStringRecord } from './content-schema';

const model = contentModelSchema.parse(JSON.parse(modelJson));

describe('content model data access', () => {
  it('keeps passwords out of public content and reads nested display labels', () => {
    expect(model.data).not.toHaveProperty('demoPassword');
    expect(JSON.stringify(model.data)).not.toContain('stock-demo-only');
    expect(() => dataString(model, 'demoPassword')).toThrow('CONTENT_DATA_INVALID:demoPassword');
    expect(dataString(model, 'api.port')).toBe('5402');
    expect(typeof dataStringAt(model, 'productLabels', 'BEV-1042', 'name')).toBe('string');
  });

  it('rejects missing and non-string values', () => {
    expect(() => dataString(model, 'missing.key')).toThrow('CONTENT_DATA_INVALID:missing.key');
    expect(() => dataString(model, 'profileEmails')).toThrow('CONTENT_DATA_INVALID:profileEmails');
  });

  it('returns model string records and rejects non-record values', () => {
    expect(dataStringRecord(model, 'profileEmails')).toEqual(model.data.profileEmails);
    expect(() => dataStringRecord(model, 'demoPassword')).toThrow('CONTENT_DATA_INVALID:demoPassword');
  });
});
