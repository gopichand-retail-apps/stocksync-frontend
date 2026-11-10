import { describe, expect, it } from 'vitest';
import { testContentModel } from '../../test/contentModel';
import { roleOptionsForCodes } from './role-options';

describe('StockSync role options', () => {
  it('uses only role codes returned by the local API', () => {
    const options = roleOptionsForCodes(testContentModel, ['auditor']);

    expect(options.map(({ role }) => role)).toEqual(['auditor']);
    expect(options[0]).toMatchObject({
      email: 'auditor@stocksync.test',
      summary: 'Read only',
    });
  });

  it('rejects an empty role list from the local API', () => {
    expect(() => roleOptionsForCodes(testContentModel, [])).toThrow('SYNTHETIC_ROLE_OPTIONS_EMPTY');
  });

  it('rejects role codes that are not in the StockSync contract', () => {
    expect(() => roleOptionsForCodes(testContentModel, ['unknown_role'])).toThrow('SYNTHETIC_ROLE_INVALID');
  });

  it('fails clearly when a server role has no content-model profile', () => {
    const model = {
      ...testContentModel,
      data: {
        ...testContentModel.data,
        profileSummaries: { associate: 'Central Market', inventory_manager: 'All locations' },
      },
    };

    expect(() => roleOptionsForCodes(model, ['auditor'])).toThrow('CONTENT_ROLE_PROFILE_MISSING:auditor');
  });
});
