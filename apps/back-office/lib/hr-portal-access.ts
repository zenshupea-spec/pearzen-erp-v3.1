import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  canAccessPathViaPortalRbac,
  hasAnyPortalAccess,
  isImmutableExecutiveRank,
  isLockedOmRank,
  isLockedTmRank,
  landingPathFromPortalRbac,
  type PortalAccessLevel,
} from "../../../packages/portal-rbac";
import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import { resolveCompanyIdForSession } from "./company-context";
import { EXECUTIVE_DESK_PATH, HQ_HUB_PATH } from "./hq-hub";
import { resolveEmployeePortalRbacRow } from "./portal-rbac-store";
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
  employeeId?: string | null;
  portalRbac?: Record<string, PortalAccessLevel> | null;
  /** Head Office staff whose portal routes are gated by the RBAC matrix. */
  rbacGated?: boolean;
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
  if (normalized === "MD" || normalized === "OD") return "/executive/finance";
  if (normalized === "OM") return "/om";
  if (normalized === "TM") return "/tm";
  if (normalized === "HR") return "/hr";
  if (normalized === "FM") return "/fm";
  return null;
}

/** Post-auth landing path for a signed-in user (no public module hub). */
export function authenticatedLandingPath(
  role: string | null | undefined,
  profile?: Pick<BackOfficeUserProfile, "portalRbac" | "rbacGated">,
): string {
  const normalized = normalizePortalRole(role);
  if (!normalized) return "/login/head-office";
  if (normalized === "MD" || normalized === "OD") return EXECUTIVE_DESK_PATH;
  if (normalized === "OM") return "/om";
  if (normalized === "TM") return "/tm";
  if (normalized === "HR" || normalized === "FM") return HQ_HUB_PATH;
  if (profile?.rbacGated) {
    return landingPathFromPortalRbac(profile.portalRbac ?? undefined) != null
      ? HQ_HUB_PATH
      : "/login/head-office";
  }
  return portalPathForRole(normalized) ?? "/login/head-office";
}

export function canAccessPathForProfile(
  pathname: string,
  profile: BackOfficeUserProfile,
): boolean {
  if (!profile.role) return false;
  if (isImmutableExecutiveRank(profile.role)) return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac(pathname, profile.portalRbac ?? undefined);
  }
  const expected = portalPathForRole(profile.role);
  if (!expected) return false;
  return pathname === expected || pathname.startsWith(`${expected}/`);
}

/** HR portal routes (MNR, onboarding, temp roster, etc.). */
export function canAccessHrPortal(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  if (!normalized) return false;
  if (normalized === "MD" || normalized === "OD") return true;
  return normalized === "HR" || normalized === "FM" || normalized === "OM";
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

/** MNR: match signed-in email to employees.email; Head Office staff are RBAC-gated. */
export async function fetchEmployeePortalProfileByEmail(
  email: string,
  companyId?: string | null,
): Promise<BackOfficeUserProfile | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("employees")
    .select("id, full_name, rank, status, id_photo_url, group, company_id")
    .ilike("email", trimmed)
    .maybeSingle();

  if (!data) return null;

  const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
  if (status && status !== "ACTIVE") return null;

  const group =
    typeof data.group === "string" ? data.group.trim().toUpperCase() : "";
  const rank = normalizePortalRole(data.rank as string | undefined);
  const employeeId = typeof data.id === "string" ? data.id : String(data.id ?? "");
  const resolvedCompanyId =
    companyId ??
    (typeof data.company_id === "string" ? data.company_id : null);

  if (group === "HEAD_OFFICE") {
    const portalRbac = await resolveEmployeePortalRbacRow({
      companyId: resolvedCompanyId,
      employeeId,
      rank,
    });

    if (isImmutableExecutiveRank(rank)) {
      return {
        role: rank,
        full_name: typeof data.full_name === "string" ? data.full_name : null,
        id_photo_url:
          typeof data.id_photo_url === "string" ? data.id_photo_url : null,
        employeeId,
        portalRbac,
        rbacGated: false,
      };
    }

    if (isLockedOmRank(rank)) {
      return {
        role: "OM",
        full_name: typeof data.full_name === "string" ? data.full_name : null,
        id_photo_url:
          typeof data.id_photo_url === "string" ? data.id_photo_url : null,
        employeeId,
        portalRbac,
        rbacGated: false,
      };
    }

    if (isLockedTmRank(rank)) {
      return {
        role: "TM",
        full_name: typeof data.full_name === "string" ? data.full_name : null,
        id_photo_url:
          typeof data.id_photo_url === "string" ? data.id_photo_url : null,
        employeeId,
        portalRbac,
        rbacGated: false,
      };
    }

    if (!hasAnyPortalAccess(portalRbac)) {
      return null;
    }

    return {
      role: rank ?? "STAFF",
      full_name: typeof data.full_name === "string" ? data.full_name : null,
      id_photo_url:
        typeof data.id_photo_url === "string" ? data.id_photo_url : null,
      employeeId,
      portalRbac,
      rbacGated: true,
    };
  }

  if (!rank || !isPortalRank(rank)) return null;

  return {
    role: rank,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    id_photo_url:
      typeof data.id_photo_url === "string" ? data.id_photo_url : null,
    employeeId,
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
  const companyId = await resolveCompanyIdForSession(supabase);

  if (user.email) {
    const fromMnr = await fetchEmployeePortalProfileByEmail(user.email, companyId);
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
