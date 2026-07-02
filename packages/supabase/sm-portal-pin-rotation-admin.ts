import 'server-only';

import { clearPortalPasswordHistory } from './portal-password-rotation';
import { createSupabaseServiceClient } from './service';

export async function markSmPortalPinRotationRequired(
  canonicalEpf: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const epf = canonicalEpf.trim().toUpperCase();
  if (!epf) {
    return { ok: false, error: 'EPF number required.' };
  }

  const service = createSupabaseServiceClient();
  const { data: authRecord } = await service
    .from('sm_portal_auth')
    .select('is_active, needs_pin_setup, epf_number')
    .eq('epf_number', epf)
    .maybeSingle();

  if (!authRecord?.is_active) {
    return { ok: false, error: 'Portal access is not active.' };
  }
  if (authRecord.needs_pin_setup) {
    return { ok: false, error: 'Complete initial PIN setup before forcing rotation.' };
  }

  const { data: employee } = await service
    .from('employees')
    .select('id')
    .or(`emp_number.eq.${epf},epf_no.eq.${epf},epf_num.eq.${epf}`)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!employee?.id) {
    return { ok: false, error: 'Active sector manager record not found.' };
  }

  const cleared = await clearPortalPasswordHistory(service, employee.id, 'sm');
  if (!cleared.ok) {
    return { ok: false, error: cleared.error ?? 'Could not clear PIN history.' };
  }

  const { error } = await service
    .from('sm_portal_auth')
    .update({
      must_change_pin: true,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
