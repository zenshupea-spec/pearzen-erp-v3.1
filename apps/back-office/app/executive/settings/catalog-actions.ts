'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  DEFAULT_PENALTY_CATALOG,
  parsePenaltyCatalog,
  type PenaltyCatalogEntry,
} from '../../../../../packages/penalty-catalog';
import {
  parseReplacementCatalog,
  type ReplacementCatalogEntry,
} from '../../../../../packages/replacement-catalog';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';
import { writeSettingsAuditLog } from './settings-audit';
import {
  assertExecutiveMdSettingsWrite,
  getExecutiveMdSettingsContext,
  upsertMdSettings,
} from './lib/executive-md-settings-db';

export async function getPenaltyCatalog(): Promise<PenaltyCatalogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return DEFAULT_PENALTY_CATALOG;

  const { data } = await supabase
    .from('md_settings')
    .select('penalty_catalog')
    .eq('company_id', companyId)
    .maybeSingle();

  return parsePenaltyCatalog((data as { penalty_catalog?: unknown } | null)?.penalty_catalog);
}

export async function savePenaltyCatalog(catalog: PenaltyCatalogEntry[]) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  const sanitized = catalog
    .map((entry) => ({
      id: entry.id,
      offense: entry.offense.trim(),
      fine: Math.max(0, Math.round(entry.fine)),
    }))
    .filter((entry) => entry.offense.length > 0);

  const { error } = await upsertMdSettings(db, companyId, { penalty_catalog: sanitized });

  if (error) return { success: false, error: error.message };

  const audit = await writeSettingsAuditLog(session, companyId, 'UPDATE_PENALTY_CATALOG', {
    offenseCount: sanitized.length,
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  return { success: true };
}

export async function getReplacementCatalog(): Promise<ReplacementCatalogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return [];

  const { data } = await supabase
    .from('md_settings')
    .select('replacement_catalog')
    .eq('company_id', companyId)
    .maybeSingle();

  return parseReplacementCatalog(
    (data as { replacement_catalog?: unknown } | null)?.replacement_catalog,
  );
}

export async function saveReplacementCatalog(catalog: ReplacementCatalogEntry[]) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  const sanitized = catalog
    .map((entry) => ({
      id: entry.id,
      item: entry.item.trim(),
      cost: Math.max(0, Math.round(entry.cost)),
    }))
    .filter((entry) => entry.item.length > 0);

  const { error } = await upsertMdSettings(db, companyId, {
    replacement_catalog: sanitized,
  });

  if (error) return { success: false, error: error.message };

  const audit = await writeSettingsAuditLog(session, companyId, 'UPDATE_REPLACEMENT_CATALOG', {
    itemCount: sanitized.length,
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  return { success: true };
}
