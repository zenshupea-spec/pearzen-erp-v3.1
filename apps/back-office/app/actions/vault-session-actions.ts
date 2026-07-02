"use server";

import { revalidatePath } from "next/cache";

import { verifyHeadOfficeMfaCode } from "../../lib/head-office-portal-auth";
import {
  clearVaultUnlockSessionCookiesStore,
  hasValidVaultUnlockSession,
  setVaultUnlockSessionCookies,
  unlockExecutiveVaultWithPin,
} from "../../lib/executive-vault-session";
import {
  hashPortalPin,
} from "../../lib/head-office-portal-pin";
import { fetchBackOfficeUserProfile } from "../../lib/hr-portal-access-server";
import { isExecutiveRank } from "../../lib/portal-role-utils";
import { auditStaffAction } from "../../lib/staff-audit";
import { resolveExecutiveCompanyId } from "../executive/settings/lib/executive-md-settings-db";
import { writeSettingsAuditLogForAction } from "../executive/settings/settings-audit";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "../../../../packages/supabase/server";

export type VaultSessionPolicy = {
  autoLockEnabled: boolean;
  idleTimeoutMinutes: number;
};

export type VaultPinStatus = {
  configured: boolean;
};

export type VaultUnlockSessionStatus = {
  /** Vault PIN gate applies to this signed-in user (MD/OD). */
  applies: boolean;
  pinConfigured: boolean;
  unlocked: boolean;
};

export type ActiveVaultSession = {
  id: string;
  user: string;
  role: string;
  roleLabel: string;
  device: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  status: "ONLINE" | "IDLE";
  isCurrent: boolean;
};

type VaultSessionRow = {
  session_id: string;
  user_id: string;
  employee_id: string;
  full_name: string | null;
  rank: string | null;
  work_email: string | null;
  ip: string | null;
  user_agent: string | null;
  last_active_at: string;
};

const DEFAULT_POLICY: VaultSessionPolicy = {
  autoLockEnabled: true,
  idleTimeoutMinutes: 30,
};

const VAULT_PIN_LENGTH = 4;
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

const RANK_LABELS: Record<string, string> = {
  MD: "MD",
  OD: "OD",
  FM: "FM",
  HR: "HR",
  EA: "EA",
  OM: "OM",
  TM: "TM",
};

function normalizeVaultPin(pin: string): string | null {
  const trimmed = pin.replace(/\D/g, "");
  if (trimmed.length !== VAULT_PIN_LENGTH) return null;
  return trimmed;
}

function decodeAccessTokenSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

async function getCurrentAuthSessionId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return decodeAccessTokenSessionId(session.access_token);
}

async function assertVaultSessionAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: "Only MD or OD can manage vault sessions." as const };
  }

  const companyId = await resolveExecutiveCompanyId(supabase);
  return { supabase, profile, user, companyId };
}

function parseUserAgent(userAgent: string | null): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "Unknown device";
  if (ua.includes("Electron")) return "Desktop app · Electron";
  if (/iPad|iPhone|iPod/i.test(ua)) {
    const browser = ua.includes("CriOS") || ua.includes("Chrome")
      ? "Chrome"
      : "Safari";
    return `iOS · ${browser}`;
  }
  if (/Android/i.test(ua)) {
    return ua.includes("Chrome") ? "Android · Chrome" : "Android · Mobile browser";
  }
  if (ua.includes("Macintosh")) {
    const browser = ua.includes("Edg/")
      ? "Edge"
      : ua.includes("Chrome/")
        ? "Chrome"
        : ua.includes("Safari/")
          ? "Safari"
          : "Browser";
    return `macOS · ${browser}`;
  }
  if (ua.includes("Windows")) {
    const browser = ua.includes("Edg/")
      ? "Edge"
      : ua.includes("Chrome/")
        ? "Chrome"
        : "Browser";
    return `Windows · ${browser}`;
  }
  return ua.length > 48 ? `${ua.slice(0, 48)}…` : ua;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const diffMs = Date.now() - then;
  if (diffMs < 45_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function resolveRoleLabel(rank: string | null | undefined): string {
  const normalized = String(rank ?? "HO").trim().toUpperCase();
  return RANK_LABELS[normalized] ?? normalized;
}

function mapVaultSessionRow(
  row: VaultSessionRow,
  currentSessionId: string | null,
): ActiveVaultSession {
  const lastActiveAt = row.last_active_at;
  const lastActiveMs = new Date(lastActiveAt).getTime();
  const status =
    Number.isFinite(lastActiveMs) &&
    Date.now() - lastActiveMs <= ONLINE_THRESHOLD_MS
      ? "ONLINE"
      : "IDLE";

  return {
    id: row.session_id,
    user: row.full_name?.trim() || row.work_email?.trim() || "Head Office user",
    role: String(row.rank ?? "HO").trim().toUpperCase() || "HO",
    roleLabel: resolveRoleLabel(row.rank),
    device: parseUserAgent(row.user_agent),
    ipAddress: row.ip?.trim() || "—",
    location: "—",
    lastActive: formatRelativeTime(lastActiveAt),
    status,
    isCurrent: Boolean(currentSessionId && row.session_id === currentSessionId),
  };
}

export async function listActiveVaultSessions(): Promise<
  { sessions: ActiveVaultSession[] } | { error: string }
> {
  const actor = await assertVaultSessionAdmin();
  if ("error" in actor) return { error: actor.error };

  const db = createSupabaseServiceClient();
  const currentSessionId = await getCurrentAuthSessionId();
  const { data, error } = await db.rpc("list_active_head_office_vault_sessions", {
    p_company_id: actor.companyId,
  });

  if (error) return { error: error.message };

  const sessions = ((data ?? []) as VaultSessionRow[]).map((row) =>
    mapVaultSessionRow(row, currentSessionId),
  );

  return { sessions };
}

export async function revokeVaultSessionAction(
  sessionId: string,
): Promise<{ ok: true } | { error: string }> {
  const actor = await assertVaultSessionAdmin();
  if ("error" in actor) return { error: actor.error };

  const currentSessionId = await getCurrentAuthSessionId();
  if (currentSessionId && sessionId === currentSessionId) {
    return { error: "You cannot revoke your current session from this panel." };
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("revoke_head_office_vault_session", {
    p_session_id: sessionId,
    p_company_id: actor.companyId,
  });

  if (error) return { error: error.message };
  if (!data) return { error: "Session not found or already revoked." };

  await auditStaffAction({
    supabase: actor.supabase,
    portal: "hq",
    action: "Revoke Head Office Vault Session",
    targetEntity: sessionId,
  });

  revalidatePath("/executive/settings");
  return { ok: true };
}

export async function revokeAllOtherVaultSessionsAction(): Promise<
  { ok: true; revokedCount: number } | { error: string }
> {
  const actor = await assertVaultSessionAdmin();
  if ("error" in actor) return { error: actor.error };

  const currentSessionId = await getCurrentAuthSessionId();
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("revoke_other_head_office_vault_sessions", {
    p_current_session_id: currentSessionId,
    p_company_id: actor.companyId,
  });

  if (error) return { error: error.message };

  const revokedCount = typeof data === "number" ? data : 0;

  await auditStaffAction({
    supabase: actor.supabase,
    portal: "hq",
    action: "Terminate Other Head Office Vault Sessions",
    details: { revokedCount },
  });

  revalidatePath("/executive/settings");
  return { ok: true, revokedCount };
}

export async function getVaultSessionPolicy(): Promise<VaultSessionPolicy> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("md_settings")
    .select("vault_auto_lock_enabled, vault_idle_timeout_minutes")
    .eq("company_id", companyId)
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

export async function getVaultPinStatus(): Promise<VaultPinStatus> {
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
  return { configured: Boolean(hash) };
}

export async function getVaultUnlockSessionStatus(): Promise<VaultUnlockSessionStatus> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { applies: false, pinConfigured: false, unlocked: false };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.employeeId || !isExecutiveRank(profile.role)) {
    return { applies: false, pinConfigured: false, unlocked: true };
  }

  const pinStatus = await getVaultPinStatus();
  if (!pinStatus.configured) {
    return { applies: true, pinConfigured: false, unlocked: false };
  }

  const unlocked = await hasValidVaultUnlockSession(
    profile.employeeId,
    user.email,
  );
  return { applies: true, pinConfigured: true, unlocked };
}

