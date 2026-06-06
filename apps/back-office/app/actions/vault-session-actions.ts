"use server";

import { revalidatePath } from "next/cache";

import { CLASSIC_VENTURE_COMPANY_ID } from "../../lib/company-context";
import { fetchBackOfficeUserProfile } from "../../lib/hr-portal-access";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "../../../../packages/supabase/server";

export type VaultSessionPolicy = {
  autoLockEnabled: boolean;
  idleTimeoutMinutes: number;
};

const DEFAULT_POLICY: VaultSessionPolicy = {
  autoLockEnabled: true,
  idleTimeoutMinutes: 30,
};

export async function getVaultSessionPolicy(): Promise<VaultSessionPolicy> {
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("md_settings")
    .select("vault_auto_lock_enabled, vault_idle_timeout_minutes")
    .eq("company_id", CLASSIC_VENTURE_COMPANY_ID)
    .maybeSingle();

  if (!data) return DEFAULT_POLICY;

  const minutes = Number(data.vault_idle_timeout_minutes);
  return {
    autoLockEnabled: Boolean(data.vault_auto_lock_enabled),
    idleTimeoutMinutes:
      Number.isFinite(minutes) && minutes >= 1 && minutes <= 60
        ? Math.round(minutes)
        : DEFAULT_POLICY.idleTimeoutMinutes,
  };
}

export async function saveVaultSessionPolicy(
  idleTimeoutMinutes: number,
  autoLockEnabled: boolean,
): Promise<{ ok: true }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (profile.role !== "MD") {
    throw new Error("Only the Managing Director can change vault session policy.");
  }

  const minutes = Math.max(1, Math.min(60, Math.round(idleTimeoutMinutes)));
  const db = createSupabaseServiceClient();

  const { error } = await db.from("md_settings").upsert(
    {
      company_id: CLASSIC_VENTURE_COMPANY_ID,
      vault_auto_lock_enabled: autoLockEnabled,
      vault_idle_timeout_minutes: minutes,
    },
    { onConflict: "company_id" },
  );

  if (error) throw new Error(error.message);

  revalidatePath("/executive/settings");
  return { ok: true };
}
