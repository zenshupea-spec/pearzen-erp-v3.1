'use server';

import { revalidatePath } from 'next/cache';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import { CVS_INTERNAL_WORKFORCE_ONLY } from '../../../lib/cvs-workforce-phase';
import {
  BULK_IMPORT_DEBT_ADVANCE_REASON,
  BULK_IMPORT_DEBT_PENALTY_REASON,
  BULK_IMPORT_DEBT_PLAN_NOTE,
  BULK_IMPORT_INSTALMENT_PLAN_REMINDER,
  applyMigrationEmployeeDefaults,
  collectMigrationSiteImportRows,
  collectSmLinksFromParsedWorkbook,
  deriveSitesFromRosterRows,
  employeeBalanceDebtPatchForUpsert,
  employeeDbPayloadForUpsert,
  employeeDbPayloadFromUnified,
  emptyUnifiedEmployeeExportLedgerDebts,
  ensureRanksFromRosterRows,
  mapUnifiedRosterRow,
  mapMigrationWorkforceExportRow,
  parseBulkDataWorkbook,
  rosterDebtColumnProvided,
  bulkImportValidationWarnings,
  shouldSkipBulkMigrationImportRow,
  usesMigrationSitesSheet,
  validateBulkImport,
  DEFAULT_BULK_IMPORT_MODE,
  type BulkImportMode,
  type BulkImportSummary,
  type DerivedSiteImportRow,
  type MigrationDerivedSiteImportRow,
  type ParsedBulkWorkbook,
  type UnifiedEmployeeExportLedgerDebts,
  type UnifiedRosterSmLink,
} from '../../../lib/bulk-data-import';
import { buildBulkDataWorkbook, mapSiteProfileForMigrationExport } from '../../../lib/bulk-data-workbook';
import {
  decryptEmployeePiiRecord,
  encryptEmployeePiiRecord,
} from '../../../lib/employee-pii';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from '../../../lib/site-geofence';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { findActiveSectorManagerByEpf } from '../../../lib/sector-manager-roster';
import type { BackOfficeUserProfile } from '../../../lib/hr-portal-access';
import { verifyHeadOfficeTotpStepUp } from '../../../lib/head-office-portal-auth';
import { getRankPayMatrix, saveRankPayMatrix } from './rank-matrix-actions';
import type { RankPayEntry } from '../../../../../packages/rank-pay-matrix';

/** Persists auto-created ranks from roster rows via MD rank-matrix save + audit. */
export async function persistRanksEnsuredFromRosterRows(
  rows: Record<string, unknown>[],
  rankMatrix?: RankPayEntry[],
) {
  const baseMatrix = rankMatrix ?? (await getRankPayMatrix());
  const { matrix, createdRankCodes } = ensureRanksFromRosterRows(rows, baseMatrix);
  if (createdRankCodes.length === 0) {
    return { matrix, createdRankCodes };
  }

  const res = await saveRankPayMatrix(matrix);
  if (!res.success) {
    throw new Error(res.error ?? 'Could not save new ranks to the Rank Pay Matrix.');
  }

  return { matrix, createdRankCodes };
}

const INTERNAL_WORKFORCE_EXPORT_GROUPS = new Set(['HEAD_OFFICE', 'CAFE']);
const EMPLOYEE_EXPORT_PAGE_SIZE = 1000;
/** Keep PostgREST `.in()` URLs under Cloudflare/proxy URI limits. */
const EXPORT_LEDGER_IN_BATCH_SIZE = 80;
const OPEN_SALARY_ADVANCE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PENDING'] as const;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function friendlyExportError(context: string, message: string): string {
  if (/<html/i.test(message)) {
    if (/414|Request-URI Too Large/i.test(message)) {
      return `${context}: roster is too large for a single request. Try again — if this persists, contact support.`;
    }
    return `${context}: upstream service error. Try again shortly.`;
  }
  return `${context}: ${message}`;
}

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* not found|42P01/i.test(message);
}

function bulkImportPayrollMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function bulkImportPayrollPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function requireManagingDirector(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  profile: BackOfficeUserProfile;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  if (role !== 'MD' && role !== 'OD') {
    throw new Error('Only the Managing Director can download or upload bulk data files.');
  }

  return { supabase, profile };
}

function filterEmployeesForExportPhase(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  let filtered = rows.filter(
    (row) => !shouldSkipBulkMigrationImportRow(row),
  );

  if (!CVS_INTERNAL_WORKFORCE_ONLY) return filtered;

  filtered = filtered.filter((row) => {
    const group = String(row.group ?? '').trim().toUpperCase();
    return INTERNAL_WORKFORCE_EXPORT_GROUPS.has(group);
  });

  return filtered;
}

