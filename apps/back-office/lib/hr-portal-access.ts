import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import {
  HR_PORTAL_EDITOR_ROLES,
  normalizePortalRole,
  PORTAL_RANKS,
} from "./portal-role-utils";

export {
  EXECUTIVE_RANKS,
  HR_PORTAL_EDITOR_ROLES,
  normalizePortalRole,
  PORTAL_RANKS,
} from "./portal-role-utils";

export type HrPortalEditorRole = (typeof HR_PORTAL_EDITOR_ROLES)[number];
export type PortalRank = (typeof PORTAL_RANKS)[number];

export type BackOfficeUserProfile = {
  role: string | null;
  full_name: string | null;
  id_photo_url: string | null;
};

export function isPortalRank(
  role: string | null | undefined,
): role is PortalRank {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (PORTAL_RANKS as readonly string[]).includes(normalized)
  );
}

export function portalPathForRole(
  role: string | null | undefined,
): string | null {
  const normalized = normalizePortalRole(role);
  if (!normalized) return null;
  if (normalized === "MD" || normalized === "OD") return "/executive";
  if (normalized === "OM") return "/om";
  if (normalized === "HR") return "/hr";
  if (normalized === "FM") return "/fm";
  return null;
}

/** Post-auth landing path for a signed-in user (no public module hub). */
export function authenticatedLandingPath(
  role: string | null | undefined,
): string {
  const normalized = normalizePortalRole(role);
  if (!normalized) return "/login/head-office";
  // MD/OD home is the cross-portal HQ nexus, not CV Operations.
  if (normalized === "MD" || normalized === "OD") return "/dashboard";
  return portalPathForRole(normalized) ?? "/login/head-office";
}

export function isHrPortalEditor(
  role: string | null | undefined,
): role is HrPortalEditorRole {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (HR_PORTAL_EDITOR_ROLES as readonly string[]).includes(normalized)
  );
}

export function assertHrPortalEditor(
  role: string | null | undefined,
): asserts role is HrPortalEditorRole {
  if (!isHrPortalEditor(role)) {
    throw new Error("Only HR, MD, OD, or FM can perform this action.");
  }
}

function profileFromRow(
  row: { role?: unknown; full_name?: unknown; id_photo_url?: unknown } | null | undefined,
): BackOfficeUserProfile | null {
  if (!row || typeof row.role !== "string") return null;
  const role = normalizePortalRole(row.role);
  if (!role) return null;
  return {
    role,
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    id_photo_url:
      typeof row.id_photo_url === "string" ? row.id_photo_url : null,
  };
}

/** MNR: match signed-in email to employees.email; employees.rank is the portal role. */
export async function fetchEmployeePortalProfileByEmail(
  email: string,
): Promise<BackOfficeUserProfile | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("employees")
    .select("full_name, rank, status, id_photo_url")
    .ilike("email", trimmed)
    .maybeSingle();

  if (!data) return null;

  const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
  if (status && status !== "ACTIVE") return null;

  const role = normalizePortalRole(data.rank as string | undefined);
  if (!role || !isPortalRank(role)) return null;

  return {
    role,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    id_photo_url:
      typeof data.id_photo_url === "string" ? data.id_photo_url : null,
  };
}

/**
 * Resolve portal clearance for a signed-in user.
 * Priority: MNR employee (email → rank) → legacy users table → auth metadata.
 */
export async function fetchBackOfficeUserProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<BackOfficeUserProfile> {
  if (user.email) {
    const fromMnr = await fetchEmployeePortalProfileByEmail(user.email);
    if (fromMnr) return fromMnr;
  }

  const select = "role, full_name";

  if (user.email) {
    const { data } = await supabase
      .from("users")
      .select(select)
      .ilike("email", user.email)
      .maybeSingle();
    const fromEmail = profileFromRow(data);
    if (fromEmail) return fromEmail;
  }

  if (user.id) {
    const { data } = await supabase
      .from("users")
      .select(select)
      .eq("id", user.id)
      .maybeSingle();
    const fromId = profileFromRow(data);
    if (fromId) return fromId;
  }

  const metaRole = normalizePortalRole(
    user.user_metadata?.role as string | undefined,
  );
  if (metaRole) {
    const metaName = user.user_metadata?.full_name;
    return {
      role: metaRole,
      full_name: typeof metaName === "string" ? metaName : null,
      id_photo_url: null,
    };
  }

  return { role: null, full_name: null, id_photo_url: null };
}

export function formatHrPortalEditorLabel(
  name: string,
  role: HrPortalEditorRole,
): string {
  return `${name} (${role})`;
}
