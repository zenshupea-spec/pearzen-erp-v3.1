'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

export async function fetchBillingTenants() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error && error.code !== '42P01') throw new Error(error.message);

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Fetch Billing):", error.message);
    return { success: false, data: [], error: error.message };
  }
}

export async function toggleKillSwitch(companyId: string, currentStatus: boolean) {
  try {
    if (!companyId) throw new Error("Missing company ID");
    
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('companies')
      .update({ is_suspended: !currentStatus })
      .eq('id', companyId);

    if (error) throw new Error(error.message);

    revalidatePath('/forge');
    revalidatePath('/forge/billing');

    return { success: true };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Kill Switch):", error.message);
    return { success: false, error: error.message };
  }
}