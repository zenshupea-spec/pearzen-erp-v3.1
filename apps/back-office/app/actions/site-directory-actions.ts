'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { normalizeSmEpf } from '../../../../packages/supabase/sm-epf';
import { isSectorManagerEmployee } from '../../lib/hr-sectors';
import {
  anyMealProvided,
  EMPTY_SITE_MEALS,
  parseSiteMealsFromRow,
  type SiteMealsProvided,
} from '../../lib/site-welfare';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from '../../lib/site-geofence';
import { resolveActiveSmPortalAuth } from '../../lib/sm-portal-access-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';

export type SiteStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'ARCHIVED';

export type RankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

export type RankRateEntry = {
  qty: number;
  invoiceRate: number;
  payRate: number;
  isEventBill?: boolean;
  eventLabel?: string;
};

export type RateAudit = {
  editedBy: string;
  editedAt: string;
};

export type VerificationMode = 'A' | 'B' | 'C';

export type MasterSite = {
  id: string;
  siteKind: SiteRegistrationKind;
  clientName: string;
  parentClient?: string;
  siteName: string;
  siteCode: string;
  address: string;
  clientBillingAddress: string;
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
  minDwellTimeMinutes: number;
  visitsLogged: number;
  status: SiteStatus;
  contractStart: string;
  contractEnd: string;
  geofenceRadiusM: number;
  verificationMode: VerificationMode;
  nfcTagId: string | null;
  mealsProvided: SiteMealsProvided;
  providesAccommodation: boolean;
  rateMatrix: Partial<Record<RankKey, RankRateEntry>>;
  rateAudit: RateAudit | null;
};

export type SectorManagerOption = {
  epf: string;
  label: string;
  phone: string;
  sector: string;
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
    shiftType?: string;
    headcount: string;
    invoiceRate: string;
    payRate: string;
  }[];
  mealsProvided?: SiteMealsProvided;
  providesAccommodation?: boolean;
};

export type SiteConfigUpdate = {
  siteName: string;
  siteCode: string;
  address: string;
  clientName: string;
  parentClient: string;
  clientBillingAddress: string;
  lat: number;
  lng: number;
  contractStart: string;
  contractEnd: string;
  sectorManagerEpf: string;
  perVisitCharge: number;
  minDwellTimeMinutes: number;
  geofenceRadiusM: number;
  verificationMode: VerificationMode;
  mealsProvided: SiteMealsProvided;
  providesAccommodation: boolean;
};

const RANKS: RankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];

function parseSiteStatus(value: unknown, hasSm: boolean): SiteStatus {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'ACTIVE' || raw === 'SUSPENDED' || raw === 'PENDING' || raw === 'ARCHIVED') {
    return raw;
  }
  return hasSm ? 'ACTIVE' : 'PENDING';
}

function parseVerificationMode(value: unknown): VerificationMode {
  const raw = String(value ?? 'B').toUpperCase();
  if (raw === 'A' || raw === 'B' || raw === 'C') return raw;
  return 'B';
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
    const eventLabel =
      typeof row.eventLabel === 'string' ? row.eventLabel.trim() : undefined;
    out[key as RankKey] = {
      qty: Number(row.qty) || 0,
      invoiceRate: Number(row.invoiceRate) || 0,
      payRate: Number(row.payRate) || 0,
      isEventBill: Boolean(row.isEventBill),
      eventLabel: eventLabel || undefined,
    };
  }
  return out;
}

function smLabel(rank: string | null, fullName: string | null, epf: string): string {
  const name = fullName?.trim() || epf;
  const r = rank?.trim();
  return r ? `${r} ${name}` : name;
}

function isSectorManagerRow(row: {
  emp_number?: string | null;
  rank?: string | null;
  group?: string | null;
}) {
  return isSectorManagerEmployee(row);
}

function resolveClientSiteSector(
  smEpf: string | null,
  smByEpf: Map<string, SectorManagerOption>,
): string {
  if (!smEpf) return 'Unassigned';
  const sector = smByEpf.get(smEpf)?.sector?.trim();
  return sector || 'Unassigned';
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
    .select('emp_number, epf_no, epf_num, full_name, rank, phone, status, group, site')
    .eq('status', 'ACTIVE')
    .or('group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)')
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
    .map((row) => {
      const epf = employeeEpfKey(row);
      if (!epf) return null;
      return {
        epf,
        label: smLabel(
          row.rank == null ? null : String(row.rank),
          row.full_name == null ? null : String(row.full_name),
          epf,
        ),
        phone: row.phone ? String(row.phone) : '—',
        sector: row.site == null ? '' : String(row.site).trim(),
      };
    })
    .filter((row): row is SectorManagerOption => row != null);
}

