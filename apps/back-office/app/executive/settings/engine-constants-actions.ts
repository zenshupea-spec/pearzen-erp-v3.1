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

export type SmPayMode = 'FIXED_ONLY' | 'PER_VISIT_ONLY' | 'FIXED_AND_PER_VISIT';

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
  };
}

export async function getMdEngineConstants(): Promise<MdEngineConstants> {
  const companyId = await resolveExecutiveCompanyId();
  const envelope = await loadSettingEnvelope(getMdSettingsDb(), companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as Partial<MdEngineConstants> | undefined;
  return sanitize({ ...DEFAULTS, ...raw });
}

export async function saveMdEngineConstants(settings: MdEngineConstants) {
  const { db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = sanitize(settings);

  const res = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.engineConstants]: sanitized,
  });
  if (!res.success) return res;

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  return { success: true as const };
}