async function fetchBulkMigrationProtectedEmployeeKeys(
  db: SupabaseClient,
  companyId: string,
): Promise<{ ids: Set<string>; empNumbers: Set<string> }> {
  const ids = new Set<string>();
  const empNumbers = new Set<string>();

  const { data, error } = await db
    .from('employees')
    .select('id, emp_number, epf_no, rank')
    .eq('company_id', companyId)
    .in('rank', ['MD', 'OD']);

  if (error) throw new Error(`Executive roster protection lookup: ${error.message}`);

  for (const row of data ?? []) {
    const id = String(row.id ?? '').trim();
    if (id) ids.add(id);
    for (const key of [
      String(row.emp_number ?? '').trim().toUpperCase(),
      String(row.epf_no ?? '').trim().toUpperCase(),
    ]) {
      if (key) empNumbers.add(key);
    }
  }

  return { ids, empNumbers };
}

async function fetchEmployeeEpfByIds(
  db: SupabaseClient,
  companyId: string,
  employeeIds: string[],
): Promise<Map<string, string>> {
  const epfById = new Map<string, string>();
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (!uniqueIds.length) return epfById;

  for (const batch of chunkArray(uniqueIds, EXPORT_LEDGER_IN_BATCH_SIZE)) {
    const { data, error } = await db
      .from('employees')
      .select('id, epf_no, emp_number')
      .eq('company_id', companyId)
      .in('id', batch);
    if (error) throw new Error(friendlyExportError('Export temp parent lookup', error.message));
    for (const row of data ?? []) {
      const id = String(row.id ?? '');
      const epf = String(row.epf_no ?? row.emp_number ?? '').trim().toUpperCase();
      if (id && epf) epfById.set(id, epf);
    }
  }

  return epfById;
}

async function fetchEmployeeLedgerDebtsForExport(
  db: SupabaseClient,
  companyId: string,
  employeeIds: string[],
): Promise<Map<string, UnifiedEmployeeExportLedgerDebts>> {
  const debtsByEmployee = new Map<string, UnifiedEmployeeExportLedgerDebts>();
  for (const employeeId of employeeIds) {
    debtsByEmployee.set(employeeId, emptyUnifiedEmployeeExportLedgerDebts());
  }
  if (!employeeIds.length) return debtsByEmployee;

  for (const batch of chunkArray(employeeIds, EXPORT_LEDGER_IN_BATCH_SIZE)) {
    const { data: advances, error: advancesError } = await db
      .from('salary_advances')
      .select('profile_id, amount, status')
      .eq('company_id', companyId)
      .in('profile_id', batch)
      .in('status', [...OPEN_SALARY_ADVANCE_STATUSES]);
    if (advancesError && advancesError.code !== '42P01') {
      throw new Error(friendlyExportError('Export salary advances', advancesError.message));
    }
    for (const row of advances ?? []) {
      const employeeId = String(row.profile_id ?? '');
      const snapshot = debtsByEmployee.get(employeeId);
      if (!snapshot) continue;
      snapshot.salary_advance_outstanding_lkr += Math.max(0, Math.round(Number(row.amount ?? 0)));
    }
  }

  for (const batch of chunkArray(employeeIds, EXPORT_LEDGER_IN_BATCH_SIZE)) {
    const { data: penalties, error: penaltiesError } = await db
      .from('payroll_deductions')
      .select('guard_id, amount, category')
      .eq('company_id', companyId)
      .in('guard_id', batch)
      .eq('category', 'DISCIPLINARY');
    if (penaltiesError && !isMissingTableError(penaltiesError.message)) {
      throw new Error(friendlyExportError('Export penalties', penaltiesError.message));
    }
    for (const row of penalties ?? []) {
      const employeeId = String(row.guard_id ?? '');
      const snapshot = debtsByEmployee.get(employeeId);
      if (!snapshot) continue;
      snapshot.penalty_outstanding_lkr += Math.max(0, Math.round(Number(row.amount ?? 0)));
    }
  }

  for (const batch of chunkArray(employeeIds, EXPORT_LEDGER_IN_BATCH_SIZE)) {
    const { data: plans, error: plansError } = await db
      .from('fm_employee_deduction_plans')
      .select('employee_id, deduction_kind, total_liability_lkr, status')
      .eq('company_id', companyId)
      .in('employee_id', batch)
      .eq('status', 'ACTIVE');
    if (plansError && !isMissingTableError(plansError.message)) {
      throw new Error(friendlyExportError('Export deduction plans', plansError.message));
    }
    for (const row of plans ?? []) {
      const employeeId = String(row.employee_id ?? '');
      const snapshot = debtsByEmployee.get(employeeId);
      if (!snapshot) continue;
      const amount = Math.max(0, Math.round(Number(row.total_liability_lkr ?? 0)));
      switch (String(row.deduction_kind ?? '').toUpperCase()) {
        case 'SALARY_LOAN':
          snapshot.salary_loan_outstanding_lkr += amount;
          break;
        case 'UNIT_DAMAGES':
          snapshot.unit_damages_outstanding_lkr += amount;
          break;
        case 'OTHER_DEDUCTIONS':
          snapshot.other_deduction_outstanding_lkr += amount;
          break;
        default:
          break;
      }
    }
  }

  return debtsByEmployee;
}

