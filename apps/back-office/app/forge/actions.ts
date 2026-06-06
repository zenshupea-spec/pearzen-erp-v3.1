'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export async function fetchAllTenants() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // In a multi-tenant system, we query the core 'companies' table
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Graceful fallback if table is not yet seeded
      if (error.code === '42P01') {
        console.warn("⚠️ companies table not created yet.");
        return { success: true, data: [] };
      }
      throw new Error(error.message);
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Fetch Tenants):", error.message);
    return { success: false, data: [], error: error.message };
  }
}
