'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import {
  CLASSIC_VENTURE_COMPANY_ID,
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from '../../lib/site-geofence';

export type SiteStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export type RankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

export type RankRateEntry = {
  qty: number;
  invoiceRate: number;
  payRate: number;
};

export type RateAudit = {
  editedBy: string;
  editedAt: string;
};

export type MasterSite = {
  id: string;
  siteKind: SiteRegistrationKind;
  clientName: string;
  parentClient?: string;
  siteName: string;
  address: string;
  lat: number;
  lng: number;
  sector: string;
  sectorManager: string;
  sectorManagerEpf: string | null;
  smPhone: string;
  rankRequirements: string;
  shiftsCompleted: number;
  clientInvoiceRate: number;
  guardPayRate: number;
  deductions: number;
  perVisitCharge: number;
  visitsLogged: number;
  status: SiteStatus;
  contractStart: string;
  contractEnd: string;
  geofenceRadiusM: number;
  rateMatrix: Partial<Record<RankKey, RankRateEntry>>;
  rateAudit: RateAudit | null;
};

export type SectorManagerOption = {
  epf: string;
  label: string;
  phone: string;
};

export type InternalStaffOption = {
  epf: string;
  label: string;
};

export type SiteRegistrationKind = 'client' | 'head_office' | 'cafe_branch';

export type RegisterSiteInput = {
  siteKind: SiteRegistrationKind;
  clientMode: 'existing' | 'new';
  existingClientName: string;
  newClientName: string;
  newClientBillingAddress: string;
  siteCode: string;
  siteName: string;
  locationAddress: string;
  contractStart: string;
  contractEnd: string;
  gpsCoords: string;
  geofenceRadiusM: string;
  requestOMGPS: boolean;
  sectorManagerEpf: string;
  /** @deprecated Use assignedStaffEpfs for internal sites */
  assignedStaffEpf: string;
  assignedStaffEpfs?: string[];
  perVisitCharge: string;
  minDwellTime: string;
  rankRows: {
    rank: string;
    headcount: string;
    invoiceRate: string;
    payRate: string;
  }[];
};

export type SiteConfigUpdate = {
  lat: number;
  lng: number;
  contractStart: string;
  contractEnd: string;
  sectorManagerEpf: string;
  smPhone: string;
  verificationMode?: 'A' | 'B' | 'C';
};

const RANKS: RankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];

function parseSiteStatus(value: unknown, hasSm: boolean): SiteStatus {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'ACTIVE' || raw === 'SUSPENDED' || raw === 'PENDING') {
    return raw;
  }
  return hasSm ? 'ACTIVE' : 'PENDING';
}

function blendedRates(matrix: Partial<Record<RankKey, RankRateEntry>>) {
  const entries = (Object.values(matrix).filter(Boolean) as RankRateEntry[]).filter(
    (r) => r.qty > 0,
  );
  const totalQty = entries.reduce((sum, r) => sum + r.qty, 0);
  if (!totalQty) return { inv: 0, pay: 0 };
  return {
    inv: Math.round(entries.reduce((s, r) => s + r.qty * r.invoiceRate, 0) / totalQty),
    pay: Math.round(entries.reduce((s, r) => s + r.qty * r.payRate, 0) / totalQty),
  };
}

function rankRequirementsFromMatrix(matrix: Partial<Record<RankKey, RankRateEntry>>): string {
  const parts = (Object.entries(matrix) as [RankKey, RankRateEntry][])
    .filter(([, r]) => r?.qty > 0)
    .map(([rank, r]) => `${r.qty}× ${rank}`);
  return parts.length ? parts.join(', ') : 'TBD';
}

function parseRateMatrix(value: unknown): Partial<Record<RankKey, RankRateEntry>> {
  if (!value || typeof value !== 'object') return {};
  const out: Partial<Record<RankKey, RankRateEntry>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!RANKS.includes(key as RankKey) || !raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    out[key as RankKey] = {
      qty: Number(row.qty) || 0,
      invoiceRate: Number(row.invoiceRate) || 0,
      payRate: Number(row.payRate) || 0,
    };
  }
  return out;
}

function smLabel(rank: string | null, fullName: string | null, epf: string): string {
  const name = fullName?.trim() || epf;
  const r = rank?.trim();
  return r ? `${r} ${name}` : name;
}