export async function fetchBulkMigrationSiteProfilesForExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string | null,
) {
  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_code, site_name, site_type, site_status, client_name, parent_client, client_billing_address, contract_start, contract_end, address, latitude, longitude, geofence_radius, verification_mode, needs_om_gps_capture, assigned_sm_epf, required_guards, per_visit_charge_lkr, min_dwell_time_minutes, nfc_tag_id, provides_food, food_allowance_lkr, provides_accommodation, rate_matrix',
    )
    .order('site_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapSiteProfileForMigrationExport(row as Record<string, unknown>));
}

export async function fetchBulkMigrationEmployeesForExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sessionCompanyId: string | null,
) {
  let rows = await fetchWithRosterCompanyFallback(
    (companyId) => fetchEmployeeRowsPaginated(supabase, companyId),
    sessionCompanyId,
  );

  if (!rows.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    rows = await fetchWithRosterCompanyFallback(
      (companyId) => fetchEmployeeRowsPaginated(service, companyId),
      sessionCompanyId,
    );
  }

  const filtered = filterEmployeesForExportPhase(rows);
  const companyId = sessionCompanyId;
  const db =
    process.env.SUPABASE_SERVICE_ROLE_KEY != null
      ? createSupabaseServiceClient()
      : supabase;

  const sites = await fetchBulkMigrationSiteProfilesForExport(supabase, companyId);
  const siteByName = new Map(
    sites.map((site) => [String(site.site_name ?? '').trim().toLowerCase(), site]),
  );

  const employeeIds = filtered.map((row) => String(row.id ?? '')).filter(Boolean);
  const ledgerDebtsByEmployee = companyId
    ? await fetchEmployeeLedgerDebtsForExport(db, companyId, employeeIds)
    : new Map<string, UnifiedEmployeeExportLedgerDebts>();

  const tempParentIds = filtered
    .map((row) => String(row.temp_parent_id ?? ''))
    .filter(Boolean);
  const tempParentEpfById = companyId
    ? await fetchEmployeeEpfByIds(db, companyId, tempParentIds)
    : new Map<string, string>();

  return filtered.map((row) => {
    const decrypted = decryptEmployeePiiRecord(row);
    const siteLabel = String(decrypted.site ?? '').trim();
    const site = siteLabel ? siteByName.get(siteLabel.toLowerCase()) : undefined;
    const employeeId = String(decrypted.id ?? '');
    const ledgerDebts =
      ledgerDebtsByEmployee.get(employeeId) ?? emptyUnifiedEmployeeExportLedgerDebts();
    const tempParentId = String(decrypted.temp_parent_id ?? '');
    const tempParentEpf = tempParentId ? tempParentEpfById.get(tempParentId) ?? '' : '';

    return mapMigrationWorkforceExportRow(decrypted, site, {
      ledgerDebts,
      tempParentEpf,
    });
  });
}

async function fetchEmployeeRowsPaginated(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += EMPLOYEE_EXPORT_PAGE_SIZE) {
    let query = supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true })
      .range(from, from + EMPLOYEE_EXPORT_PAGE_SIZE - 1);
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < EMPLOYEE_EXPORT_PAGE_SIZE) break;
  }
  return all;
}

export type BulkWorkbookDownloadMode = 'template' | 'export';

export async function downloadBulkDataWorkbook(
  mode: BulkWorkbookDownloadMode,
): Promise<{
  success: true;
  filename: string;
  base64: string;
}> {
  const { supabase } = await requireManagingDirector();

  if (mode === 'template') {
    const { base64, filename } = await buildBulkDataWorkbook({
      mode: 'template',
      employees: [],
      sites: [],
    });
    return { success: true, filename, base64 };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    throw new Error('Tenant context required. Sign in on your company subdomain.');
  }

  const rankMatrix = await getRankPayMatrix();
  const employees = await fetchBulkMigrationEmployeesForExport(supabase, companyId);
  const sites = await fetchBulkMigrationSiteProfilesForExport(supabase, companyId);

  const { base64, filename } = await buildBulkDataWorkbook({
    mode: 'export',
    employees,
    sites,
    rankMatrix,
  });

  return { success: true, filename, base64 };
}