async function fetchSitesForCompany(companyId: string | null): Promise<Record<string, unknown>[]> {
  const supabase = getSiteDirectoryDb();
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
  const supabase = getSiteDirectoryDb();
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
  marginActivity?: { shiftsCompleted: number; visitsLogged: number },
): MasterSite {
  const rateMatrix = parseRateMatrix(row.rate_matrix);
  const { inv, pay } = blendedRates(rateMatrix);
  const smEpf = normalizeSmEpf(row.assigned_sm_epf);
  const siteStaffEpfs = siteStaffBySiteId.get(String(row.id)) ?? (smEpf ? [smEpf] : []);
  const rateAuditRaw = row.rate_audit as RateAudit | null;

  const siteKind = inferSiteKindFromRow(row);

  return {
    id: String(row.id),
    siteKind,
    clientName: String(row.client_name ?? row.site_name ?? ''),
    parentClient: row.parent_client ? String(row.parent_client) : undefined,
    siteName: String(row.site_name ?? ''),
    siteCode: row.site_code == null ? '' : String(row.site_code),
    address: row.address == null ? '' : String(row.address),
    clientBillingAddress:
      row.client_billing_address == null ? '' : String(row.client_billing_address),
    lat: row.latitude == null ? 0 : Number(row.latitude),
    lng: row.longitude == null ? 0 : Number(row.longitude),
    sector:
      siteKind === 'head_office'
        ? 'Head Office'
        : siteKind === 'cafe_branch'
          ? 'Café'
          : resolveClientSiteSector(smEpf, smByEpf),
    sectorManager: resolveStaffContactLabel(smEpf, smByEpf, staffByEpf, siteStaffEpfs),
    sectorManagerEpf: smEpf,
    smPhone: smEpf ? (smByEpf.get(smEpf)?.phone ?? '—') : '—',
    rankRequirements: rankRequirementsFromMatrix(rateMatrix),
    shiftsCompleted: marginActivity?.shiftsCompleted ?? 0,
    clientInvoiceRate: inv,
    guardPayRate: pay,
    deductions: 0,
    perVisitCharge: Number(row.per_visit_charge_lkr ?? 0),
    minDwellTimeMinutes: Number(row.min_dwell_time_minutes ?? 0),
    visitsLogged: marginActivity?.visitsLogged ?? 0,
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
    verificationMode: parseVerificationMode(row.verification_mode),
    nfcTagId: row.nfc_tag_id == null ? null : String(row.nfc_tag_id),
    mealsProvided: parseSiteMealsFromRow(row),
    providesAccommodation: Boolean(row.provides_accommodation),
    rateMatrix,
    rateAudit:
      rateAuditRaw && rateAuditRaw.editedAt
        ? { editedBy: rateAuditRaw.editedBy ?? 'MD', editedAt: rateAuditRaw.editedAt }
        : null,
  };
}

function totalHeadsFromRankMatrix(matrix: Partial<Record<RankKey, RankRateEntry>>): number {
  return RANKS.reduce((sum, rank) => sum + (matrix[rank]?.qty ?? 0), 0);
}

type StoredRateMatrix = Partial<Record<RankKey, RankRateEntry>> & {
  _shiftRows?: Array<{
    rank: string;
    shiftType: string;
    qty: number;
    invoiceRate: number;
    payRate: number;
  }>;
};

function rankTotalsFromShiftRows(
  shiftRows: NonNullable<StoredRateMatrix['_shiftRows']>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of shiftRows) {
    const rank = String(row.rank ?? '').trim().toUpperCase();
    if (!rank) continue;
    totals.set(rank, (totals.get(rank) ?? 0) + Math.max(0, Number(row.qty) || 0));
  }
  return totals;
}

function rankTotalsFromMatrix(matrix: Partial<Record<RankKey, RankRateEntry>>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const rank of RANKS) {
    const qty = matrix[rank]?.qty ?? 0;
    if (qty > 0) totals.set(rank, qty);
  }
  return totals;
}

