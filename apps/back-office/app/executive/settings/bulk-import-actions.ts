'use server';

import { revalidatePath } from 'next/cache';

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import {
  CLASSIC_VENTURE_COMPANY_ID,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import {
  mapEmployeeImportRow,
  mapSiteImportRow,
  mapSmLinkImportRow,
  parseBulkDataWorkbook,
  validateBulkImport,
  type BulkImportSummary,
} from '../../../lib/bulk-data-import';
import { buildBulkDataWorkbook } from '../../../lib/bulk-data-workbook';
import {
  decryptEmployeePiiRecord,
  encryptEmployeePiiRecord,
} from '../../../lib/employee-pii';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from '../../../lib/site-geofence';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { getRankPayMatrix } from './rank-matrix-actions';

export type BulkWorkbookMode = 'template' | 'export';

async function requireManagingDirector() {
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

  return supabase;
}

function mapEmployeeExportRow(emp: Record<string, unknown>) {
  const decrypted = decryptEmployeePiiRecord(emp);

  return {
    employee_id: decrypted.id ?? '',
    emp_number: decrypted.emp_number ?? '',
    full_name: decrypted.full_name ?? '',
    nic: decrypted.nic ?? '',
    passport_no: decrypted.passport_no ?? '',
    epf_no: decrypted.epf_no ?? decrypted.epf_num ?? '',
    phone: decrypted.phone ?? '',
    dob: decrypted.dob ?? '',
    gender: decrypted.gender ?? '',
    nationality: decrypted.nationality ?? '',
    religion: decrypted.religion ?? '',
    home_address: decrypted.home_address ?? '',
    role: decrypted.role ?? '',
    group: decrypted.group ?? '',
    rank: decrypted.rank ?? '',
    site: decrypted.site ?? '',
    date_joined: decrypted.date_joined ?? '',
    status: decrypted.status ?? '',
    base_salary: decrypted.base_salary ?? decrypted.basic_salary ?? '',
    salary_type: decrypted.salary_type ?? '',
    epf_yn: decrypted.epf_yn ?? false,
    bank_code: decrypted.bank_code ?? '',
    bank_name: decrypted.bank_name ?? '',
    branch_code: decrypted.branch_code ?? '',
    account_number: decrypted.account_number ?? '',
    mod_expiry: decrypted.mod_expiry ?? '',
    police_expiry: decrypted.police_expiry ?? '',
    maternity_leave: decrypted.maternity_leave ?? false,
  };
}

function mapSiteExportRow(row: Record<string, unknown>) {
  return {
    site_id: row.id ?? '',
    site_name: row.site_name ?? '',
    site_type: row.site_type ?? 'OTHER',
    address: row.address ?? '',
    required_guards: row.required_guards ?? 1,
    assigned_sm_epf: row.assigned_sm_epf ?? '',
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    geofence_radius_m: row.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS_M,
    verification_mode: row.verification_mode ?? 'B',
    provides_food: row.provides_food ?? false,
    food_allowance_lkr: row.food_allowance_lkr ?? 0,
    provides_accommodation: row.provides_accommodation ?? false,
    nfc_tag_id: row.nfc_tag_id ?? '',
  };
}

async function fetchEmployeesForExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string | null,
) {
  let query = supabase.from('employees').select('*').order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  let { data, error } = await query;
  if (error) throw new Error(error.message);

  if (!data?.length && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    let fallback = service.from('employees').select('*').order('full_name', { ascending: true });
    if (companyId) fallback = fallback.eq('company_id', companyId);
    const res = await fallback;
    if (!res.error) data = res.data;
  }

  return (data ?? []).map((row) => mapEmployeeExportRow(row as Record<string, unknown>));
}

async function fetchSitesForExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string | null,
) {
  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, site_type, address, required_guards, assigned_sm_epf, latitude, longitude, geofence_radius, verification_mode, provides_food, food_allowance_lkr, provides_accommodation, nfc_tag_id',
    )
    .order('site_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapSiteExportRow(row as Record<string, unknown>));
}

async function fetchSmGuardLinks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const { data, error } = await supabase
    .from('sm_guard_assignments')
    .select('sm_epf, guard_epf')
    .order('sm_epf', { ascending: true });
  if (error) {
    console.error('fetchSmGuardLinks:', error.message);
    return [];
  }
  return data ?? [];
}