export type BulkUploadResult =
  | { success: true; message: string; summary: BulkImportSummary }
  | { success: false; error: string; validationErrors?: string[] };

async function upsertDerivedSite(
  db: SupabaseClient,
  companyId: string,
  mapped: DerivedSiteImportRow,
  summary: BulkImportSummary,
) {
  const { siteId, siteName, payload } = mapped;

  const record: Record<string, unknown> = {
    ...payload,
    company_id: companyId,
    geofence_radius: clampGeofenceRadiusM(
      payload.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS_M,
    ),
  };

  if (siteId) {
    const { error } = await db
      .from('site_profiles')
      .update(record)
      .eq('id', siteId)
      .eq('company_id', companyId);
    if (error) throw new Error(`Site update (${siteName || siteId}): ${error.message}`);
    summary.sitesUpdated += 1;
    return;
  }

  if (!siteName) {
    throw new Error('Site row is missing site_name.');
  }

  const { data: existing } = await db
    .from('site_profiles')
    .select('id')
    .eq('site_name', siteName)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from('site_profiles').update(record).eq('id', existing.id);
    if (error) throw new Error(`Site update (${siteName}): ${error.message}`);
    summary.sitesUpdated += 1;
  } else {
    const { error } = await db.from('site_profiles').insert(record);
    if (error) throw new Error(`Site insert (${siteName}): ${error.message}`);
    summary.sitesInserted += 1;
  }
}

async function upsertMigrationSiteProfile(
  db: SupabaseClient,
  companyId: string,
  mapped: MigrationDerivedSiteImportRow,
  summary: BulkImportSummary,
) {
  const { siteId, siteCode, siteName, payload } = mapped;

  const record: Record<string, unknown> = {
    company_id: companyId,
    site_code: payload.site_code,
    site_name: payload.site_name,
    site_type: payload.site_type,
    site_status: payload.site_status,
    client_name: payload.client_name,
    parent_client: payload.parent_client,
    client_billing_address: payload.client_billing_address,
    contract_start: payload.contract_start || null,
    contract_end: payload.contract_end || null,
    address: payload.address,
    latitude: payload.latitude,
    longitude: payload.longitude,
    geofence_radius: clampGeofenceRadiusM(
      payload.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS_M,
    ),
    needs_om_gps_capture: payload.needs_om_gps_capture,
    assigned_sm_epf: payload.assigned_sm_epf,
    required_guards: payload.required_guards,
    per_visit_charge_lkr: payload.per_visit_charge_lkr,
    min_dwell_time_minutes: payload.min_dwell_time_minutes,
    rate_matrix: payload.rate_matrix,
    verification_mode: payload.verification_mode,
    provides_food: payload.provides_food,
    food_allowance_lkr: payload.food_allowance_lkr,
    provides_accommodation: payload.provides_accommodation,
    nfc_tag_id: payload.nfc_tag_id,
  };

  const siteLabel = siteName || siteCode || siteId || 'unknown site';

  if (siteId) {
    const { error } = await db
      .from('site_profiles')
      .update(record)
      .eq('id', siteId)
      .eq('company_id', companyId);
    if (error) throw new Error(`Site update (${siteLabel}): ${error.message}`);
    summary.sitesUpdated += 1;
    return;
  }

  if (!siteName && !siteCode) {
    throw new Error('Site row is missing site_code and site_name.');
  }

  let existing: { id: string } | null = null;

  if (siteCode) {
    const { data } = await db
      .from('site_profiles')
      .select('id')
      .eq('site_code', siteCode)
      .eq('company_id', companyId)
      .maybeSingle();
    existing = data;
  }

  if (!existing?.id && siteName) {
    const { data } = await db
      .from('site_profiles')
      .select('id')
      .eq('site_name', siteName)
      .eq('company_id', companyId)
      .maybeSingle();
    existing = data;
  }

  if (existing?.id) {
    const { error } = await db.from('site_profiles').update(record).eq('id', existing.id);
    if (error) throw new Error(`Site update (${siteLabel}): ${error.message}`);
    summary.sitesUpdated += 1;
  } else {
    const { error } = await db.from('site_profiles').insert(record);
    if (error) throw new Error(`Site insert (${siteLabel}): ${error.message}`);
    summary.sitesInserted += 1;
  }
}

