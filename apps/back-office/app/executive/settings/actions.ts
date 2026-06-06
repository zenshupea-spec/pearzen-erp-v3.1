"use server";

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  isMissingColumnError,
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
  parseSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import { revalidatePath } from 'next/cache';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
  resolveGeofenceRadiusM,
} from '../../../lib/site-geofence';

// Strict error logging for the Audit Ledger
async function writeAuditLog(supabase: any, companyId: string, actionType: string, entity: string, details: any) {
  const { data: { user } } = await supabase.auth.getUser();
  const actorEmail = user?.email || 'SYSTEM_ADMIN';

  // 🚨 Pointing explicitly to the new isolated ledger
  const { error } = await supabase.from('executive_audit_logs').insert({
    company_id: companyId,
    actor_email: actorEmail,
    action_type: actionType,
    entity: entity,
    details: details
  });

  if (error) {
    console.error("❌ AUDIT LOG INSERT FAILED:", error.message);
  } else {
    console.log("✅ EXECUTIVE AUDIT LOG SAVED TO DB.");
  }
}

export async function updateGlobalSettings(companyId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const payload = {
    company_id: companyId,
    sscl_rate: Number(formData.get('sscl_rate')) || 0,
    vat_rate: Number(formData.get('vat_rate')) || 0,
    wb_working_days: Number(formData.get('wb_working_days')) || 26,
    wb_hours: Number(formData.get('wb_hours')) || 200,
    wb_ot_multiplier: Number(formData.get('wb_ot_multiplier')) || 1.5,
    so_working_days: Number(formData.get('so_working_days')) || 20,
    so_hours: Number(formData.get('so_hours')) || 180,
    so_ot_multiplier: Number(formData.get('so_ot_multiplier')) || 1.5,
    statutory_takehome_floor: Number(formData.get('statutory_takehome_floor')) || 5,
    max_deduction_pct: Number(formData.get('max_deduction_pct')) || 5,
  };

  const { error } = await supabase
    .from('md_settings')
    .upsert(payload, { onConflict: 'company_id' });

  if (error) {
    console.error("❌ SUPABASE ERROR (updateGlobalSettings):", error.message);
    return { success: false, error: error.message };
  }

  await writeAuditLog(supabase, companyId, 'UPDATE_SETTINGS', 'MD_SETTINGS', payload);

  revalidatePath('/executive/settings');
  revalidatePath('/executive/audit');
  revalidatePath('/invoice-desk');
  return { success: true };
}

