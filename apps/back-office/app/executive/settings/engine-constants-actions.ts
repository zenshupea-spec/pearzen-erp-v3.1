'use server';

import { revalidatePath } from 'next/cache';
import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog } from './settings-audit';

export type SmPayMode = 'FIXED_ONLY' | 'PER_VISIT_ONLY' | 'FIXED_AND_PER_VISIT';

export type GuardMonthPreviewQty = {
  std: number;
  sun: number;
  poya: number;
  pubHol: number;
  sat: number;
};

export type CafeMonthPreviewQty = {
  std: number;
  sun: number;
  poya: number;
  pubHol: number;
  statutory: number;
  sat: number;
};

export type MdEngineConstants = {
  cafeOtCutoffTime: string;
  invoiceDispatchDay: number;
  payrollTargetDay: number;
  collectionWarningDay: number;
  smPayMode: SmPayMode;
  smFixedBasic: number;
  smPerVisitBonus: number;
  fuelSurplusCorrection: boolean;
  cafeOtMaxMonthlyHours: number;
  enforceFlatSiteRate: boolean;
  allowPoyaOnFlatRate: boolean;
  prevMonthRetentionThreshold: number;
  salaryMonthRetentionThreshold: number;
  cafeOpenStart: string;
  cafeOpenEnd: string;
  /** Live wage preview — SM visit count for calculator */
  smPreviewVisits: number;
  /** Live wage preview — HO salary input for calculator */
  hoPreviewSalary: number;
  /** Guard month simulation — day-type counts */
  guardPreviewQty: GuardMonthPreviewQty;
  /** Café month simulation — sample basic salary */
  cafePreviewBasic: number;
  /** Café month simulation — day-type counts */
  cafePreviewQty: CafeMonthPreviewQty;
  /** Café month simulation — OT hours in month */
  cafePreviewOtHours: number;
  /** When true, FM cannot lock payroll until HQ Deductions Admin locks the month. */
  requireDeductionMonthLock: boolean;
};

const DEFAULTS: MdEngineConstants = {
  cafeOtCutoffTime: '19:00',
  invoiceDispatchDay: 1,
  payrollTargetDay: 10,
  collectionWarningDay: 6,
  smPayMode: 'FIXED_AND_PER_VISIT',
  smFixedBasic: 55_000,
  smPerVisitBonus: 2_500,
  fuelSurplusCorrection: true,
  cafeOtMaxMonthlyHours: 20,
  enforceFlatSiteRate: true,
  allowPoyaOnFlatRate: false,
  prevMonthRetentionThreshold: 30,
  salaryMonthRetentionThreshold: 10,
  cafeOpenStart: '07:00',
  cafeOpenEnd: '19:00',
  smPreviewVisits: 70,
  hoPreviewSalary: 180_000,
  guardPreviewQty: { std: 20, sun: 4, poya: 1, pubHol: 0, sat: 4 },
  cafePreviewBasic: 38_000,
  cafePreviewQty: { std: 20, sun: 4, poya: 1, pubHol: 0, statutory: 0, sat: 4 },
  cafePreviewOtHours: 0,
  requireDeductionMonthLock: true,
};

const SM_MODES: SmPayMode[] = ['FIXED_ONLY', 'PER_VISIT_ONLY', 'FIXED_AND_PER_VISIT'];

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function clampDay(v: number, fallback: number): number {
  return Math.min(28, Math.max(1, Math.round(num(v, fallback))));
}

function timeOrDefault(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
}

function clampQty(v: unknown, fallback: number): number {
  return Math.min(31, Math.max(0, Math.round(num(v, fallback))));
}

function sanitizeGuardPreviewQty(raw: unknown): GuardMonthPreviewQty {
  const row = raw && typeof raw === 'object' ? (raw as Partial<GuardMonthPreviewQty>) : {};
  const d = DEFAULTS.guardPreviewQty;
  return {
    std: clampQty(row.std, d.std),
    sun: clampQty(row.sun, d.sun),
    poya: clampQty(row.poya, d.poya),
    pubHol: clampQty(row.pubHol, d.pubHol),
    sat: clampQty(row.sat, d.sat),
  };
}

