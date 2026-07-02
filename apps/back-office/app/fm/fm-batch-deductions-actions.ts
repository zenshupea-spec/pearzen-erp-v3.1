'use server';

import { rosterCompanyId, resolveCompanyIdForSession } from '../../lib/company-context-server';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  DEFAULT_WELFARE_FUND_SETTINGS,
  parseWelfareFundSettings,
  type WelfareFundSettings,
} from '../../../../packages/welfare-fund';
import {
  isMissingColumnError,
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../../packages/supabase/md-settings-envelope';
import { getMdSettingsDb } from '../executive/settings/lib/executive-md-settings-db';
import type { BatchDeductionKind, BatchDeductionRow } from './lib/batch-deductions-ledger';
import { fetchBatchDeductionLedgerRows } from './lib/fm-batch-deductions-data';

async function resolveFmCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

export async function fetchFmBatchDeductionLedger(
  kind: BatchDeductionKind,
  year: number,
  month: number,
): Promise<BatchDeductionRow[]> {
  const companyId = await resolveFmCompanyId();
  if (!companyId) return [];
  return fetchBatchDeductionLedgerRows(companyId, kind, year, month);
}

export async function getFmWelfareFundSettings(): Promise<WelfareFundSettings> {
  const companyId = await resolveFmCompanyId();
  if (!companyId) return DEFAULT_WELFARE_FUND_SETTINGS;

  const supabase = getMdSettingsDb();
  const { data, error } = await supabase
    .from('md_settings')
    .select('welfare_fund_settings')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parseWelfareFundSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]);
    }
    console.error('getFmWelfareFundSettings:', error.message);
    return DEFAULT_WELFARE_FUND_SETTINGS;
  }

  const row = data as { welfare_fund_settings?: unknown } | null;
  if (row?.welfare_fund_settings != null) {
    return parseWelfareFundSettings(row.welfare_fund_settings);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseWelfareFundSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]);
}
