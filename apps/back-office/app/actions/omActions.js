"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Helper to initialize Supabase server client securely in modern Next.js
async function getSupabaseServerClient() {
  // THE FIX: Must await cookies() here
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
            // Ignored if called from a Server Component context
          }
        },
      },
    }
  );
}

export async function getPendingVerifications() {
  try {
    const supabase = await getSupabaseServerClient();

    // THE FIX: Exactly matching your Supabase table columns
    const { data, error } = await supabase
      .from("shifts")
      .select("id, profile_id, location_id, created_at, status")
      .eq("status", "PENDING_VERIFICATION")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase Data Fetch Error:", error.message);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error("Server Action Error:", err);
    return { success: false, error: err.message, data: [] };
  }
}

export async function approveShift(shiftId) {
  try {
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase
      .from("shifts")
      // Note: 'updated_at' wasn't visible in the screenshot. If it fails, remove 'updated_at' from this update object.
      .update({ status: "APPROVED" })
      .eq("id", shiftId);

    if (error) {
      console.error("Supabase Update Error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Server Action Error:", err);
    return { success: false, error: err.message };
  }
}
