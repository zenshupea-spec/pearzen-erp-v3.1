import "server-only";

import type { HeadOfficeRbacStaffRow } from "../../../packages/portal-rbac";
import { createSupabaseServiceClient } from "../../../packages/supabase/service";

const TERMINATED_STATUSES = new Set(["RESIGNED", "TERMINATED"]);

export function normalizeCorporateGroup(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "GUARD_FIELD" ? "GUARD" : normalized;
}

export function isHeadOfficeCorporateGroup(value: unknown): boolean {
  return normalizeCorporateGroup(value) === "HEAD_OFFICE";
}

export function isHeadOfficeWorkforceStatus(status: unknown): boolean {
  const normalized = String(status ?? "ACTIVE").trim().toUpperCase();
  return normalized.length > 0 && !TERMINATED_STATUSES.has(normalized);
}

export function mapHeadOfficeCorporateStaffRow(row: {
  id: unknown;
  full_name?: unknown;
  rank?: unknown;
  email?: unknown;
  status?: unknown;
}): HeadOfficeRbacStaffRow {
  return {
    id: String(row.id),
    fullName:
      typeof row.full_name === "string" && row.full_name.trim()
        ? row.full_name.trim()
        : "Unnamed staff",
    rank: typeof row.rank === "string" ? row.rank.trim().toUpperCase() : null,
    email: typeof row.email === "string" ? row.email.trim() : null,
    status:
      typeof row.status === "string"
        ? row.status.trim().toUpperCase()
        : "ACTIVE",
  };
}

export async function fetchHeadOfficeCorporateStaffForCompany(
  companyId: string | null,
): Promise<HeadOfficeRbacStaffRow[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("employees")
    .select("id, full_name, rank, email, status, group")
    .order("full_name", { ascending: true });

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchHeadOfficeCorporateStaffForCompany:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isHeadOfficeCorporateGroup(row.group))
    .filter((row) => isHeadOfficeWorkforceStatus(row.status))
    .map(mapHeadOfficeCorporateStaffRow);
}
