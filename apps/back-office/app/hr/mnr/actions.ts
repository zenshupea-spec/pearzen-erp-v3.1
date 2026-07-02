"use server";

import { revalidatePath } from "next/cache";

import {
  findRankPayEntry,
  isRankInMatrix,
  isRankValidForHrAssignment,
  type RankPayEntry,
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
} from "../../../lib/hr-portal-access-server";
import {
  assertEpfDiffersFromPrevious,
  assertEpfNoUnique,
  friendlyEpfSaveError,
} from "../../../lib/employee-epf";
import { encryptEmployeePiiRecord, assertEmployeePiiEncryptionReady } from "../../../lib/employee-pii";
import { resolveSalaryOverrideApproval } from "../../../lib/hr-salary-override";
import { employmentPayComponentsFromPayload } from "../../../lib/employee-pay-components";
import { gramaNiladariExpiryError } from "../../../lib/hr-vetting-validation";
import { isSectorManagerEmployee } from "../../../lib/hr-sectors";
import { getRankPayMatrix } from "../../executive/settings/rank-matrix-actions";
import { auditStaffAction } from "../../../lib/staff-audit";
import { resolveCompanyIdForSession } from "../../../lib/company-context-server";
import { assertInternalWorkforceCorporateGroup } from "../../../lib/cvs-workforce-phase";
import { createSupabaseServiceClient } from "../../../../../packages/supabase/service";
import { getHeadOfficePortalAuthByEmployeeId } from "../../../lib/head-office-portal-auth";
import { getOccupiedSingletonPortalRanks, assertSingletonPortalRankAvailable } from "../../../lib/singleton-portal-rank-guard";
import { isExecutiveRank } from "../../../lib/portal-role-utils";
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

function resolveEmploymentBaseSalary(
  payload: { base_salary?: unknown; rank?: unknown },
  matrix: Awaited<ReturnType<typeof getRankPayMatrix>>,
  existingBaseSalary?: number | null,
): number | null {
  if (payload.base_salary != null && payload.base_salary !== "") {
    const n = Number(payload.base_salary);
    return Number.isFinite(n) ? n : null;
  }
  const rankRaw = typeof payload.rank === "string" ? payload.rank.trim() : "";
  if (rankRaw) {
    const entry = findRankPayEntry(matrix, rankRaw.toUpperCase());
    if (entry?.basicPay != null && entry.basicPay > 0) {
      return entry.basicPay;
    }
  }
  return existingBaseSalary ?? null;
}

function normalizeMnrCorporateGroup(group: string | null | undefined): string | null {
  const raw = (group ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "GUARD_FIELD") return "GUARD";
  // Legacy SECTOR_MANAGER group → Head Office (rank SM holds the SM role).
  if (raw === "SECTOR_MANAGER") return "HEAD_OFFICE";
  return raw;
}

function resolveMnrSavedCorporateGroup(args: {
  payloadGroup?: unknown;
  existingGroup?: string | null;
  rank?: string | null;
}): string | null {
  const rank =
    typeof args.rank === "string" && args.rank.trim()
      ? args.rank.trim().toUpperCase()
      : null;

  let resolved: string | null = null;
  if (typeof args.payloadGroup === "string" && args.payloadGroup.trim()) {
    resolved = normalizeMnrCorporateGroup(args.payloadGroup.trim());
  }
  if (!resolved) {
    resolved = normalizeMnrCorporateGroup(args.existingGroup);
  }

  if (
    isSectorManagerEmployee({
      rank,
      group: resolved ?? args.existingGroup,
    })
  ) {
    return "HEAD_OFFICE";
  }

  return resolved;
}

function revalidateSectorManagerDeskPaths(
  rank: string | null | undefined,
  group: string | null | undefined,
) {
  if (!isSectorManagerEmployee({ rank, group })) return;
  revalidatePath("/hr/sm-portal");
  revalidatePath("/hq/sm-proxy");
  revalidatePath("/executive/sites");
  revalidatePath("/fm/sites");
}

async function assertMnrEmploymentRankChangeAllowed(args: {
  matrix: RankPayEntry[];
  corporateGroup: string | null;
  rank: string;
  existingRank: string | null | undefined;
  companyId: string | null | undefined;
  employeeId: string;
}): Promise<void> {
  const rank = args.rank.trim().toUpperCase();
  const existing = (args.existingRank ?? "").trim().toUpperCase();
  if (rank === existing) return;

  const groupKey = normalizeMnrCorporateGroup(args.corporateGroup);
  if (groupKey) {
    if (!isRankValidForHrAssignment(args.matrix, groupKey, rank)) {
      throw new Error(
        `Rank "${rank}" is not valid for corporate group "${groupKey}". Define it in MD Settings → Rank Pay Matrix.`,
      );
    }
  } else if (!isRankInMatrix(args.matrix.length > 0 ? args.matrix : [], rank)) {
    throw new Error(
      `Rank "${rank}" is not in the pay ledger. Add it from the MNR rank dropdown first.`,
    );
  }

  const companyId = args.companyId?.trim();
  if (companyId) {
    await assertSingletonPortalRankAvailable(rank, companyId, args.employeeId);
  }
}

