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
import { encrypt } from "../../../lib/encryption";
import { getRankPayMatrix } from "../../executive/settings/rank-matrix-actions";
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
    .select("section_edits, rank, email")
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
    const emailRaw =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    patch = {
      ...patch,
      full_name: payload.full_name,
      email: emailRaw || null,
      passport_no: payload.passport_no || null,
      epf_no: payload.epf_no || null,
      dob: payload.dob || null,
      gender: payload.gender || null,
      nationality: payload.nationality || null,
      religion: payload.religion || null,
      home_address: payload.home_address || null,
      nic: encrypt(String(payload.nic ?? "")),
      phone: encrypt(String(payload.phone ?? "")),
    };
  } else if (section === "employment") {
    const rankRaw = typeof payload.rank === "string" ? payload.rank.trim() : "";
    const rank = rankRaw ? rankRaw.toUpperCase() : null;
    if (rank) {
      const matrix = await getRankPayMatrix();
      const group =
        typeof payload.group === "string" ? payload.group.trim() : "";
      if (group) {
        if (!isRankValidForCorporateGroup(matrix, group, rank)) {
          throw new Error(
            `Rank "${rank}" is not valid for corporate group "${group}". Check MD Settings → Rank Pay Matrix.`,
          );
        }
      } else if (!isRankInMatrix(matrix, rank)) {
        throw new Error(
          `Rank "${rank}" is not defined in MD Settings → Rank Pay Matrix. Add it there first.`,
        );
      }
    }
    patch = {
      ...patch,
      rank,
      role: payload.role || null,
      group: payload.group || null,
      site: payload.site || null,
      date_joined: payload.date_joined || null,
      status: payload.status || null,
      base_salary: payload.base_salary != null && payload.base_salary !== ""
        ? Number(payload.base_salary)
        : null,
      salary_type: payload.salary_type || null,
      epf_yn: payload.epf_yn === true || payload.epf_yn === "true",
    };
  } else if (section === "bank") {
    patch = {
      ...patch,
      bank_code: payload.bank_code || null,
      branch_code: payload.branch_code || null,
      account_number: payload.account_number || null,
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

  if (error) throw new Error(error.message);

  revalidatePath("/hr/mnr");
  revalidatePath("/hr");
  revalidatePath("/om");
  revalidatePath("/om/roster");
  revalidatePath("/om/sites/assignments");
  revalidatePath("/tm");
  revalidatePath("/fm");
  revalidatePath("/fm/roster");
}
