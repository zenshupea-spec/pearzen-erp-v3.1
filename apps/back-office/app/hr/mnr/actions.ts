"use server";

import { revalidatePath } from "next/cache";

import {
  isRankInMatrix,
  isRankValidForCorporateGroup,
} from "../../../../../packages/rank-pay-matrix";
import { createSupabaseServerClient } from "../../../../../packages/supabase/server";
import {
  assertMnrEditAllowed,
  canManageExecutiveAccess,
} from "../../../lib/executive-rank-guard";
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
  isHrPortalEditor,
  normalizePortalRole,
} from "../../../lib/hr-portal-access";
import { encryptEmployeePiiRecord } from "../../../lib/employee-pii";
import { getRankPayMatrix } from "../../executive/settings/rank-matrix-actions";
import { auditStaffAction } from "../../../lib/staff-audit";
import type { MnrAccess, MnrSectionKey, SectionEditMeta } from "./mnr-action-types";

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to edit employee records.");
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  assertHrPortalEditor(role);

  const name =
    (profile.full_name?.trim()) ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email ||
    role;

  return { supabase, editorLabel: formatHrPortalEditorLabel(name, role), editorRole: role };
}

function normalizeEpfNo(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s.toLowerCase() : "";
}

function normalizeWorkEmail(value: unknown): string {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s || "";
}

function friendlyEmployeeSaveError(message: string): string {
  if (message.includes("employees_email_lower_unique")) {
    return "Work email is already assigned to another employee.";
  }
  return message;
}

async function assertEmailUnique(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  email: unknown,
  employeeId: string
) {
  const norm = normalizeWorkEmail(email);
  if (!norm) return;

  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, email")
    .neq("id", employeeId);

  if (error) throw new Error(error.message);

  const conflict = (data ?? []).find(
    (row) => normalizeWorkEmail(row.email) === norm
  );

  if (conflict) {
    throw new Error(
      `Work email is already in use by ${conflict.full_name as string}.`
    );
  }
}

function employeeStoredEpfNo(row: {
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string {
  const raw = row.epf_no ?? row.epf_num;
  return raw == null ? "" : String(raw).trim();
}

async function assertEpfNoUnique(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  epfNo: unknown,
  employeeId: string
) {
  const norm = normalizeEpfNo(epfNo);
  if (!norm) return;

  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, epf_no, epf_num")
    .neq("id", employeeId);

  if (error) throw new Error(error.message);

  const conflict = (data ?? []).find(
    (row) => normalizeEpfNo(employeeStoredEpfNo(row)) === norm
  );

  if (conflict) {
    throw new Error(
      `EPF number is already in use by ${conflict.full_name as string}.`
    );
  }
}

function stampSectionEdits(
  existing: Record<string, SectionEditMeta> | null | undefined,
  section: MnrSectionKey,
  editorLabel: string
): Record<string, SectionEditMeta> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  base[section] = { at: new Date().toISOString(), by: editorLabel };
  return base;
}

export async function getMnrAccess(): Promise<MnrAccess> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      canEdit: false,
      role: null,
      signedIn: false,
      canManageExecutive: false,
      viewerEmail: null,
    };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  return {
    canEdit: isHrPortalEditor(role),
    role,
    signedIn: true,
    canManageExecutive: canManageExecutiveAccess(role),
    viewerEmail: user.email?.trim().toLowerCase() ?? null,
  };
}

