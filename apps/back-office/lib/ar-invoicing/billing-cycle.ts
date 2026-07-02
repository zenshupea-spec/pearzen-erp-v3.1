import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';

import {
  AR_BILLING_CYCLE_DEFAULTS,
  sanitizeArBillingCycle,
  type ArBillingCycle,
} from './ar-billing-cycle-config';

export {
  AR_BILLING_CYCLE_DEFAULTS,
  sanitizeArBillingCycle,
  type ArBillingCycle,
} from './ar-billing-cycle-config';

/** Load MD billing-cycle knobs for AR invoice dispatch / due dates. */
export async function loadArBillingCycle(companyId: string | null): Promise<ArBillingCycle> {
  if (!companyId) return AR_BILLING_CYCLE_DEFAULTS;

  const supabase = createSupabaseServiceClient();
  const envelope = await loadSettingEnvelope(supabase, companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as
    | Partial<ArBillingCycle>
    | undefined;

  return sanitizeArBillingCycle({ ...AR_BILLING_CYCLE_DEFAULTS, ...raw });
}
