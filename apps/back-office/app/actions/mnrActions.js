"use server";

import { revalidatePath } from "next/cache";

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "../../../../packages/supabase/server";
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from "../../lib/company-context-server";
import {
  decryptEmployeePiiRecord,
  encryptEmployeePiiRecord,
} from "../../lib/employee-pii";
import {
  assertCanChangeEmployeeStatus,
  assertMnrEditAllowed,
} from "../../lib/executive-rank-guard";
import {
  assertHrPortalEditor,
  canAccessHrPortal,
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
} from "../../lib/hr-portal-access-server";
import { rankSortIndex } from "../../../../packages/rank-pay-matrix";
import {
  computeMnrPersonnelCounts,
  internalWorkforceGroup,
  isInternalWorkforceEmployee,
  matchesMnrPersonnelFilter,
  matchesMnrSearch,
} from "../../lib/mnr-operational-buckets";

const SHIFT_LOOKBACK_DAYS = 14;
const MNR_PAGE_SIZE_DEFAULT = 20;

const MNR_SUMMARY_COLUMNS = [
  "id",
  "emp_number",
  "epf_no",
  "epf_num",
  "full_name",
  "status",
  "site",
  "group",
  "rank",
  "maternity_leave",
  "nic",
  "passport_no",
  "date_joined",
  "grama_niladari_expiry",
  "grama_niladari_url",
  "nic_passport_doc_url",
  "police_clearance_url",
  "email",
  "id_photo_url",
  "base_salary",
  "basic_salary",
].join(", ");

function shiftCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - SHIFT_LOOKBACK_DAYS);
  d.setHours(0, 0, 0, 0);
  return {
    iso: d.toISOString(),
    date: d.toISOString().split("T")[0],
  };
}

async function fetchRecentShiftIdentifiers(supabase) {
  const { iso, date } = shiftCutoff();
  const epfSet = new Set();
  const employeeIdSet = new Set();

  const [logsRes, smRes, shiftsRes] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("emp_number")
      .gte("device_time", iso)
      .eq("action_type", "CHECK_IN"),
    supabase
      .from("sm_guard_attendance")
      .select("guard_epf")
      .gte("shift_date", date)
      .neq("status", "CANCELLED"),
    supabase
      .from("time_shifts")
      .select("employee_id")
      .gte("check_in_time", iso),
  ]);

  if (!logsRes.error) {
    for (const row of logsRes.data ?? []) {
      if (row.emp_number) epfSet.add(String(row.emp_number));
    }
  }
  if (!smRes.error) {
    for (const row of smRes.data ?? []) {
      if (row.guard_epf) epfSet.add(String(row.guard_epf));
    }
  }
  if (!shiftsRes.error) {
    for (const row of shiftsRes.data ?? []) {
      if (row.employee_id) employeeIdSet.add(String(row.employee_id));
    }
  }

  return { epfSet, employeeIdSet };
}

function employeeHasRecentShift(emp, { epfSet, employeeIdSet }) {
  const epf =
    emp.emp_number ??
    (emp.epf_no != null ? String(emp.epf_no) : emp.epf_num != null ? String(emp.epf_num) : null);
  if (epf && epfSet.has(epf)) return true;
  if (emp.id && employeeIdSet.has(String(emp.id))) return true;
  return false;
}

async function fetchEmployeeRows(supabase, companyId) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("employees")
      .select("*")
      .order("full_name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

async function fetchEmployeeSummaryRows(supabase, companyId) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("employees")
      .select(MNR_SUMMARY_COLUMNS)
      .order("full_name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all.map((row) => decryptEmployeePiiRecord(row));
}

async function fetchEmployeeRowsByIds(supabase, companyId, ids) {
  if (!ids.length) return [];
  let query = supabase.from("employees").select("*").in("id", ids);
  if (companyId) {
    query = query.eq("company_id", companyId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((row) => [String(row.id), row]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((emp) => ({
      ...decryptEmployeePiiRecord(emp),
      base_salary: emp.base_salary ?? emp.basic_salary ?? null,
      has_recent_shift: false,
    }));
}

async function assertMnrReader() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessHrPortal(profile.role)) {
    throw new Error("You do not have access to the Master Nominal Roll.");
  }

  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return { supabase, sessionCompanyId };
}

async function loadEmployeeSummaries(supabase, sessionCompanyId) {
  let rows = await fetchWithRosterCompanyFallback(
    (companyId) => fetchEmployeeSummaryRows(supabase, companyId),
    sessionCompanyId,
  );

  if (!rows.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    rows = await fetchWithRosterCompanyFallback(
      (companyId) => fetchEmployeeSummaryRows(service, companyId),
      sessionCompanyId,
    );
  }

  return rows;
}

function sortMnrRows(rows, sortBy, sortDir, matrix) {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "rank") {
      cmp = rankSortIndex(matrix, a.rank) - rankSortIndex(matrix, b.rank);
    } else if (sortBy === "date_joined") {
      cmp = (a.date_joined || "").localeCompare(b.date_joined || "");
    } else if (sortBy === "status") {
      cmp = (a.status || "").localeCompare(b.status || "");
    } else {
      cmp = (a.full_name || "").localeCompare(b.full_name || "");
    }
    return cmp * dir;
  });
}