function rankTotalsEqual(
  left: Map<string, number>,
  right: Map<string, number>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [rank, qty] of left) {
    if (right.get(rank) !== qty) return false;
  }
  return true;
}

function refreshShiftRowRates(
  shiftRows: NonNullable<StoredRateMatrix['_shiftRows']>,
  matrix: Partial<Record<RankKey, RankRateEntry>>,
): NonNullable<StoredRateMatrix['_shiftRows']> {
  return shiftRows.map((row) => {
    const rank = row.rank as RankKey;
    const entry = matrix[rank];
    return {
      ...row,
      invoiceRate: entry?.invoiceRate ?? row.invoiceRate,
      payRate: entry?.payRate ?? row.payRate,
    };
  });
}

/** Rebuild `_shiftRows` as all-shift coverage when MD edits aggregated rank qty in Site Directory. */
function buildShiftRowsFromAggregatedMatrix(
  matrix: Partial<Record<RankKey, RankRateEntry>>,
): StoredRateMatrix {
  const shiftRows: NonNullable<StoredRateMatrix['_shiftRows']> = [];
  for (const rank of RANKS) {
    const entry = matrix[rank];
    if (!entry || entry.qty <= 0) continue;
    shiftRows.push({
      rank,
      shiftType: 'both',
      qty: entry.qty,
      invoiceRate: entry.invoiceRate,
      payRate: entry.payRate,
    });
  }
  if (!shiftRows.length) return matrix;
  return { ...matrix, _shiftRows: shiftRows };
}

/**
 * Keep day/night `_shiftRows` when MD only changes rates; rebuild when rank headcounts change.
 * SM portal (`parseSiteShiftRows`) reads rank + shiftType + qty from `_shiftRows`.
 */
function attachShiftRowsForSave(
  existing: unknown,
  input: Partial<Record<RankKey, RankRateEntry>>,
): StoredRateMatrix {
  const existingRows =
    existing &&
    typeof existing === 'object' &&
    Array.isArray((existing as StoredRateMatrix)._shiftRows)
      ? (existing as StoredRateMatrix)._shiftRows!
      : undefined;

  const inputTotals = rankTotalsFromMatrix(input);

  if (
    existingRows?.length &&
    rankTotalsEqual(rankTotalsFromShiftRows(existingRows), inputTotals)
  ) {
    return { ...input, _shiftRows: refreshShiftRowRates(existingRows, input) };
  }

  return buildShiftRowsFromAggregatedMatrix(input);
}

async function fetchExistingRateMatrix(
  db: ReturnType<typeof getSiteDirectoryDb>,
  companyId: string,
  siteId: string,
): Promise<unknown> {
  const { data, error } = await db
    .from('site_profiles')
    .select('rate_matrix')
    .eq('id', siteId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.rate_matrix ?? null;
}

async function requireSiteDirectoryMutationActor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD' && role !== 'FM') {
    throw new Error('Forbidden');
  }
  return user;
}

/** Signed-in MD/OD/FM write scope — no silent CVS fallback when session tenant is missing. */
async function requireSiteDirectoryWriteScope() {
  const supabase = await createSupabaseServerClient();
  await requireSiteDirectoryMutationActor(supabase);

  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  if (!sessionCompanyId) throw new Error('Unauthorized');

  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) throw new Error('Forbidden');

  return { supabase, companyId };
}

