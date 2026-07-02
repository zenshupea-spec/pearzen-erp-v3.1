"use server";

import { createSupabaseServerClient } from "../../../../packages/supabase/server";

// Fetch all client companies (Bypasses RLS using Service Role if needed,
// but assuming Super Admin has global read access via policies)
export async function getAllTenants() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("companies")
      .select("id, name, status, modules")
      .order("name", { ascending: true });

    if (error) {
      console.error("Fetch Tenants Error:", error.message);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error("Server Action Error:", err);
    return { success: false, error: err.message, data: [] };
  }
}

// The Kill-Switch: Flips a company's status between ACTIVE and UNPAID
export async function toggleTenantBillingStatus(tenantId, currentStatus) {
  try {
    const supabase = await createSupabaseServerClient();
    const newStatus = currentStatus === "ACTIVE" ? "UNPAID" : "ACTIVE";

    const { error } = await supabase
      .from("companies")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    if (error) {
      console.error("Kill-Switch Error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, newStatus };
  } catch (err) {
    console.error("Server Action Error:", err);
    return { success: false, error: err.message };
  }
}
