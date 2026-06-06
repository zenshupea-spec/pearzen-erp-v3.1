'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export async function fetchAuditLogs() {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); // Limit to last 100 for performance

    // If the table doesn't exist yet, catch it gracefully so the UI doesn't crash
    if (error) {
      if (error.code === '42P01') {
        console.warn("⚠️ audit_logs table not created yet.");
        return { success: true, data: [] };
      }
      throw new Error(error.message);
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (Fetch Audit Logs):", error.message);
    return { success: false, data: [], error: error.e };
  }
}