async function resolveCompanyId() {
  return resolveExecutiveCompanyId();
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

export type MdInvoiceConfig = {
  vatRate: number;
  ssclRate: number;
  tradingName: string | null;
  companyLogoUrl: string | null;
  headOffice: string;
  telephone: string;
  email: string;
  pvNumber: string;
  supplierTin: string;
  supplierAddress: string;
};

const INVOICE_DEFAULTS: Omit<MdInvoiceConfig, 'tradingName' | 'companyLogoUrl'> = {
  vatRate: 18,
  ssclRate: 2.5641,
  headOffice: 'No: 196, Park Road, Colombo 05.',
  telephone: '011 263 2000, 0753 632 007',
  email: 'iresha@classicventure.com',
  pvNumber: '7278',
  supplierTin: '114453099-7000',
  supplierAddress: 'No. 196, Park Road, Colombo 05.',
};

type InvoiceLetterheadJson = {
  headOffice?: string;
  telephone?: string;
  email?: string;
  pvNumber?: string;
  supplierTin?: string;
  supplierAddress?: string;
  tradingName?: string;
};

function parseInvoiceLetterhead(row: Record<string, unknown> | null): InvoiceLetterheadJson {
  if (!row) return {};
  const direct: InvoiceLetterheadJson = {
    headOffice: row.invoice_head_office as string | undefined,
    telephone: row.invoice_telephone as string | undefined,
    email: row.invoice_email as string | undefined,
    pvNumber: row.invoice_pv_no as string | undefined,
    supplierTin: row.supplier_tin as string | undefined,
    supplierAddress: row.supplier_address as string | undefined,
    tradingName: row.trading_name as string | undefined,
  };
  if (row.setting_value) {
    try {
      const raw = row.setting_value;
      const parsed =
        typeof raw === 'string'
          ? (JSON.parse(raw) as InvoiceLetterheadJson)
          : (raw as InvoiceLetterheadJson);
      if (parsed.headOffice || parsed.telephone || parsed.email) {
        return { ...direct, ...parsed };
      }
    } catch {
      // ignore corrupt JSON
    }
  }
  return direct;
}

/** VAT, SSCL, and tax-invoice letterhead from md_settings (Invoice Desk reads this). */
export async function getMdInvoiceConfig(): Promise<MdInvoiceConfig> {
  const companyId = await resolveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select(
      'vat_rate, sscl_rate, company_logo_url, setting_key, setting_value, invoice_head_office, invoice_telephone, invoice_email, invoice_pv_no, supplier_tin, supplier_address',
    )
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.error('getMdInvoiceConfig:', error.message);
    return { ...INVOICE_DEFAULTS, tradingName: null, companyLogoUrl: null };
  }

  const row = data as Record<string, unknown> | null;
  const letter = parseInvoiceLetterhead(row);
  return {
    vatRate: num(row?.vat_rate, INVOICE_DEFAULTS.vatRate),
    ssclRate: num(row?.sscl_rate, INVOICE_DEFAULTS.ssclRate),
    tradingName: letter.tradingName ?? null,
    companyLogoUrl: (row?.company_logo_url as string | null) ?? null,
    headOffice: letter.headOffice || INVOICE_DEFAULTS.headOffice,
    telephone: letter.telephone || INVOICE_DEFAULTS.telephone,
    email: letter.email || INVOICE_DEFAULTS.email,
    pvNumber: letter.pvNumber || INVOICE_DEFAULTS.pvNumber,
    supplierTin: letter.supplierTin || INVOICE_DEFAULTS.supplierTin,
    supplierAddress: letter.supplierAddress || INVOICE_DEFAULTS.supplierAddress,
  };
}

export async function saveMdInvoiceConfig(payload: {
  vatRate: number;
  ssclRate: number;
  tradingName?: string;
  headOffice?: string;
  telephone?: string;
  email?: string;
  pvNumber?: string;
  supplierTin?: string;
  supplierAddress?: string;
}) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  const letterhead: InvoiceLetterheadJson = {};
  if (payload.tradingName !== undefined) letterhead.tradingName = payload.tradingName;
  if (payload.headOffice !== undefined) letterhead.headOffice = payload.headOffice;
  if (payload.telephone !== undefined) letterhead.telephone = payload.telephone;
  if (payload.email !== undefined) letterhead.email = payload.email;
  if (payload.pvNumber !== undefined) letterhead.pvNumber = payload.pvNumber;
  if (payload.supplierTin !== undefined) letterhead.supplierTin = payload.supplierTin;
  if (payload.supplierAddress !== undefined) letterhead.supplierAddress = payload.supplierAddress;

  const envelope = await loadSettingEnvelope(db, companyId);
  const setting_value = JSON.stringify({ ...envelope, ...letterhead });

  const row: Record<string, unknown> = {
    company_id: companyId,
    vat_rate: payload.vatRate,
    sscl_rate: payload.ssclRate,
    setting_value,
  };

  // Prefer dedicated letterhead columns when deployed; always persist JSON in setting_value.
  if (payload.headOffice !== undefined) row.invoice_head_office = payload.headOffice;
  if (payload.telephone !== undefined) row.invoice_telephone = payload.telephone;
  if (payload.email !== undefined) row.invoice_email = payload.email;
  if (payload.pvNumber !== undefined) row.invoice_pv_no = payload.pvNumber;
  if (payload.supplierTin !== undefined) row.supplier_tin = payload.supplierTin;
  if (payload.supplierAddress !== undefined) row.supplier_address = payload.supplierAddress;

  let { error } = await db.from('md_settings').upsert(row, { onConflict: 'company_id' });

  if (error && isMissingColumnError(error.message)) {
    const fallback: Record<string, unknown> = {
      company_id: companyId,
      vat_rate: payload.vatRate,
      sscl_rate: payload.ssclRate,
      setting_value,
    };
    ({ error } = await db.from('md_settings').upsert(fallback, { onConflict: 'company_id' }));
  }

  if (error) return { success: false, error: error.message };

  await writeAuditLog(session, companyId, 'UPDATE_INVOICE_SETTINGS', 'MD_SETTINGS', row);

  revalidatePath('/executive/settings');
  revalidatePath('/invoice-desk');
  return { success: true };
}

