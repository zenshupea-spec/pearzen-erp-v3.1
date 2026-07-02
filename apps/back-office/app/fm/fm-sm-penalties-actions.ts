'use server';

import { rosterCompanyId, resolveCompanyIdForSession } from '../../lib/company-context-server';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  fetchPenaltyDeductionLedgerRows,
  type PenaltyDeductionLedgerRow,
} from './lib/fm-sm-penalties';
import type { BatchDeductionRow } from './lib/batch-deductions-ledger';

async function resolveFmCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

export async function fetchFmPenaltyDeductionLedger(
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  const companyId = await resolveFmCompanyId();
  if (!companyId) return [];

  const rows = await fetchPenaltyDeductionLedgerRows(companyId, year, month);
  return rows.map(penaltyLedgerRowToBatch);
}

function penaltyLedgerRowToBatch(row: PenaltyDeductionLedgerRow): BatchDeductionRow {
  return {
    empNo: row.empNo,
    name: row.name,
    rank: row.rank,
    site: row.site,
    amountLkr: row.amountLkr,
    detail: row.catalogLabel,
    supplier: row.supplier,
  };
}