/** Paginated MNR desk — decrypts full rows for the current page only. */
export async function getMnrRosterDesk({
  personnelFilter = "ACTIVE",
  groupFilter = null,
  searchQuery = "",
  sortBy = "name",
  sortDir = "asc",
  page = 1,
  pageSize = MNR_PAGE_SIZE_DEFAULT,
} = {}) {
  const { supabase, sessionCompanyId } = await assertMnrReader();
  const { getRankPayMatrix } = await import(
    "../executive/settings/rank-matrix-actions"
  );
  const { CVS_INTERNAL_WORKFORCE_ONLY } = await import(
    "../../lib/cvs-workforce-phase"
  );

  const [summaries, matrix] = await Promise.all([
    loadEmployeeSummaries(supabase, sessionCompanyId),
    getRankPayMatrix().catch(() => []),
  ]);

  const counts = computeMnrPersonnelCounts(
    summaries,
    matrix,
    CVS_INTERNAL_WORKFORCE_ONLY,
  );

  let pool = summaries;
  if (CVS_INTERNAL_WORKFORCE_ONLY) {
    pool = pool.filter(isInternalWorkforceEmployee);
  }
  if (groupFilter === "HEAD_OFFICE" || groupFilter === "CAFE") {
    pool = pool.filter((row) => internalWorkforceGroup(row) === groupFilter);
  }

  let filtered = pool.filter((row) =>
    matchesMnrPersonnelFilter(row, personnelFilter, matrix),
  );
  filtered = filtered.filter((row) => matchesMnrSearch(row, searchQuery));
  filtered = sortMnrRows(filtered, sortBy, sortDir, matrix);

  const safePageSize = Math.max(1, Math.min(Number(pageSize) || MNR_PAGE_SIZE_DEFAULT, 100));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const slice = filtered.slice(
    (safePage - 1) * safePageSize,
    safePage * safePageSize,
  );
  const ids = slice.map((row) => row.id);

  let rows = await fetchWithRosterCompanyFallback(
    (companyId) => fetchEmployeeRowsByIds(supabase, companyId, ids),
    sessionCompanyId,
  );

  if (!rows.length && ids.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    rows = await fetchWithRosterCompanyFallback(
      (companyId) => fetchEmployeeRowsByIds(service, companyId, ids),
      sessionCompanyId,
    );
  }

  return {
    rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    counts,
    rosterTotal: pool.length,
  };
}

/** Lightweight rows for search suggestions and EPF/email uniqueness checks. */
export async function getMnrEmployeeUniquenessIndex() {
  const { supabase, sessionCompanyId } = await assertMnrReader();
  const summaries = await loadEmployeeSummaries(supabase, sessionCompanyId);
  return summaries.map((row) => ({
    id: row.id,
    epf_no: row.epf_no,
    epf_num: row.epf_num,
    emp_number: row.emp_number,
    email: row.email,
    full_name: row.full_name,
    nic: row.nic,
    passport_no: row.passport_no,
    rank: row.rank,
    status: row.status,
    group: row.group,
    site: row.site,
    id_photo_url: row.id_photo_url,
    maternity_leave: row.maternity_leave,
  }));
}