function buildEmploymentAuditDetails(
  existing: { base_salary?: number | null; rank?: string | null } | null | undefined,
  resolved: {
    rank: string | null;
    base_salary: number | null;
    requires_md_approval: boolean;
  },
  matrix: Awaited<ReturnType<typeof getRankPayMatrix>>,
): Record<string, unknown> {
  const matrixBasic = findRankPayEntry(matrix, resolved.rank)?.basicPay ?? null;
  const previousBaseSalaryLkr =
    existing?.base_salary != null && existing.base_salary !== ""
      ? Number(existing.base_salary)
      : null;
  return {
    section: "employment",
    previousRank: existing?.rank ?? null,
    newRank: resolved.rank,
    previousBaseSalaryLkr: Number.isFinite(previousBaseSalaryLkr)
      ? previousBaseSalaryLkr
      : null,
    newBaseSalaryLkr: resolved.base_salary,
    matrixBasicPayLkr: matrixBasic,
    salaryOverridePending: resolved.requires_md_approval,
  };
}

function normalizeWorkEmail(value: unknown): string {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s || "";
}

function friendlyEmployeeSaveError(message: string): string {
  if (message.includes("employees_email_lower_unique")) {
    return "Work email is already assigned to another employee.";
  }
  return friendlyEpfSaveError(message);
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

export async function getOccupiedSingletonPortalRanksForSession(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return [];
  return getOccupiedSingletonPortalRanks(companyId);
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

export async function getExecutiveRecoveryEmailForMnr(employeeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isHrPortalEditor(profile.role)) {
    return { error: "HR desk access required." };
  }

  const scopedId = employeeId?.trim();
  if (!scopedId) return { error: "Missing employee." };

  const companyId = await resolveCompanyIdForSession(supabase);
  const service = createSupabaseServiceClient();
  let query = service
    .from("employees")
    .select("id, rank, group")
    .eq("id", scopedId);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return { error: "Employee not found." };

  if (String(data.group ?? "").trim().toUpperCase() !== "HEAD_OFFICE") {
    return { recoveryEmail: null as string | null };
  }
  if (!isExecutiveRank(data.rank as string | undefined)) {
    return { recoveryEmail: null as string | null };
  }

  const auth = await getHeadOfficePortalAuthByEmployeeId(scopedId);
  return { recoveryEmail: auth?.recovery_email?.trim() || null };
}

export async function saveEmployeeSection(
  section: MnrSectionKey,
  employeeId: string,
  payload: Record<string, unknown>
) {
  const { supabase, editorLabel, editorRole } = await requireHrEditor();

  const { data: existing, error: fetchError } = await supabase
    .from("employees")
    .select("section_edits, rank, email, group, company_id, base_salary, grama_niladari_url")
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
  let employmentAuditDetails: Record<string, unknown> | undefined;

  if (section === "personal") {
    assertEmployeePiiEncryptionReady();
    const groupRaw = String(existing?.group ?? "").trim().toUpperCase();
    const isHeadOffice = groupRaw === "HEAD_OFFICE";
    const emailRaw =
      typeof payload.email === "string" ? payload.email.trim() : "";
    const emailToSave = isHeadOffice
      ? emailRaw || null
      : (existing?.email as string | null | undefined) ?? null;
    assertEpfDiffersFromPrevious(payload.epf_no, payload.previous_epf_no);
    await assertEpfNoUnique(supabase, payload.epf_no, {
      excludeEmployeeId: employeeId,
      companyId: existing?.company_id as string | null | undefined,
    });
    await assertEmailUnique(supabase, emailToSave, employeeId);
    patch = {
      ...patch,
      previous_epf_no: payload.previous_epf_no || null,
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
    const groupRaw =
      typeof payload.group === "string" ? payload.group.trim().toUpperCase() : "";
    const matrix = await getRankPayMatrix();
    if (rank) {
      const groupKey = normalizeMnrCorporateGroup(
        groupRaw || String(existing?.group ?? "").trim().toUpperCase() || null,
      );
      await assertMnrEmploymentRankChangeAllowed({
        matrix,
        corporateGroup: groupKey,
        rank,
        existingRank: existing?.rank as string | undefined,
        companyId: existing?.company_id as string | null | undefined,
        employeeId,
      });
    }
    const savedGroup = resolveMnrSavedCorporateGroup({
      payloadGroup: payload.group,
      existingGroup: existing?.group as string | null | undefined,
      rank,
    });
    const effectiveGroup =
      savedGroup ??
      normalizeMnrCorporateGroup(String(existing?.group ?? "").trim().toUpperCase() || null);
    assertInternalWorkforceCorporateGroup(effectiveGroup);
    const resolvedBaseSalary = resolveEmploymentBaseSalary(
      payload,
      matrix,
      existing?.base_salary as number | null | undefined,
    );
    const salaryApproval = resolveSalaryOverrideApproval(
      matrix,
      rank,
      resolvedBaseSalary,
    );
    patch = {
      ...patch,
      rank,
      group: savedGroup,
      site: payload.site || null,
      date_joined: payload.date_joined || null,
      status: payload.status || null,
      base_salary: resolvedBaseSalary,
      requires_md_approval: salaryApproval.requires_md_approval,
      salary_approval_status: salaryApproval.salary_approval_status,
      custom_salary: salaryApproval.custom_salary,
      ...employmentPayComponentsFromPayload(payload),
      salary_type:
        typeof payload.salary_type === "string" && payload.salary_type.trim()
          ? payload.salary_type.trim().toUpperCase()
          : null,
      epf_yn: payload.epf_yn === true || payload.epf_yn === "true",
    };
    employmentAuditDetails = buildEmploymentAuditDetails(
      existing,
      {
        rank,
        base_salary: resolvedBaseSalary,
        requires_md_approval: salaryApproval.requires_md_approval,
      },
      matrix,
    );
  } else if (section === "bank") {
    assertEmployeePiiEncryptionReady();
    patch = {
      ...patch,
      ...encryptEmployeePiiRecord({
        bank_code: payload.bank_code || null,
        branch_code: payload.branch_code || null,
        account_number: payload.account_number || null,
      }),
    };
  } else if (section === "vetting") {
    const gramaNiladariExpiry =
      typeof payload.grama_niladari_expiry === "string"
        ? payload.grama_niladari_expiry.trim() || null
        : null;
    const gramaValidation = gramaNiladariExpiryError({
      gramaNiladariUrl: existing?.grama_niladari_url as string | null | undefined,
      gramaNiladariExpiry,
    });
    if (gramaValidation) {
      throw new Error(gramaValidation);
    }
    patch = {
      ...patch,
      grama_niladari_expiry: gramaNiladariExpiry,
    };
  }

  const { error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", employeeId);

  if (error) throw new Error(friendlyEmployeeSaveError(error.message));

  const employmentAudit =
    section === "employment" ? employmentAuditDetails : undefined;

  await auditStaffAction({
    supabase,
    portal: "hr",
    action: `MNR Save — ${section}`,
    targetEntity: `Employee ${employeeId}`,
    actorName: editorLabel,
    actorRole: editorRole,
    details: employmentAudit,
  });

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
  revalidatePath("/om");
  revalidatePath("/om/roster");
  revalidatePath("/om/sites/assignments");
  revalidatePath("/tm");
  revalidatePath("/fm");
  revalidatePath("/fm/roster");
  revalidatePath("/fm/exceptions");
  revalidatePath("/executive/settings");
  if (section === "employment") {
    revalidateSectorManagerDeskPaths(
      (patch.rank as string | null | undefined) ?? (existing?.rank as string | undefined),
      (patch.group as string | null | undefined) ??
        (existing?.group as string | null | undefined),
    );
  }
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
  payload: Record<string, unknown>,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
  const { supabase, editorLabel, editorRole } = await requireHrEditor();

  const { data: existing, error: fetchError } = await supabase
    .from("employees")
    .select("section_edits, rank, email, group, company_id, base_salary, grama_niladari_url")
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
  assertEmployeePiiEncryptionReady();

  const gramaNiladariExpiry =
    typeof payload.grama_niladari_expiry === "string"
      ? payload.grama_niladari_expiry.trim() || null
      : null;
  const gramaValidation = gramaNiladariExpiryError({
    gramaNiladariUrl: existing?.grama_niladari_url as string | null | undefined,
    gramaNiladariExpiry,
  });
  if (gramaValidation) {
    return { success: false, error: gramaValidation };
  }

  const groupRawExisting = String(existing?.group ?? "").trim().toUpperCase();
  const groupRawPayload =
    typeof payload.group === "string" ? payload.group.trim().toUpperCase() : "";
  const groupForEmail = normalizeMnrCorporateGroup(
    groupRawPayload || groupRawExisting || null,
  );
  const isHeadOffice = groupForEmail === "HEAD_OFFICE";
  const emailRaw =
    typeof payload.email === "string" ? payload.email.trim() : "";
  const emailToSave = isHeadOffice
    ? emailRaw || null
    : (existing?.email as string | null | undefined) ?? null;

  const rank = rankRaw
    ? rankRaw.toUpperCase()
    : ((existing?.rank as string | null | undefined) ?? null);
  const matrix = await getRankPayMatrix();
  if (rankRaw && rank) {
    const groupKey = normalizeMnrCorporateGroup(
      groupRawPayload || groupRawExisting || null,
    );
    await assertMnrEmploymentRankChangeAllowed({
      matrix,
      corporateGroup: groupKey,
      rank,
      existingRank: existing?.rank as string | undefined,
      companyId: existing?.company_id as string | null | undefined,
      employeeId,
    });
  }

  const savedGroup = resolveMnrSavedCorporateGroup({
    payloadGroup: groupRawPayload || null,
    existingGroup: existing?.group as string | null | undefined,
    rank,
  });

  assertInternalWorkforceCorporateGroup(savedGroup);

  assertEpfDiffersFromPrevious(payload.epf_no, payload.previous_epf_no);
  await assertEpfNoUnique(supabase, payload.epf_no, {
    excludeEmployeeId: employeeId,
    companyId: existing?.company_id as string | null | undefined,
  });
  await assertEmailUnique(supabase, emailToSave, employeeId);

  const resolvedBaseSalary = resolveEmploymentBaseSalary(
    payload,
    matrix,
    existing?.base_salary as number | null | undefined,
  );
  const salaryApproval = resolveSalaryOverrideApproval(
    matrix,
    rank,
    resolvedBaseSalary,
  );

  const patch: Record<string, unknown> = {
    section_edits: stampAllSectionEdits(
      existing?.section_edits as Record<string, SectionEditMeta> | undefined,
      editorLabel
    ),
    previous_epf_no: payload.previous_epf_no || null,
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
    base_salary: resolvedBaseSalary,
    requires_md_approval: salaryApproval.requires_md_approval,
    salary_approval_status: salaryApproval.salary_approval_status,
    custom_salary: salaryApproval.custom_salary,
    ...employmentPayComponentsFromPayload(payload),
    salary_type:
      typeof payload.salary_type === "string" && payload.salary_type.trim()
        ? payload.salary_type.trim().toUpperCase()
        : null,
    epf_yn: payload.epf_yn === true || payload.epf_yn === "true",
    grama_niladari_expiry: gramaNiladariExpiry,
    hr_memo:
      typeof payload.hr_memo === "string" ? payload.hr_memo.trim() || null : null,
  };

  const { error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", employeeId);

  if (error) throw new Error(friendlyEmployeeSaveError(error.message));

  const recoveryEmailRaw =
    typeof payload.recovery_email === "string" ? payload.recovery_email.trim() : "";
  if (isHeadOffice && isExecutiveRank(rank) && recoveryEmailRaw) {
    if (!emailToSave) {
      throw new Error("Set a work email before saving a recovery email.");
    }
    const { upsertExecutivePortalRecoveryEmail } = await import(
      "../../../lib/head-office-portal-auth"
    );
    const seeded = await upsertExecutivePortalRecoveryEmail(
      employeeId,
      emailToSave,
      recoveryEmailRaw,
    );
    if (!seeded.ok) {
      throw new Error(seeded.error ?? "Failed to save recovery email.");
    }
  }

  await auditStaffAction({
    supabase,
    portal: "hr",
    action: "MNR Save — All Sections",
    targetEntity: `Employee ${employeeId}`,
    actorName: editorLabel,
    actorRole: editorRole,
    details: buildEmploymentAuditDetails(
      existing,
      {
        rank,
        base_salary: resolvedBaseSalary,
        requires_md_approval: salaryApproval.requires_md_approval,
      },
      matrix,
    ),
  });

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
  revalidatePath("/om");
  revalidatePath("/om/roster");
  revalidatePath("/om/sites/assignments");
  revalidatePath("/tm");
  revalidatePath("/fm");
  revalidatePath("/fm/roster");
  revalidatePath("/fm/exceptions");
  revalidatePath("/executive/settings");
  revalidatePath("/executive/access");
  revalidateSectorManagerDeskPaths(rank, savedGroup);
  return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save employee record.";
    return { success: false, error: message };
  }
}
