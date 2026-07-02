import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeSmEpf, sectorManagerEpfKey } from '../../../packages/supabase/sm-epf';
import { findActiveSectorManagerByEpf } from './sector-manager-roster';

export type ActiveSectorManagerRow = {
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
};

/**
 * Sector managers assigned to sites must be active employees with live sm_portal_auth.
 * Returns canonical emp_number key for site_profiles.assigned_sm_epf.
 */
export async function resolveActiveSmPortalAuth(
  supabase: SupabaseClient,
  companyId: string | null,
  smEpf: string,
): Promise<
  | { ok: true; storedEpf: string; manager: ActiveSectorManagerRow }
  | { ok: false; error: string }
> {
  const normalized = normalizeSmEpf(smEpf);
  if (!normalized) {
    return { ok: false, error: 'Select a Sector Manager.' };
  }

  const manager = await findActiveSectorManagerByEpf(
    supabase,
    normalized,
    companyId,
    'emp_number, epf_no, epf_num, full_name',
  );
  if (!manager) {
    return { ok: false, error: `${normalized} is not an active Sector Manager.` };
  }

  const storedEpf = sectorManagerEpfKey(manager);
  if (!storedEpf) {
    return { ok: false, error: 'Sector Manager has no EPF on file.' };
  }

  const { data: auth, error: authError } = await supabase
    .from('sm_portal_auth')
    .select('epf_number, is_active')
    .eq('epf_number', storedEpf)
    .maybeSingle();

  if (authError) throw authError;

  if (!auth?.is_active) {
    return {
      ok: false,
      error: `SM portal access is not provisioned for ${storedEpf}. Provision via HR → SM Portal first.`,
    };
  }

  return { ok: true, storedEpf, manager };
}
