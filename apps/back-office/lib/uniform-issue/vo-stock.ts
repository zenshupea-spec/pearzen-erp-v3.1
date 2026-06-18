'use server';

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import {
  fetchUniformVoStockOnHand,
  type UniformVoStockRow,
} from '../../../../packages/uniform-vo-stock';

export async function getMyUniformStockOnHand(
  holderEpf: string,
): Promise<UniformVoStockRow[]> {
  const epf = holderEpf.trim().toUpperCase();
  if (!epf) return [];

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return [];

  const db = createSupabaseServiceClient();
  try {
    return await fetchUniformVoStockOnHand(db, companyId, epf);
  } catch (err) {
    console.error('[Uniform VO stock] fetch:', err);
    return [];
  }
}