/**
 * Read statutory_takehome_floor and max_deduction_pct for the current user's company.
 * Used by the settings page compliance card on mount.
 */
export async function getComplianceConfig() {
  const companyId = await resolveCompanyId();
  const supabase = getMdSettingsDb();

  let { data, error } = await supabase
    .from('md_settings')
    .select('statutory_takehome_floor, max_deduction_pct, setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('md_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .maybeSingle());
  }

  if (error && isMissingColumnError(error.message)) {
    const envelope = await loadSettingEnvelope(supabase, companyId);
    const c = envelope[MD_SETTINGS_ENVELOPE_KEYS.compliance] as
      | { statutory_takehome_floor?: number; max_deduction_pct?: number }
      | undefined;
    return {
      statutory_takehome_floor: c?.statutory_takehome_floor ?? 5,
      max_deduction_pct: c?.max_deduction_pct ?? 5,
    };
  }

  const row = data as {
    statutory_takehome_floor?: number | null;
    max_deduction_pct?: number | null;
    setting_value?: unknown;
  } | null;

  if (
    row?.statutory_takehome_floor == null &&
    row?.max_deduction_pct == null &&
    row?.setting_value
  ) {
    const envelope = parseSettingEnvelope(row.setting_value);
    const c = envelope[MD_SETTINGS_ENVELOPE_KEYS.compliance] as
      | { statutory_takehome_floor?: number; max_deduction_pct?: number }
      | undefined;
    if (c) {
      return {
        statutory_takehome_floor: c.statutory_takehome_floor ?? 5,
        max_deduction_pct: c.max_deduction_pct ?? 5,
      };
    }
  }

  return {
    statutory_takehome_floor: row?.statutory_takehome_floor ?? 5,
    max_deduction_pct: row?.max_deduction_pct ?? 5,
  };
}

/**
 * Persist compliance limits (take-home floor & max deduction cap) for the current user's company.
 * Called by the compliance card "Save" button in the settings page.
 */
export async function updateComplianceSettings(
  statutory_takehome_floor: number,
  max_deduction_pct: number
) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  let { error } = await db
    .from('md_settings')
    .upsert(
      { company_id: companyId, statutory_takehome_floor, max_deduction_pct },
      { onConflict: 'company_id' },
    );

  if (error && isMissingColumnError(error.message)) {
    const res = await mergeSettingEnvelope(db, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.compliance]: { statutory_takehome_floor, max_deduction_pct },
    });
    if (!res.success) return res;
    error = null;
  }

  if (error) return { success: false, error: error.message };

  await writeAuditLog(session, companyId, 'UPDATE_COMPLIANCE_SETTINGS', 'MD_SETTINGS', {
    statutory_takehome_floor,
    max_deduction_pct,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/om/discrepancies');
  return { success: true };
}

/**
 * Read global guard shift timing defaults from md_settings.
 */
export async function getShiftSettings() {
  const companyId = await resolveCompanyId();
  const supabase = getMdSettingsDb();

  const { data } = await supabase
    .from('md_settings')
    .select('security_day_start, security_day_end, security_night_start, security_night_end')
    .eq('company_id', companyId)
    .maybeSingle();

  const row = data as { security_day_start?: string | null; security_day_end?: string | null; security_night_start?: string | null; security_night_end?: string | null } | null;
  return {
    security_day_start:   row?.security_day_start   ?? '07:00',
    security_day_end:     row?.security_day_end     ?? '19:00',
    security_night_start: row?.security_night_start ?? '19:00',
    security_night_end:   row?.security_night_end   ?? '07:00',
  };
}

/**
 * Persist global guard shift timing defaults to md_settings.
 */
export async function updateShiftSettings(
  security_day_start: string,
  security_day_end: string,
  security_night_start: string,
  security_night_end: string,
) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  const { error } = await db
    .from('md_settings')
    .upsert(
      { company_id: companyId, security_day_start, security_day_end, security_night_start, security_night_end },
      { onConflict: 'company_id' },
    );

  if (error) return { success: false, error: error.message };

  await writeAuditLog(session, companyId, 'UPDATE_SHIFT_SETTINGS', 'MD_SETTINGS', {
    security_day_start, security_day_end, security_night_start, security_night_end,
  });

  revalidatePath('/executive/settings');
  return { success: true };
}