async function lookupEmployeeIdByEpf(
  db: SupabaseClient,
  companyId: string,
  epfOrEmpNumber: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const key = epfOrEmpNumber.trim().toUpperCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  const { data } = await db
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .or(`emp_number.eq.${key},epf_no.eq.${key}`)
    .maybeSingle();

  if (!data?.id) return null;
  const id = String(data.id);
  cache.set(key, id);
  return id;
}

function cacheEmployeeLookupKeys(
  cache: Map<string, string>,
  employeeId: string,
  row: Record<string, unknown>,
): void {
  const empNumber = String(row.emp_number ?? '').trim().toUpperCase();
  const epfNo = String(row.epf_no ?? '').trim().toUpperCase();
  if (empNumber) cache.set(empNumber, employeeId);
  if (epfNo) cache.set(epfNo, employeeId);
}

async function upsertUnifiedEmployee(
  db: SupabaseClient,
  companyId: string,
  row: Record<string, unknown>,
  summary: BulkImportSummary,
  importMode: BulkImportMode,
  tempParentId?: string | null,
): Promise<{ employeeId: string; isUpdate: boolean }> {
  const { employee } = mapUnifiedRosterRow(row);
  const { employeeId, empNumber, payload } = employee;
  const employeeLabel =
    empNumber?.trim() ||
    String(payload.full_name ?? '').trim() ||
    (employeeId ? `row ${employeeId.slice(0, 8)}…` : 'unknown employee');

  const upsertOptions = {
    mode: importMode,
    rawRow: row,
    isUpdate: true as const,
    tempParentId,
  };

  if (employeeId) {
    const record = encryptEmployeePiiRecord(
      employeeDbPayloadForUpsert(employee, companyId, upsertOptions),
    );
    if (Object.keys(record).length === 0) {
      return { employeeId, isUpdate: true };
    }
    const { error } = await db
      .from('employees')
      .update(record)
      .eq('id', employeeId)
      .eq('company_id', companyId);
    if (error) throw new Error(`Employee update (${employeeLabel}): ${error.message}`);
    summary.employeesUpdated += 1;
    return { employeeId, isUpdate: true };
  }

  if (!empNumber) {
    throw new Error(`Employee "${payload.full_name}" is missing emp_number.`);
  }

  const { data: existing } = await db
    .from('employees')
    .select('id')
    .eq('emp_number', empNumber)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existing?.id) {
    const record = encryptEmployeePiiRecord(
      employeeDbPayloadForUpsert(employee, companyId, upsertOptions),
    );
    if (Object.keys(record).length === 0) {
      return { employeeId: existing.id, isUpdate: true };
    }
    const { error } = await db.from('employees').update(record).eq('id', existing.id);
    if (error) throw new Error(`Employee update (${empNumber}): ${error.message}`);
    summary.employeesUpdated += 1;
    return { employeeId: existing.id, isUpdate: true };
  }

  const record = encryptEmployeePiiRecord(
    employeeDbPayloadFromUnified(employee, companyId, { tempParentId }),
  );
  const { data: inserted, error } = await db
    .from('employees')
    .insert(record)
    .select('id')
    .single();
  if (error) throw new Error(`Employee insert (${empNumber}): ${error.message}`);
  summary.employeesInserted += 1;
  return { employeeId: String(inserted.id), isUpdate: false };
}

async function seedFmDeductionPlanIfNeeded(
  db: SupabaseClient,
  companyId: string,
  employeeId: string,
  deductionKind: 'SALARY_LOAN' | 'UNIT_DAMAGES' | 'OTHER_DEDUCTIONS',
  amount: number,
  notes: string | null,
  payrollMonth: string,
  summary: BulkImportSummary,
) {
  if (amount <= 0) return;

  const { data: existing, error: fetchError } = await db
    .from('fm_employee_deduction_plans')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('deduction_kind', deductionKind)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (fetchError) {
    if (isMissingTableError(fetchError.message)) return;
    throw new Error(`Debt plan lookup (${deductionKind}): ${fetchError.message}`);
  }
  if (existing?.id) return;

  const planNotes = [BULK_IMPORT_DEBT_PLAN_NOTE, notes].filter(Boolean).join(' — ') || null;
  const { error } = await db.from('fm_employee_deduction_plans').insert({
    company_id: companyId,
    employee_id: employeeId,
    deduction_kind: deductionKind,
    total_liability_lkr: amount,
    installment_total: 1,
    start_payroll_month: payrollMonth,
    status: 'ACTIVE',
    notes: planNotes,
  });
  if (error) {
    if (isMissingTableError(error.message)) return;
    throw new Error(`Debt plan insert (${deductionKind}): ${error.message}`);
  }
  summary.debtLedgersSeeded += 1;
}