async function loadSiteProfileForWrite(
  db: ReturnType<typeof getSiteDirectoryDb>,
  companyId: string,
  siteId: string,
  select: string,
) {
  const { data, error } = await db
    .from('site_profiles')
    .select(select)
    .eq('id', siteId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

function siteDirectoryAuthFailure(
  error: unknown,
): { success: false; error: string } | null {
  if (error instanceof Error) {
    if (error.message === 'Forbidden') return { success: false, error: 'Forbidden' };
    if (error.message === 'Unauthorized') {
      return { success: false, error: 'Unauthorized' };
    }
  }
  return null;
}

function buildRateMatrixFromRows(
  rankRows: RegisterSiteInput['rankRows'],
): Partial<Record<RankKey, RankRateEntry>> & {
  _shiftRows?: Array<{
    rank: string;
    shiftType: string;
    qty: number;
    invoiceRate: number;
    payRate: number;
  }>;
} {
  const matrix: Partial<Record<RankKey, RankRateEntry>> = {};
  const shiftRows: Array<{
    rank: string;
    shiftType: string;
    qty: number;
    invoiceRate: number;
    payRate: number;
  }> = [];

  for (const row of rankRows) {
    const rank = row.rank as RankKey;
    if (!RANKS.includes(rank)) continue;
    const qty = parseInt(row.headcount, 10) || 0;
    if (qty <= 0) continue;

    const shiftType = String(row.shiftType ?? 'both').toLowerCase();
    shiftRows.push({
      rank,
      shiftType,
      qty,
      invoiceRate: parseFloat(row.invoiceRate) || 0,
      payRate: parseFloat(row.payRate) || 0,
    });

    const existing = matrix[rank];
    matrix[rank] = {
      qty: (existing?.qty ?? 0) + qty,
      invoiceRate: parseFloat(row.invoiceRate) || existing?.invoiceRate || 0,
      payRate: parseFloat(row.payRate) || existing?.payRate || 0,
    };
  }

  return shiftRows.length ? { ...matrix, _shiftRows: shiftRows } : matrix;
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

/** Service-role DB — executive/FM sessions often fail site_profiles RLS. */
function getSiteDirectoryDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'Site directory is not configured (missing SUPABASE_SERVICE_ROLE_KEY).',
    );
  }
  return createSupabaseServiceClient();
}