/** Company default geofence radius (m) for new site registrations. */
export async function getGeofenceSettings() {
  const companyId = await resolveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('default_geofence_radius_m, setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    const envelope = await loadSettingEnvelope(supabase, companyId);
    const g = envelope[MD_SETTINGS_ENVELOPE_KEYS.geofence] as
      | { default_geofence_radius_m?: number }
      | undefined;
    return {
      default_geofence_radius_m: resolveGeofenceRadiusM(g?.default_geofence_radius_m),
    };
  }

  const row = data as { default_geofence_radius_m?: number | null; setting_value?: unknown } | null;
  if (row?.default_geofence_radius_m == null && row?.setting_value) {
    const envelope = parseSettingEnvelope(row.setting_value);
    const g = envelope[MD_SETTINGS_ENVELOPE_KEYS.geofence] as
      | { default_geofence_radius_m?: number }
      | undefined;
    if (g?.default_geofence_radius_m != null) {
      return {
        default_geofence_radius_m: resolveGeofenceRadiusM(g.default_geofence_radius_m),
      };
    }
  }

  return {
    default_geofence_radius_m: resolveGeofenceRadiusM(row?.default_geofence_radius_m),
  };
}

export async function updateGeofenceSettings(defaultGeofenceRadiusM: number) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();

  const radius = clampGeofenceRadiusM(defaultGeofenceRadiusM);

  let { error } = await db
    .from('md_settings')
    .upsert({ company_id: companyId, default_geofence_radius_m: radius }, { onConflict: 'company_id' });

  if (error && isMissingColumnError(error.message)) {
    const res = await mergeSettingEnvelope(db, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.geofence]: { default_geofence_radius_m: radius },
    });
    if (!res.success) return res;
    error = null;
  }

  if (error) return { success: false, error: error.message };

  await writeAuditLog(session, companyId, 'UPDATE_GEOFENCE_SETTINGS', 'MD_SETTINGS', {
    default_geofence_radius_m: radius,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/executive/sites');
  revalidatePath('/fm/sites');
  revalidatePath('/om/sites/location');
  return { success: true };
}

export async function updateRankBasicSalary(companyId: string, rank: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  
  const newBasic = Number(formData.get('basic_salary'));
  if (!newBasic || newBasic <= 0) return { success: false, error: "INVALID SALARY AMOUNT" };

  const { error } = await supabase
    .from('employees')
    .update({ basic_salary: newBasic })
    .eq('company_id', companyId)
    .eq('rank', rank.toUpperCase())
    .neq('status', 'RESIGNED')
    .neq('status', 'TERMINATED');

  if (error) {
    console.error("❌ SUPABASE ERROR (updateRankBasicSalary):", error.message);
    return { success: false, error: error.message };
  }

  await writeAuditLog(supabase, companyId, 'UPDATE_RANK_SALARY', 'EMPLOYEES', { rank: rank.toUpperCase(), new_basic_salary: newBasic });

  revalidatePath('/executive/settings');
  revalidatePath('/executive/audit');
  return { success: true };
}

export type DivisionNames = {
  security: string;
  hospitality: string;
  realEstate: string;
};

const DEFAULT_DIVISION_NAMES: DivisionNames = {
  security: 'Classic Venture Security',
  hospitality: 'Café Tasha',
  realEstate: 'Shalom Residence',
};

export async function getDivisionNames(): Promise<DivisionNames> {
  const companyId = await resolveCompanyId();
  const envelope = await loadSettingEnvelope(getMdSettingsDb(), companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.divisionNames] as Partial<DivisionNames> | undefined;
  return {
    security: raw?.security?.trim() || DEFAULT_DIVISION_NAMES.security,
    hospitality: raw?.hospitality?.trim() || DEFAULT_DIVISION_NAMES.hospitality,
    realEstate: raw?.realEstate?.trim() || DEFAULT_DIVISION_NAMES.realEstate,
  };
}

export async function saveDivisionNames(names: DivisionNames) {
  const { db, companyId } = await getExecutiveMdSettingsContext();

  const sanitized: DivisionNames = {
    security: names.security.trim() || DEFAULT_DIVISION_NAMES.security,
    hospitality: names.hospitality.trim() || DEFAULT_DIVISION_NAMES.hospitality,
    realEstate: names.realEstate.trim() || DEFAULT_DIVISION_NAMES.realEstate,
  };

  const res = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.divisionNames]: sanitized,
  });
  if (!res.success) return res;

  revalidatePath('/executive/settings');
  return { success: true };
}