async function applyUnifiedRosterDebts(
  db: SupabaseClient,
  companyId: string,
  employeeId: string,
  row: Record<string, unknown>,
  summary: BulkImportSummary,
  importMode: BulkImportMode,
  isUpdate: boolean,
) {
  const { employee, debts } = mapUnifiedRosterRow(row);
  const payrollMonth = bulkImportPayrollMonth();
  const { year, month } = bulkImportPayrollPeriod();

  const balancePatch = employeeBalanceDebtPatchForUpsert(row, debts, {
    mode: importMode,
    isUpdate,
  });
  if (balancePatch) {
    const { error: balanceError } = await db
      .from('employees')
      .update(balancePatch)
      .eq('id', employeeId)
      .eq('company_id', companyId);
    if (balanceError) {
      throw new Error(
        `Debt balance update (${employee.empNumber ?? employeeId}): ${balanceError.message}`,
      );
    }
    summary.debtBalancesUpdated += 1;
  }

  const shouldSeedAdvance =
    importMode === 'full_replace' || !isUpdate || rosterDebtColumnProvided(row, 'salary_advance_outstanding_lkr');
  const shouldSeedPenalty =
    importMode === 'full_replace' || !isUpdate || rosterDebtColumnProvided(row, 'penalty_outstanding_lkr');
  const shouldSeedSalaryLoan =
    importMode === 'full_replace' || !isUpdate || rosterDebtColumnProvided(row, 'salary_loan_outstanding_lkr');
  const shouldSeedUnitDamages =
    importMode === 'full_replace' || !isUpdate || rosterDebtColumnProvided(row, 'unit_damages_outstanding_lkr');
  const shouldSeedOtherDeduction =
    importMode === 'full_replace' || !isUpdate || rosterDebtColumnProvided(row, 'other_deduction_outstanding_lkr');

  const hasLedgerSeeds =
    (shouldSeedAdvance && debts.salary_advance_outstanding_lkr > 0) ||
    (shouldSeedPenalty && debts.penalty_outstanding_lkr > 0) ||
    (shouldSeedSalaryLoan && debts.salary_loan_outstanding_lkr > 0) ||
    (shouldSeedUnitDamages && debts.unit_damages_outstanding_lkr > 0) ||
    (shouldSeedOtherDeduction && debts.other_deduction_outstanding_lkr > 0);

  if (
    balancePatch ||
    hasLedgerSeeds ||
    debts.uniform_outstanding_lkr > 0 ||
    debts.meals_advance_other_outstanding_lkr > 0
  ) {
    summary.employeesWithOutstandingDebt += 1;
  }

  if (!hasLedgerSeeds) return;

  if (shouldSeedAdvance && debts.salary_advance_outstanding_lkr > 0) {
    const { data: existingAdvance } = await db
      .from('salary_advances')
      .select('id')
      .eq('company_id', companyId)
      .eq('profile_id', employeeId)
      .eq('reason', BULK_IMPORT_DEBT_ADVANCE_REASON)
      .in('status', [...OPEN_SALARY_ADVANCE_STATUSES])
      .maybeSingle();

    if (!existingAdvance?.id) {
      const { error } = await db.from('salary_advances').insert({
        company_id: companyId,
        profile_id: employeeId,
        emp_number: employee.empNumber,
        amount: debts.salary_advance_outstanding_lkr,
        period_year: year,
        period_month: month,
        status: 'APPROVED',
        reason: BULK_IMPORT_DEBT_ADVANCE_REASON,
      });
      if (error && error.code !== '42P01') {
        throw new Error(`Salary advance seed (${employee.empNumber ?? employeeId}): ${error.message}`);
      }
      if (!error) summary.debtLedgersSeeded += 1;
    }
  }

  if (shouldSeedPenalty && debts.penalty_outstanding_lkr > 0) {
    const { data: existingPenalty } = await db
      .from('payroll_deductions')
      .select('id')
      .eq('company_id', companyId)
      .eq('guard_id', employeeId)
      .eq('category', 'DISCIPLINARY')
      .eq('reason', BULK_IMPORT_DEBT_PENALTY_REASON)
      .maybeSingle();

    if (!existingPenalty?.id) {
      const { error } = await db.from('payroll_deductions').insert({
        company_id: companyId,
        guard_id: employeeId,
        category: 'DISCIPLINARY',
        amount: debts.penalty_outstanding_lkr,
        reason: BULK_IMPORT_DEBT_PENALTY_REASON,
        applied_month: payrollMonth,
        approval_status: 'APPROVED',
      });
      if (error && !isMissingTableError(error.message)) {
        throw new Error(`Penalty seed (${employee.empNumber ?? employeeId}): ${error.message}`);
      }
      if (!error) summary.debtLedgersSeeded += 1;
    }
  }

  if (shouldSeedSalaryLoan) {
    await seedFmDeductionPlanIfNeeded(
      db,
      companyId,
      employeeId,
      'SALARY_LOAN',
      debts.salary_loan_outstanding_lkr,
      debts.debt_notes,
      payrollMonth,
      summary,
    );
  }
  if (shouldSeedUnitDamages) {
    await seedFmDeductionPlanIfNeeded(
      db,
      companyId,
      employeeId,
      'UNIT_DAMAGES',
      debts.unit_damages_outstanding_lkr,
      debts.debt_notes,
      payrollMonth,
      summary,
    );
  }
  if (shouldSeedOtherDeduction) {
    await seedFmDeductionPlanIfNeeded(
      db,
      companyId,
      employeeId,
      'OTHER_DEDUCTIONS',
      debts.other_deduction_outstanding_lkr,
      debts.debt_notes,
      payrollMonth,
      summary,
    );
  }
}