function sanitizeCafePreviewQty(raw: unknown): CafeMonthPreviewQty {
  const row = raw && typeof raw === 'object' ? (raw as Partial<CafeMonthPreviewQty>) : {};
  const d = DEFAULTS.cafePreviewQty;
  return {
    std: clampQty(row.std, d.std),
    sun: clampQty(row.sun, d.sun),
    poya: clampQty(row.poya, d.poya),
    pubHol: clampQty(row.pubHol, d.pubHol),
    statutory: clampQty(row.statutory, d.statutory),
    sat: clampQty(row.sat, d.sat),
  };
}

function sanitize(raw: Partial<MdEngineConstants>): MdEngineConstants {
  const mode = SM_MODES.includes(raw.smPayMode as SmPayMode)
    ? (raw.smPayMode as SmPayMode)
    : DEFAULTS.smPayMode;

  return {
    cafeOtCutoffTime: timeOrDefault(raw.cafeOtCutoffTime, DEFAULTS.cafeOtCutoffTime),
    invoiceDispatchDay: clampDay(raw.invoiceDispatchDay ?? 0, DEFAULTS.invoiceDispatchDay),
    payrollTargetDay: clampDay(raw.payrollTargetDay ?? 0, DEFAULTS.payrollTargetDay),
    collectionWarningDay: clampDay(raw.collectionWarningDay ?? 0, DEFAULTS.collectionWarningDay),
    smPayMode: mode,
    smFixedBasic: Math.max(0, Math.round(num(raw.smFixedBasic, DEFAULTS.smFixedBasic))),
    smPerVisitBonus: Math.max(0, Math.round(num(raw.smPerVisitBonus, DEFAULTS.smPerVisitBonus))),
    fuelSurplusCorrection: raw.fuelSurplusCorrection !== false,
    cafeOtMaxMonthlyHours: Math.min(100, Math.max(0, Math.round(num(raw.cafeOtMaxMonthlyHours, DEFAULTS.cafeOtMaxMonthlyHours)))),
    enforceFlatSiteRate: raw.enforceFlatSiteRate !== false,
    allowPoyaOnFlatRate: Boolean(raw.allowPoyaOnFlatRate),
    prevMonthRetentionThreshold: Math.min(31, Math.max(1, Math.round(num(raw.prevMonthRetentionThreshold, DEFAULTS.prevMonthRetentionThreshold)))),
    salaryMonthRetentionThreshold: Math.min(31, Math.max(1, Math.round(num(raw.salaryMonthRetentionThreshold, DEFAULTS.salaryMonthRetentionThreshold)))),
    cafeOpenStart: timeOrDefault(raw.cafeOpenStart, DEFAULTS.cafeOpenStart),
    cafeOpenEnd: timeOrDefault(raw.cafeOpenEnd, DEFAULTS.cafeOpenEnd),
    smPreviewVisits: Math.min(500, Math.max(0, Math.round(num(raw.smPreviewVisits, DEFAULTS.smPreviewVisits)))),
    hoPreviewSalary: Math.min(10_000_000, Math.max(0, Math.round(num(raw.hoPreviewSalary, DEFAULTS.hoPreviewSalary)))),
    guardPreviewQty: sanitizeGuardPreviewQty(raw.guardPreviewQty),
    cafePreviewBasic: Math.min(10_000_000, Math.max(0, Math.round(num(raw.cafePreviewBasic, DEFAULTS.cafePreviewBasic)))),
    cafePreviewQty: sanitizeCafePreviewQty(raw.cafePreviewQty),
    cafePreviewOtHours: Math.min(200, Math.max(0, Math.round(num(raw.cafePreviewOtHours, DEFAULTS.cafePreviewOtHours)))),
    requireDeductionMonthLock: raw.requireDeductionMonthLock !== false,
  };
}

export async function getMdEngineConstants(): Promise<MdEngineConstants> {
  const companyId = await resolveExecutiveCompanyId();
  const envelope = await loadSettingEnvelope(getMdSettingsDb(), companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as Partial<MdEngineConstants> | undefined;
  return sanitize({ ...DEFAULTS, ...raw });
}

export async function saveMdEngineConstants(settings: MdEngineConstants) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = sanitize(settings);

  const res = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.engineConstants]: sanitized,
  });
  if (!res.success) return res;

  await writeSettingsAuditLog(session, companyId, 'UPDATE_ENGINE_CONSTANTS', sanitized);

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/fm');
  return { success: true as const };
}