export async function verifyVaultUnlockPin(
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  return unlockExecutiveVaultWithPin(pin);
}

export async function clearExecutiveVaultUnlockAction(): Promise<{ ok: true }> {
  await clearVaultUnlockSessionCookiesStore();
  return { ok: true };
}

/** Slide the MD vault unlock cookie forward while the user is still active. */
export async function refreshVaultUnlockSessionAction(): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.employeeId || !isExecutiveRank(profile.role)) return { ok: false };

  const pinStatus = await getVaultPinStatus();
  if (!pinStatus.configured) return { ok: false };

  const policy = await getVaultSessionPolicy();
  if (!policy.autoLockEnabled) return { ok: false };

  await setVaultUnlockSessionCookies(
    profile.employeeId,
    user.email,
    policy.idleTimeoutMinutes,
  );
  return { ok: true };
}

export async function saveVaultMasterPin(
  mfaCode: string,
  newPin: string,
  confirmPin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "You must be signed in." };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (profile.role !== "MD") {
    return {
      ok: false,
      error: "Only the Managing Director can change the master vault PIN.",
    };
  }
  if (!profile.employeeId) {
    return { ok: false, error: "No employee record linked to this account." };
  }

  const normalized = normalizeVaultPin(newPin);
  const normalizedConfirm = normalizeVaultPin(confirmPin);
  if (!normalized || !normalizedConfirm) {
    return { ok: false, error: "Enter a 4-digit vault PIN." };
  }
  if (normalized !== normalizedConfirm) {
    return { ok: false, error: "PINs do not match." };
  }

  const mfa = await verifyHeadOfficeMfaCode(profile.employeeId, mfaCode);
  if (!mfa.ok) {
    return { ok: false, error: mfa.error ?? "Invalid MFA code." };
  }

  const db = createSupabaseServiceClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const { error } = await db.from("md_settings").upsert(
    {
      company_id: companyId,
      vault_pin_hash: hashPortalPin(normalized),
    },
    { onConflict: "company_id" },
  );

  if (error) return { ok: false, error: error.message };

  const audit = await writeSettingsAuditLogForAction("UPDATE_VAULT_MASTER_PIN", {
    configured: true,
  });
  if (!audit.ok) return { ok: false, error: audit.error };

  revalidatePath("/executive/settings");
  revalidatePath("/executive/audit");
  return { ok: true };
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

  const companyId = await resolveExecutiveCompanyId(supabase);
  const { error } = await db.from("md_settings").upsert(
    {
      company_id: companyId,
      vault_auto_lock_enabled: autoLockEnabled,
      vault_idle_timeout_minutes: minutes,
    },
    { onConflict: "company_id" },
  );

  if (error) throw new Error(error.message);

  const audit = await writeSettingsAuditLogForAction("UPDATE_VAULT_SESSION_POLICY", {
    autoLockEnabled,
    idleTimeoutMinutes: minutes,
  });
  if (!audit.ok) throw new Error(audit.error);

  revalidatePath("/executive/settings");
  revalidatePath("/executive/audit");
  return { ok: true };
}
