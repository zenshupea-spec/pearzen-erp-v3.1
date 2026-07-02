'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { assertForgeOperator } from '../../lib/forge-operator-server';

export async function fetchAllTenants() {
  try {
    await assertForgeOperator();

    const supabase = await createSupabaseServerClient();

    // Platform-operator view — lists provisioned tenants (not implicit CVS scope).
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ companies table not created yet.');
        return { success: true, data: [] };
      }
      throw new Error(error.message);
    }

    return { success: true, data: data || [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tenants';
    console.error('❌ SUPABASE ERROR (Fetch Tenants):', message);
    return { success: false, data: [], error: message };
  }
}