function isSectorManagerRow(row: { emp_number?: string | null; rank?: string | null }) {
  const epf = String(row.emp_number ?? '').toUpperCase();
  const rank = String(row.rank ?? '').toUpperCase();
  return epf.startsWith('SM-') || ['SM', 'OIC', 'SSO', 'CSO'].includes(rank);
}

function employeeEpfKey(row: {
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | null;
}): string {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  return epf.toUpperCase();
}

function staffLabel(fullName: string | null, epf: string, rank?: string | null): string {
  const name = fullName?.trim() || epf;
  const r = rank?.trim();
  return r ? `${r} ${name}` : name;
}

async function fetchStaffByGroupForCompany(
  companyId: string | null,
  group: 'HEAD_OFFICE' | 'CAFE',
): Promise<InternalStaffOption[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, epf_no, epf_num, full_name, rank, status, group')
    .eq('status', 'ACTIVE')
    .eq('group', group)
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`❌ SUPABASE ERROR (fetchStaffByGroup ${group}):`, error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const epf = employeeEpfKey(row);
      if (!epf) return null;
      return {
        epf,
        label: staffLabel(
          row.full_name == null ? null : String(row.full_name),
          epf,
          row.rank == null ? null : String(row.rank),
        ),
      };
    })
    .filter((row): row is InternalStaffOption => row != null);
}

async function fetchSectorManagersForCompany(
  companyId: string | null,
): Promise<SectorManagerOption[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, rank, phone, status')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchSectorManagers):', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isSectorManagerRow(row))
    .map((row) => ({
      epf: String(row.emp_number),
      label: smLabel(row.rank == null ? null : String(row.rank), row.full_name == null ? null : String(row.full_name), String(row.emp_number)),
      phone: row.phone ? String(row.phone) : '—',
    }));
}

async function fetchSitesForCompany(companyId: string | null): Promise<Record<string, unknown>[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_profiles')
    .select('*')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchMasterSites):', error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

function resolveStaffContactLabel(
  smEpf: string | null,
  smByEpf: Map<string, SectorManagerOption>,
  staffByEpf: Map<string, InternalStaffOption>,
  siteStaffEpfs: string[],
): string {
  if (siteStaffEpfs.length) {
    const labels = siteStaffEpfs.map((epf) => staffByEpf.get(epf)?.label ?? epf);
    return labels.join(', ');
  }
  if (!smEpf) return 'Unassigned';
  const sm = smByEpf.get(smEpf);
  if (sm) return sm.label;
  const staff = staffByEpf.get(smEpf);
  if (staff) return staff.label;
  return smEpf;
}

type SiteStaffAssignmentRow = {
  site_profile_id: string;
  staff_epf: string;
};

async function fetchSiteStaffAssignmentRows(
  companyId: string | null,
): Promise<SiteStaffAssignmentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_staff_assignments')
    .select('site_profile_id, staff_epf')
    .order('created_at', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchSiteStaffAssignments):', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      site_profile_id: String(row.site_profile_id),
      staff_epf: String(row.staff_epf ?? '').trim().toUpperCase(),
    }))
    .filter((row) => row.staff_epf.length > 0);
}

function inferSiteKindFromRow(row: Record<string, unknown>): SiteRegistrationKind {
  const clientName = String(row.client_name ?? '').trim();
  const siteName = String(row.site_name ?? '').trim();
  const siteType = String(row.site_type ?? '').trim().toUpperCase();

  if (
    clientName === 'Head Office' ||
    siteName === 'Head Office' ||
    siteType === 'OFFICE'
  ) {
    return 'head_office';
  }

  if (
    clientName.startsWith('Café') ||
    clientName.startsWith('Cafe') ||
    siteName.startsWith('Café') ||
    siteName.startsWith('Cafe')
  ) {
    return 'cafe_branch';
  }

  return 'client';
}

function groupSiteStaffAssignments(
  rows: SiteStaffAssignmentRow[],
): Map<string, string[]> {
  const bySite = new Map<string, string[]>();
  for (const row of rows) {
    const list = bySite.get(row.site_profile_id) ?? [];
    list.push(row.staff_epf);
    bySite.set(row.site_profile_id, list);
  }
  return bySite;
}

