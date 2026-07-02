'use server';

import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import type { BulkImportSummary } from '../../../lib/bulk-data-import';
import { validateBulkEditorSnapshot } from '../../../lib/bulk-editor-validation';
import {
  buildBulkEditorExportPayload,
  mergeEditorRankMatrixWithCurrent,
} from '../../../lib/bulk-roster-web-editor-export';
import type { BulkEditorSnapshot, BulkEditorTabId } from '../../../lib/bulk-roster-web-editor-spec';
import { buildBulkEditorSnapshot } from '../../../lib/bulk-roster-web-editor-snapshot';
import { buildBulkDataWorkbook } from '../../../lib/bulk-data-workbook';
import { verifyHeadOfficeTotpStepUp } from '../../../lib/head-office-portal-auth';
import type { BackOfficeUserProfile } from '../../../lib/hr-portal-access';
import { getHrSectorNames } from '../../hr/hr-sector-actions';
import {
  fetchBulkMigrationEmployeesForExport,
  fetchBulkMigrationSiteProfilesForExport,
  formatBulkMigrationImportMessage,
  revalidateBulkMigrationImportPaths,
  requireManagingDirector,
  runBulkMigrationImport,
} from './bulk-import-actions';
import { getRankPayMatrix, saveRankPayMatrix } from './rank-matrix-actions';

export type LoadBulkEditorSnapshotResult =
  | { success: true; snapshot: BulkEditorSnapshot }
  | { success: false; error: string };

export type ValidateBulkEditorSnapshotResult =
  | { success: true; issues: import('../../../lib/bulk-editor-validation').BulkEditorValidationIssue[] }
  | { success: false; error: string };

export type ApplyBulkEditorSnapshotInput = {
  snapshot: BulkEditorSnapshot;
  totpCode: string;
  /** Tabs edited since load — when includes `ranks`, rank matrix is saved before import. */
  dirtyTabIds?: BulkEditorTabId[];
};

export type ApplyBulkEditorSnapshotResult =
  | { success: true; message: string; summary: BulkImportSummary }
  | { success: false; error: string; validationErrors?: string[] };

export type DownloadBulkEditorWorkbookResult =
  | { success: true; filename: string; base64: string }
  | { success: false; error: string };

/** Load live tenant roster into in-browser bulk editor grids (MD only). */
export async function loadBulkEditorSnapshot(): Promise<LoadBulkEditorSnapshotResult> {
  try {
    const { supabase } = await requireManagingDirector();
    const companyId = await resolveCompanyIdForSession(supabase);
    if (!companyId) {
      return {
        success: false,
        error: 'Tenant context required. Sign in on your company subdomain.',
      };
    }

    const [employees, sites, rankMatrix, sectorNamesFromSettings] = await Promise.all([
      fetchBulkMigrationEmployeesForExport(supabase, companyId),
      fetchBulkMigrationSiteProfilesForExport(supabase, companyId),
      getRankPayMatrix(),
      getHrSectorNames(),
    ]);

    const snapshot = buildBulkEditorSnapshot({
      employees,
      sites,
      rankMatrix,
      sectorNamesFromSettings,
    });

    return { success: true, snapshot };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load bulk editor data.';
    return { success: false, error: message };
  }
}

/** Build .xlsx from current editor grids for archival download (MD only, no DB writes). */
export async function downloadBulkEditorWorkbookAction(
  snapshot: BulkEditorSnapshot,
): Promise<DownloadBulkEditorWorkbookResult> {
  try {
    await requireManagingDirector();
    const { parsed } = buildBulkEditorExportPayload(snapshot);
    const { base64, filename } = await buildBulkDataWorkbook({
      mode: 'export',
      employees: parsed.rows,
      sites: parsed.siteRows ?? [],
    });
    return { success: true, filename, base64 };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not build workbook download.';
    return { success: false, error: message };
  }
}

/** Dry-run validateBulkImport on editor grids (MD only, no DB writes). */
export async function validateBulkEditorSnapshotAction(
  snapshot: BulkEditorSnapshot,
): Promise<ValidateBulkEditorSnapshotResult> {
  try {
    await requireManagingDirector();
    const issues = validateBulkEditorSnapshot(snapshot);
    return { success: true, issues };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation failed.';
    return { success: false, error: message };
  }
}

async function verifyBulkEditorTotp(
  profile: BackOfficeUserProfile,
  totpCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = String(totpCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false,
      error: 'Enter your current 6-digit authenticator code to confirm apply.',
    };
  }
  if (!profile.employeeId) {
    return { ok: false, error: 'Could not resolve your staff profile for 2FA verification.' };
  }

  const stepUp = await verifyHeadOfficeTotpStepUp(profile.employeeId, code);
  if (!stepUp.ok) {
    return { ok: false, error: stepUp.error ?? 'Invalid authenticator code.' };
  }

  return { ok: true };
}

/** Validate, optionally save ranks, then applyBulkImport (MD + TOTP, merge-on-update). */
export async function applyBulkEditorSnapshotAction(
  input: ApplyBulkEditorSnapshotInput,
): Promise<ApplyBulkEditorSnapshotResult> {
  let profile: BackOfficeUserProfile;
  try {
    ({ profile } = await requireManagingDirector());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Access denied.',
    };
  }

  const totp = await verifyBulkEditorTotp(profile, input.totpCode);
  if (!totp.ok) {
    return { success: false, error: totp.error };
  }

  const validationIssues = validateBulkEditorSnapshot(input.snapshot);
  if (validationIssues.length > 0) {
    return {
      success: false,
      error: `${validationIssues.length} validation issue(s) found. Fix the grids and validate again before applying.`,
      validationErrors: validationIssues.map((issue) => issue.raw),
    };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      success: false,
      error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — bulk apply cannot write to the database.',
    };
  }

  try {
    const { supabase } = await requireManagingDirector();
    const companyId = await resolveCompanyIdForSession(supabase);
    if (!companyId) {
      return {
        success: false,
        error: 'Tenant context required. Sign in on your company subdomain.',
      };
    }

    const payload = buildBulkEditorExportPayload(input.snapshot);
    const ranksDirty = input.dirtyTabIds?.includes('ranks') ?? false;
    const currentMatrix = await getRankPayMatrix();

    let rankMatrix = currentMatrix;
    if (ranksDirty) {
      const merged = mergeEditorRankMatrixWithCurrent(payload.rankMatrix, currentMatrix);
      const saved = await saveRankPayMatrix(merged);
      if (!saved.success) {
        return {
          success: false,
          error: saved.error ?? 'Could not save rank pay matrix from editor.',
        };
      }
      rankMatrix = await getRankPayMatrix();
    }

    const summary = await runBulkMigrationImport(companyId, payload.parsed, rankMatrix);
    await revalidateBulkMigrationImportPaths();

    return {
      success: true,
      message: await formatBulkMigrationImportMessage(payload.parsed, summary),
      summary,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Apply failed while saving to the database.',
    };
  }
}
