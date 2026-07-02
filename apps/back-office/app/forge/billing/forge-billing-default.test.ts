import { describe, expect, it } from 'vitest';

import { CVS_COMPANY_ID } from '../../../lib/company-ids';
import { forgeBillingDefaultCompanyId } from './forge-billing-default';

describe('forgeBillingDefaultCompanyId', () => {
  const cvsTenant: ForgeBillingCompany = {
    id: CVS_COMPANY_ID,
    name: 'Classic Venture Security',
    slug: 'cvs',
  };

  it('returns null even when CVS is first alphabetically', () => {
    expect(forgeBillingDefaultCompanyId([cvsTenant])).toBeNull();
  });

  it('returns null for empty tenant list', () => {
    expect(forgeBillingDefaultCompanyId([])).toBeNull();
  });

  it('returns null when other tenants exist', () => {
    expect(
      forgeBillingDefaultCompanyId([
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Acme Corp', slug: 'acme' },
        cvsTenant,
      ]),
    ).toBeNull();
  });
});