function mapDbRowToMasterSite(
  row: Record<string, unknown>,
  smByEpf: Map<string, SectorManagerOption>,
  staffByEpf: Map<string, InternalStaffOption>,
  siteStaffBySiteId: Map<string, string[]>,
): MasterSite {
  const rateMatrix = parseRateMatrix(row.rate_matrix);
  const { inv, pay } = blendedRates(rateMatrix);
  const smEpf =
    row.assigned_sm_epf == null || row.assigned_sm_epf === ''
      ? null
      : String(row.assigned_sm_epf).trim().toUpperCase();
  const siteStaffEpfs = siteStaffBySiteId.get(String(row.id)) ?? (smEpf ? [smEpf] : []);
  const rateAuditRaw = row.rate_audit as RateAudit | null;

  const siteKind = inferSiteKindFromRow(row);

  return {
    id: String(row.id),
    siteKind,
    clientName: String(row.client_name ?? row.site_name ?? ''),
    parentClient: row.parent_client ? String(row.parent_client) : undefined,
    siteName: String(row.site_name ?? ''),
    address: row.address == null ? '' : String(row.address),
    lat: row.latitude == null ? 0 : Number(row.latitude),
    lng: row.longitude == null ? 0 : Number(row.longitude),
    sector:
      siteKind === 'head_office'
        ? 'Head Office'
        : siteKind === 'cafe_branch'
          ? 'Café'
          : 'Unassigned',
    sectorManager: resolveStaffContactLabel(smEpf, smByEpf, staffByEpf, siteStaffEpfs),
    sectorManagerEpf: smEpf,
    smPhone: smEpf ? (smByEpf.get(smEpf)?.phone ?? '—') : '—',
    rankRequirements: rankRequirementsFromMatrix(rateMatrix),
    shiftsCompleted: 0,
    clientInvoiceRate: inv,
    guardPayRate: pay,
    deductions: 0,
    perVisitCharge: Number(row.per_visit_charge_lkr ?? 0),
    visitsLogged: 0,
    status: parseSiteStatus(row.site_status, Boolean(smEpf)),
    contractStart: row.contract_start
      ? String(row.contract_start).slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    contractEnd: row.contract_end ? String(row.contract_end).slice(0, 10) : '',
    geofenceRadiusM: clampGeofenceRadiusM(
      row.geofence_radius == null
        ? DEFAULT_GEOFENCE_RADIUS_M
        : Number(row.geofence_radius),
    ),
    rateMatrix,
    rateAudit:
      rateAuditRaw && rateAuditRaw.editedAt
        ? { editedBy: rateAuditRaw.editedBy ?? 'MD', editedAt: rateAuditRaw.editedAt }
        : null,
  };
}

function buildRateMatrixFromRows(
  rankRows: RegisterSiteInput['rankRows'],
): Partial<Record<RankKey, RankRateEntry>> {
  const matrix: Partial<Record<RankKey, RankRateEntry>> = {};
  for (const row of rankRows) {
    const rank = row.rank as RankKey;
    if (!RANKS.includes(rank)) continue;
    const qty = parseInt(row.headcount, 10) || 0;
    if (qty <= 0) continue;
    matrix[rank] = {
      qty,
      invoiceRate: parseFloat(row.invoiceRate) || 0,
      payRate: parseFloat(row.payRate) || 0,
    };
  }
  return matrix;
}

function resolveClientName(input: RegisterSiteInput): string {
  if (input.siteKind === 'head_office') return 'Head Office';
  if (input.siteKind === 'cafe_branch') {
    const branch = input.siteName.trim();
    return branch ? `Café — ${branch}` : 'Café Branch';
  }
  return input.clientMode === 'existing'
    ? input.existingClientName.trim()
    : input.newClientName.trim();
}

function composedSiteName(
  clientName: string,
  siteName: string,
  siteKind?: SiteRegistrationKind,
): string {
  const trimmed = siteName.trim();
  if (siteKind === 'head_office') return 'Head Office';
  if (siteKind === 'cafe_branch') {
    if (trimmed.includes('—') || trimmed.includes(' - ')) return trimmed;
    return `Café — ${trimmed}`;
  }
  if (trimmed.includes('—') || trimmed.includes(' - ')) return trimmed;
  return `${clientName} — ${trimmed}`;
}

function supabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

/** Service-role writes — executive/FM sessions often fail site_profiles RLS. */
function getSiteDirectoryWriteDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'Site directory writes are not configured (missing SUPABASE_SERVICE_ROLE_KEY).',
    );
  }
  return createSupabaseServiceClient();
}

async function resolveCompanyScope() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId =
    rosterCompanyId(sessionCompanyId) ?? CLASSIC_VENTURE_COMPANY_ID;
  return { supabase, companyId };
}

function buildStaffByEpf(
  headOfficeStaff: InternalStaffOption[],
  cafeStaff: InternalStaffOption[],
): Map<string, InternalStaffOption> {
  const map = new Map<string, InternalStaffOption>();
  for (const person of [...headOfficeStaff, ...cafeStaff]) {
    map.set(person.epf, person);
  }
  return map;
}

async function loadSiteMappingContext(companyId: string | null) {
  const [sectorManagers, headOfficeStaff, cafeStaff, assignmentRows] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSectorManagersForCompany, companyId),
    fetchWithRosterCompanyFallback((id) => fetchStaffByGroupForCompany(id, 'HEAD_OFFICE'), companyId),
    fetchWithRosterCompanyFallback((id) => fetchStaffByGroupForCompany(id, 'CAFE'), companyId),
    fetchWithRosterCompanyFallback(fetchSiteStaffAssignmentRows, companyId),
  ]);
  return {
    sectorManagers,
    headOfficeStaff,
    cafeStaff,
    smByEpf: new Map(sectorManagers.map((m) => [m.epf, m])),
    staffByEpf: buildStaffByEpf(headOfficeStaff, cafeStaff),
    siteStaffBySiteId: groupSiteStaffAssignments(assignmentRows),
  };
}

function resolveAssignedStaffEpfs(input: RegisterSiteInput): string[] {
  const fromList = (input.assignedStaffEpfs ?? [])
    .map((epf) => epf.trim().toUpperCase())
    .filter(Boolean);
  if (fromList.length) return [...new Set(fromList)];
  const single = input.assignedStaffEpf.trim().toUpperCase();
  return single ? [single] : [];
}

async function syncEmployeeSiteAssignments(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  siteLabel: string,
  staffEpfs: string[],
) {
  if (!staffEpfs.length) return;

  for (const epf of staffEpfs) {
    let query = db
      .from('employees')
      .update({ site: siteLabel })
      .eq('status', 'ACTIVE');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { error: empError } = await query.or(
      `emp_number.ilike.${epf},epf_no.ilike.${epf},epf_num.ilike.${epf}`,
    );
    if (empError) {
      console.error('❌ SUPABASE ERROR (syncEmployeeSiteAssignments):', empError.message);
    }
  }
}

async function insertSiteStaffAssignments(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  siteProfileId: string,
  staffEpfs: string[],
) {
  if (!staffEpfs.length) return;

  const rows = staffEpfs.map((staffEpf) => ({
    company_id: companyId,
    site_profile_id: siteProfileId,
    staff_epf: staffEpf,
  }));

  const { error } = await db.from('site_staff_assignments').insert(rows);
  if (error) throw new Error(error.message);
}

export async function fetchMasterSiteDirectory(): Promise<{
  sites: MasterSite[];
  sectorManagers: SectorManagerOption[];
  headOfficeStaff: InternalStaffOption[];
  cafeStaff: InternalStaffOption[];
}> {
  const { companyId } = await resolveCompanyScope();
  const [rows, mapping] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
    loadSiteMappingContext(companyId),
  ]);

  return {
    sites: rows.map((row) =>
      mapDbRowToMasterSite(
        row,
        mapping.smByEpf,
        mapping.staffByEpf,
        mapping.siteStaffBySiteId,
      ),
    ),
    sectorManagers: mapping.sectorManagers,
    headOfficeStaff: mapping.headOfficeStaff,
    cafeStaff: mapping.cafeStaff,
  };
}