async function upsertSmGuardLink(
  db: SupabaseClient,
  companyId: string,
  link: UnifiedRosterSmLink,
  summary: BulkImportSummary,
) {
  const sm = await findActiveSectorManagerByEpf(db, link.sm_epf, companyId, 'emp_number');
  if (!sm?.emp_number) {
    throw new Error(`Roster SM link: "${link.sm_epf}" is not a Sector Manager.`);
  }

  const { data: guard } = await db
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .or(`emp_number.eq.${link.guard_epf},epf_no.eq.${link.guard_epf}`)
    .maybeSingle();
  if (!guard) {
    throw new Error(`Roster SM link: guard "${link.guard_epf}" was not found.`);
  }

  const { error } = await db
    .from('sm_guard_assignments')
    .upsert({ sm_epf: link.sm_epf, guard_epf: link.guard_epf }, { onConflict: 'sm_epf,guard_epf' });
  if (error) throw new Error(`SM link (${link.sm_epf} → ${link.guard_epf}): ${error.message}`);
  summary.smLinksUpserted += 1;
}

async function applyBulkImport(
  companyId: string,
  parsed: ParsedBulkWorkbook,
  rankMatrix: RankPayEntry[],
  importMode: BulkImportMode = DEFAULT_BULK_IMPORT_MODE,
): Promise<BulkImportSummary> {
  const db = createSupabaseServiceClient();
  const summary: BulkImportSummary = {
    employeesInserted: 0,
    employeesUpdated: 0,
    sitesInserted: 0,
    sitesUpdated: 0,
    smLinksUpserted: 0,
    debtBalancesUpdated: 0,
    debtLedgersSeeded: 0,
    employeesWithOutstandingDebt: 0,
  };

  await persistRanksEnsuredFromRosterRows(parsed.rows, rankMatrix);

  if (usesMigrationSitesSheet(parsed)) {
    for (const site of collectMigrationSiteImportRows(parsed)) {
      await upsertMigrationSiteProfile(db, companyId, site, summary);
    }
  } else {
    for (const site of deriveSitesFromRosterRows(parsed.rows)) {
      await upsertDerivedSite(db, companyId, site, summary);
    }
  }

  const epfToIdCache = new Map<string, string>();
  const protectedExecutiveKeys = await fetchBulkMigrationProtectedEmployeeKeys(db, companyId);

  for (let i = 0; i < parsed.rows.length; i++) {
    const meta = parsed.sheetMeta?.[i];
    const row = applyMigrationEmployeeDefaults(parsed.rows[i]!, meta);

    if (shouldSkipBulkMigrationImportRow(row, protectedExecutiveKeys)) {
      continue;
    }

    let tempParentId: string | null | undefined;
    const tempParentEpf = String(row.temp_parent_epf ?? '').trim();
    if (tempParentEpf) {
      tempParentId = await lookupEmployeeIdByEpf(
        db,
        companyId,
        tempParentEpf,
        epfToIdCache,
      );
    }

    const { employeeId, isUpdate } = await upsertUnifiedEmployee(
      db,
      companyId,
      row,
      summary,
      importMode,
      tempParentId,
    );
    cacheEmployeeLookupKeys(epfToIdCache, employeeId, row);
    await applyUnifiedRosterDebts(
      db,
      companyId,
      employeeId,
      row,
      summary,
      importMode,
      isUpdate,
    );
  }

  for (const link of collectSmLinksFromParsedWorkbook(parsed)) {
    await upsertSmGuardLink(db, companyId, link, summary);
  }

  return summary;
}