export async function saveEmployeeSection(
  section: MnrSectionKey,
  employeeId: string,
  payload: Record<string, unknown>
) {
  const { supabase, editorLabel, editorRole } = await requireHrEditor();

  const { data: existing, error: fetchError } = await supabase
    .from("employees")
    .select("section_edits, rank, email, group")
    .eq("id", employeeId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const rankRaw = typeof payload.rank === "string" ? payload.rank.trim() : "";
  const proposedRank = rankRaw ? normalizePortalRole(rankRaw) : undefined;

  assertMnrEditAllowed({
    editorRole,
    employeeRank: existing?.rank as string | undefined,
    newRank: proposedRank,
  });

  const sectionEdits = stampSectionEdits(
    existing?.section_edits as Record<string, SectionEditMeta> | undefined,
    section,
    editorLabel
  );

  let patch: Record<string, unknown> = { section_edits: sectionEdits };

  if (section === "personal") {
    const groupRaw = String(existing?.group ?? "").trim().toUpperCase();
    const isHeadOffice = groupRaw === "HEAD_OFFICE";
    const emailRaw =
      typeof payload.email === "string" ? payload.email.trim() : "";
    const emailToSave = isHeadOffice
      ? emailRaw || null
      : (existing?.email as string | null | undefined) ?? null;
    await assertEpfNoUnique(supabase, payload.epf_no, employeeId);
    await assertEmailUnique(supabase, emailToSave, employeeId);
    patch = {
      ...patch,
      ...encryptEmployeePiiRecord({
        full_name: payload.full_name,
        email: emailToSave,
        passport_no: payload.passport_no || null,
        epf_no: payload.epf_no || null,
        dob: payload.dob || null,
        gender: payload.gender || null,
        nationality: payload.nationality || null,
        religion: payload.religion || null,
        home_address: payload.home_address || null,
        nic: payload.nic ?? "",
        phone: payload.phone ?? "",
      }),
    };
  } else if (section === "employment") {
    const rankRaw = typeof payload.rank === "string" ? payload.rank.trim() : "";
    const rank = rankRaw ? rankRaw.toUpperCase() : null;
    if (rank) {
      const matrix = await getRankPayMatrix();
      const groupRaw =
        typeof payload.group === "string" ? payload.group.trim().toUpperCase() : "";
      const group =
        groupRaw === "GUARD_FIELD" ? "GUARD" : groupRaw;
      if (groupRaw) {
        if (!isRankValidForCorporateGroup(matrix, group, rank)) {
          throw new Error(
            `Rank "${rank}" is not valid for corporate group "${groupRaw}". Check MD Settings → Rank Pay Matrix.`,
          );
        }
      } else if (!isRankInMatrix(matrix, rank)) {
        throw new Error(
          `Rank "${rank}" is not defined in MD Settings → Rank Pay Matrix. Add it there first.`,
        );
      }
    }
    const savedGroup =
      typeof payload.group === "string" && payload.group.trim()
        ? (groupRaw === "GUARD_FIELD" ? "GUARD" : groupRaw)
        : null;
    patch = {
      ...patch,
      rank,
      group: savedGroup,
      site: payload.site || null,
      date_joined: payload.date_joined || null,
      status: payload.status || null,
      base_salary: payload.base_salary != null && payload.base_salary !== ""
        ? Number(payload.base_salary)
        : null,
      salary_type:
        typeof payload.salary_type === "string" && payload.salary_type.trim()
          ? payload.salary_type.trim().toUpperCase()
          : null,
      epf_yn: payload.epf_yn === true || payload.epf_yn === "true",
    };
  } else if (section === "bank") {
    patch = {
      ...patch,
      ...encryptEmployeePiiRecord({
        bank_code: payload.bank_code || null,
        branch_code: payload.branch_code || null,
        account_number: payload.account_number || null,
      }),
    };
  } else if (section === "vetting") {
    patch = {
      ...patch,
      mod_expiry: payload.mod_expiry || null,
      police_expiry: payload.police_expiry || null,
    };
  }

  const { error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", employeeId);

  if (error) throw new Error(friendlyEmployeeSaveError(error.message));

  await auditStaffAction({
    supabase,
    portal: "hr",
    action: `MNR Save — ${section}`,
    targetEntity: `Employee ${employeeId}`,
    actorName: editorLabel,
    actorRole: editorRole,
  });

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
  revalidatePath("/om");
  revalidatePath("/om/roster");
  revalidatePath("/om/sites/assignments");
  revalidatePath("/tm");
  revalidatePath("/fm");
  revalidatePath("/fm/roster");
  revalidatePath("/executive/settings");
}

const ALL_MNR_SECTIONS: MnrSectionKey[] = [
  "personal",
  "employment",
  "bank",
  "vetting",
];

function stampAllSectionEdits(
  existing: Record<string, SectionEditMeta> | null | undefined,
  editorLabel: string
): Record<string, SectionEditMeta> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const at = new Date().toISOString();
  for (const section of ALL_MNR_SECTIONS) {
    base[section] = { at, by: editorLabel };
  }
  return base;
}

/** Persist personal, employment, bank, and vetting fields in one update. */
export async function saveEmployeeAll(
  employeeId: string,
  payload: Record<string, unknown>
) {
  const { supabase, editorLabel, editorRole } = await requireHrEditor();

  const { data: existing, error: fetchError } = await supabase
    .from("employees")
    .select("section_edits, rank, email, group")
    .eq("id", employeeId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const rankRaw = typeof payload.rank === "string" ? payload.rank.trim() : "";
  const proposedRank = rankRaw ? normalizePortalRole(rankRaw) : undefined;

  assertMnrEditAllowed({
    editorRole,
    employeeRank: existing?.rank as string | undefined,
    newRank: proposedRank,
  });

  const groupRawExisting = String(existing?.group ?? "").trim().toUpperCase();
  const groupRawPayload =
    typeof payload.group === "string" ? payload.group.trim().toUpperCase() : "";
  const groupForEmail = groupRawPayload
    ? (groupRawPayload === "GUARD_FIELD" ? "GUARD" : groupRawPayload)
    : groupRawExisting;
  const isHeadOffice = groupForEmail === "HEAD_OFFICE";
  const emailRaw =
    typeof payload.email === "string" ? payload.email.trim() : "";
  const emailToSave = isHeadOffice
    ? emailRaw || null
    : (existing?.email as string | null | undefined) ?? null;

  const rank = rankRaw
    ? rankRaw.toUpperCase()
    : ((existing?.rank as string | null | undefined) ?? null);
  if (rankRaw) {
    const matrix = await getRankPayMatrix();
    const group = groupRawPayload
      ? (groupRawPayload === "GUARD_FIELD" ? "GUARD" : groupRawPayload)
      : groupRawExisting;
    if (groupRawPayload || groupRawExisting) {
      if (!isRankValidForCorporateGroup(matrix, group, rank)) {
        throw new Error(
          `Rank "${rank}" is not valid for corporate group "${groupRawPayload || groupRawExisting}". Check MD Settings → Rank Pay Matrix.`,
        );
      }
    } else if (!isRankInMatrix(matrix, rank)) {
      throw new Error(
        `Rank "${rank}" is not defined in MD Settings → Rank Pay Matrix. Add it there first.`,
      );
    }
  }

  const savedGroup = groupRawPayload
    ? (groupRawPayload === "GUARD_FIELD" ? "GUARD" : groupRawPayload)
    : ((existing?.group as string | null | undefined) ?? null);

  await assertEpfNoUnique(supabase, payload.epf_no, employeeId);
  await assertEmailUnique(supabase, emailToSave, employeeId);

  const patch: Record<string, unknown> = {
    section_edits: stampAllSectionEdits(
      existing?.section_edits as Record<string, SectionEditMeta> | undefined,
      editorLabel
    ),
    ...encryptEmployeePiiRecord({
      full_name: payload.full_name,
      email: emailToSave,
      passport_no: payload.passport_no || null,
      epf_no: payload.epf_no || null,
      dob: payload.dob || null,
      gender: payload.gender || null,
      nationality: payload.nationality || null,
      religion: payload.religion || null,
      home_address: payload.home_address || null,
      nic: payload.nic ?? "",
      phone: payload.phone ?? "",
      bank_code: payload.bank_code || null,
      branch_code: payload.branch_code || null,
      account_number: payload.account_number || null,
    }),
    rank,
    group: savedGroup,
    site: payload.site || null,
    date_joined: payload.date_joined || null,
    status: payload.status || null,
    base_salary:
      payload.base_salary != null && payload.base_salary !== ""
        ? Number(payload.base_salary)
        : null,
    salary_type:
      typeof payload.salary_type === "string" && payload.salary_type.trim()
        ? payload.salary_type.trim().toUpperCase()
        : null,
    epf_yn: payload.epf_yn === true || payload.epf_yn === "true",
    mod_expiry: payload.mod_expiry || null,
    police_expiry: payload.police_expiry || null,
  };

  const { error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", employeeId);

  if (error) throw new Error(friendlyEmployeeSaveError(error.message));

  await auditStaffAction({
    supabase,
    portal: "hr",
    action: "MNR Save — All Sections",
    targetEntity: `Employee ${employeeId}`,
    actorName: editorLabel,
    actorRole: editorRole,
  });

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
  revalidatePath("/om");
  revalidatePath("/om/roster");
  revalidatePath("/om/sites/assignments");
  revalidatePath("/tm");
  revalidatePath("/fm");
  revalidatePath("/fm/roster");
  revalidatePath("/executive/settings");
}
