"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../packages/supabase/server";

export type MdSettingsUpdateInput = {
  trading_name: string;
  hospitality_module: boolean;
  advanced_geofencing: boolean;
  auto_approve_payroll: boolean;
};

export async function getSettings() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("md_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data ?? null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown settings load error.",
      data: null,
    };
  }
}

export async function updateSettings(input: MdSettingsUpdateInput) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: existingError } = await supabase
      .from("md_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return { success: false, error: existingError.message };
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("md_settings")
        .update(input)
        .eq("id", existing.id);

      if (error) {
        return { success: false, error: error.message };
      }

      revalidatePath("/executive/dashboard/settings");
    } else {
      const { error } = await supabase.from("md_settings").insert([input]);

      if (error) {
        return { success: false, error: error.message };
      }

      revalidatePath("/executive/dashboard/settings");
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown settings update error.",
    };
  }
}
