"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Ignored in Server Component context
          }
        },
      },
    }
  );
}

export async function getExecutiveMetrics() {
  try {
    const supabase = await getSupabaseServerClient();

    // RLS (Row Level Security) ensures these queries ONLY return data
    // for this Executive's specific company_id.

    // 1. Fetch Active Guards
    const { count: activeGuards, error: guardErr } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE");

    // 2. Fetch Pending Incidents (from shift verification queue)
    const { count: pendingIncidents, error: incidentErr } = await supabase
      .from("shifts")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING_VERIFICATION");

    if (guardErr || incidentErr) {
      const errorMessage =
        guardErr?.message || incidentErr?.message || "Failed to load metrics.";
      return {
        success: false,
        error: errorMessage,
        data: {
          revenue: 0,
          activeGuards: 0,
          pendingIncidents: 0,
          unpaidInvoices: 0,
        },
      };
    }

    // 3. Mocked Financials (Until complex Payroll RPC is fully written)
    // In production, this would call a Supabase RPC function for sum calculations
    const metrics = {
      revenue: 1250000.0,
      activeGuards: activeGuards || 0,
      pendingIncidents: pendingIncidents || 0,
      unpaidInvoices: 1,
    };

    return { success: true, data: metrics };
  } catch (err) {
    console.error("Server Action Error:", err);
    return {
      success: false,
      error: err.message,
      data: { revenue: 0, activeGuards: 0, pendingIncidents: 0, unpaidInvoices: 0 },
    };
  }
}