export type PayrollStatutorySettings = {
  epfEmployeeRate: number;
  epfEmployerRate: number;
  etfRate: number;
  payrollEpfEmployer: number;
  payrollEtfEmployer: number;
  monthlyDaysDivisor: number;
};

const DEFAULT_PAYROLL_STATUTORY: PayrollStatutorySettings = {
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,
  payrollEpfEmployer: 12,
  payrollEtfEmployer: 3,
  monthlyDaysDivisor: 26,
};

export async function getPayrollStatutorySettings(): Promise<PayrollStatutorySettings> {
  const companyId = await resolveCompanyId();
  const envelope = await loadSettingEnvelope(getMdSettingsDb(), companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.payrollStatutory] as Partial<PayrollStatutorySettings> | undefined;
  return {
    epfEmployeeRate: num(raw?.epfEmployeeRate, DEFAULT_PAYROLL_STATUTORY.epfEmployeeRate),
    epfEmployerRate: num(raw?.epfEmployerRate, DEFAULT_PAYROLL_STATUTORY.epfEmployerRate),
    etfRate: num(raw?.etfRate, DEFAULT_PAYROLL_STATUTORY.etfRate),
    payrollEpfEmployer: num(raw?.payrollEpfEmployer, DEFAULT_PAYROLL_STATUTORY.payrollEpfEmployer),
    payrollEtfEmployer: num(raw?.payrollEtfEmployer, DEFAULT_PAYROLL_STATUTORY.payrollEtfEmployer),
    monthlyDaysDivisor: num(raw?.monthlyDaysDivisor, DEFAULT_PAYROLL_STATUTORY.monthlyDaysDivisor),
  };
}

export async function savePayrollStatutorySettings(settings: PayrollStatutorySettings) {
  const { db, companyId } = await getExecutiveMdSettingsContext();

  const sanitized: PayrollStatutorySettings = {
    epfEmployeeRate: num(settings.epfEmployeeRate, DEFAULT_PAYROLL_STATUTORY.epfEmployeeRate),
    epfEmployerRate: num(settings.epfEmployerRate, DEFAULT_PAYROLL_STATUTORY.epfEmployerRate),
    etfRate: num(settings.etfRate, DEFAULT_PAYROLL_STATUTORY.etfRate),
    payrollEpfEmployer: num(settings.payrollEpfEmployer, DEFAULT_PAYROLL_STATUTORY.payrollEpfEmployer),
    payrollEtfEmployer: num(settings.payrollEtfEmployer, DEFAULT_PAYROLL_STATUTORY.payrollEtfEmployer),
    monthlyDaysDivisor: Math.min(31, Math.max(20, Math.round(num(settings.monthlyDaysDivisor, 26)))),
  };

  const res = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.payrollStatutory]: sanitized,
  });
  if (!res.success) return res;

  revalidatePath('/executive/settings');
  return { success: true };
}