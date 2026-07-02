'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_RANK_PAY_MATRIX,
  defaultOperationalGroupForCorporateGroup,
  ensureSystemLedgerRanks,
  isLockedExecutiveLedgerRank,
  isLockedSectorManagerLedgerRank,
  parseRankPayMatrix,
  sanitizeRankPayMatrixEntries,
  type RankPayEntry,
} from '../../../../../packages/rank-pay-matrix';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  parseSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { canManageExecutiveAccess } from '../../../lib/executive-rank-guard';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';
import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
  assertExecutiveMdSettingsWrite,
  upsertMdSettings,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog, persistMdSettingEnvelopeWithAudit } from './settings-audit';

const HR_RANK_APPEND_ROLES = new Set(['HR', 'MD', 'OD', 'FM']);

export async function getRankPayMatrix(): Promise<RankPayEntry[]> {
  const session = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) {
    return ensureSystemLedgerRanks([]);
  }
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
    return [];
  }

  const row = data as { rank_pay_matrix?: unknown; setting_value?: unknown } | null;
  if (!row) return ensureSystemLedgerRanks([]);

  if (Array.isArray(row.rank_pay_matrix)) {
    if (row.rank_pay_matrix.length === 0) return ensureSystemLedgerRanks([]);
    return ensureSystemLedgerRanks(parseRankPayMatrix(row.rank_pay_matrix));
  }

  const envelope = parseSettingEnvelope(row.setting_value);
  const fromEnvelope = envelope[MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix];
  if (Array.isArray(fromEnvelope)) {
    if (fromEnvelope.length === 0) return ensureSystemLedgerRanks([]);
    return ensureSystemLedgerRanks(parseRankPayMatrix(fromEnvelope));
  }

  return ensureSystemLedgerRanks([]);
}

export async function saveRankPayMatrix(matrix: RankPayEntry[]) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const session = await createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  const profile = user ? await fetchBackOfficeUserProfile(session, user) : null;
  const editorRole = normalizePortalRole(profile?.role);
  const canEditExecutiveRanks = canManageExecutiveAccess(editorRole);

  const current = await getRankPayMatrix();
  let sanitized = sanitizeRankPayMatrixEntries(matrix);

  if (!canEditExecutiveRanks) {
    const lockedFromCurrent = current.filter((entry) =>
      isLockedExecutiveLedgerRank(entry.rankCode),
    );
    sanitized = [
      ...sanitized.filter((entry) => !isLockedExecutiveLedgerRank(entry.rankCode)),
      ...lockedFromCurrent,
    ];
    sanitized = ensureSystemLedgerRanks(sanitized);
  }

  let { error } = await upsertMdSettings(supabase, companyId, { rank_pay_matrix: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      supabase,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix]: sanitized },
      'UPDATE_RANK_PAY_MATRIX',
      { rankCount: sanitized.length },
    );
    if (!res.success) return res;
    revalidatePath('/executive/settings');
    revalidatePath('/hr/mnr');
    revalidatePath('/hr/onboarding');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const audit = await writeSettingsAuditLog(session, companyId, 'UPDATE_RANK_PAY_MATRIX', {
    rankCount: sanitized.length,
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidatePath('/executive/settings');
  revalidatePath('/hr/mnr');
  revalidatePath('/hr/onboarding');
  return { success: true };
}

/** HR / FM may append a missing rank during MNR onboarding — no vault PIN required. */
export async function appendRankToPayMatrixFromHr(input: {
  rankCode: string;
  fullTitle: string;
  corporateGroup: string;
  basicPay?: number;
}): Promise<
  | { success: true; rankCode: string; entry: RankPayEntry }
  | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (!role || !HR_RANK_APPEND_ROLES.has(role)) {
    return { success: false, error: 'Only HR, FM, MD, or OD can add ranks from MNR.' };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return { success: false, error: 'Tenant context required.' };
  }

  const rankCode = input.rankCode.trim().toUpperCase().slice(0, 12);
  const fullTitle = input.fullTitle.trim().toUpperCase();
  if (!rankCode || !fullTitle) {
    return { success: false, error: 'Rank code and title are required.' };
  }
  if (isExecutiveRank(rankCode) && !canManageExecutiveAccess(role)) {
    return { success: false, error: 'Only MD or OD can add MD/OD ranks.' };
  }

  const current = await getRankPayMatrix();
  const baseMatrix = current.length > 0 ? current : [...DEFAULT_RANK_PAY_MATRIX];
  const existing = baseMatrix.find((entry) => entry.rankCode === rankCode);
  if (existing) {
    return { success: true, rankCode, entry: existing };
  }

  const entry: RankPayEntry = {
    id: `rp-hr-${Date.now()}`,
    rankCode,
    fullTitle,
    basicPay: Math.max(0, Math.round(Number(input.basicPay ?? 0))),
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: defaultOperationalGroupForCorporateGroup(input.corporateGroup),
  };

  const db = getMdSettingsDb();
  const nextMatrix = [...baseMatrix, entry];
  let { error } = await upsertMdSettings(db, companyId, { rank_pay_matrix: nextMatrix });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      db,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix]: nextMatrix },
      'APPEND_RANK_FROM_HR',
      { rankCode, corporateGroup: input.corporateGroup },
    );
    if (!res.success) return res;
    revalidatePath('/executive/settings');
    revalidatePath('/hr/mnr');
    revalidatePath('/hr/onboarding');
    return { success: true, rankCode, entry };
  }

  if (error) return { success: false, error: error.message };

  const audit = await writeSettingsAuditLog(supabase, companyId, 'APPEND_RANK_FROM_HR', {
    rankCode,
    fullTitle,
    corporateGroup: input.corporateGroup,
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidatePath('/executive/settings');
  revalidatePath('/hr/mnr');
  revalidatePath('/hr/onboarding');
  return { success: true, rankCode, entry };
}