export async function uploadBulkDataWorkbook(formData: FormData): Promise<BulkUploadResult> {
  let profile: BackOfficeUserProfile;
  try {
    ({ profile } = await requireManagingDirector());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Access denied.',
    };
  }

  const totpCode = String(formData.get('totpCode') ?? '').trim();
  if (!/^\d{6}$/.test(totpCode)) {
    return {
      success: false,
      error: 'Enter your current 6-digit authenticator code to confirm upload.',
    };
  }
  if (!profile.employeeId) {
    return { success: false, error: 'Could not resolve your staff profile for 2FA verification.' };
  }

  const stepUp = await verifyHeadOfficeTotpStepUp(profile.employeeId, totpCode);
  if (!stepUp.ok) {
    return { success: false, error: stepUp.error ?? 'Invalid authenticator code.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Choose an .xlsx workbook to upload.' };
  }

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return {
      success: false,
      error: 'Tenant context required. Sign in on your company subdomain.',
    };
  }
  const effectiveCompanyId = companyId;

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseBulkDataWorkbook(buffer);
  } catch {
    return {
      success: false,
      error: 'Could not read the workbook. Use a Pearzen bulk export or import template (.xlsx).',
    };
  }

  const rankMatrix = await getRankPayMatrix();
  const validationErrors = validateBulkImport(parsed, rankMatrix);
  if (validationErrors.length > 0) {
    return {
      success: false,
      error: `${validationErrors.length} validation issue(s) found. Fix the workbook and upload again.`,
      validationErrors,
    };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      success: false,
      error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — bulk import cannot write to the database.',
    };
  }

  try {
    const summary = await applyBulkImport(effectiveCompanyId, parsed, rankMatrix);

    await revalidateBulkMigrationImportPaths();

    return {
      success: true,
      message: await formatBulkMigrationImportMessage(parsed, summary),
      summary,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Import failed while saving to the database.',
    };
  }
}

/** Apply parsed migration workbook to Supabase (merge-on-update). Used by upload + bulk editor. */
export async function runBulkMigrationImport(
  companyId: string,
  parsed: ParsedBulkWorkbook,
  rankMatrix: RankPayEntry[],
  importMode: BulkImportMode = DEFAULT_BULK_IMPORT_MODE,
): Promise<BulkImportSummary> {
  return applyBulkImport(companyId, parsed, rankMatrix, importMode);
}

export async function formatBulkMigrationImportMessage(
  parsed: ParsedBulkWorkbook,
  summary: BulkImportSummary,
): Promise<string> {
  const parts = [
    summary.employeesInserted || summary.employeesUpdated
      ? `${summary.employeesInserted} employee(s) added, ${summary.employeesUpdated} updated`
      : null,
    summary.sitesInserted || summary.sitesUpdated
      ? `${summary.sitesInserted} site(s) added, ${summary.sitesUpdated} updated`
      : null,
    summary.smLinksUpserted ? `${summary.smLinksUpserted} SM guard link(s) saved` : null,
    summary.debtBalancesUpdated
      ? `${summary.debtBalancesUpdated} employee debt balance(s) updated`
      : null,
    summary.debtLedgersSeeded
      ? `${summary.debtLedgersSeeded} debt ledger row(s) seeded`
      : null,
    summary.employeesWithOutstandingDebt
      ? `${summary.employeesWithOutstandingDebt} employee(s) with outstanding debt`
      : null,
  ].filter(Boolean);

  const instalmentReminder =
    summary.debtLedgersSeeded > 0 || summary.employeesWithOutstandingDebt > 0
      ? ` ${BULK_IMPORT_INSTALMENT_PLAN_REMINDER}`
      : '';

  const importWarnings = bulkImportValidationWarnings(parsed);
  const warningSuffix = importWarnings.length ? ` ${importWarnings.join(' ')}` : '';

  return parts.length
    ? `Import complete: ${parts.join('; ')}.${warningSuffix}${instalmentReminder}`
    : `Import complete — no rows changed.${warningSuffix}`;
}

export async function revalidateBulkMigrationImportPaths(): Promise<void> {
  revalidateMdSettingsConsumers();
  revalidatePath('/hr/mnr');
  revalidatePath('/om/sites/assignments');
  revalidatePath('/om/sites/location');
  revalidatePath('/executive/settings');
}
