'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  DEFAULT_PENALTY_CATALOG,
  parsePenaltyCatalog,
  type PenaltyCatalogEntry,
} from '../../../../../packages/penalty-catalog';
import { revalidatePath } from 'next/cache';
import { writeSettingsAuditLog } from './settings-audit';

async function resolveCompanyId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  let companyId = (userRow as { company_id?: string } | null)?.company_id;
  if (!companyId) {
    const { data: co } = await supabase.from('companies').select('id').limit(1).maybeSingle();
    companyId = co?.id;
  }
  return companyId ?? null;
}

export async function getPenaltyCatalog(): Promise<PenaltyCatalogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyId(supabase);
  if (!companyId) return DEFAULT_PENALTY_CATALOG;

  const { data } = await supabase
    .from('md_settings')
    .select('penalty_catalog')
    .eq('company_id', companyId)
    .maybeSingle();

  return parsePenaltyCatalog((data as { penalty_catalog?: unknown } | null)?.penalty_catalog);
}

export async function savePenaltyCatalog(catalog: PenaltyCatalogEntry[]) {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyId(supabase);
  if (!companyId) return { success: false, error: 'No company context' };

  const sanitized = catalog
    .map((entry) => ({
      id: entry.id,
      offense: entry.offense.trim(),
      fine: Math.max(0, Math.round(entry.fine)),
    }))
    .filter((entry) => entry.offense.length > 0);

  const { error } = await supabase
    .from('md_settings')
    .upsert(
      { company_id: companyId, penalty_catalog: sanitized },
      { onConflict: 'company_id' },
    );

  if (error) return { success: false, error: error.message };

  await writeSettingsAuditLog(supabase, companyId, 'UPDATE_PENALTY_CATALOG', {
    offenseCount: sanitized.length,
  });

  revalidatePath('/executive/settings');
  return { success: true };
}