export async function createMasterSite(
  input: RegisterSiteInput,
): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  const isClientSite = input.siteKind === 'client';
  const isInternalSite = !isClientSite;

  const clientName = resolveClientName(input);
  if (!clientName) return { success: false, error: 'Client name is required.' };
  if (!input.siteCode.trim()) return { success: false, error: 'Site code is required.' };
  if (!input.siteName.trim()) return { success: false, error: 'Site name is required.' };
  if (!input.locationAddress.trim()) return { success: false, error: 'Address is required.' };
  if (!input.contractStart) return { success: false, error: 'Contract start date is required.' };

  const rateMatrix = isClientSite ? buildRateMatrixFromRows(input.rankRows) : {};
  const totalHeads = Object.values(rateMatrix).reduce((s, r) => s + (r?.qty ?? 0), 0);
  const gpsParts = input.gpsCoords.split(',').map((p) => p.trim());
  const lat = gpsParts[0] ? parseFloat(gpsParts[0]) : null;
  const lng = gpsParts[1] ? parseFloat(gpsParts[1]) : null;
  const hasGps = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const requestOmGps = isClientSite && input.requestOMGPS;

  if (!hasGps && !requestOmGps) {
    return { success: false, error: 'GPS coordinates are required (or request OM field capture for client sites).' };
  }

  const assignedStaffEpfs = isInternalSite ? resolveAssignedStaffEpfs(input) : [];
  const smEpf = isInternalSite
    ? assignedStaffEpfs[0] ?? null
    : input.sectorManagerEpf.trim() || null;

  if (isInternalSite && !assignedStaffEpfs.length) {
    return {
      success: false,
      error:
        input.siteKind === 'cafe_branch'
          ? 'Select at least one café staff member for this branch.'
          : 'Select at least one head office employee for this location.',
    };
  }

  try {
    const { companyId } = await resolveCompanyScope();

    const siteType =
      input.siteKind === 'head_office'
        ? ('OFFICE' as const)
        : input.siteKind === 'cafe_branch'
          ? ('HOTEL' as const)
          : ('OTHER' as const);

    const record = {
      company_id: companyId,
      site_name: composedSiteName(clientName, input.siteName, input.siteKind),
      site_type: siteType,
      address: input.locationAddress.trim().toUpperCase(),
      site_code: input.siteCode.trim().toUpperCase(),
      client_name: clientName,
      parent_client: clientName,
      client_billing_address: isClientSite ? input.newClientBillingAddress.trim() || null : null,
      contract_start: input.contractStart,
      contract_end: input.contractEnd || null,
      latitude: hasGps ? lat : null,
      longitude: hasGps ? lng : null,
      geofence_radius: clampGeofenceRadiusM(
        parseInt(input.geofenceRadiusM, 10) || DEFAULT_GEOFENCE_RADIUS_M,
      ),
      needs_om_gps_capture: requestOmGps || !hasGps,
      assigned_sm_epf: smEpf,
      per_visit_charge_lkr: isClientSite ? parseFloat(input.perVisitCharge) || 0 : 0,
      min_dwell_time_minutes: isClientSite ? parseInt(input.minDwellTime, 10) || 0 : 0,
      required_guards: isClientSite ? totalHeads || 1 : 0,
      rate_matrix: rateMatrix,
      site_status: smEpf || hasGps ? 'ACTIVE' : 'PENDING',
      verification_mode: 'B',
    };

    const db = getSiteDirectoryWriteDb();
    const { data, error } = await db.from('site_profiles').insert(record).select('*').single();
    if (error) throw new Error(error.message);

    const siteId = String((data as Record<string, unknown>).id);
    const siteLabel = composedSiteName(clientName, input.siteName, input.siteKind);

    if (isInternalSite && assignedStaffEpfs.length) {
      await insertSiteStaffAssignments(db, companyId, siteId, assignedStaffEpfs);
      await syncEmployeeSiteAssignments(db, companyId, siteLabel, assignedStaffEpfs);
    }

    const { smByEpf, staffByEpf, siteStaffBySiteId } = await loadSiteMappingContext(companyId);

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');
    revalidatePath('/hr/mnr');

    return {
      success: true,
      site: mapDbRowToMasterSite(
        data as Record<string, unknown>,
        smByEpf,
        staffByEpf,
        siteStaffBySiteId,
      ),
    };
  } catch (error: unknown) {
    const message = supabaseErrorMessage(error, 'Failed to save site.');
    console.error('❌ SUPABASE ERROR (createMasterSite):', message);
    return { success: false, error: message };
  }
}

