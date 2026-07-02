import "server-only";

import type { HeadOfficeRbacStaffRow } from "../../../packages/portal-rbac";
import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import {
  isOmRankEmployee,
  resolveEmployeeEpfNo,
} from "./om-sector-assignment-spec";

const TERMINATED_STATUSES = new Set(["RESIGNED", "TERMINATED"]);

export function normalizeCorporateGroup(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "GUARD_FIELD") return "GUARD";
  if (normalized === "SECTOR_MANAGER") return "HEAD_OFFICE";
  return normalized;
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

export type OmRankStaffRow = HeadOfficeRbacStaffRow & {
  epfNo: string | null;
};

function mapOmRankStaffRow(row: {
  id: unknown;
  full_name?: unknown;
  rank?: unknown;
  email?: unknown;
  status?: unknown;
  epf_no?: unknown;
  epf_num?: unknown;
  emp_number?: unknown;
}): OmRankStaffRow {
  return {
    ...mapHeadOfficeCorporateStaffRow(row),
    epfNo: resolveEmployeeEpfNo(row),
  };
}

/** Active company employees with rank OM — not restricted to Head Office group. */
export async function fetchActiveOmRankEmployeesForCompany(
  companyId: string,
): Promise<OmRankStaffRow[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, rank, email, status, group, epf_no, epf_num, emp_number")
    .eq("company_id", companyId)
    .ilike("rank", "OM")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("fetchActiveOmRankEmployeesForCompany:", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isOmRankEmployee(row.rank as string | null | undefined))
    .filter((row) => isHeadOfficeWorkforceStatus(row.status))
    .map(mapOmRankStaffRow);
}
