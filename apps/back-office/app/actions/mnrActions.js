"use server";

import { revalidatePath } from "next/cache";

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "../../../../packages/supabase/server";
import {
  CLASSIC_VENTURE_COMPANY_ID,
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

const HQ_MASTER_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

function rosterCompanyId(sessionCompanyId) {
  if (!sessionCompanyId || sessionCompanyId === HQ_MASTER_COMPANY_ID) {
    return CLASSIC_VENTURE_COMPANY_ID;
  }
  return sessionCompanyId;
}

const SHIFT_LOOKBACK_DAYS = 14;

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
  const preferredCompanyId = rosterCompanyId(sessionCompanyId);

  let rows = await fetchEmployeeRows(supabase, preferredCompanyId);
  if (!rows.length && preferredCompanyId !== CLASSIC_VENTURE_COMPANY_ID) {
    rows = await fetchEmployeeRows(supabase, CLASSIC_VENTURE_COMPANY_ID);
  }
  if (!rows.length) {
    rows = await fetchEmployeeRows(supabase, null);
  }

  // Signed-in session + RLS or wrong tenant metadata — read roster via service role
  if (!rows.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    rows = await fetchEmployeeRows(service, CLASSIC_VENTURE_COMPANY_ID);
    if (!rows.length) {
      rows = await fetchEmployeeRows(service, null);
    }
  }

  let activity = { epfSet: new Set(), employeeIdSet: new Set() };
  try {
    activity = await fetchRecentShiftIdentifiers(supabase);
  } catch {
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        activity = await fetchRecentShiftIdentifiers(createSupabaseServiceClient());
      }
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
    .select("rank")
    .eq("id", id)
    .maybeSingle();

  assertCanChangeEmployeeStatus(role, existing?.rank);

  if (newStatus === "Resigned") {
    const { assertHrCanConfirmResignation } = await import(
      "../hr/mnr/clearance-actions.ts"
    );
    await assertHrCanConfirmResignation(id);
  }

  const { error } = await supabase
    .from("employees")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
}