export async function activateMasterSite(input: {
  siteId: string;
  smEpf: string;
}): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  const smEpf = input.smEpf.trim().toUpperCase();
  if (!smEpf) return { success: false, error: 'Select a Sector Manager.' };

  try {
    const { companyId } = await resolveCompanyScope();
    const db = getSiteDirectoryWriteDb();
    const { error } = await db
      .from('site_profiles')
      .update({ assigned_sm_epf: smEpf, site_status: 'ACTIVE' })
      .eq('id', input.siteId);

    if (error) throw new Error(error.message);

    const [rows, mapping] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      loadSiteMappingContext(companyId),
    ]);
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after activation.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');

    return {
      success: true,
      site: mapDbRowToMasterSite(
        site,
        mapping.smByEpf,
        mapping.staffByEpf,
        mapping.siteStaffBySiteId,
      ),
    };
  } catch (error: unknown) {
    const message = supabaseErrorMessage(error, 'Failed to activate site.');
    console.error('❌ SUPABASE ERROR (activateMasterSite):', message);
    return { success: false, error: message };
  }
}

export async function updateMasterSiteRates(input: {
  siteId: string;
  rateMatrix: Partial<Record<RankKey, RankRateEntry>>;
}): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  const rateAudit = { editedBy: 'MD', editedAt: new Date().toISOString() };
  const totalHeads = Object.values(input.rateMatrix).reduce((s, r) => s + (r?.qty ?? 0), 0);

  try {
    const { companyId } = await resolveCompanyScope();
    const db = getSiteDirectoryWriteDb();
    const { error } = await db
      .from('site_profiles')
      .update({
        rate_matrix: input.rateMatrix,
        rate_audit: rateAudit,
        required_guards: totalHeads || 1,
      })
      .eq('id', input.siteId);

    if (error) throw new Error(error.message);

    const [rows, mapping] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      loadSiteMappingContext(companyId),
    ]);
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after update.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');

    return {
      success: true,
      site: mapDbRowToMasterSite(
        site,
        mapping.smByEpf,
        mapping.staffByEpf,
        mapping.siteStaffBySiteId,
      ),
    };
  } catch (error: unknown) {
    const message = supabaseErrorMessage(error, 'Failed to save rates.');
    console.error('❌ SUPABASE ERROR (updateMasterSiteRates):', message);
    return { success: false, error: message };
  }
}

export async function updateMasterSiteConfig(input: {
  siteId: string;
  config: SiteConfigUpdate;
  rateMatrix: Partial<Record<RankKey, RankRateEntry>>;
}): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  const smEpf = input.config.sectorManagerEpf.trim() || null;
  const totalHeads = Object.values(input.rateMatrix).reduce((s, r) => s + (r?.qty ?? 0), 0);
  const rateAudit = { editedBy: 'MD', editedAt: new Date().toISOString() };

  try {
    const { companyId } = await resolveCompanyScope();
    const db = getSiteDirectoryWriteDb();
    const { error } = await db
      .from('site_profiles')
      .update({
        latitude: input.config.lat,
        longitude: input.config.lng,
        contract_start: input.config.contractStart || null,
        contract_end: input.config.contractEnd || null,
        assigned_sm_epf: smEpf,
        site_status: smEpf ? 'ACTIVE' : 'PENDING',
        rate_matrix: input.rateMatrix,
        rate_audit: rateAudit,
        required_guards: totalHeads || 1,
        verification_mode: input.config.verificationMode ?? 'B',
        needs_om_gps_capture: false,
      })
      .eq('id', input.siteId);

    if (error) throw new Error(error.message);

    const [rows, mapping] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      loadSiteMappingContext(companyId),
    ]);
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after update.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');

    return {
      success: true,
      site: mapDbRowToMasterSite(
        site,
        mapping.smByEpf,
        mapping.staffByEpf,
        mapping.siteStaffBySiteId,
      ),
    };
  } catch (error: unknown) {
    const message = supabaseErrorMessage(error, 'Failed to save configuration.');
    console.error('❌ SUPABASE ERROR (updateMasterSiteConfig):', message);
    return { success: false, error: message };
  }
}