export async function downloadBulkDataWorkbook(mode: BulkWorkbookMode): Promise<{
  success: true;
  filename: string;
  base64: string;
}> {
  const supabase = await requireManagingDirector();
  const companyId = await resolveCompanyIdForSession(supabase);
  const effectiveCompanyId = companyId || CLASSIC_VENTURE_COMPANY_ID;

  const rankMatrix = await getRankPayMatrix();

  let employees: Record<string, unknown>[] = [];
  let sites: Record<string, unknown>[] = [];
  let smGuardLinks: Record<string, unknown>[] = [];

  if (mode === 'export') {
    employees = await fetchEmployeesForExport(supabase, effectiveCompanyId);
    sites = await fetchSitesForExport(supabase, effectiveCompanyId);
    smGuardLinks = await fetchSmGuardLinks(supabase);
  }

  const { base64, filename } = buildBulkDataWorkbook({
    mode,
    employees,
    sites,
    smGuardLinks,
    rankMatrix,
  });

  return { success: true, filename, base64 };
}

export type BulkUploadResult =
  | { success: true; message: string; summary: BulkImportSummary }
  | { success: false; error: string; validationErrors?: string[] };

async function applyBulkImport(
  companyId: string,
  parsed: ReturnType<typeof parseBulkDataWorkbook>,
): Promise<BulkImportSummary> {
  const db = createSupabaseServiceClient();
  const summary: BulkImportSummary = {
    employeesInserted: 0,
    employeesUpdated: 0,
    sitesInserted: 0,
    sitesUpdated: 0,
    smLinksUpserted: 0,
  };

  for (const row of parsed.employees) {
    const mapped = mapEmployeeImportRow(row);
    const { employeeId, empNumber, payload } = mapped;

    const record = encryptEmployeePiiRecord({
      ...payload,
      company_id: companyId,
      nic: payload.nicPlain || null,
      phone: payload.phonePlain || null,
    });
    delete record.nicPlain;
    delete record.phonePlain;

    if (employeeId) {
      const { error } = await db
        .from('employees')
        .update(record)
        .eq('id', employeeId)
        .eq('company_id', companyId);
      if (error) throw new Error(`Employee update (${employeeId}): ${error.message}`);
      summary.employeesUpdated += 1;
      continue;
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
      const { error } = await db
        .from('employees')
        .update(record)
        .eq('id', existing.id);
      if (error) throw new Error(`Employee update (${empNumber}): ${error.message}`);
      summary.employeesUpdated += 1;
    } else {
      const { error } = await db.from('employees').insert(record);
      if (error) throw new Error(`Employee insert (${empNumber}): ${error.message}`);
      summary.employeesInserted += 1;
    }
  }

  for (const row of parsed.sites) {
    const mapped = mapSiteImportRow(row);
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
      continue;
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

  for (const row of parsed.smGuardLinks) {
    const link = mapSmLinkImportRow(row);

    const { data: sm } = await db
      .from('employees')
      .select('emp_number')
      .eq('emp_number', link.sm_epf)
      .eq('group', 'SECTOR_MANAGER')
      .maybeSingle();
    if (!sm) {
      throw new Error(`SM_Guard_Links: "${link.sm_epf}" is not a Sector Manager.`);
    }

    const { data: guard } = await db
      .from('employees')
      .select('emp_number')
      .eq('emp_number', link.guard_epf)
      .maybeSingle();
    if (!guard) {
      throw new Error(`SM_Guard_Links: guard "${link.guard_epf}" was not found.`);
    }

    const { error } = await db
      .from('sm_guard_assignments')
      .upsert({ sm_epf: link.sm_epf, guard_epf: link.guard_epf }, { onConflict: 'sm_epf,guard_epf' });
    if (error) throw new Error(`SM link (${link.sm_epf} → ${link.guard_epf}): ${error.message}`);
    summary.smLinksUpserted += 1;
  }

  return summary;
}

export async function uploadBulkDataWorkbook(formData: FormData): Promise<BulkUploadResult> {
  await requireManagingDirector();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Choose an .xlsx workbook to upload.' };
  }

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const effectiveCompanyId = companyId || CLASSIC_VENTURE_COMPANY_ID;

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
    const summary = await applyBulkImport(effectiveCompanyId, parsed);

    revalidatePath('/executive/settings');
    revalidatePath('/hr/mnr');
    revalidatePath('/hr/onboarding');
    revalidatePath('/om/sites/assignments');
    revalidatePath('/om/sites/location');

    const parts = [
      summary.employeesInserted || summary.employeesUpdated
        ? `${summary.employeesInserted} employee(s) added, ${summary.employeesUpdated} updated`
        : null,
      summary.sitesInserted || summary.sitesUpdated
        ? `${summary.sitesInserted} site(s) added, ${summary.sitesUpdated} updated`
        : null,
      summary.smLinksUpserted
        ? `${summary.smLinksUpserted} SM guard link(s) saved`
        : null,
    ].filter(Boolean);

    return {
      success: true,
      message: parts.length ? `Import complete: ${parts.join('; ')}.` : 'Import complete — no rows changed.',
      summary,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Import failed while saving to the database.',
    };
  }
}
