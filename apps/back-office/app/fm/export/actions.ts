'use server';

import { assertPayrollBankExportAllowed } from '../../../lib/payroll-bank-export';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';

export async function fetchBankExportData() {
  return {
    success: false as const,
    data: [] as never[],
    error:
      'Bulk bank export is disabled. Generate payroll, obtain MD approval, then download from the FM Portfolio or Executive Payroll desk.',
  };
}

/** @deprecated Kept for defense-in-depth if route is re-exposed. */
export async function assertFmBulkExportBlocked() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) {
    throw new Error('Bank export requires an MD-approved payroll batch.');
  }

  const { data: runs } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('company_id', companyId)
    .in('status', ['APPROVED', 'PAID'])
    .limit(1);

  if (!runs?.length) {
    assertPayrollBankExportAllowed('DRAFT');
  }
}
