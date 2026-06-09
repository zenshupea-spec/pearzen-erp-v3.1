'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_RANK_PAY_MATRIX,
  parseRankPayMatrix,
  type RankPayEntry,
} from '../../../../../packages/rank-pay-matrix';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
  parseSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog } from './settings-audit';

export async function getRankPayMatrix(): Promise<RankPayEntry[]> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  let { data, error } = await supabase
    .from('md_settings')
    .select('rank_pay_matrix, setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('md_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .maybeSingle());
  }

  if (error) {
    console.error('getRankPayMatrix:', error.message);
    return DEFAULT_RANK_PAY_MATRIX;
  }

  const row = data as { rank_pay_matrix?: unknown; setting_value?: unknown } | null;
  if (Array.isArray(row?.rank_pay_matrix) && row.rank_pay_matrix.length > 0) {
    return parseRankPayMatrix(row.rank_pay_matrix);
  }

  const envelope = parseSettingEnvelope(row?.setting_value);
  const fromEnvelope = envelope[MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix];
  if (Array.isArray(fromEnvelope) && fromEnvelope.length > 0) {
    return parseRankPayMatrix(fromEnvelope);
  }

  if (Array.isArray(row?.rank_pay_matrix)) {
    return parseRankPayMatrix(row.rank_pay_matrix);
  }

  return parseRankPayMatrix(fromEnvelope);
}

export async function saveRankPayMatrix(matrix: RankPayEntry[]) {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const sanitized = matrix
    .map((entry) => ({
      id: entry.id,
      rankCode: entry.rankCode.trim().toUpperCase().slice(0, 12),
      fullTitle: entry.fullTitle.trim().toUpperCase(),
      basicPay: Math.max(0, Math.round(entry.basicPay)),
      annualIncrement: Math.max(0, Math.round(entry.annualIncrement ?? 0)),
      salaryType: entry.salaryType === 'CASH' ? 'CASH' : 'BANK',
      operationalGroup: entry.operationalGroup,
    }))
    .filter((entry) => entry.rankCode.length > 0 && entry.fullTitle.length > 0);

  let { error } = await supabase
    .from('md_settings')
    .upsert({ company_id: companyId, rank_pay_matrix: sanitized }, { onConflict: 'company_id' });

  if (error && isMissingColumnError(error.message)) {
    const res = await mergeSettingEnvelope(supabase, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix]: sanitized,
    });
    if (!res.success) return res;
    revalidatePath('/executive/settings');
    revalidatePath('/fm/settings');
    revalidatePath('/hr/mnr');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  await writeSettingsAuditLog(session, auditCompanyId, 'UPDATE_RANK_PAY_MATRIX', {
    rankCount: sanitized.length,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/hr/mnr');
  return { success: true };
}
