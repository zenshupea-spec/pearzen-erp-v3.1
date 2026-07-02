import type { NextRequest } from "next/server";

import {
  createSupabaseServerClient,
} from "../../../packages/supabase/server";
import {
  decodeSignedPortalCookie,
  encodeSignedPortalCookie,
} from "./head-office-portal-cookie-crypto";
import { normalizeWorkEmail } from "./head-office-portal-auth";
import { fetchBackOfficeUserProfile } from "./hr-portal-access-server";
import { isExecutiveRank } from "./portal-role-utils";
import { resolveExecutiveCompanyId } from "../app/executive/settings/lib/executive-md-settings-db";
import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import {
  hashPortalPin,
  verifyPortalPin,
} from "./head-office-portal-pin";

export const HO_VAULT_UNLOCK_COOKIE = "pz_ho_vault_unlock";

const VAULT_PIN_LENGTH = 4;

function normalizeVaultPin(pin: string): string | null {
  const trimmed = pin.replace(/\D/g, "");
  if (trimmed.length !== VAULT_PIN_LENGTH) return null;
  return trimmed;
}

export async function setVaultUnlockSessionCookies(
  employeeId: string,
  email: string,
  idleTimeoutMinutes = 30,
): Promise<void> {
  const exp = Date.now() + idleTimeoutMinutes * 60 * 1000;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  const token = await encodeSignedPortalCookie(payload);
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set(HO_VAULT_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, idleTimeoutMinutes * 60),
  });
}

export async function clearVaultUnlockSessionCookiesStore(): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(HO_VAULT_UNLOCK_COOKIE);
}

export async function hasValidVaultUnlockSession(
  employeeId: string,
  email: string,
): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(HO_VAULT_UNLOCK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
  const exp = Number(expRaw);
  if (
    tokenEmployeeId !== employeeId ||
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }

  return true;
}

export async function hasValidVaultUnlockSessionFromRequest(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_VAULT_UNLOCK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
  const exp = Number(expRaw);
  if (
    tokenEmployeeId !== employeeId ||
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }

  return true;
}

async function vaultPinConfiguredForCompany(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("md_settings")
    .select("vault_pin_hash")
    .eq("company_id", companyId)
    .maybeSingle();

  const hash =
    typeof data?.vault_pin_hash === "string" ? data.vault_pin_hash.trim() : "";
  return Boolean(hash);
}

async function resolveVaultIdleTimeoutMinutesForCompany(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("md_settings")
    .select("vault_idle_timeout_minutes")
    .eq("company_id", companyId)
    .maybeSingle();

  const minutes = Number(data?.vault_idle_timeout_minutes);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 60
    ? Math.round(minutes)
    : 30;
}

/** Fresh portal login (password + 2FA) — start vault idle window without re-entering vault PIN. */
export async function grantExecutiveVaultUnlockOnPortalLogin(
  employeeId: string,
  email: string,
  role: string | null | undefined,
): Promise<void> {
  if (!isExecutiveRank(role)) return;
  if (!(await vaultPinConfiguredForCompany())) return;

  const idleTimeoutMinutes = await resolveVaultIdleTimeoutMinutesForCompany();
  await setVaultUnlockSessionCookies(employeeId, email, idleTimeoutMinutes);
}

async function verifyVaultPinForUser(
  employeeId: string,
  email: string,
  pin: string,
  role: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeVaultPin(pin);
  if (!normalized) {
    return { ok: false, error: "Enter your 4-digit vault PIN." };
  }

  if (role !== "MD" && role !== "OD") {
    return { ok: false, error: "Vault lock applies to MD and OD sessions only." };
  }

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("md_settings")
    .select("vault_pin_hash")
    .eq("company_id", companyId)
    .maybeSingle();

  const stored =
    typeof data?.vault_pin_hash === "string" ? data.vault_pin_hash.trim() : "";
  if (!stored) {
    return {
      ok: false,
      error: "Vault PIN is not configured yet. Ask MD to set it in Executive Access.",
    };
  }

  if (!verifyPortalPin(normalized, stored)) {
    return { ok: false, error: "Incorrect vault PIN." };
  }

  const idleTimeoutMinutes = await resolveVaultIdleTimeoutMinutesForCompany();

  await setVaultUnlockSessionCookies(employeeId, email, idleTimeoutMinutes);
  return { ok: true };
}

export async function assertVaultPinVerified(
  vaultPin?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "You must be signed in." };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.employeeId) {
    return { ok: false, error: "No employee record linked to this account." };
  }

  if (!isExecutiveRank(profile.role)) {
    return { ok: true };
  }

  if (!(await vaultPinConfiguredForCompany())) {
    return {
      ok: false,
      error: "Vault PIN is not configured. Set it in Executive Access before saving settings.",
    };
  }

  if (await hasValidVaultUnlockSession(profile.employeeId, user.email)) {
    return { ok: true };
  }

  if (vaultPin?.trim()) {
    return verifyVaultPinForUser(
      profile.employeeId,
      user.email,
      vaultPin,
      profile.role,
    );
  }

  return {
    ok: false,
    error: "Vault is locked. Unlock with your 4-digit PIN before saving settings.",
  };
}

/** True when a settings write was blocked by the vault PIN gate. */
export { isVaultLockSaveError } from "./executive-vault-session-shared";

export async function unlockExecutiveVaultWithPin(
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "You must be signed in." };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.employeeId) {
    return { ok: false, error: "No employee record linked to this account." };
  }

  const result = await verifyVaultPinForUser(
    profile.employeeId,
    user.email,
    pin,
    profile.role,
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
