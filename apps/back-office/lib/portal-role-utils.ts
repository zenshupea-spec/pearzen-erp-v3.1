/** Client-safe portal role helpers (no Supabase / server imports). */

export const HR_PORTAL_EDITOR_ROLES = ["HR", "MD", "OD", "FM"] as const;
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