async function siteCodeInUse(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  siteCode: string,
  excludeSiteId?: string,
): Promise<boolean> {
  const normalized = siteCode.trim().toUpperCase();
  if (!normalized) return false;

  let query = db
    .from('site_profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('site_code', normalized)
    .limit(1);

  if (excludeSiteId) {
    query = query.neq('id', excludeSiteId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function resolveCompanyScope() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
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

export type FetchMasterSiteDirectoryOptions = {
  /** YYYY-MM — when set, populates shiftsCompleted / visitsLogged from monthly rollup. */
  payrollMonth?: string;
  /** HO/café-only desk — excludes client guard sites from the payload. */
  internalLocationsOnly?: boolean;
};

function isInternalLocationSite(site: MasterSite): boolean {
  return site.siteKind === 'head_office' || site.siteKind === 'cafe_branch';
}

export async function fetchMasterSiteDirectory(
  options?: FetchMasterSiteDirectoryOptions,
): Promise<{
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

  let activityBySiteId: Map<string, { shiftsCompleted: number; visitsLogged: number }> | null =
    null;
  if (options?.payrollMonth) {
    const { fetchSiteMarginActivityBySiteId } = await import('../../lib/site-margin-activity');
    activityBySiteId = await fetchSiteMarginActivityBySiteId(companyId, options.payrollMonth);
  }

  return {
    sites: rows
      .map((row) => {
        const siteId = String(row.id);
        const marginActivity = activityBySiteId?.get(siteId);
        return mapDbRowToMasterSite(
          row,
          mapping.smByEpf,
          mapping.staffByEpf,
          mapping.siteStaffBySiteId,
          marginActivity,
        );
      })
      .filter((site) => !options?.internalLocationsOnly || isInternalLocationSite(site)),
    sectorManagers: mapping.sectorManagers,
    headOfficeStaff: mapping.headOfficeStaff,
    cafeStaff: mapping.cafeStaff,
  };
}

export async function createMasterSite(
  input: RegisterSiteInput,
): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  if (input.siteKind !== 'client') {
    return {
      success: false,
      error:
        'Head office and café branches are configured in MD Settings → Operations. Site Directory is for client guard sites only.',
    };
  }

  const isClientSite = true;

  const clientName = resolveClientName(input);
  if (!clientName) return { success: false, error: 'Client name is required.' };
  if (!input.siteCode.trim()) return { success: false, error: 'Site code is required.' };
  if (!input.siteName.trim()) return { success: false, error: 'Site name is required.' };
  if (!input.locationAddress.trim()) return { success: false, error: 'Address is required.' };
  if (!input.contractStart) return { success: false, error: 'Contract start date is required.' };

  const rateMatrix = isClientSite ? buildRateMatrixFromRows(input.rankRows) : {};
  const totalHeads = totalHeadsFromRankMatrix(rateMatrix);
  const gpsParts = input.gpsCoords.split(',').map((p) => p.trim());
  const lat = gpsParts[0] ? parseFloat(gpsParts[0]) : null;
  const lng = gpsParts[1] ? parseFloat(gpsParts[1]) : null;
  const hasGps = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const requestOmGps = isClientSite && input.requestOMGPS;

  if (!hasGps && !requestOmGps) {
    return { success: false, error: 'GPS coordinates are required (or request TM field capture for client sites).' };
  }

  const smEpfRaw = input.sectorManagerEpf.trim();
  const smEpf =
    smEpfRaw && smEpfRaw.toLowerCase() !== 'null' ? smEpfRaw.toUpperCase() : null;

  try {
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    let assignedSmEpf: string | null = null;
    if (smEpf) {
      const gate = await resolveActiveSmPortalAuth(db, companyId, smEpf);
      if (!gate.ok) return { success: false, error: gate.error };
      assignedSmEpf = gate.storedEpf;
    }

    if (await siteCodeInUse(db, companyId, input.siteCode)) {
      return {
        success: false,
        error: `Site code "${input.siteCode.trim().toUpperCase()}" is already assigned to another site.`,
      };
    }

    const siteType = 'OTHER' as const;
    const mealsProvided = input.mealsProvided ?? EMPTY_SITE_MEALS;

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
      assigned_sm_epf: assignedSmEpf,
      per_visit_charge_lkr: isClientSite ? parseFloat(input.perVisitCharge) || 0 : 0,
      min_dwell_time_minutes: 0,
      required_guards: isClientSite ? totalHeads || 1 : 0,
      rate_matrix: rateMatrix,
      site_status: assignedSmEpf || hasGps ? 'ACTIVE' : 'PENDING',
      verification_mode: 'B',
      provides_food: anyMealProvided(mealsProvided),
      meal_breakfast: mealsProvided.breakfast,
      meal_lunch: mealsProvided.lunch,
      meal_dinner: mealsProvided.dinner,
      meal_tea: mealsProvided.tea,
      provides_accommodation: Boolean(input.providesAccommodation),
    };

    const { data, error } = await db.from('site_profiles').insert(record).select('*').single();
    if (error) throw new Error(error.message);

    const { smByEpf, staffByEpf, siteStaffBySiteId } = await loadSiteMappingContext(companyId);

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');
    revalidatePath('/hr/mnr');
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
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
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    const existing = await loadSiteProfileForWrite(db, companyId, input.siteId, 'id');
    if (!existing) return { success: false, error: 'Site not found.' };

    const gate = await resolveActiveSmPortalAuth(db, companyId, smEpf);
    if (!gate.ok) return { success: false, error: gate.error };

    const { error } = await db
      .from('site_profiles')
      .update({ assigned_sm_epf: gate.storedEpf, site_status: 'ACTIVE' })
      .eq('id', input.siteId)
      .eq('company_id', companyId);

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
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
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
  const totalHeads = totalHeadsFromRankMatrix(input.rateMatrix);

  try {
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    const existing = await loadSiteProfileForWrite(db, companyId, input.siteId, 'id');
    if (!existing) return { success: false, error: 'Site not found.' };

    const existingMatrix = await fetchExistingRateMatrix(db, companyId, input.siteId);
    const rateMatrix = attachShiftRowsForSave(existingMatrix, input.rateMatrix);

    const { error } = await db
      .from('site_profiles')
      .update({
        rate_matrix: rateMatrix,
        rate_audit: rateAudit,
        required_guards: totalHeads || 1,
      })
      .eq('id', input.siteId)
      .eq('company_id', companyId);

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
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
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
  const smEpfRaw = input.config.sectorManagerEpf.trim();
  const smEpf =
    smEpfRaw && smEpfRaw.toLowerCase() !== 'null' ? smEpfRaw.toUpperCase() : null;
  const totalHeads = totalHeadsFromRankMatrix(input.rateMatrix);
  const rateAudit = { editedBy: 'MD', editedAt: new Date().toISOString() };

  try {
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    const existing = await loadSiteProfileForWrite(
      db,
      companyId,
      input.siteId,
      'site_status, rate_matrix',
    );
    if (!existing) return { success: false, error: 'Site not found.' };

    const rateMatrix = attachShiftRowsForSave(existing.rate_matrix, input.rateMatrix);

    const currentStatus = String(existing.site_status ?? '').toUpperCase();
    const siteStatus =
      currentStatus === 'ARCHIVED' || currentStatus === 'SUSPENDED'
        ? currentStatus
        : smEpf
          ? 'ACTIVE'
          : 'PENDING';

    const siteName = input.config.siteName.trim();
    const clientName = input.config.clientName.trim();
    const parentClient = input.config.parentClient.trim() || clientName;
    const siteCode = input.config.siteCode.trim().toUpperCase();

    if (siteCode && (await siteCodeInUse(db, companyId, siteCode, input.siteId))) {
      return {
        success: false,
        error: `Site code "${siteCode}" is already assigned to another site.`,
      };
    }

    let assignedSmEpf: string | null = null;
    if (smEpf) {
      const gate = await resolveActiveSmPortalAuth(db, companyId, smEpf);
      if (!gate.ok) return { success: false, error: gate.error };
      assignedSmEpf = gate.storedEpf;
    }

    const { error } = await db
      .from('site_profiles')
      .update({
        site_name: siteName,
        site_code: siteCode || null,
        address: input.config.address.trim().toUpperCase(),
        client_name: clientName,
        parent_client: parentClient,
        client_billing_address: input.config.clientBillingAddress.trim() || null,
        latitude: input.config.lat,
        longitude: input.config.lng,
        contract_start: input.config.contractStart || null,
        contract_end: input.config.contractEnd || null,
        assigned_sm_epf: assignedSmEpf,
        site_status: siteStatus,
        rate_matrix: rateMatrix,
        rate_audit: rateAudit,
        required_guards: totalHeads || 1,
        verification_mode: input.config.verificationMode,
        needs_om_gps_capture: false,
        per_visit_charge_lkr: input.config.perVisitCharge,
        min_dwell_time_minutes: 0,
        geofence_radius: clampGeofenceRadiusM(input.config.geofenceRadiusM),
        provides_food: anyMealProvided(input.config.mealsProvided),
        meal_breakfast: input.config.mealsProvided.breakfast,
        meal_lunch: input.config.mealsProvided.lunch,
        meal_dinner: input.config.mealsProvided.dinner,
        meal_tea: input.config.mealsProvided.tea,
        provides_accommodation: input.config.providesAccommodation,
      })
      .eq('id', input.siteId)
      .eq('company_id', companyId);

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
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
    const message = supabaseErrorMessage(error, 'Failed to save configuration.');
    console.error('❌ SUPABASE ERROR (updateMasterSiteConfig):', message);
    return { success: false, error: message };
  }
}

export async function archiveMasterSite(input: {
  siteId: string;
}): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  try {
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    const existing = await loadSiteProfileForWrite(db, companyId, input.siteId, 'id');
    if (!existing) return { success: false, error: 'Site not found.' };

    const { error } = await db
      .from('site_profiles')
      .update({ site_status: 'ARCHIVED' })
      .eq('id', input.siteId)
      .eq('company_id', companyId);

    if (error) throw new Error(error.message);

    const [rows, mapping] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      loadSiteMappingContext(companyId),
    ]);
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after archive.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
    const message = supabaseErrorMessage(error, 'Failed to archive site.');
    console.error('❌ SUPABASE ERROR (archiveMasterSite):', message);
    return { success: false, error: message };
  }
}

export async function restoreMasterSite(input: {
  siteId: string;
}): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  try {
    const { companyId } = await requireSiteDirectoryWriteScope();
    const db = getSiteDirectoryDb();

    const existing = await loadSiteProfileForWrite(
      db,
      companyId,
      input.siteId,
      'assigned_sm_epf',
    );
    if (!existing) return { success: false, error: 'Site not found.' };

    const smEpf = existing.assigned_sm_epf
      ? String(existing.assigned_sm_epf).trim().toUpperCase()
      : '';
    const nextStatus: SiteStatus = smEpf ? 'ACTIVE' : 'PENDING';

    const { error } = await db
      .from('site_profiles')
      .update({ site_status: nextStatus })
      .eq('id', input.siteId)
      .eq('company_id', companyId);

    if (error) throw new Error(error.message);

    const [rows, mapping] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      loadSiteMappingContext(companyId),
    ]);
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after restore.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');
    revalidatePath('/hr/vacancies');

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
    const authFailure = siteDirectoryAuthFailure(error);
    if (authFailure) return authFailure;
    const message = supabaseErrorMessage(error, 'Failed to restore site.');
    console.error('❌ SUPABASE ERROR (restoreMasterSite):', message);
    return { success: false, error: message };
  }
}
