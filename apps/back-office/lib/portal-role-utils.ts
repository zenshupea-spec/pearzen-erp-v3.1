/** Client-safe portal role helpers (no Supabase / server imports). */

export const HR_PORTAL_EDITOR_ROLES = ["HR", "MD", "OD", "FM", "EA"] as const;
export const PORTAL_RANKS = ["MD", "OD", "OM", "HR", "FM"] as const;
export const EXECUTIVE_RANKS = ["MD", "OD"] as const;

export function normalizePortalRole(
  role: string | null | undefined,
): string | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toUpperCase();
  return normalized || null;
}

export function isExecutiveRank(rank: string | null | undefined): boolean {
  const normalized = normalizePortalRole(rank);
  return (
    normalized !== null &&
    (EXECUTIVE_RANKS as readonly string[]).includes(normalized)
  );
}

export function canManageExecutiveAccess(
  editorRole: string | null | undefined,
): boolean {
  const role = normalizePortalRole(editorRole);
  return role === "MD" || role === "OD";
}

/** HR desk may provision HQ staff OTP — not MD, OD, or HR (executives use MD Portal). */
export function canHrProvisionTargetRank(
  actorRank: string | null | undefined,
  targetRank: string | null | undefined,
): boolean {
  const actor = normalizePortalRole(actorRank);
  const target = normalizePortalRole(targetRank);
  if (actor === "HR") {
    if (target === "HR") return false;
    if (isExecutiveRank(target)) return false;
    return true;
  }
  if (actor === "MD" || actor === "OD") return true;
  return false;
}

export function hrProvisionTargetRankError(
  actorRank: string | null | undefined,
  targetRank: string | null | undefined,
): string {
  const actor = normalizePortalRole(actorRank);
  const target = normalizePortalRole(targetRank);
  if (actor === "HR" && isExecutiveRank(target)) {
    return "HR cannot provision OTP for MD or OD. Use Security & Access in the MD Portal.";
  }
  if (actor === "HR" && target === "HR") {
    return "HR cannot provision OTP for HR. Ask OD or MD.";
  }
  return "You cannot provision OTP for this rank.";
}