export async function getEmployees() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessHrPortal(profile.role)) {
    throw new Error("You do not have access to the Master Nominal Roll.");
  }

  const sessionCompanyId = await resolveCompanyIdForSession(supabase);

  const activityPromise = fetchRecentShiftIdentifiers(supabase).catch(() => ({
    epfSet: new Set(),
    employeeIdSet: new Set(),
  }));

  let rows = await fetchWithRosterCompanyFallback(
    (companyId) => fetchEmployeeRows(supabase, companyId),
    sessionCompanyId,
  );

  // Signed-in session + RLS or wrong tenant metadata — read roster via service role
  if (!rows.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    rows = await fetchWithRosterCompanyFallback(
      (companyId) => fetchEmployeeRows(service, companyId),
      sessionCompanyId,
    );
  }

  let activity = await activityPromise;
  if (!activity.epfSet.size && !activity.employeeIdSet.size && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      activity = await fetchRecentShiftIdentifiers(createSupabaseServiceClient());
    } catch {
      /* roster still usable without shift flags */
    }
  }

  return rows.map((emp) => ({
    ...decryptEmployeePiiRecord(emp),
    base_salary: emp.base_salary ?? emp.basic_salary ?? null,
    has_recent_shift: employeeHasRecentShift(emp, activity),
  }));
}

export async function setMaternityLeave(id, onLeave) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  assertHrPortalEditor(role);

  const { data: existing } = await supabase
    .from("employees")
    .select("section_edits, rank")
    .eq("id", id)
    .single();

  assertMnrEditAllowed({ editorRole: role, employeeRank: existing?.rank });

  const editorName =
    (profile.full_name?.trim()) ||
    user.email ||
    role;

  const prior =
    existing?.section_edits &&
    typeof existing.section_edits === "object" &&
    !Array.isArray(existing.section_edits)
      ? { ...existing.section_edits }
      : {};

  prior.employment = {
    at: new Date().toISOString(),
    by: formatHrPortalEditorLabel(editorName, role),
  };

  const { error } = await supabase
    .from("employees")
    .update({
      maternity_leave: Boolean(onLeave),
      section_edits: prior,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
}

export async function saveEmployee(formData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  assertHrPortalEditor(role);

  const id = formData.get("id");

  const employeeData = encryptEmployeePiiRecord({
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    nic: formData.get("nic"),
    phone: formData.get("phone"),
    status: "Active",
  });

  let error;
  if (id) {
    ({ error } = await supabase.from("employees").update(employeeData).eq("id", id));
  } else {
    ({ error } = await supabase.from("employees").insert([employeeData]));
  }

  if (error) throw new Error(error.message);
  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
}

export async function terminateEmployee(id, newStatus) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  assertHrPortalEditor(role);

  const { data: existing } = await supabase
    .from("employees")
    .select("rank, emp_number, epf_no, epf_num, date_resigned")
    .eq("id", id)
    .maybeSingle();

  assertCanChangeEmployeeStatus(role, existing?.rank);

  const isResignation =
    String(newStatus ?? "")
      .trim()
      .toLowerCase() === "resigned";

  if (isResignation) {
    const { assertHrCanConfirmResignation, finalizeClearanceOnResignation } = await import(
      "../hr/mnr/clearance-actions.ts"
    );
    await assertHrCanConfirmResignation(id);
    await finalizeClearanceOnResignation(id, user.id, supabase);
  }

  const resignDate =
    existing?.date_resigned ?? new Date().toISOString().split("T")[0];
  const normalizedStatus = isResignation ? "RESIGNED" : newStatus;

  const { error } = await supabase
    .from("employees")
    .update({
      status: normalizedStatus,
      ...(isResignation ? { date_resigned: resignDate } : {}),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (isResignation) {
    const guardEpfs = [
      existing?.emp_number,
      existing?.epf_no != null ? String(existing.epf_no) : null,
      existing?.epf_num != null ? String(existing.epf_num) : null,
    ]
      .filter(Boolean)
      .map((epf) => String(epf).trim().toUpperCase());

    if (guardEpfs.length) {
      const { error: smFreezeError } = await supabase
        .from("sm_guard_attendance")
        .update({ status: "CANCELLED" })
        .in("guard_epf", guardEpfs)
        .gt("shift_date", resignDate)
        .in("status", ["SUBMITTED", "PENDING"]);

      if (smFreezeError) {
        console.error(
          "[terminateEmployee] sm_guard_attendance freeze:",
          smFreezeError.message,
        );
      }
    }

    const { error: shiftFreezeError } = await supabase
      .from("time_shifts")
      .update({ verification_status: "REJECTED" })
      .eq("employee_id", id)
      .gt("shift_date", resignDate)
      .eq("verification_status", "PENDING");

    if (shiftFreezeError) {
      console.error(
        "[terminateEmployee] time_shifts freeze:",
        shiftFreezeError.message,
      );
    }
  }

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
}
