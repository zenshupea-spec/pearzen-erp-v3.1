'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function fetchModuleTenants() {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Fetch Modules):", error.message);
    return { success: false, data: [], error: error.message };
  }
}

export async function toggleTenantModule(companyId: string, currentStatus: boolean) {
  try {
    if (!companyId) throw new Error("Missing company ID");
    
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('companies')
      .update({ has_cafe_module: !currentStatus })
      .eq('id', companyId);

    if (error) throw new Error(error.message);

    revalidatePath('/forge/modules');
    return { success: true };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Toggle Module):", error.message);
    return { success: false, error: error.message };
  }
}