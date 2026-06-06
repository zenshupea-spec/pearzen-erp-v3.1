'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../lib/company-context';
import { clampGeofenceRadiusM } from '../../lib/site-geofence';

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

export type RegisterSiteInput = {
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

function mapDbRowToMasterSite(
  row: Record<string, unknown>,
  smByEpf: Map<string, SectorManagerOption>,
): MasterSite {
  const rateMatrix = parseRateMatrix(row.rate_matrix);
  const { inv, pay } = blendedRates(rateMatrix);
  const smEpf =
    row.assigned_sm_epf == null || row.assigned_sm_epf === ''
      ? null
      : String(row.assigned_sm_epf);
  const sm = smEpf ? smByEpf.get(smEpf) : undefined;
  const rateAuditRaw = row.rate_audit as RateAudit | null;

  return {
    id: String(row.id),
    clientName: String(row.client_name ?? row.site_name ?? ''),
    parentClient: row.parent_client ? String(row.parent_client) : undefined,
    siteName: String(row.site_name ?? ''),
    address: row.address == null ? '' : String(row.address),
    lat: row.latitude == null ? 0 : Number(row.latitude),
    lng: row.longitude == null ? 0 : Number(row.longitude),
    sector: 'Unassigned',
    sectorManager: sm?.label ?? (smEpf ? smEpf : 'Unassigned'),
    sectorManagerEpf: smEpf,
    smPhone: sm?.phone ?? '—',
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
      row.geofence_radius == null ? 25 : Number(row.geofence_radius),
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
  return input.clientMode === 'existing'
    ? input.existingClientName.trim()
    : input.newClientName.trim();
}

function composedSiteName(clientName: string, siteName: string): string {
  const trimmed = siteName.trim();
  if (trimmed.includes('—') || trimmed.includes(' - ')) return trimmed;
  return `${clientName} — ${trimmed}`;
}

async function resolveCompanyScope() {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  return { supabase, companyId };
}

export async function fetchMasterSiteDirectory(): Promise<{
  sites: MasterSite[];
  sectorManagers: SectorManagerOption[];
}> {
  const { companyId } = await resolveCompanyScope();
  const [rows, managers] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
    fetchWithRosterCompanyFallback(fetchSectorManagersForCompany, companyId),
  ]);

  const smByEpf = new Map(managers.map((m) => [m.epf, m]));
  return {
    sites: rows.map((row) => mapDbRowToMasterSite(row, smByEpf)),
    sectorManagers: managers,
  };
}

export async function createMasterSite(
  input: RegisterSiteInput,
): Promise<{ success: true; site: MasterSite } | { success: false; error: string }> {
  const clientName = resolveClientName(input);
  if (!clientName) return { success: false, error: 'Client name is required.' };
  if (!input.siteCode.trim()) return { success: false, error: 'Site code is required.' };
  if (!input.siteName.trim()) return { success: false, error: 'Site name is required.' };
  if (!input.locationAddress.trim()) return { success: false, error: 'Address is required.' };
  if (!input.contractStart) return { success: false, error: 'Contract start date is required.' };

  const rateMatrix = buildRateMatrixFromRows(input.rankRows);
  const totalHeads = Object.values(rateMatrix).reduce((s, r) => s + (r?.qty ?? 0), 0);
  const gpsParts = input.gpsCoords.split(',').map((p) => p.trim());
  const lat = gpsParts[0] ? parseFloat(gpsParts[0]) : null;
  const lng = gpsParts[1] ? parseFloat(gpsParts[1]) : null;
  const hasGps = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const smEpf = input.sectorManagerEpf.trim() || null;

  try {
    const { supabase, companyId } = await resolveCompanyScope();
    if (!companyId) {
      return { success: false, error: 'Could not resolve company for this session.' };
    }

    const record = {
      company_id: companyId,
      site_name: composedSiteName(clientName, input.siteName),
      site_type: 'OTHER' as const,
      address: input.locationAddress.trim().toUpperCase(),
      site_code: input.siteCode.trim().toUpperCase(),
      client_name: clientName,
      parent_client: clientName,
      client_billing_address: input.newClientBillingAddress.trim() || null,
      contract_start: input.contractStart,
      contract_end: input.contractEnd || null,
      latitude: hasGps ? lat : null,
      longitude: hasGps ? lng : null,
      geofence_radius: clampGeofenceRadiusM(parseInt(input.geofenceRadiusM, 10) || 25),
      needs_om_gps_capture: input.requestOMGPS || !hasGps,
      assigned_sm_epf: smEpf,
      per_visit_charge_lkr: parseFloat(input.perVisitCharge) || 0,
      min_dwell_time_minutes: parseInt(input.minDwellTime, 10) || 0,
      required_guards: totalHeads || 1,
      rate_matrix: rateMatrix,
      site_status: smEpf ? 'ACTIVE' : 'PENDING',
      verification_mode: 'B',
    };

    const { data, error } = await supabase.from('site_profiles').insert(record).select('*').single();
    if (error) throw error;

    const managers = await fetchWithRosterCompanyFallback(
      fetchSectorManagersForCompany,
      companyId,
    );
    const smByEpf = new Map(managers.map((m) => [m.epf, m]));

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');

    return { success: true, site: mapDbRowToMasterSite(data as Record<string, unknown>, smByEpf) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save site.';
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
    const { supabase, companyId } = await resolveCompanyScope();
    const { error } = await supabase
      .from('site_profiles')
      .update({ assigned_sm_epf: smEpf, site_status: 'ACTIVE' })
      .eq('id', input.siteId);

    if (error) throw error;

    const [rows, managers] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      fetchWithRosterCompanyFallback(fetchSectorManagersForCompany, companyId),
    ]);
    const smByEpf = new Map(managers.map((m) => [m.epf, m]));
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after activation.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');

    return { success: true, site: mapDbRowToMasterSite(site, smByEpf) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to activate site.';
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
    const { supabase, companyId } = await resolveCompanyScope();
    const { error } = await supabase
      .from('site_profiles')
      .update({
        rate_matrix: input.rateMatrix,
        rate_audit: rateAudit,
        required_guards: totalHeads || 1,
      })
      .eq('id', input.siteId);

    if (error) throw error;

    const [rows, managers] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      fetchWithRosterCompanyFallback(fetchSectorManagersForCompany, companyId),
    ]);
    const smByEpf = new Map(managers.map((m) => [m.epf, m]));
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after update.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');

    return { success: true, site: mapDbRowToMasterSite(site, smByEpf) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save rates.';
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
    const { supabase, companyId } = await resolveCompanyScope();
    const { error } = await supabase
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

    if (error) throw error;

    const [rows, managers] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchSitesForCompany, companyId),
      fetchWithRosterCompanyFallback(fetchSectorManagersForCompany, companyId),
    ]);
    const smByEpf = new Map(managers.map((m) => [m.epf, m]));
    const site = rows.find((r) => String(r.id) === input.siteId);
    if (!site) return { success: false, error: 'Site not found after update.' };

    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');
    revalidatePath('/om');

    return { success: true, site: mapDbRowToMasterSite(site, smByEpf) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save configuration.';
    console.error('❌ SUPABASE ERROR (updateMasterSiteConfig):', message);
    return { success: false, error: message };
  }
}
