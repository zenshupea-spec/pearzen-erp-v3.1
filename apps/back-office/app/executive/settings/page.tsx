'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings,
  Clock,
  Calendar,
  User,
  Percent,
  Save,
  CheckCircle2,
  Zap,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  DollarSign,
  Building2,
  Coffee,
  Home,
  Globe2,
  Info,
  Shield,
  Lock,
  Monitor,
  MapPin,
  CircleDot,
  OctagonX,
  Landmark,
  Banknote,
  ListChecks,
  Plus,
  Trash2,
  Pencil,
  X,
  KeyRound,
  Timer,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Users,
  UserCheck,
  ChevronDown,
  Unlock,
  Calculator,
  History,
  ArrowRightLeft,
  FlaskConical,
  Sun,
  Star,
  Moon,
  Briefcase,
  FileText,
  SplitSquareHorizontal,
  Flag,
  Scale,
  HeartHandshake,
  UserPlus,
  Upload,
  ImageIcon,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  getShiftSettings,
  updateShiftSettings,
  getGeofenceSettings,
  updateGeofenceSettings,
  getMdInvoiceConfig,
  saveMdInvoiceConfig,
  getDivisionNames,
  saveDivisionNames,
  getPayrollStatutorySettings,
  savePayrollStatutorySettings,
} from './actions';
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  formatGpsCoords,
  MAX_GEOFENCE_RADIUS_M,
  MIN_GEOFENCE_RADIUS_M,
  parseGpsCoords,
} from '../../../lib/site-geofence';
import { fetchCompanyLogo, persistCompanyLogo, clearCompanyLogo } from './logo-actions';
import { fetchExecutiveSessionProfile } from '../actions';
import { getRankPayMatrix, saveRankPayMatrix } from './rank-matrix-actions';
import RankPayLedgerSections, {
  blankRankDraftForSection,
  type RankPayDraft,
} from './RankPayLedgerSections';
import {
  sanitizeRankPayMatrixEntries,
  isLockedExecutiveLedgerRank,
  isLockedSectorManagerLedgerRank,
  type RankLedgerSectionId,
} from '../../../../../packages/rank-pay-matrix';
import { getGratuitySettings, saveGratuitySettings } from './gratuity-actions';
import { getWelfareFundSettings, saveWelfareFundSettings } from './welfare-fund-actions';
import { getMdEngineConstants, saveMdEngineConstants } from './engine-constants-actions';
import type { CafeMonthPreviewQty, GuardMonthPreviewQty } from './engine-constants';
import { getBankExportSettings, saveBankExportSettings } from './bank-export-actions';
import { getPayFormulasSettings, savePayFormulasSettings } from './pay-formulas-actions';
import { calculateCafeShift } from '../../../lib/compensation-engine';
import {
  computeGuardMonthSimulatorGross,
  guardMonthPreviewRates,
} from '../../../lib/guard-day-type-pay';
import type { GratuitySettings } from '../../../../../packages/gratuity';
import type { WelfareFundSettings } from '../../../../../packages/welfare-fund';
import {
  BANK_EXPORT_FORMAT_LABELS,
  type BankExportFormatId,
} from '../../../../../packages/bank-export-settings';
import {
  calcApit,
  calcStampDutyLkr,
  DEFAULT_APIT_SLABS,
  DEFAULT_STAMP_DUTY_LKR,
  DEFAULT_STAMP_DUTY_THRESHOLD_LKR,
  type ApitSlab,
} from '../../../../../packages/payroll-deductions';
import {
  DEFAULT_CAFE_PAY_FORMULAS,
  DEFAULT_GUARD_PAY_FORMULAS,
  type CafeFormulaKey,
  type CafePayFormulas,
  type GuardFormulaKey,
  type GuardPayFormulas,
} from '../../../../../packages/pay-formulas';
import { LOGO_STORAGE_KEY } from '../../../../../packages/supabase/branding-constants';
import BulkDataImportPanel from './BulkDataImportPanel';
import AdvanceSalarySettingsCard from './AdvanceSalarySettingsCard';
import { useExecutiveNavGuardRef } from '../executive-nav-guard';
import { getSettingsAuditTrail, type SettingsSectionAudit } from './settings-traceability-actions';
import type { SettingsSectionId } from './settings-section-types';
import {
  SectionSaveButton,
  SettingsCardHeader,
  SettingsTraceability,
} from './settings-section-ui';
import {
  getInternalWorkLocations,
  saveInternalWorkLocations,
} from './internal-work-locations-actions';
import {
  createEmptyInternalWorkLocation,
  DEFAULT_INTERNAL_WORK_LOCATIONS,
  type InternalWorkLocation,
  type InternalWorkLocationsSettings,
} from '../../../lib/internal-work-locations';
import { useExecutiveVaultSessionOptional } from '../../../components/executive/ExecutiveVaultSession';
import { isVaultLockSaveError } from '../../../lib/executive-vault-session-shared';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageShell,
  ExecutivePageToolbar,
} from '../../../components/executive/ExecutivePageChrome';

function failuresIncludeVaultLock(failures: string[]): boolean {
  return failures.some((line) => isVaultLockSaveError(line));
}

function scrollToRankPaySection(sectionId: 'head-office' | 'guard' | 'cafe') {
  document.getElementById(`rank-pay-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SmPayMode = 'FIXED_ONLY' | 'PER_VISIT_ONLY' | 'FIXED_AND_PER_VISIT';

type RankFormula = 'STATUTORY_HOURLY' | 'FLAT_MONTHLY' | 'HOSPITALITY_HYBRID';

type OperationalGroup = 'GUARD_FIELD' | 'GUARD' | 'SECTOR_MANAGER' | 'HEAD_OFFICE' | 'CAFE';

type RankSalaryType = 'BANK' | 'CASH';

interface RankPay {
  id: string;
  rankCode: string;
  fullTitle: string;
  basicPay: number;
  annualIncrement: number;
  salaryType: RankSalaryType;
  operationalGroup: OperationalGroup;
}

interface SettingsState {
  // Café OT Kill-Switch
  cafeOtCutoffTime: string;

  // Billing Cycle
  invoiceDispatchDay: number;
  payrollTargetDay: number;
  collectionWarningDay: number;

  // Rank Pay Ledger
  rankPay: RankPay[];

  // SM Pay Mode
  smPayMode: SmPayMode;
  smFixedBasic: number;
  smPerVisitBonus: number;

  // Fuel Surplus Correction
  fuelSurplusCorrection: boolean;
  smFuelAdvanceLkr: number;
  smFuelPerKmLkr: number;

  // Statutory
  vatRate: number;
  ssclRate: number;
  invoiceHeadOffice: string;
  invoiceTelephone: string;
  invoiceEmail: string;
  invoicePvNo: string;
  supplierTin: string;
  supplierAddress: string;
  epfEmployeeRate: number;
  epfEmployerRate: number;
  etfRate: number;

  // Payroll Formula Engine
  payrollEpfEmployer: number;
  payrollEtfEmployer: number;
  monthlyDaysDivisor: number;
  rankFormulaMap: Record<string, RankFormula>;

  // Café OT Threshold
  cafeOtMaxMonthlyHours: number;
  cafeWeeklyOtThresholdHours: number;
}

// ─── Initial demo state ───────────────────────────────────────────────────────

const INITIAL: SettingsState = {
  cafeOtCutoffTime: '19:00',

  invoiceDispatchDay: 1,
  payrollTargetDay: 10,
  collectionWarningDay: 6,

  rankPay: [
    { id: 'rp-1', rankCode: 'CSO', fullTitle: 'CHIEF SECURITY OFFICER',  basicPay: 35000, annualIncrement: 2000, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-2', rankCode: 'OIC', fullTitle: 'OFFICER IN CHARGE',        basicPay: 33000, annualIncrement: 1800, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-3', rankCode: 'SSO', fullTitle: 'SENIOR SECURITY OFFICER',  basicPay: 32000, annualIncrement: 1500, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-4', rankCode: 'JSO', fullTitle: 'JUNIOR SECURITY OFFICER',  basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-5', rankCode: 'LSO', fullTitle: 'LADY SECURITY OFFICER', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  ],

  smPayMode: 'FIXED_AND_PER_VISIT',
  smFixedBasic: 55000,
  smPerVisitBonus: 2500,

  fuelSurplusCorrection: true,
  smFuelAdvanceLkr: 15_000,
  smFuelPerKmLkr: 100,

  vatRate: 18,
  ssclRate: 2.5641,
  invoiceHeadOffice: 'No: 196, Park Road, Colombo 05.',
  invoiceTelephone: '011 263 2000, 0753 632 007',
  invoiceEmail: 'iresha@classicventure.com',
  invoicePvNo: '7278',
  supplierTin: '114453099-7000',
  supplierAddress: 'No. 196, Park Road, Colombo 05.',
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,

  payrollEpfEmployer: 12,
  payrollEtfEmployer: 3,
  monthlyDaysDivisor: 26,
  rankFormulaMap: {},

  cafeOtMaxMonthlyHours: 20,
  cafeWeeklyOtThresholdHours: 48,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
const labelCls = 'mb-1 block text-sm font-bold uppercase tracking-wide text-slate-700';

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  Icon,
  title,
  sub,
  accent = 'text-emerald-800',
  audit,
  onSave,
  saving,
  saved,
}: {
  Icon: React.ElementType;
  title: string;
  sub: string;
  accent?: string;
  audit?: SettingsSectionAudit;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <p className="text-sm font-medium text-slate-700">{sub}</p>
          <SettingsTraceability audit={audit} />
        </div>
      </div>
      {onSave ? <SectionSaveButton saving={saving} saved={saved} onClick={onSave} /> : null}
    </div>
  );
}

function SettingsSectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-b border-slate-200/70 pb-2 pt-1">
      <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      {sub ? <p className="mt-1 text-sm font-medium text-slate-600">{sub}</p> : null}
    </div>
  );
}

// ─── Save Toast ───────────────────────────────────────────────────────────────

function SaveToast({ visible, message }: { visible: boolean; message?: string }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/30">
        <CheckCircle2 className="h-4 w-4" />
        {message ?? 'All settings saved'}
      </div>
    </div>
  );
}

// ─── Salary Release Logic Engine ─────────────────────────────────────────────

export type SalaryReleaseAction = 'FULL_SALARY' | 'HALF_SALARY' | 'STOP_PAYMENT';

/**
 * Determines the salary release action based on previous and current month shift counts.
 * Strictly halts all payment if the previous month threshold is not met.
 * * @param prevMonthShifts Total shifts worked in the last ended month (e.g., April)
 * @param currMonthShifts Shifts logged in the current active month up to payroll date (e.g., May)
 * @param minPrevReq Configurable threshold for the previous month (Default: 30)
 * @param minCurrReq Configurable threshold for the current month (Default: 10)
 */
export function calculateSalaryRelease(
  prevMonthShifts: number,
  currMonthShifts: number,
  minPrevReq: number = 30,
  minCurrReq: number = 10
): SalaryReleaseAction {
  // Hard lock: If they failed the previous month threshold, halt payment entirely.
  if (prevMonthShifts < minPrevReq) {
    return 'STOP_PAYMENT';
  }
  
  // If they passed the previous month threshold, evaluate the current month.
  return currMonthShifts >= minCurrReq ? 'FULL_SALARY' : 'HALF_SALARY';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface EntityNames {
  security:    string;
  hospitality: string;
  realEstate:  string;
}

const INITIAL_ENTITY_NAMES: EntityNames = {
  security:    'Classic Venture Security',
  hospitality: 'Café Tasha',
  realEstate:  'Shalom Residence',
};

const MASTER_BANK_FORMATS = (Object.entries(BANK_EXPORT_FORMAT_LABELS) as [BankExportFormatId, string][]).map(
  ([id, label]) => ({ id, label }),
);

const GUARD_FORMULA_ROWS: {
  key: GuardFormulaKey;
  title: string;
  icon: React.ElementType;
}[] = [
  { key: 'standardWorkingDay', title: 'STANDARD WORKING DAY', icon: Sun },
  { key: 'otRatePerHour', title: 'OT RATE (PER HOUR)', icon: Clock },
  { key: 'poyaDay', title: 'POYA DAY', icon: Star },
  { key: 'publicHoliday', title: 'PUBLIC HOLIDAY', icon: Flag },
  { key: 'statutory', title: 'STATUTORY', icon: Scale },
  { key: 'weeklyHolidaySunday', title: 'WEEKLY HOLIDAY (SUNDAY)', icon: Moon },
  { key: 'saturdayHalfDay', title: 'SATURDAY', icon: Calendar },
];

const CAFE_FORMULA_ROWS: {
  key: CafeFormulaKey;
  title: string;
  icon: React.ElementType;
}[] = [
  { key: 'standardShift', title: 'STANDARD SHIFT / OTHER DAYS', icon: Sun },
  { key: 'otRatePerHour', title: 'OT RATE (PER HOUR)', icon: Clock },
  { key: 'poyaDay', title: 'POYA DAY', icon: Star },
  { key: 'publicHoliday', title: 'PUBLIC HOLIDAY', icon: Flag },
  { key: 'statutoryHoliday', title: 'STATUTORY HOLIDAY', icon: Scale },
  { key: 'weeklyHolidaySunday', title: 'WEEKLY HOLIDAY (SUNDAY)', icon: Moon },
  { key: 'saturdayShift', title: 'SATURDAY SHIFT', icon: Calendar },
];

type SettingsTab = 'GENERAL' | 'CATALOGS' | 'OPERATIONS';

const SETTINGS_TABS: { id: SettingsTab; label: string; Icon: React.ElementType }[] = [
  { id: 'CATALOGS',   label: 'Asset & Penalty Catalogs',  Icon: ListChecks  },
  { id: 'GENERAL',    label: 'Finance & Compensation',    Icon: Settings    },
  { id: 'OPERATIONS', label: 'Operations & Compliance',   Icon: UserCheck   },
];

const GLOBAL_SETTINGS_WARNING_TABS: Partial<
  Record<
    SettingsTab,
    { subtitle: string; portals: string; caution: string }
  >
> = {
  GENERAL: {
    subtitle: 'Finance & Compensation',
    portals: 'FM payroll, HR MNR, and client billing',
    caution:
      'Ensure the Finance Manager and HR are informed before modifying statutory formulas, rank pay matrix, or bank export rules.',
  },
  CATALOGS: {
    subtitle: 'Asset & Penalty Catalogs',
    portals: 'FM deductions, HR clearance, and tenant billing',
    caution:
      'Ensure operations and finance are aligned before updating penalty amounts or Shalom replacement costs.',
  },
  OPERATIONS: {
    subtitle: 'Operations & Compliance',
    portals: 'OM, FM, HR, and Field PWA',
    caution:
      'Ensure all operational managers are informed before modifying shift timings or geofence defaults.',
  },
};

type SettingsDirtySnapshot = {
  settings: SettingsState;
  entities: EntityNames;
  apitSlabs: typeof DEFAULT_APIT_SLABS;
  stampDutyAmount: number;
  stampDutyThresholdLkr: number;
  masterBankFormat: BankExportFormatId;
  enforceBankFormat: boolean;
  isolateExternalBank: boolean;
  prevMonthThreshold: number;
  salaryMonthThreshold: number;
  enforceFlatSiteRate: boolean;
  allowPoyaOnFlatRate: boolean;
  requireDeductionMonthLock: boolean;
  uniformMonthlyInstalmentLkr: number;
  smVisits: number;
  hoSalary: number;
  guardPreviewQty: GuardMonthPreviewQty;
  cafePreviewBasic: number;
  cafePreviewQty: CafeMonthPreviewQty;
  cafePreviewOtHours: number;
  dayShiftStart: string;
  dayShiftEnd: string;
  nightShiftStart: string;
  nightShiftEnd: string;
  defaultGeofenceRadiusM: string;
  internalWorkLocations: InternalWorkLocationsSettings;
  cafeOpenStart: string;
  cafeOpenEnd: string;
  guardFormulas: GuardPayFormulas;
  cafeFormulas: CafePayFormulas;
  gratuitySettings: GratuitySettings;
  welfareFundSettings: WelfareFundSettings;
  companyLogo: string;
  rankPay: RankPay[];
  rankAddDraft: Omit<RankPay, 'id'> | null;
};

function serializeSettingsDirtySnapshot(snap: SettingsDirtySnapshot): string {
  return JSON.stringify(snap);
}

const TRACKED_DIRTY_SECTIONS = [
  'bankExport',
  'statutory',
  'payGroup',
  'guardRetention',
  'guardFormulas',
  'cafeFormulas',
  'crossDeployment',
  'entityBranding',
  'cafeOtCutoff',
  'billingCycle',
  'rankPay',
  'gratuity',
  'welfareFund',
  'geofence',
  'internalWorkLocations',
  'shiftTimes',
  'cafeOperatingWindow',
] as const satisfies readonly SettingsSectionId[];

const SETTINGS_SECTION_LABELS: Record<SettingsSectionId, string> = {
  bankExport: 'Bank Export Format',
  statutory: 'Statutory & Tax Rates',
  payGroup: 'Pay Group & Live Preview',
  guardRetention: 'Guard Retention Rules',
  guardFormulas: 'Guard Pay Formulas',
  cafeFormulas: 'Café Pay Formulas',
  crossDeployment: 'Cross-Deployment Pay Rules',
  entityBranding: 'Entity Branding & Logo',
  cafeOtCutoff: 'Café OT Cutoff',
  billingCycle: 'Billing & Payroll Cycle',
  rankPay: 'Rank Pay Matrix',
  gratuity: 'Gratuity Settings',
  welfareFund: 'Welfare Fund',
  geofence: 'Default Geofence Radius',
  internalWorkLocations: 'Internal Work Locations',
  shiftTimes: 'Guard Shift Times',
  cafeOperatingWindow: 'Café Operating Window',
  penaltyCatalog: 'Security Penalty Matrix',
  replacementCatalog: 'Replacement Asset Catalog',
  portalRbac: 'Portal Permissions',
};

function sectionSnapshotSlice(
  sectionId: SettingsSectionId,
  snap: SettingsDirtySnapshot,
): unknown {
  const { settings } = snap;
  switch (sectionId) {
    case 'bankExport':
      return {
        masterBankFormat: snap.masterBankFormat,
        enforceBankFormat: snap.enforceBankFormat,
        isolateExternalBank: snap.isolateExternalBank,
      };
    case 'statutory':
      return {
        vatRate: settings.vatRate,
        ssclRate: settings.ssclRate,
        invoiceHeadOffice: settings.invoiceHeadOffice,
        invoiceTelephone: settings.invoiceTelephone,
        invoiceEmail: settings.invoiceEmail,
        invoicePvNo: settings.invoicePvNo,
        supplierTin: settings.supplierTin,
        supplierAddress: settings.supplierAddress,
        epfEmployeeRate: settings.epfEmployeeRate,
        epfEmployerRate: settings.epfEmployerRate,
        etfRate: settings.etfRate,
        payrollEpfEmployer: settings.payrollEpfEmployer,
        payrollEtfEmployer: settings.payrollEtfEmployer,
        monthlyDaysDivisor: settings.monthlyDaysDivisor,
        apitSlabs: snap.apitSlabs,
        stampDutyAmount: snap.stampDutyAmount,
        stampDutyThresholdLkr: snap.stampDutyThresholdLkr,
      };
    case 'payGroup':
      return {
        smPayMode: settings.smPayMode,
        smFixedBasic: settings.smFixedBasic,
        smPerVisitBonus: settings.smPerVisitBonus,
        smVisits: snap.smVisits,
        hoSalary: snap.hoSalary,
        guardPreviewQty: snap.guardPreviewQty,
        cafePreviewBasic: snap.cafePreviewBasic,
        cafePreviewQty: snap.cafePreviewQty,
        cafePreviewOtHours: snap.cafePreviewOtHours,
      };
    case 'guardRetention':
      return {
        prevMonthThreshold: snap.prevMonthThreshold,
        salaryMonthThreshold: snap.salaryMonthThreshold,
      };
    case 'guardFormulas':
      return { guardFormulas: snap.guardFormulas };
    case 'cafeFormulas':
      return {
        cafeFormulas: snap.cafeFormulas,
        cafeOtMaxMonthlyHours: settings.cafeOtMaxMonthlyHours,
        cafeWeeklyOtThresholdHours: settings.cafeWeeklyOtThresholdHours,
      };
    case 'crossDeployment':
      return {
        enforceFlatSiteRate: snap.enforceFlatSiteRate,
        allowPoyaOnFlatRate: snap.allowPoyaOnFlatRate,
      };
    case 'entityBranding':
      return { entities: snap.entities, companyLogo: snap.companyLogo };
    case 'cafeOtCutoff':
      return { cafeOtCutoffTime: settings.cafeOtCutoffTime };
    case 'billingCycle':
      return {
        invoiceDispatchDay: settings.invoiceDispatchDay,
        payrollTargetDay: settings.payrollTargetDay,
        collectionWarningDay: settings.collectionWarningDay,
        requireDeductionMonthLock: snap.requireDeductionMonthLock,
        uniformMonthlyInstalmentLkr: snap.uniformMonthlyInstalmentLkr,
      };
    case 'rankPay':
      return { rankPay: snap.rankPay, rankAddDraft: snap.rankAddDraft };
    case 'gratuity':
      return { gratuitySettings: snap.gratuitySettings };
    case 'welfareFund':
      return { welfareFundSettings: snap.welfareFundSettings };
    case 'geofence':
      return { defaultGeofenceRadiusM: snap.defaultGeofenceRadiusM };
    case 'internalWorkLocations':
      return { internalWorkLocations: snap.internalWorkLocations };
    case 'shiftTimes':
      return {
        dayShiftStart: snap.dayShiftStart,
        dayShiftEnd: snap.dayShiftEnd,
        nightShiftStart: snap.nightShiftStart,
        nightShiftEnd: snap.nightShiftEnd,
      };
    case 'cafeOperatingWindow':
      return { cafeOpenStart: snap.cafeOpenStart, cafeOpenEnd: snap.cafeOpenEnd };
    default:
      return null;
  }
}

function listDirtySettingsSections(
  savedJson: string | null,
  currentJson: string,
): SettingsSectionId[] {
  if (!savedJson) return [];
  try {
    const saved = JSON.parse(savedJson) as SettingsDirtySnapshot;
    const current = JSON.parse(currentJson) as SettingsDirtySnapshot;
    return TRACKED_DIRTY_SECTIONS.filter(
      (id) =>
        JSON.stringify(sectionSnapshotSlice(id, saved)) !==
        JSON.stringify(sectionSnapshotSlice(id, current)),
    );
  } catch {
    return [];
  }
}

function hasRankAddDraft(draft: Omit<RankPay, 'id'>): boolean {
  return Boolean(
    draft.rankCode.trim() ||
      draft.fullTitle.trim() ||
      draft.basicPay > 0 ||
      draft.annualIncrement > 0,
  );
}

function isInternalSettingsHref(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return true;
  }
  try {
    const path = href.startsWith('http')
      ? new URL(href).pathname
      : href.split('?')[0] ?? href;
    return path === '/executive/settings';
  } catch {
    return false;
  }
}

// ─── Catalog Types & Initial Data ─────────────────────────────────────────────

import { DEFAULT_PENALTY_CATALOG, type PenaltyCatalogEntry } from '../../../../../packages/penalty-catalog';
import type { ReplacementCatalogEntry } from '../../../../../packages/replacement-catalog';
import {
  getPenaltyCatalog,
  getReplacementCatalog,
  savePenaltyCatalog,
  saveReplacementCatalog,
} from './catalog-actions';

interface PenaltyEntry extends PenaltyCatalogEntry {}
interface ReplacementEntry extends ReplacementCatalogEntry {}

// ─── Asset Catalogs Panel ─────────────────────────────────────────────────────

function AssetCatalogsPanel() {
  const [penalties,     setPenalties]     = useState<PenaltyEntry[]>(DEFAULT_PENALTY_CATALOG);
  const [replacements,  setReplacements]  = useState<ReplacementEntry[]>([]);
  const [catalogSaved,  setCatalogSaved]  = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogError,  setCatalogError]  = useState('');

  useEffect(() => {
    getPenaltyCatalog().then(setPenalties).catch(() => setPenalties(DEFAULT_PENALTY_CATALOG));
    getReplacementCatalog().then(setReplacements).catch(() => setReplacements([]));
  }, []);

  const showSaved = () => { setCatalogSaved(true); setTimeout(() => setCatalogSaved(false), 2500); };

  const handleSaveCatalogs = async () => {
    setCatalogSaving(true);
    setCatalogError('');
    const [penaltyResult, replacementResult] = await Promise.all([
      savePenaltyCatalog(penalties),
      saveReplacementCatalog(replacements),
    ]);
    setCatalogSaving(false);
    if (penaltyResult.success && replacementResult.success) {
      showSaved();
    } else {
      setCatalogError(
        penaltyResult.error
          ?? replacementResult.error
          ?? 'Failed to save asset catalogs.',
      );
    }
  };

  // ── Penalty handlers ──────────────────────────────────────────────────────
  const updatePenalty = (id: string, field: 'offense' | 'fine', val: string) =>
    setPenalties((prev) =>
      prev.map((p) => p.id === id
        ? { ...p, [field]: field === 'fine' ? parseInt(val) || 0 : val }
        : p
      )
    );
  const removePenalty = (id: string) => setPenalties((prev) => prev.filter((p) => p.id !== id));
  const addPenalty    = () => setPenalties((prev) => [
    ...prev,
    { id: `p${Date.now()}`, offense: '', fine: 0 },
  ]);

  // ── Replacement handlers ──────────────────────────────────────────────────
  const updateReplacement = (id: string, field: 'item' | 'cost', val: string) =>
    setReplacements((prev) =>
      prev.map((r) => r.id === id
        ? { ...r, [field]: field === 'cost' ? parseInt(val) || 0 : val }
        : r
      )
    );
  const removeReplacement = (id: string) => setReplacements((prev) => prev.filter((r) => r.id !== id));
  const addReplacement    = () => setReplacements((prev) => [
    ...prev,
    { id: `r${Date.now()}`, item: '', cost: 0 },
  ]);

  const thCls = 'px-4 py-2.5 text-left text-sm font-bold uppercase tracking-widest text-slate-500';
  const tdCls = 'px-4 py-2';

  return (
    <div className="space-y-6">

      {/* ── Security Penalty Matrix ── */}
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
              <Shield className="h-5 w-5 text-rose-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Security Penalty Matrix</h3>
              <p className="text-sm font-medium text-slate-600">Standard deduction amounts applied to guard wages per disciplinary offense</p>
              <SettingsTraceability />
            </div>
          </div>
          <SectionSaveButton
            saving={catalogSaving}
            saved={catalogSaved}
            onClick={() => void handleSaveCatalogs()}
            label="Save Catalogs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60">
              <tr>
                <th className={thCls} style={{ width: '50%' }}>Offense Type</th>
                <th className={`${thCls} text-right`} style={{ width: '35%' }}>Standard Fine (LKR)</th>
                <th className={thCls} style={{ width: '15%' }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {penalties.map((p, i) => (
                <tr key={p.id} className={`transition-colors hover:bg-white/40 ${i % 2 === 0 ? 'bg-white/20' : ''}`}>
                  <td className={tdCls}>
                    <input
                      type="text"
                      value={p.offense}
                      onChange={(e) => updatePenalty(p.id, 'offense', e.target.value)}
                      placeholder="e.g. Sleeping on Post"
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 placeholder:text-slate-400 hover:border-slate-200 focus:border-rose-200/80 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all"
                    />
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-mono text-slate-600">LKR</span>
                      <input
                        type="number"
                        min={0}
                        value={p.fine}
                        onChange={(e) => updatePenalty(p.id, 'fine', e.target.value)}
                        className="w-28 rounded-lg border border-transparent bg-transparent py-1 pr-2 text-right text-sm font-black tabular-nums text-rose-900 hover:border-slate-200 focus:border-rose-200/80 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all"
                      />
                    </div>
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <button
                      type="button"
                      onClick={() => removePenalty(p.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-rose-200/80 hover:bg-rose-50/80 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200/60 bg-slate-50/40 px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={addPenalty}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300/80 px-3 py-1.5 text-sm font-bold text-slate-500 transition-all hover:border-rose-300 hover:text-rose-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Offense
          </button>
          <p className="text-sm text-slate-600">{penalties.length} offense{penalties.length !== 1 ? 's' : ''} defined</p>
        </div>
      </ExecutiveGlassCard>

      {/* ── Shalom Replacement Costs ── */}
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
              <Home className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Shalom Replacement Costs</h3>
              <p className="text-sm font-medium text-slate-600">Standard asset replacement values used to bill tenants or guests for damaged / missing items</p>
              <SettingsTraceability />
            </div>
          </div>
          <SectionSaveButton
            saving={catalogSaving}
            saved={catalogSaved}
            onClick={() => void handleSaveCatalogs()}
            label="Save Catalogs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60">
              <tr>
                <th className={thCls} style={{ width: '50%' }}>Item</th>
                <th className={`${thCls} text-right`} style={{ width: '35%' }}>Replacement Cost (LKR)</th>
                <th className={thCls} style={{ width: '15%' }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {replacements.map((r, i) => (
                <tr key={r.id} className={`transition-colors hover:bg-white/40 ${i % 2 === 0 ? 'bg-white/20' : ''}`}>
                  <td className={tdCls}>
                    <input
                      type="text"
                      value={r.item}
                      onChange={(e) => updateReplacement(r.id, 'item', e.target.value)}
                      placeholder="e.g. Broken TV"
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-200/80 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                    />
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-mono text-slate-600">LKR</span>
                      <input
                        type="number"
                        min={0}
                        value={r.cost}
                        onChange={(e) => updateReplacement(r.id, 'cost', e.target.value)}
                        className="w-28 rounded-lg border border-transparent bg-transparent py-1 pr-2 text-right text-sm font-black tabular-nums text-indigo-900 hover:border-slate-200 focus:border-indigo-200/80 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                      />
                    </div>
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <button
                      type="button"
                      onClick={() => removeReplacement(r.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-rose-200/80 hover:bg-rose-50/80 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200/60 bg-slate-50/40 px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={addReplacement}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300/80 px-3 py-1.5 text-sm font-bold text-slate-500 transition-all hover:border-indigo-300 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </button>
          <p className="text-sm text-slate-600">{replacements.length} item{replacements.length !== 1 ? 's' : ''} catalogued</p>
        </div>
      </ExecutiveGlassCard>

      {catalogError && (
        <p className="text-xs font-bold text-rose-600">{catalogError}</p>
      )}

    </div>
  );
}

// ─── Live Formula Preview ─────────────────────────────────────────────────────

const evaluatePreview = (formula: string) => {
  try {
    const parsed = formula.replace(/\[?B\]?/g, '30000');
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${parsed}`)();
    return isNaN(result) ? 'Err' : `LKR ${Number(result).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return 'Err';
  }
};

const evaluateFormulaAtB = (formula: string, B: number, HRS = 9): number => {
  try {
    const parsed = formula
      .replace(/\[?B\]?/g, String(B))
      .replace(/\[?HRS\]?/gi, String(HRS));
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${parsed}`)();
    return Number.isFinite(result) ? Number(result) : 0;
  } catch {
    return 0;
  }
};

// ── Shared simulation helpers ─────────────────────────────────────────────────

const SIM_EPF_EMP = 0.08;

function monthSimStatutoryDeductions(
  gross: number,
  apitSlabs: ApitSlab[],
  stampDutyAmount: number,
  stampDutyThresholdLkr: number,
) {
  const epfEmp = Math.round(gross * SIM_EPF_EMP);
  const apit = calcApit(gross, apitSlabs);
  const stampDuty = calcStampDutyLkr(gross, stampDutyAmount, stampDutyThresholdLkr);
  const net = Number((gross - epfEmp - apit - stampDuty).toFixed(2));
  return { epfEmp, apit, stampDuty, net };
}

const MonthSimDeductions = ({
  epfEmp,
  apit,
  stampDuty,
}: {
  epfEmp: number;
  apit: number;
  stampDuty: number;
}) => (
  <div className="mt-1.5 space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold text-rose-600">EPF 8% (Deducted)</span>
      <span className="font-mono text-[10px] tabular-nums text-rose-600">− {fmtSimLKR(epfEmp)}</span>
    </div>
    {apit > 0 && (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-violet-600">APIT (Deducted)</span>
        <span className="font-mono text-[10px] tabular-nums text-violet-600">− {fmtSimLKR(apit)}</span>
      </div>
    )}
    {stampDuty > 0 && (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-rose-600">Stamp Duty</span>
        <span className="font-mono text-[10px] tabular-nums text-rose-600">− {fmtSimLKR(stampDuty)}</span>
      </div>
    )}
  </div>
);

const fmtSimLKR = (n: number) =>
  `LKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTH_SIM_STEPPER_BTN =
  'flex h-6 w-6 shrink-0 select-none items-center justify-center rounded border border-amber-300 bg-amber-100 text-amber-800 transition hover:bg-amber-200 active:scale-95 active:bg-amber-200 text-xs font-black leading-none touch-manipulation disabled:cursor-not-allowed disabled:opacity-40';

const MonthSimQtyRow = ({
  label,
  value,
  rate,
  min = 0,
  max = 31,
  onDelta,
}: {
  label: string;
  value: number;
  rate: number;
  min?: number;
  max?: number;
  onDelta: (delta: number) => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="truncate text-[10px] font-semibold text-amber-900">{label}</span>
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onDelta(-1)}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
        className={MONTH_SIM_STEPPER_BTN}
      >
        −
      </button>
      <span
        className="w-6 text-center font-mono text-xs font-black tabular-nums text-amber-900"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className={MONTH_SIM_STEPPER_BTN}
      >
        +
      </button>
      <span className="w-28 text-right font-mono text-[10px] tabular-nums text-amber-800">
        {fmtSimLKR(value * rate)}
      </span>
    </div>
  </div>
);

const MonthSimScalarRow = ({
  label,
  value,
  amount,
  min = 0,
  max = 200,
  onDelta,
}: {
  label: string;
  value: number;
  amount: number;
  min?: number;
  max?: number;
  onDelta: (delta: number) => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="truncate text-[10px] font-semibold text-amber-900">{label}</span>
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onDelta(-1)}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
        className={MONTH_SIM_STEPPER_BTN}
      >
        −
      </button>
      <span
        className="w-8 text-center font-mono text-xs font-black tabular-nums text-amber-900"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className={MONTH_SIM_STEPPER_BTN}
      >
        +
      </button>
      <span className="w-28 text-right font-mono text-[10px] tabular-nums text-amber-800">
        {fmtSimLKR(amount)}
      </span>
    </div>
  </div>
);

// ── Month Simulation Panel — Guard (B = LKR 30,000) ──────────────────────────

const MonthSimulator = ({
  basic,
  qty,
  onBasicChange,
  onQtyChange,
  guardFormulas,
  apitSlabs,
  stampDutyAmount,
  stampDutyThresholdLkr,
}: {
  basic: number;
  qty: GuardMonthPreviewQty;
  onBasicChange: (value: number) => void;
  onQtyChange: React.Dispatch<React.SetStateAction<GuardMonthPreviewQty>>;
  guardFormulas: GuardPayFormulas;
  apitSlabs: ApitSlab[];
  stampDutyAmount: number;
  stampDutyThresholdLkr: number;
}) => {
  const B = basic;
  const rates = guardMonthPreviewRates(B, undefined, guardFormulas);
  const gross = computeGuardMonthSimulatorGross(qty, B, undefined, guardFormulas);
  const { epfEmp, apit, stampDuty, net } = monthSimStatutoryDeductions(
    gross,
    apitSlabs,
    stampDutyAmount,
    stampDutyThresholdLkr,
  );

  const bumpKey = (key: keyof GuardMonthPreviewQty, delta: number) =>
    onQtyChange((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(31, prev[key] + delta)),
    }));

  return (
    <div className="rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-200/60 min-w-[300px]">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Month Simulation
        </p>
        <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
          B = LKR {B.toLocaleString()}
        </span>
      </div>
      <div className="mb-2.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-amber-800">
          Preview basic (rank matrix)
        </label>
        <input
          type="number"
          min={0}
          step={500}
          value={B}
          onChange={(e) => onBasicChange(parseInt(e.target.value, 10) || 0)}
          className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1 font-mono text-xs text-amber-900"
        />
      </div>

      {/* Day-type rows */}
      <div className="space-y-1.5">
        <MonthSimQtyRow label="Std Working Days"  value={qty.std}    rate={rates.std}    onDelta={(d) => bumpKey('std', d)} />
        <MonthSimQtyRow label="Sundays"           value={qty.sun}    rate={rates.sun}    onDelta={(d) => bumpKey('sun', d)} />
        <MonthSimQtyRow label="Poya Days"         value={qty.poya}   rate={rates.poya}   onDelta={(d) => bumpKey('poya', d)} />
        <MonthSimQtyRow label="Public Holidays"   value={qty.pubHol} rate={rates.pubHol} onDelta={(d) => bumpKey('pubHol', d)} />
        <MonthSimQtyRow label="Saturdays" value={qty.sat}    rate={rates.sat}    onDelta={(d) => bumpKey('sat', d)} />
      </div>

      {/* Gross subtotal */}
      <div className="mt-3 flex items-center justify-between border-t border-amber-300/70 pt-2">
        <span className="text-[10px] font-semibold text-amber-700">Est. Month Gross</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-amber-800">
          {fmtSimLKR(gross)}
        </span>
      </div>

      {/* Deductions */}
      <MonthSimDeductions epfEmp={epfEmp} apit={apit} stampDuty={stampDuty} />

      {/* Net take-home */}
      <div className="mt-2.5 flex items-center justify-between border-t border-amber-300/70 pt-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Est. Net Take-Home
        </span>
        <span className="font-mono text-sm font-black tabular-nums text-emerald-700">
          {fmtSimLKR(net)}
        </span>
      </div>
    </div>
  );
};

// ── Month Simulation Panel — Café Staff ───────────────────────────────────────

const CAFE_SIM_SHIFT_HRS = 9;

const CafeMonthSimulator = ({
  basic,
  qty,
  otHours,
  formulas,
  onBasicChange,
  onQtyChange,
  onOtHoursChange,
  apitSlabs,
  stampDutyAmount,
  stampDutyThresholdLkr,
}: {
  basic: number;
  qty: CafeMonthPreviewQty;
  otHours: number;
  formulas: CafePayFormulas;
  onBasicChange: (value: number) => void;
  onQtyChange: React.Dispatch<React.SetStateAction<CafeMonthPreviewQty>>;
  onOtHoursChange: React.Dispatch<React.SetStateAction<number>>;
  apitSlabs: ApitSlab[];
  stampDutyAmount: number;
  stampDutyThresholdLkr: number;
}) => {
  const B = basic;

  const rates = {
    std: calculateCafeShift(CAFE_SIM_SHIFT_HRS, evaluateFormulaAtB(formulas.otRatePerHour, B), {
      weeklyHoursBefore: 0,
    }).grossPay,
    sun: evaluateFormulaAtB(formulas.weeklyHolidaySunday, B),
    poya: evaluateFormulaAtB(formulas.poyaDay, B, CAFE_SIM_SHIFT_HRS),
    pubHol: evaluateFormulaAtB(formulas.publicHoliday, B),
    statutory: evaluateFormulaAtB(formulas.statutoryHoliday, B, CAFE_SIM_SHIFT_HRS),
    sat: evaluateFormulaAtB(formulas.saturdayShift, B),
  };
  const otRate = evaluateFormulaAtB(formulas.otRatePerHour, B);

  const dayGross =
    qty.std * rates.std +
    qty.sun * rates.sun +
    qty.poya * rates.poya +
    qty.pubHol * rates.pubHol +
    qty.statutory * rates.statutory +
    qty.sat * rates.sat;
  const otPay = otHours > 0 ? otHours * otRate : 0;
  const gross = dayGross + otPay;
  const { epfEmp, apit, stampDuty, net } = monthSimStatutoryDeductions(
    gross,
    apitSlabs,
    stampDutyAmount,
    stampDutyThresholdLkr,
  );

  const bumpQty = (key: keyof CafeMonthPreviewQty, delta: number) =>
    onQtyChange((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(31, prev[key] + delta)),
    }));

  const bumpOt = (delta: number) =>
    onOtHoursChange((prev) => Math.max(0, Math.min(200, prev + delta)));

  return (
    <div className="rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-200/60 min-w-[300px]">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Month Simulation
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Basic</span>
          <input
            type="number"
            value={B}
            onChange={(e) => onBasicChange(parseInt(e.target.value, 10) || 0)}
            className="w-20 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-amber-900"
          />
        </div>
      </div>

      {/* Day-type rows */}
      <div className="space-y-1.5">
        <MonthSimQtyRow label="Std Working Days"   value={qty.std}       rate={rates.std}       onDelta={(d) => bumpQty('std', d)} />
        <MonthSimQtyRow label="Sundays"            value={qty.sun}       rate={rates.sun}       onDelta={(d) => bumpQty('sun', d)} />
        <MonthSimQtyRow label="Poya Days"          value={qty.poya}      rate={rates.poya}      onDelta={(d) => bumpQty('poya', d)} />
        <MonthSimQtyRow label="Public Holidays"    value={qty.pubHol}    rate={rates.pubHol}    onDelta={(d) => bumpQty('pubHol', d)} />
        <MonthSimQtyRow label="Statutory Holidays" value={qty.statutory} rate={rates.statutory} onDelta={(d) => bumpQty('statutory', d)} />
        <MonthSimQtyRow label="Saturdays"          value={qty.sat}       rate={rates.sat}       onDelta={(d) => bumpQty('sat', d)} />
      </div>

      {/* OT Hours row */}
      <div className="mt-2 border-t border-amber-300/50 pt-2">
        <MonthSimScalarRow
          label="OT Hours (Month)"
          value={otHours}
          amount={otPay}
          onDelta={bumpOt}
        />
      </div>

      {/* Gross subtotal */}
      <div className="mt-3 flex items-center justify-between border-t border-amber-300/70 pt-2">
        <span className="text-[10px] font-semibold text-amber-700">
          Est. Month Gross
          {otPay > 0 && (
            <span className="ml-1 text-[9px] font-medium text-amber-600">
              (Days + OT)
            </span>
          )}
        </span>
        <span className="font-mono text-xs font-semibold tabular-nums text-amber-800">
          {fmtSimLKR(gross)}
        </span>
      </div>

      {/* Deductions */}
      <MonthSimDeductions epfEmp={epfEmp} apit={apit} stampDuty={stampDuty} />

      {/* Net take-home */}
      <div className="mt-2.5 flex items-center justify-between border-t border-amber-300/70 pt-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Est. Net Take-Home
        </span>
        <span className="font-mono text-sm font-black tabular-nums text-emerald-700">
          {fmtSimLKR(net)}
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const FormulaRow = ({
  title,
  icon: Icon,
  formula,
  onChange,
}: {
  title: string;
  icon: React.ElementType;
  formula: string;
  onChange: (value: string) => void;
}) => (
  <div className="mb-5">
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {title}
    </div>
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-md p-3 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400">
      <FileText className="w-4 h-4 text-slate-400" />
      <input
        type="text"
        value={formula}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-sm font-mono text-slate-800 outline-none bg-transparent"
      />
      <div className="px-2 py-1 bg-indigo-50 border border-indigo-100 rounded text-xs font-bold text-indigo-700 whitespace-nowrap">
        B=30K: {evaluatePreview(formula)}
      </div>
    </div>
  </div>
);

// ─── Internal work location branch GPS ───────────────────────────────────────

type InternalBranchKind = 'headOffice' | 'cafe';

const INTERNAL_BRANCH_META: Record<
  InternalBranchKind,
  { title: string; subtitle: string; Icon: typeof Building2; accent: string }
> = {
  headOffice: {
    title: 'Head Office Branches',
    subtitle: 'GPS geofences for HO staff check-in and portal access',
    Icon: Building2,
    accent: 'slate',
  },
  cafe: {
    title: 'Café Branches',
    subtitle: 'GPS geofences for café staff shift check-in',
    Icon: Coffee,
    accent: 'amber',
  },
};

function InternalWorkLocationRow({
  row,
  index,
  kind,
  onUpdate,
  onRemove,
}: {
  row: InternalWorkLocation;
  index: number;
  kind: InternalBranchKind;
  onUpdate: (patch: Partial<InternalWorkLocation>) => void;
  onRemove: () => void;
}) {
  const [gpsText, setGpsText] = useState(() => formatGpsCoords(row.latitude, row.longitude));

  useEffect(() => {
    setGpsText(formatGpsCoords(row.latitude, row.longitude));
  }, [row.id, row.latitude, row.longitude]);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Branch {index + 1}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Branch name
          </label>
          <input
            value={row.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={kind === 'headOffice' ? 'e.g. Colombo HQ' : 'e.g. Café Tasha — Bambalapitiya'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Address
          </label>
          <input
            value={row.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Street address, city"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="sm:col-span-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Google Maps coordinates
              </label>
              <div className="relative min-w-0">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={gpsText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setGpsText(next);
                    const { lat, lng } = parseGpsCoords(next);
                    if (lat != null && lng != null) {
                      onUpdate({ latitude: lat, longitude: lng });
                    }
                  }}
                  onBlur={() => {
                    const { lat, lng } = parseGpsCoords(gpsText);
                    onUpdate({
                      latitude: lat ?? 0,
                      longitude: lng ?? 0,
                    });
                    setGpsText(formatGpsCoords(lat ?? 0, lng ?? 0));
                  }}
                  placeholder="e.g., 6.9271, 79.8612"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>
            <div className="w-full shrink-0 lg:w-[140px]">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Geofence radius (m)
              </label>
              <input
                type="number"
                min={MIN_GEOFENCE_RADIUS_M}
                max={MAX_GEOFENCE_RADIUS_M}
                value={row.geofenceRadiusM}
                onChange={(e) =>
                  onUpdate({
                    geofenceRadiusM: Number.parseInt(e.target.value, 10) || MIN_GEOFENCE_RADIUS_M,
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InternalWorkLocationsPanel({
  value,
  onChange,
}: {
  value: InternalWorkLocationsSettings;
  onChange: (next: InternalWorkLocationsSettings) => void;
}) {
  const renderBlock = (kind: InternalBranchKind, locations: InternalWorkLocation[]) => {
    const meta = INTERNAL_BRANCH_META[kind];
    const Icon = meta.Icon;

    const updateRow = (id: string, patch: Partial<InternalWorkLocation>) => {
      onChange({
        ...value,
        [kind]: locations.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      });
    };

    const removeRow = (id: string) => {
      onChange({ ...value, [kind]: locations.filter((row) => row.id !== id) });
    };

    const addRow = () => {
      onChange({ ...value, [kind]: [...locations, createEmptyInternalWorkLocation()] });
    };

    return (
      <div
        className={`rounded-2xl border p-5 ${
          kind === 'cafe'
            ? 'border-amber-200/70 bg-amber-50/40'
            : 'border-slate-200/70 bg-slate-50/60'
        }`}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              kind === 'cafe'
                ? 'border-amber-200/80 bg-amber-100/80 text-amber-700'
                : 'border-slate-200/80 bg-slate-100/80 text-slate-700'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">{meta.title}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-600">{meta.subtitle}</p>
          </div>
        </div>

        {locations.length === 0 ? (
          <p className="mb-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm font-medium text-slate-500">
            No branches configured yet. Add a branch with name and GPS coordinates.
          </p>
        ) : (
          <div className="space-y-3">
            {locations.map((row, index) => (
              <InternalWorkLocationRow
                key={row.id}
                row={row}
                index={index}
                kind={kind}
                onUpdate={(patch) => updateRow(row.id, patch)}
                onRemove={() => removeRow(row.id)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100/70"
        >
          <Plus className="h-3.5 w-3.5" />
          Add branch
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p>
          Configure Classic Venture head office and café branches here. HR assigns staff to a branch in
          MNR; check-in uses that branch&apos;s GPS geofence. Client guard sites stay in the Site Directory.
        </p>
      </div>
      {renderBlock('headOffice', value.headOffice)}
      {renderBlock('cafe', value.cafe)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const navGuardRef = useExecutiveNavGuardRef();
  const vault = useExecutiveVaultSessionOptional();
  const vaultBlocksSave = Boolean(
    vault?.enabled &&
      vault.pinCheckDone &&
      vault.vaultPinConfigured &&
      vault.locked,
  );
  const [activeTab, setActiveTab]   = useState<SettingsTab>('CATALOGS');
  const [showGlobalSettingsWarning, setShowGlobalSettingsWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [unsavedSaveError, setUnsavedSaveError] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<SettingsTab | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [s, setS]               = useState<SettingsState>(INITIAL);
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [sectionSaving, setSectionSaving] = useState<SettingsSectionId | null>(null);
  const [sectionSaved, setSectionSaved] = useState<Partial<Record<SettingsSectionId, boolean>>>({});
  const [auditTrail, setAuditTrail] = useState<Partial<Record<SettingsSectionId, SettingsSectionAudit>>>({});
  const [entities, setEntities] = useState<EntityNames>(INITIAL_ENTITY_NAMES);

  // ── Company Logo state ──────────────────────────────────────────────────────
  const [companyLogo, setCompanyLogo] = useState<string>('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [gratuitySettings, setGratuitySettings] = useState<GratuitySettings>({
    minYears: 5,
    monthlyBasicDivisor: 2,
  });
  const [gratuityError, setGratuityError] = useState('');

  const [welfareFundSettings, setWelfareFundSettings] = useState<WelfareFundSettings>({
    monthlyDeductionLkr: 500,
  });
  const [welfareFundError, setWelfareFundError] = useState('');

  const handleLogoFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setCompanyLogo(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = async () => {
    await clearCompanyLogo();
    setCompanyLogo('');
    localStorage.removeItem(LOGO_STORAGE_KEY);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // ── Financial Config state ──────────────────────────────────────────────────
  const [masterBankFormat,      setMasterBankFormat]      = useState<BankExportFormatId>(MASTER_BANK_FORMATS[0].id);
  const [enforceBankFormat,     setEnforceBankFormat]     = useState(true);
  const [isolateExternalBank,   setIsolateExternalBank]   = useState(true);
  // ── Guard Retention & Salary Release Rules state ─────────────────────────────
  const [prevMonthThreshold,      setPrevMonthThreshold]      = useState(30);
  const [salaryMonthThreshold,    setSalaryMonthThreshold]    = useState(10);

  // ── Cross-Deployment Pay Rules state ────────────────────────────────────────
  const [enforceFlatSiteRate, setEnforceFlatSiteRate] = useState(true);
  const [allowPoyaOnFlatRate, setAllowPoyaOnFlatRate] = useState(false);
  const [requireDeductionMonthLock, setRequireDeductionMonthLock] = useState(true);
  const [uniformMonthlyInstalmentLkr, setUniformMonthlyInstalmentLkr] = useState(2_000);

  // ── Live Wage Preview calculator state ───────────────────────────────────────
  const [smVisits,     setSmVisits]     = useState(70);
  const [hoSalary,     setHoSalary]     = useState(180000);
  const [guardPreviewBasic, setGuardPreviewBasic] = useState(35_000);
  const [guardPreviewQty, setGuardPreviewQty] = useState<GuardMonthPreviewQty>({
    std: 20, sun: 4, poya: 1, pubHol: 0, sat: 4,
  });
  const [cafePreviewBasic, setCafePreviewBasic] = useState(38_000);
  const [cafePreviewQty, setCafePreviewQty] = useState<CafeMonthPreviewQty>({
    std: 20, sun: 4, poya: 1, pubHol: 0, statutory: 0, sat: 4,
  });
  const [cafePreviewOtHours, setCafePreviewOtHours] = useState(0);

  // ── Global Shift Timing Defaults state ───────────────────────────────────────
  const [dayShiftStart,   setDayShiftStart]   = useState('07:00');
  const [dayShiftEnd,     setDayShiftEnd]     = useState('19:00');
  const [nightShiftStart, setNightShiftStart] = useState('19:00');
  const [nightShiftEnd,   setNightShiftEnd]   = useState('07:00');
  const [defaultGeofenceRadiusM, setDefaultGeofenceRadiusM] = useState(
    String(DEFAULT_GEOFENCE_RADIUS_M),
  );
  const [internalWorkLocations, setInternalWorkLocations] = useState<InternalWorkLocationsSettings>(
    DEFAULT_INTERNAL_WORK_LOCATIONS,
  );

  // ── Café Operating Window state ──────────────────────────────────────────────
  const [cafeOpenStart, setCafeOpenStart] = useState('07:00');
  const [cafeOpenEnd,   setCafeOpenEnd]   = useState('19:00');

  const syncSavedSnapshotRef = useRef<(patch?: Partial<SettingsDirtySnapshot>) => void>(() => {});
  const leaveBypassRef = useRef(false);

  // ── Rank Pay Matrix state ───────────────────────────────────────────────────
  const BLANK_RANK: RankPayDraft = blankRankDraftForSection('GUARD');
  const [editingRankId,  setEditingRankId]  = useState<string | null>(null);
  const [editDraft,      setEditDraft]      = useState<RankPayDraft>(BLANK_RANK);
  const [addingRankSection, setAddingRankSection] = useState<RankLedgerSectionId | null>(null);
  const [newRankDraft,   setNewRankDraft]   = useState<RankPayDraft>(BLANK_RANK);
  const [rankMatrixError, setRankMatrixError] = useState('');
  const [rankMatrixSaving, setRankMatrixSaving] = useState(false);
  const [canManageExecutiveRanks, setCanManageExecutiveRanks] = useState(false);

  const [stampDutyAmount, setStampDutyAmount] = useState(DEFAULT_STAMP_DUTY_LKR);
  const [stampDutyThresholdLkr, setStampDutyThresholdLkr] = useState(
    DEFAULT_STAMP_DUTY_THRESHOLD_LKR,
  );
  const [apitSlabs, setApitSlabs] = useState(DEFAULT_APIT_SLABS);
  const [guardFormulas, setGuardFormulas] = useState<GuardPayFormulas>(DEFAULT_GUARD_PAY_FORMULAS);
  const [cafeFormulas, setCafeFormulas] = useState<CafePayFormulas>(DEFAULT_CAFE_PAY_FORMULAS);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const startEditRank = (r: RankPay) => {
    if (!promptVaultUnlockForRankMatrix()) return;
    if (isLockedExecutiveLedgerRank(r.rankCode) && !canManageExecutiveRanks) {
      setRankMatrixError('Only MD or OD can edit MD and OD ranks.');
      return;
    }
    setRankMatrixError('');
    setEditingRankId(r.id);
    setEditDraft({ rankCode: r.rankCode, fullTitle: r.fullTitle.toUpperCase(), basicPay: r.basicPay, annualIncrement: r.annualIncrement, salaryType: r.salaryType, operationalGroup: r.operationalGroup });
    setAddingRankSection(null);
  };

  const cancelEditRank = () => {
    setEditingRankId(null);
    setEditDraft(BLANK_RANK);
  };

  const promptVaultUnlockForRankMatrix = useCallback((): boolean => {
    if (!vaultBlocksSave) return true;
    setRankMatrixError(
      'Vault is locked. Enter your 4-digit PIN to unlock, then save the rank again.',
    );
    vault?.requestUnlock();
    return false;
  }, [vault, vaultBlocksSave]);

  const persistRankPayMatrix = async (matrix: RankPay[]): Promise<boolean> => {
    if (!promptVaultUnlockForRankMatrix()) return false;
    setRankMatrixSaving(true);
    setRankMatrixError('');
    try {
      const res = await saveRankPayMatrix(matrix);
      if (!res.success) {
        const error = res.error ?? 'Failed to save rank matrix';
        setRankMatrixError(error);
        if (isVaultLockSaveError(error)) {
          vault?.requestUnlock();
        }
        return false;
      }
      return true;
    } catch {
      setRankMatrixError('Failed to save rank matrix');
      return false;
    } finally {
      setRankMatrixSaving(false);
    }
  };

  const rankPayWithPendingEdit = (matrix: RankPay[]): RankPay[] => {
    if (!editingRankId || !editDraft.rankCode.trim() || !editDraft.fullTitle.trim()) {
      return matrix;
    }
    const existing = matrix.find((r) => r.id === editingRankId);
    if (!existing) return matrix;
    const merged = {
      ...existing,
      ...editDraft,
      salaryType: 'BANK' as const,
    };
    const unchanged =
      merged.rankCode.trim().toUpperCase() === existing.rankCode &&
      merged.fullTitle.trim().toUpperCase() === existing.fullTitle &&
      merged.basicPay === existing.basicPay &&
      merged.annualIncrement === existing.annualIncrement &&
      merged.operationalGroup === existing.operationalGroup;
    if (unchanged) return matrix;
    return matrix.map((r) => (r.id === editingRankId ? merged : r));
  };

  const commitEditRank = async () => {
    if (!editingRankId || !editDraft.rankCode.trim() || !editDraft.fullTitle.trim()) return;
    const nextMatrix = sanitizeRankPayMatrixEntries(
      s.rankPay.map((r) =>
        r.id === editingRankId ? { ...r, ...editDraft, salaryType: 'BANK' as const } : r,
      ),
    ) as RankPay[];
    if (!(await persistRankPayMatrix(nextMatrix))) return;
    setEditingRankId(null);
    setEditDraft(BLANK_RANK);
    setS((prev) => {
      const nextSettings = { ...prev, rankPay: nextMatrix };
      syncSavedSnapshotRef.current({
        settings: nextSettings,
        rankPay: nextMatrix,
        rankAddDraft: null,
      });
      return nextSettings;
    });
  };

  const deleteRank = async (id: string) => {
    if (!promptVaultUnlockForRankMatrix()) return;
    const target = s.rankPay.find((r) => r.id === id);
    if (
      target &&
      (isLockedExecutiveLedgerRank(target.rankCode) ||
        isLockedSectorManagerLedgerRank(target.rankCode))
    ) {
      setRankMatrixError('MD, OD, and SM ranks are system ranks and cannot be removed.');
      return;
    }
    const nextMatrix = sanitizeRankPayMatrixEntries(
      s.rankPay.filter((r) => r.id !== id),
    ) as RankPay[];
    if (!(await persistRankPayMatrix(nextMatrix))) return;
    if (editingRankId === id) cancelEditRank();
    setS((prev) => {
      const nextSettings = { ...prev, rankPay: nextMatrix };
      syncSavedSnapshotRef.current({
        settings: nextSettings,
        rankPay: nextMatrix,
        rankAddDraft: null,
      });
      return nextSettings;
    });
  };

  const commitAddRank = async () => {
    if (!newRankDraft.rankCode.trim() || !newRankDraft.fullTitle.trim()) return;
    if (!promptVaultUnlockForRankMatrix()) return;
    const nextMatrix = sanitizeRankPayMatrixEntries([
      ...s.rankPay,
      { id: `rp-${Date.now()}`, ...newRankDraft, salaryType: 'BANK' as const },
    ]) as RankPay[];
    if (!(await persistRankPayMatrix(nextMatrix))) return;
    setNewRankDraft(BLANK_RANK);
    setAddingRankSection(null);
    setS((prev) => {
      const nextSettings = { ...prev, rankPay: nextMatrix };
      syncSavedSnapshotRef.current({
        settings: nextSettings,
        rankPay: nextMatrix,
        rankAddDraft: null,
      });
      return nextSettings;
    });
  };

  const buildDirtySnapshot = useCallback(
    (overrides?: Partial<SettingsDirtySnapshot>): SettingsDirtySnapshot => ({
      settings: overrides?.settings ?? s,
      entities: overrides?.entities ?? entities,
      apitSlabs: overrides?.apitSlabs ?? apitSlabs,
      stampDutyAmount: overrides?.stampDutyAmount ?? stampDutyAmount,
      stampDutyThresholdLkr: overrides?.stampDutyThresholdLkr ?? stampDutyThresholdLkr,
      masterBankFormat: overrides?.masterBankFormat ?? masterBankFormat,
      enforceBankFormat: overrides?.enforceBankFormat ?? enforceBankFormat,
      isolateExternalBank: overrides?.isolateExternalBank ?? isolateExternalBank,
      prevMonthThreshold: overrides?.prevMonthThreshold ?? prevMonthThreshold,
      salaryMonthThreshold: overrides?.salaryMonthThreshold ?? salaryMonthThreshold,
      enforceFlatSiteRate: overrides?.enforceFlatSiteRate ?? enforceFlatSiteRate,
      allowPoyaOnFlatRate: overrides?.allowPoyaOnFlatRate ?? allowPoyaOnFlatRate,
      requireDeductionMonthLock:
        overrides?.requireDeductionMonthLock ?? requireDeductionMonthLock,
      uniformMonthlyInstalmentLkr:
        overrides?.uniformMonthlyInstalmentLkr ?? uniformMonthlyInstalmentLkr,
      smVisits: overrides?.smVisits ?? smVisits,
      hoSalary: overrides?.hoSalary ?? hoSalary,
      guardPreviewQty: overrides?.guardPreviewQty ?? guardPreviewQty,
      cafePreviewBasic: overrides?.cafePreviewBasic ?? cafePreviewBasic,
      cafePreviewQty: overrides?.cafePreviewQty ?? cafePreviewQty,
      cafePreviewOtHours: overrides?.cafePreviewOtHours ?? cafePreviewOtHours,
      dayShiftStart: overrides?.dayShiftStart ?? dayShiftStart,
      dayShiftEnd: overrides?.dayShiftEnd ?? dayShiftEnd,
      nightShiftStart: overrides?.nightShiftStart ?? nightShiftStart,
      nightShiftEnd: overrides?.nightShiftEnd ?? nightShiftEnd,
      defaultGeofenceRadiusM: overrides?.defaultGeofenceRadiusM ?? defaultGeofenceRadiusM,
      internalWorkLocations: overrides?.internalWorkLocations ?? internalWorkLocations,
      cafeOpenStart: overrides?.cafeOpenStart ?? cafeOpenStart,
      cafeOpenEnd: overrides?.cafeOpenEnd ?? cafeOpenEnd,
      guardFormulas: overrides?.guardFormulas ?? guardFormulas,
      cafeFormulas: overrides?.cafeFormulas ?? cafeFormulas,
      gratuitySettings: overrides?.gratuitySettings ?? gratuitySettings,
      welfareFundSettings: overrides?.welfareFundSettings ?? welfareFundSettings,
      companyLogo: overrides?.companyLogo ?? companyLogo,
      rankPay: overrides?.rankPay ?? rankPayWithPendingEdit(s.rankPay),
      rankAddDraft:
        overrides?.rankAddDraft ??
        (addingRankSection && hasRankAddDraft(newRankDraft) ? newRankDraft : null),
    }),
    [
      s,
      entities,
      apitSlabs,
      stampDutyAmount,
      stampDutyThresholdLkr,
      masterBankFormat,
      enforceBankFormat,
      isolateExternalBank,
      prevMonthThreshold,
      salaryMonthThreshold,
      enforceFlatSiteRate,
      allowPoyaOnFlatRate,
      requireDeductionMonthLock,
      smVisits,
      hoSalary,
      guardPreviewQty,
      cafePreviewBasic,
      cafePreviewQty,
      cafePreviewOtHours,
      dayShiftStart,
      dayShiftEnd,
      nightShiftStart,
      nightShiftEnd,
      defaultGeofenceRadiusM,
      internalWorkLocations,
      cafeOpenStart,
      cafeOpenEnd,
      guardFormulas,
      cafeFormulas,
      gratuitySettings,
      welfareFundSettings,
      companyLogo,
      editingRankId,
      editDraft,
      addingRankSection,
      newRankDraft,
    ],
  );

  const currentSnapshot = useMemo(
    () => serializeSettingsDirtySnapshot(buildDirtySnapshot()),
    [buildDirtySnapshot],
  );

  const dirtySections = useMemo(
    () => listDirtySettingsSections(savedSnapshot, currentSnapshot),
    [savedSnapshot, currentSnapshot],
  );

  const isDirty = settingsHydrated && dirtySections.length > 0;

  syncSavedSnapshotRef.current = (patch?: Partial<SettingsDirtySnapshot>) => {
    setSavedSnapshot(serializeSettingsDirtySnapshot(buildDirtySnapshot(patch)));
  };

  const resetRankDraftUi = () => {
    setEditingRankId(null);
    setEditDraft(BLANK_RANK);
    setAddingRankSection(null);
    setNewRankDraft(BLANK_RANK);
  };

  const applyDirtySnapshot = useCallback((snap: SettingsDirtySnapshot) => {
    setS(snap.settings);
    setEntities(snap.entities);
    setApitSlabs(snap.apitSlabs);
    setStampDutyAmount(snap.stampDutyAmount);
    setStampDutyThresholdLkr(snap.stampDutyThresholdLkr);
    setMasterBankFormat(snap.masterBankFormat);
    setEnforceBankFormat(snap.enforceBankFormat);
    setIsolateExternalBank(snap.isolateExternalBank);
    setPrevMonthThreshold(snap.prevMonthThreshold);
    setSalaryMonthThreshold(snap.salaryMonthThreshold);
    setEnforceFlatSiteRate(snap.enforceFlatSiteRate);
    setAllowPoyaOnFlatRate(snap.allowPoyaOnFlatRate);
    setRequireDeductionMonthLock(snap.requireDeductionMonthLock);
    setUniformMonthlyInstalmentLkr(snap.uniformMonthlyInstalmentLkr);
    setSmVisits(snap.smVisits);
    setHoSalary(snap.hoSalary);
    setGuardPreviewQty(snap.guardPreviewQty);
    setCafePreviewBasic(snap.cafePreviewBasic);
    setCafePreviewQty(snap.cafePreviewQty);
    setCafePreviewOtHours(snap.cafePreviewOtHours);
    setDayShiftStart(snap.dayShiftStart);
    setDayShiftEnd(snap.dayShiftEnd);
    setNightShiftStart(snap.nightShiftStart);
    setNightShiftEnd(snap.nightShiftEnd);
    setDefaultGeofenceRadiusM(snap.defaultGeofenceRadiusM);
    setInternalWorkLocations(snap.internalWorkLocations);
    setCafeOpenStart(snap.cafeOpenStart);
    setCafeOpenEnd(snap.cafeOpenEnd);
    setGuardFormulas(snap.guardFormulas);
    setCafeFormulas(snap.cafeFormulas);
    setGratuitySettings(snap.gratuitySettings);
    setWelfareFundSettings(snap.welfareFundSettings);
    setCompanyLogo(snap.companyLogo);
    resetRankDraftUi();
  }, []);

  const hydrateAllSettings = useCallback(async (): Promise<SettingsDirtySnapshot> => {
    const [
      cfg,
      payroll,
      names,
      engine,
      bank,
      formulas,
      rankPay,
      gratuity,
      welfare,
      shift,
      geofence,
      internalLocations,
      logo,
    ] = await Promise.all([
      getMdInvoiceConfig(),
      getPayrollStatutorySettings(),
      getDivisionNames(),
      getMdEngineConstants(),
      getBankExportSettings(),
      getPayFormulasSettings(),
      getRankPayMatrix(),
      getGratuitySettings(),
      getWelfareFundSettings(),
      getShiftSettings(),
      getGeofenceSettings(),
      getInternalWorkLocations(),
      fetchCompanyLogo(),
    ]);

    let resolvedLogo = logo.url ?? '';
    if (!resolvedLogo) {
      const stored = localStorage.getItem(LOGO_STORAGE_KEY);
      if (stored?.startsWith('data:')) {
        const migrated = await persistCompanyLogo(stored);
        if (migrated.success && migrated.url) {
          resolvedLogo = migrated.url;
          localStorage.setItem(LOGO_STORAGE_KEY, migrated.url);
        }
      } else if (stored) {
        resolvedLogo = stored;
      }
    } else {
      localStorage.setItem(LOGO_STORAGE_KEY, resolvedLogo);
    }

    const settings: SettingsState = {
      ...INITIAL,
      cafeOtCutoffTime: engine.cafeOtCutoffTime,
      invoiceDispatchDay: engine.invoiceDispatchDay,
      payrollTargetDay: engine.payrollTargetDay,
      collectionWarningDay: engine.collectionWarningDay,
      smPayMode: engine.smPayMode,
      smFixedBasic: engine.smFixedBasic,
      smPerVisitBonus: engine.smPerVisitBonus,
      fuelSurplusCorrection: engine.fuelSurplusCorrection,
      smFuelAdvanceLkr: engine.smFuelAdvanceLkr,
      smFuelPerKmLkr: engine.smFuelPerKmLkr,
      cafeOtMaxMonthlyHours: engine.cafeOtMaxMonthlyHours,
      cafeWeeklyOtThresholdHours: engine.cafeWeeklyOtThresholdHours,
      vatRate: cfg.vatRate,
      ssclRate: cfg.ssclRate,
      invoiceHeadOffice: cfg.headOffice,
      invoiceTelephone: cfg.telephone,
      invoiceEmail: cfg.email,
      invoicePvNo: cfg.pvNumber,
      supplierTin: cfg.supplierTin,
      supplierAddress: cfg.supplierAddress,
      epfEmployeeRate: payroll.epfEmployeeRate,
      epfEmployerRate: payroll.epfEmployerRate,
      etfRate: payroll.etfRate,
      payrollEpfEmployer: payroll.payrollEpfEmployer,
      payrollEtfEmployer: payroll.payrollEtfEmployer,
      monthlyDaysDivisor: payroll.monthlyDaysDivisor,
      rankPay: rankPay as RankPay[],
      rankFormulaMap: {},
    };

    const snap: SettingsDirtySnapshot = {
      settings,
      entities: names,
      apitSlabs: payroll.apitSlabs,
      stampDutyAmount: payroll.stampDutyLkr,
      stampDutyThresholdLkr: payroll.stampDutyThresholdLkr,
      masterBankFormat: bank.masterFormatId,
      enforceBankFormat: bank.enforceFormatGlobally,
      isolateExternalBank: bank.isolateExternalBank,
      prevMonthThreshold: engine.prevMonthRetentionThreshold,
      salaryMonthThreshold: engine.salaryMonthRetentionThreshold,
      enforceFlatSiteRate: engine.enforceFlatSiteRate,
      allowPoyaOnFlatRate: engine.allowPoyaOnFlatRate,
      requireDeductionMonthLock: engine.requireDeductionMonthLock,
      uniformMonthlyInstalmentLkr: engine.uniformMonthlyInstalmentLkr,
      smVisits: engine.smPreviewVisits,
      hoSalary: engine.hoPreviewSalary,
      guardPreviewQty: engine.guardPreviewQty,
      cafePreviewBasic: engine.cafePreviewBasic,
      cafePreviewQty: engine.cafePreviewQty,
      cafePreviewOtHours: engine.cafePreviewOtHours,
      dayShiftStart: shift.security_day_start,
      dayShiftEnd: shift.security_day_end,
      nightShiftStart: shift.security_night_start,
      nightShiftEnd: shift.security_night_end,
      defaultGeofenceRadiusM: String(geofence.default_geofence_radius_m),
      internalWorkLocations: internalLocations,
      cafeOpenStart: engine.cafeOpenStart,
      cafeOpenEnd: engine.cafeOpenEnd,
      guardFormulas: formulas.guard,
      cafeFormulas: formulas.cafe,
      gratuitySettings: gratuity,
      welfareFundSettings: welfare,
      companyLogo: resolvedLogo,
      rankPay: rankPay as RankPay[],
      rankAddDraft: null,
    };

    applyDirtySnapshot(snap);
    return snap;
  }, [applyDirtySnapshot]);

  const reloadSettingsFromDb = useCallback(async () => {
    const snap = await hydrateAllSettings();
    setSavedSnapshot(serializeSettingsDirtySnapshot(snap));
    setSettingsHydrated(true);
  }, [hydrateAllSettings]);

  useEffect(() => {
    reloadSettingsFromDb().catch(() => {
      setSettingsHydrated(true);
    });
  }, [reloadSettingsFromDb]);

  useEffect(() => {
    fetchExecutiveSessionProfile()
      .then((profile) => {
        const rank = profile?.rank?.trim().toUpperCase() ?? '';
        setCanManageExecutiveRanks(rank === 'MD' || rank === 'OD');
      })
      .catch(() => setCanManageExecutiveRanks(false));
  }, []);

  const refreshAuditTrail = useCallback(async () => {
    try {
      setAuditTrail(await getSettingsAuditTrail());
    } catch {
      /* keep prior trail */
    }
  }, []);

  useEffect(() => {
    refreshAuditTrail().catch(() => undefined);
  }, [refreshAuditTrail]);

  useEffect(() => {
    const onVaultUnlocked = () => {
      setUnsavedSaveError((prev) =>
        prev && isVaultLockSaveError(prev) ? null : prev,
      );
      setRankMatrixError((prev) =>
        prev && isVaultLockSaveError(prev) ? '' : prev,
      );
    };
    window.addEventListener('executive-vault-unlocked', onVaultUnlocked);
    return () => window.removeEventListener('executive-vault-unlocked', onVaultUnlocked);
  }, []);

  useEffect(() => {
    if (!settingsHydrated || savedSnapshot !== null) return;
    setSavedSnapshot(currentSnapshot);
  }, [settingsHydrated, savedSnapshot, currentSnapshot]);

  const clearUnsavedPrompt = () => {
    setShowUnsavedDialog(false);
    setUnsavedSaveError(null);
    setPendingNavigation(null);
    setPendingTabSwitch(null);
  };

  const completePendingLeave = useCallback((tab: SettingsTab) => {
    if (GLOBAL_SETTINGS_WARNING_TABS[tab]) {
      setPendingTab(tab);
      setShowGlobalSettingsWarning(true);
      return;
    }
    setActiveTab(tab);
  }, []);

  const pushPendingLeaveRoute = useCallback(
    (href: string) => {
      leaveBypassRef.current = true;
      router.push(href);
      queueMicrotask(() => {
        leaveBypassRef.current = false;
      });
    },
    [router],
  );

  const finishPendingLeave = useCallback(
    (href: string | null, tab: SettingsTab | null) => {
      setPendingNavigation(null);
      setPendingTabSwitch(null);
      if (href) {
        pushPendingLeaveRoute(href);
        return;
      }
      if (tab) {
        completePendingLeave(tab);
      }
    },
    [completePendingLeave, pushPendingLeaveRoute],
  );

  const promptLeaveSettings = useCallback((href: string) => {
    setPendingNavigation(href);
    setPendingTabSwitch(null);
    setUnsavedSaveError(null);
    setShowUnsavedDialog(true);
  }, []);

  const requestLeaveSettings = useCallback(
    (href: string) => {
      if (!isDirty || leaveBypassRef.current) {
        router.push(href);
        return;
      }
      promptLeaveSettings(href);
    },
    [isDirty, promptLeaveSettings, router],
  );

  useEffect(() => {
    navGuardRef.current = {
      shouldBlock: (href) =>
        !leaveBypassRef.current && isDirty && !isInternalSettingsHref(href),
      onBlocked: promptLeaveSettings,
    };
    return () => {
      navGuardRef.current = null;
    };
  }, [isDirty, navGuardRef, promptLeaveSettings]);

  const requestTabChange = useCallback(
    (tab: SettingsTab) => {
      if (tab === activeTab) return;
      if (isDirty) {
        setPendingTabSwitch(tab);
        setPendingNavigation(null);
        setUnsavedSaveError(null);
        setShowUnsavedDialog(true);
        return;
      }
      completePendingLeave(tab);
    },
    [activeTab, completePendingLeave, isDirty],
  );

  const discardUnsavedChanges = async () => {
    const navHref = pendingNavigation;
    const tabSwitch = pendingTabSwitch;
    setUnsavedSaveError(null);
    try {
      await reloadSettingsFromDb();
      setShowUnsavedDialog(false);
      finishPendingLeave(navHref, tabSwitch);
    } catch {
      setUnsavedSaveError('Could not discard changes. Please try again.');
    }
  };

  useEffect(() => {
    if (!isDirty) return;

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!anchor || anchor.getAttribute('target') === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || isInternalSettingsHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      requestLeaveSettings(href);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isDirty, requestLeaveSettings]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const buildEngineConstantsPayload = () => ({
    cafeOtCutoffTime: s.cafeOtCutoffTime,
    invoiceDispatchDay: s.invoiceDispatchDay,
    payrollTargetDay: s.payrollTargetDay,
    collectionWarningDay: s.collectionWarningDay,
    smPayMode: s.smPayMode,
    smFixedBasic: s.smFixedBasic,
    smPerVisitBonus: s.smPerVisitBonus,
    fuelSurplusCorrection: s.fuelSurplusCorrection,
    smFuelAdvanceLkr: s.smFuelAdvanceLkr,
    smFuelPerKmLkr: s.smFuelPerKmLkr,
    cafeOtMaxMonthlyHours: s.cafeOtMaxMonthlyHours,
    cafeWeeklyOtThresholdHours: s.cafeWeeklyOtThresholdHours,
    enforceFlatSiteRate,
    allowPoyaOnFlatRate,
    requireDeductionMonthLock,
    uniformMonthlyInstalmentLkr,
    prevMonthRetentionThreshold: prevMonthThreshold,
    salaryMonthRetentionThreshold: salaryMonthThreshold,
    cafeOpenStart,
    cafeOpenEnd,
    smPreviewVisits: smVisits,
    hoPreviewSalary: hoSalary,
    guardPreviewQty,
    cafePreviewBasic,
    cafePreviewQty,
    cafePreviewOtHours,
  });

  const patchSavedSnapshot = useCallback(
    (patcher: (snap: SettingsDirtySnapshot) => void) => {
      if (!savedSnapshot) return;
      const snap = JSON.parse(savedSnapshot) as SettingsDirtySnapshot;
      patcher(snap);
      setSavedSnapshot(serializeSettingsDirtySnapshot(snap));
    },
    [savedSnapshot],
  );

  const patchSnapEngineConstants = useCallback(
    (snap: SettingsDirtySnapshot) => {
      snap.settings.cafeOtCutoffTime = s.cafeOtCutoffTime;
      snap.settings.invoiceDispatchDay = s.invoiceDispatchDay;
      snap.settings.payrollTargetDay = s.payrollTargetDay;
      snap.settings.collectionWarningDay = s.collectionWarningDay;
      snap.settings.smPayMode = s.smPayMode;
      snap.settings.smFixedBasic = s.smFixedBasic;
      snap.settings.smPerVisitBonus = s.smPerVisitBonus;
      snap.settings.fuelSurplusCorrection = s.fuelSurplusCorrection;
      snap.settings.smFuelAdvanceLkr = s.smFuelAdvanceLkr;
      snap.settings.smFuelPerKmLkr = s.smFuelPerKmLkr;
      snap.settings.cafeOtMaxMonthlyHours = s.cafeOtMaxMonthlyHours;
      snap.settings.cafeWeeklyOtThresholdHours = s.cafeWeeklyOtThresholdHours;
      snap.enforceFlatSiteRate = enforceFlatSiteRate;
      snap.allowPoyaOnFlatRate = allowPoyaOnFlatRate;
      snap.requireDeductionMonthLock = requireDeductionMonthLock;
      snap.uniformMonthlyInstalmentLkr = uniformMonthlyInstalmentLkr;
      snap.prevMonthThreshold = prevMonthThreshold;
      snap.salaryMonthThreshold = salaryMonthThreshold;
      snap.cafeOpenStart = cafeOpenStart;
      snap.cafeOpenEnd = cafeOpenEnd;
      snap.smVisits = smVisits;
      snap.hoSalary = hoSalary;
      snap.guardPreviewQty = guardPreviewQty;
      snap.cafePreviewBasic = cafePreviewBasic;
      snap.cafePreviewQty = cafePreviewQty;
      snap.cafePreviewOtHours = cafePreviewOtHours;
    },
    [
      s,
      enforceFlatSiteRate,
      allowPoyaOnFlatRate,
      requireDeductionMonthLock,
      uniformMonthlyInstalmentLkr,
      prevMonthThreshold,
      salaryMonthThreshold,
      cafeOpenStart,
      cafeOpenEnd,
      smVisits,
      hoSalary,
      guardPreviewQty,
      cafePreviewBasic,
      cafePreviewQty,
      cafePreviewOtHours,
    ],
  );

  const flashSectionSaved = (sectionId: SettingsSectionId) => {
    setSectionSaved((prev) => ({ ...prev, [sectionId]: true }));
    setTimeout(() => {
      setSectionSaved((prev) => ({ ...prev, [sectionId]: false }));
    }, 2500);
  };

  const sectionAudit = (sectionId: SettingsSectionId) => auditTrail[sectionId];

  const saveSettingsSection = async (
    sectionId: SettingsSectionId,
    options?: { quiet?: boolean },
  ): Promise<boolean> => {
    if (vaultBlocksSave) {
      vault?.requestUnlock();
      const message =
        'Vault is locked. Enter your 4-digit PIN in the unlock screen, then save this section again.';
      if (options?.quiet) {
        setUnsavedSaveError(message);
      } else {
        alert(message);
      }
      return false;
    }

    setSectionSaving(sectionId);
    const record = (label: string, res: { success: boolean; error?: string }) => {
      if (!res.success) failures.push(`${label}: ${res.error ?? 'unknown error'}`);
    };
    const failures: string[] = [];

    try {
      switch (sectionId) {
        case 'bankExport':
          record(
            'Bank export',
            await saveBankExportSettings({
              masterFormatId: masterBankFormat,
              enforceFormatGlobally: enforceBankFormat,
              isolateExternalBank,
            }),
          );
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.masterBankFormat = masterBankFormat;
              snap.enforceBankFormat = enforceBankFormat;
              snap.isolateExternalBank = isolateExternalBank;
            });
          }
          break;
        case 'statutory':
          record(
            'Invoice & taxes',
            await saveMdInvoiceConfig({
              vatRate: s.vatRate,
              ssclRate: s.ssclRate,
              headOffice: s.invoiceHeadOffice,
              telephone: s.invoiceTelephone,
              email: s.invoiceEmail,
              pvNumber: s.invoicePvNo,
              supplierTin: s.supplierTin,
              supplierAddress: s.supplierAddress,
            }),
          );
          record(
            'Payroll statutory',
            await savePayrollStatutorySettings({
              epfEmployeeRate: s.epfEmployeeRate,
              epfEmployerRate: s.epfEmployerRate,
              etfRate: s.etfRate,
              payrollEpfEmployer: s.payrollEpfEmployer,
              payrollEtfEmployer: s.payrollEtfEmployer,
              monthlyDaysDivisor: s.monthlyDaysDivisor,
              apitSlabs,
              stampDutyLkr: stampDutyAmount,
              stampDutyThresholdLkr,
            }),
          );
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.settings.vatRate = s.vatRate;
              snap.settings.ssclRate = s.ssclRate;
              snap.settings.invoiceHeadOffice = s.invoiceHeadOffice;
              snap.settings.invoiceTelephone = s.invoiceTelephone;
              snap.settings.invoiceEmail = s.invoiceEmail;
              snap.settings.invoicePvNo = s.invoicePvNo;
              snap.settings.supplierTin = s.supplierTin;
              snap.settings.supplierAddress = s.supplierAddress;
              snap.settings.epfEmployeeRate = s.epfEmployeeRate;
              snap.settings.epfEmployerRate = s.epfEmployerRate;
              snap.settings.etfRate = s.etfRate;
              snap.settings.payrollEpfEmployer = s.payrollEpfEmployer;
              snap.settings.payrollEtfEmployer = s.payrollEtfEmployer;
              snap.settings.monthlyDaysDivisor = s.monthlyDaysDivisor;
              snap.apitSlabs = apitSlabs;
              snap.stampDutyAmount = stampDutyAmount;
              snap.stampDutyThresholdLkr = stampDutyThresholdLkr;
            });
          }
          break;
        case 'payGroup':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'guardRetention':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'crossDeployment':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'cafeOtCutoff':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'billingCycle':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'cafeOperatingWindow':
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'cafeFormulas':
          record('Pay formulas', await savePayFormulasSettings({ guard: guardFormulas, cafe: cafeFormulas }));
          record('Engine constants', await saveMdEngineConstants(buildEngineConstantsPayload()));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.cafeFormulas = cafeFormulas;
              snap.guardFormulas = guardFormulas;
              patchSnapEngineConstants(snap);
            });
          }
          break;
        case 'guardFormulas':
          record('Pay formulas', await savePayFormulasSettings({ guard: guardFormulas, cafe: cafeFormulas }));
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.guardFormulas = guardFormulas;
              snap.cafeFormulas = cafeFormulas;
            });
          }
          break;
        case 'entityBranding': {
          record('Division names', await saveDivisionNames(entities));
          let resolvedLogo = companyLogo;
          if (companyLogo.startsWith('data:')) {
            const logoRes = await persistCompanyLogo(companyLogo);
            if (!logoRes.success) {
              failures.push(`Company logo: ${logoRes.error ?? 'upload failed'}`);
            } else if (logoRes.url) {
              resolvedLogo = logoRes.url;
              setCompanyLogo(logoRes.url);
              localStorage.setItem(LOGO_STORAGE_KEY, logoRes.url);
            }
          }
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.entities = entities;
              snap.companyLogo = resolvedLogo;
            });
          }
          break;
        }
        case 'rankPay': {
          let rankPayToSave = sanitizeRankPayMatrixEntries(
            rankPayWithPendingEdit(s.rankPay),
          ) as RankPay[];
          if (addingRankSection && newRankDraft.rankCode.trim() && newRankDraft.fullTitle.trim()) {
            rankPayToSave = sanitizeRankPayMatrixEntries([
              ...rankPayToSave,
              { id: `rp-${Date.now()}`, ...newRankDraft, salaryType: 'BANK' as const },
            ]) as RankPay[];
          }
          record('Rank pay matrix', await saveRankPayMatrix(rankPayToSave));
          if (!failures.length) {
            resetRankDraftUi();
            setS((prev) => ({ ...prev, rankPay: rankPayToSave }));
            patchSavedSnapshot((snap) => {
              snap.rankPay = rankPayToSave;
              snap.settings = { ...snap.settings, rankPay: rankPayToSave };
              snap.rankAddDraft = null;
            });
          }
          break;
        }
        case 'gratuity':
          record('Gratuity', await saveGratuitySettings(gratuitySettings));
          if (!failures.length) patchSavedSnapshot((snap) => { snap.gratuitySettings = gratuitySettings; });
          break;
        case 'welfareFund':
          record('Welfare fund', await saveWelfareFundSettings(welfareFundSettings));
          if (!failures.length) patchSavedSnapshot((snap) => { snap.welfareFundSettings = welfareFundSettings; });
          break;
        case 'geofence': {
          const radius = parseInt(defaultGeofenceRadiusM, 10);
          if (!Number.isFinite(radius)) {
            failures.push('Geofence: invalid radius');
          } else {
            record('Geofence default', await updateGeofenceSettings(radius));
            if (!failures.length) {
              patchSavedSnapshot((snap) => { snap.defaultGeofenceRadiusM = defaultGeofenceRadiusM; });
            }
          }
          break;
        }
        case 'internalWorkLocations': {
          const invalidBranch = [...internalWorkLocations.headOffice, ...internalWorkLocations.cafe].find(
            (loc) => !loc.name.trim() || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude),
          );
          if (invalidBranch) {
            failures.push('Internal locations: each branch needs a name and GPS coordinates');
          } else {
            record('Internal work locations', await saveInternalWorkLocations(internalWorkLocations));
            if (!failures.length) {
              patchSavedSnapshot((snap) => { snap.internalWorkLocations = internalWorkLocations; });
            }
          }
          break;
        }
        case 'shiftTimes':
          record(
            'Guard shift times',
            await updateShiftSettings(dayShiftStart, dayShiftEnd, nightShiftStart, nightShiftEnd),
          );
          if (!failures.length) {
            patchSavedSnapshot((snap) => {
              snap.dayShiftStart = dayShiftStart;
              snap.dayShiftEnd = dayShiftEnd;
              snap.nightShiftStart = nightShiftStart;
              snap.nightShiftEnd = nightShiftEnd;
            });
          }
          break;
        default:
          break;
      }

      if (failures.length > 0) {
        if (failuresIncludeVaultLock(failures)) {
          vault?.requestUnlock();
        }
        const message = failuresIncludeVaultLock(failures)
          ? 'Vault is locked. Enter your 4-digit PIN in the unlock screen, then save this section again.'
          : `Could not save this section:\n\n${failures.join('\n')}`;
        if (options?.quiet) {
          setUnsavedSaveError(message);
        } else {
          alert(message);
        }
        return false;
      }

      await refreshAuditTrail();
      flashSectionSaved(sectionId);
      return true;
    } catch {
      alert('Failed to save this section. Please try again.');
      return false;
    } finally {
      setSectionSaving(null);
    }
  };

  const saveSection = (sectionId: SettingsSectionId) => () => {
    void saveSettingsSection(sectionId);
  };

  const handleSave = async (options?: { quiet?: boolean }): Promise<boolean> => {
    if (vaultBlocksSave) {
      vault?.requestUnlock();
      const message =
        'Vault is locked. Enter your 4-digit PIN in the unlock screen, then try saving again.';
      if (options?.quiet) {
        setUnsavedSaveError(message);
      } else {
        alert(message);
      }
      return false;
    }

    const sectionsToSave = listDirtySettingsSections(savedSnapshot, currentSnapshot);
    if (sectionsToSave.length === 0) return true;

    setSaving(true);
    if (options?.quiet) {
      setUnsavedSaveError(null);
    }

    try {
      for (const sectionId of sectionsToSave) {
        const ok = await saveSettingsSection(sectionId, options);
        if (!ok) return false;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return true;
    } catch {
      const message = 'Failed to save settings. Please try again.';
      if (options?.quiet) {
        setUnsavedSaveError(message);
      } else {
        alert(message);
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveUnsavedChangesAndLeave = async () => {
    if (vaultBlocksSave) {
      vault?.requestUnlock();
      setUnsavedSaveError(
        'Vault is locked. Enter your 4-digit PIN in the unlock screen, then tap Save & Leave again.',
      );
      return;
    }

    setUnsavedSaveError(null);
    const navHref = pendingNavigation;
    const tabSwitch = pendingTabSwitch;
    const ok = await handleSave({ quiet: true });
    if (!ok) return;
    setShowUnsavedDialog(false);
    finishPendingLeave(navHref, tabSwitch);
  };

  const SM_MODES: { id: SmPayMode; label: string; desc: string }[] = [
    { id: 'FIXED_ONLY',          label: 'Fixed Basic Only',         desc: 'Monthly flat salary, no per-visit component' },
    { id: 'PER_VISIT_ONLY',      label: 'Per-Visit Bonus Only',     desc: 'Paid purely based on patrol visits logged' },
    { id: 'FIXED_AND_PER_VISIT', label: 'Fixed Basic + Per-Visit',  desc: 'Combination: base salary + per-visit top-up' },
  ];

  return (
    <>
      <SaveToast visible={saved} message="All settings saved to engine" />

      {/* ── Unsaved changes dialog ── */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/[0.05]">
            <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-300/80 bg-amber-100/80">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-widest text-slate-900">Unsaved Changes</h3>
                <p className="text-sm font-medium text-slate-600">Settings &amp; Compensations</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {dirtySections.length === 1
                  ? 'The following section has changes that are not saved yet:'
                  : 'The following sections have changes that are not saved yet:'}
              </p>
              <ul className="mt-4 space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
                {dirtySections.map((sectionId) => (
                  <li
                    key={sectionId}
                    className="flex items-start gap-2 text-sm font-semibold text-amber-950"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                    {SETTINGS_SECTION_LABELS[sectionId]}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-medium text-slate-600 leading-relaxed">
                Save them before leaving, discard and revert to the last saved version, or keep editing.
              </p>
              {vaultBlocksSave ? (
                <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] px-4 py-3">
                  <p className="text-sm font-semibold text-[color:var(--cvs-accent)] leading-relaxed">
                    Vault is locked. Unlock with your 4-digit PIN before saving settings.
                  </p>
                  <button
                    type="button"
                    onClick={() => vault?.requestUnlock()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--cvs-accent)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[color:var(--cvs-accent-hover)] transition-all"
                  >
                    <Lock className="h-4 w-4" />
                    Unlock Vault
                  </button>
                </div>
              ) : null}
              {unsavedSaveError ? (
                <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 whitespace-pre-line">
                  {unsavedSaveError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={clearUnsavedPrompt}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={() => void discardUnsavedChanges()}
                  disabled={saving}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 transition-all disabled:opacity-50"
                >
                  Discard Changes
                </button>
                <button
                  type="button"
                  onClick={() => void saveUnsavedChangesAndLeave()}
                  disabled={saving || vaultBlocksSave}
                  title={vaultBlocksSave ? 'Unlock the vault before saving' : undefined}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save & Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Global settings warning dialog (Finance, Catalogs, RBAC, Operations) ── */}
      {showGlobalSettingsWarning && pendingTab && GLOBAL_SETTINGS_WARNING_TABS[pendingTab] && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-amber-300/80 bg-white shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/[0.05]">
            <div className="flex items-center gap-3 border-b border-amber-200/80 bg-amber-50/80 px-6 py-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-300/80 bg-amber-100/80">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-widest text-amber-900">
                  Global Settings Warning
                </h3>
                <p className="text-sm font-medium text-amber-700">
                  {GLOBAL_SETTINGS_WARNING_TABS[pendingTab]!.subtitle}
                </p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                Changes made in this section will take effect{' '}
                <span className="font-black text-slate-900">immediately across all portals</span>
                {' '}— including {GLOBAL_SETTINGS_WARNING_TABS[pendingTab]!.portals} — the moment you
                commit them.
              </p>
              <p className="mt-3 text-sm font-semibold text-rose-600">
                {GLOBAL_SETTINGS_WARNING_TABS[pendingTab]!.caution}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowGlobalSettingsWarning(false);
                    setPendingTab(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingTab) setActiveTab(pendingTab);
                    setPendingTab(null);
                    setShowGlobalSettingsWarning(false);
                  }}
                  className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/25 hover:bg-amber-500 transition-all"
                >
                  I Understand — Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExecutivePageShell>
        <ExecutivePageHeader
          title="Settings & Compensations"
          subtitle={
            isDirty
              ? `Unsaved: ${dirtySections.map((id) => SETTINGS_SECTION_LABELS[id]).join(' · ')}`
              : 'Master Configurator · each section saves independently'
          }
          toolbar={
            <ExecutivePageToolbar>
              {SETTINGS_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => requestTabChange(id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                    activeTab === id
                      ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </ExecutivePageToolbar>
          }
        />

        <ExecutivePageBody>

          {activeTab === 'CATALOGS' && (
            <AssetCatalogsPanel />
          )}

          {activeTab === 'GENERAL' && (
            <div className="space-y-8">

              <SettingsSectionHeading
                title="Statutory, taxes & bank export"
                sub="VAT, SSCL, EPF/ETF, invoice letterhead, and payroll bank file format"
              />

              {/* ── Corporate Bank Integration ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Landmark}
                  iconClassName="border-indigo-200/80 bg-indigo-50/80 text-indigo-700"
                  title="Corporate Bank Integration"
                  sub="Set the master bank export format and enforce it globally across all payroll desks"
                  sectionId="bankExport"
                  audit={sectionAudit('bankExport')}
                  saving={sectionSaving === 'bankExport'}
                  saved={sectionSaved.bankExport}
                  onSave={saveSection('bankExport')}
                />

                <div className="p-6 space-y-6">
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      <Banknote className="h-3.5 w-3.5 text-indigo-600" />
                      Master Export Format
                    </label>
                    <select
                      value={masterBankFormat}
                      onChange={(e) => setMasterBankFormat(e.target.value as BankExportFormatId)}
                      className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all sm:max-w-sm"
                    >
                      {MASTER_BANK_FORMATS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-sm font-medium text-slate-600">
                      Determines the file format generated when the FM locks any payroll ledger and exports the bank transfer file.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-white/50 px-5 py-4 shadow-inner">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Enforce Format Globally</p>
                        <p className="mt-0.5 text-sm font-medium text-slate-600">
                          {enforceBankFormat
                            ? 'Active — the FM payroll desk cannot override the bank format. The dropdown is replaced with a locked badge.'
                            : 'Inactive — the FM can freely select any bank format per payroll batch.'}
                        </p>
                      </div>
                      <button type="button" onClick={() => setEnforceBankFormat((v) => !v)} className="flex-shrink-0">
                        {enforceBankFormat
                          ? <ToggleRight className="h-10 w-10 text-indigo-600" />
                          : <ToggleLeft  className="h-10 w-10 text-slate-500" />
                        }
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                    enforceBankFormat
                      ? 'border-indigo-200/80 bg-indigo-50/60 text-indigo-900'
                      : 'border-slate-200/60 bg-slate-50/60 text-slate-600'
                  }`}>
                    {enforceBankFormat ? (
                      <span className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-indigo-700 flex-shrink-0" />
                        FM payroll desk is locked to{' '}
                        <strong>{MASTER_BANK_FORMATS.find((f) => f.id === masterBankFormat)?.label}</strong>.
                        The format selector will be replaced by a read-only badge.
                      </span>
                    ) : (
                      'Toggle ON to enforce the selected format across all payroll batches.'
                    )}
                  </div>

                  {/* ── Account Routing & Batch Splitting ── */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 mt-6 flex items-center gap-1.5">
                      <SplitSquareHorizontal className="h-3.5 w-3.5 text-slate-400" />
                      Account Routing &amp; Batch Splitting
                    </p>

                    {/* Isolate External Bank Transfers toggle */}
                    <div className="rounded-2xl border border-slate-200/70 bg-white/50 px-5 py-4 shadow-inner mb-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-slate-900">Isolate External Bank Transfers</p>
                          <p className="mt-0.5 text-sm font-medium text-slate-600">
                            Automatically splits non-Commercial Bank accounts into a separate &apos;Other Banks&apos; export list during payroll finalization.
                          </p>
                        </div>
                        <button type="button" onClick={() => setIsolateExternalBank((v) => !v)} className="flex-shrink-0">
                          {isolateExternalBank
                            ? <ToggleRight className="h-10 w-10 text-indigo-600" />
                            : <ToggleLeft  className="h-10 w-10 text-slate-500" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Entity Batching Strategy */}
                    <div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                          <p className="text-sm font-bold text-slate-800">Field Operations Batch</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">Guards</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 text-sky-500 flex-shrink-0" />
                          <p className="text-sm font-bold text-slate-800">CVS Payroll Group</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">HQ Staff</span>
                          <span className="text-xs font-bold text-slate-400">+</span>
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">SM Group</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <p className="text-sm font-bold text-slate-800">Café Operations Batch</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">Café Staff</span>
                        </div>
                      </div>

                      <p className="mt-2 text-xs font-medium text-slate-500">
                        The FM payroll desk will automatically generate distinct bank export files based on these entity groupings.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Changing the master format after payroll batches are in review may cause file mismatch
                      with the bank&apos;s portal. Coordinate with the FM before switching formats mid-cycle.
                    </span>
                  </div>

                  <p className="text-sm font-medium text-slate-500">
                    Bank export settings apply to the FM payroll desk when you save this section.
                  </p>
                </div>
              </ExecutiveGlassCard>

              {/* ── Global Statutory Modifiers ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Percent}
                  iconClassName="border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
                  title="Global Statutory Modifiers"
                  sub="Invoice taxes, payroll deduction percentages, and daily rate divisor applied across all companies"
                  sectionId="statutory"
                  audit={sectionAudit('statutory')}
                  saving={sectionSaving === 'statutory'}
                  saved={sectionSaved.statutory}
                  onSave={saveSection('statutory')}
                />

                <div className="p-6 space-y-6">
                  <div className="flex flex-col gap-5 w-full">
                    {/* ROW 1: Corporate Taxes */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">Invoice & Corporate Taxes</h4>
                      <div className="flex items-center gap-6">
                        {/* VAT */}
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="inline-flex rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-2 py-0.5 text-sm font-black text-indigo-800">VAT</span>
                            <span className="text-sm font-medium text-slate-600">Invoice tax</span>
                          </div>
                          <div className="relative">
                            <input type="number" step="0.01" min={0} max={50} value={s.vatRate} onChange={(e) => set('vatRate', parseFloat(e.target.value) || 0)} className={`${inputCls} pr-8`} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-600">%</span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-600">Current: {s.vatRate}%</p>
                        </div>
                        {/* SSCL */}
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="inline-flex rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-sm font-black text-amber-800">SSCL</span>
                            <span className="text-sm font-medium text-slate-600">Social Security</span>
                          </div>
                          <div className="relative">
                            <input type="number" step="0.01" min={0} max={50} value={s.ssclRate} onChange={(e) => set('ssclRate', parseFloat(e.target.value) || 0)} className={`${inputCls} pr-8`} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-600">%</span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-600">Current: {s.ssclRate}%</p>
                        </div>
                      </div>
                      <p className="mt-3 text-[10px] font-semibold text-indigo-700">
                        Saved to database — Invoice Desk uses these rates on every tax invoice.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">
                        Tax Invoice Letterhead
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Head Office</label>
                          <input type="text" value={s.invoiceHeadOffice} onChange={(e) => set('invoiceHeadOffice', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Telephone</label>
                          <input type="text" value={s.invoiceTelephone} onChange={(e) => set('invoiceTelephone', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">E-mail</label>
                          <input type="email" value={s.invoiceEmail} onChange={(e) => set('invoiceEmail', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">PV No.</label>
                          <input type="text" value={s.invoicePvNo} onChange={(e) => set('invoicePvNo', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Supplier&rsquo;s TIN</label>
                          <input type="text" value={s.supplierTin} onChange={(e) => set('supplierTin', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Supplier address (on invoice)</label>
                          <input type="text" value={s.supplierAddress} onChange={(e) => set('supplierAddress', e.target.value)} className={`${inputCls} mt-1`} />
                        </div>
                      </div>
                    </div>

                    {/* ROW 2: Payroll Funds */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">Payroll Statutory Funds</h4>
                      <div className="flex items-center gap-6">
                        {/* EPF Employee */}
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="inline-flex rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-sm font-black text-emerald-800">EPF</span>
                            <span className="text-sm font-medium text-slate-600">Employee (8%)</span>
                          </div>
                          <div className="relative">
                            <input type="number" step="0.5" min={0} max={20} value={s.epfEmployeeRate} onChange={(e) => set('epfEmployeeRate', parseFloat(e.target.value) || 0)} className={`${inputCls} pr-8`} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-600">%</span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-600">Deducted from employee</p>
                        </div>
                        {/* EPF Employer */}
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="inline-flex rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-sm font-black text-emerald-800">EPF</span>
                            <span className="text-sm font-medium text-slate-600">Employer (12%)</span>
                          </div>
                          <div className="relative">
                            <input type="number" step="0.5" min={0} max={30} value={s.epfEmployerRate} onChange={(e) => set('epfEmployerRate', parseFloat(e.target.value) || 0)} className={`${inputCls} pr-8`} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-600">%</span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-600">Company contribution</p>
                        </div>
                        {/* ETF */}
                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="inline-flex rounded-lg border border-teal-200/80 bg-teal-50/80 px-2 py-0.5 text-sm font-black text-teal-800">ETF</span>
                            <span className="text-sm font-medium text-slate-600">Trust Fund (3%)</span>
                          </div>
                          <div className="relative">
                            <input type="number" step="0.5" min={0} max={10} value={s.etfRate} onChange={(e) => set('etfRate', parseFloat(e.target.value) || 0)} className={`${inputCls} pr-8`} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-600">%</span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-600">Employer only</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Additional Statutory Deductions: APIT & Stamp Duty ── */}
                  <div className="border-t border-slate-200/70 pt-5 space-y-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Additional Statutory Deductions</p>

                    {/* APIT */}
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="inline-flex rounded-lg border border-violet-200/80 bg-violet-50/80 px-2 py-0.5 text-sm font-black text-violet-800">APIT</span>
                        <span className="text-sm font-semibold text-slate-700">Income Tax</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                          <div className="min-w-[520px]">
                          {/* Table header */}
                          <div className="grid grid-cols-[2fr_1.3fr_80px_90px_32px] border-b border-slate-200/70 bg-slate-100/80 px-3 py-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Income Tier (Monthly)</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Taxable Portion</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 text-center">Tax Rate</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 text-right pr-1">Max Tax/Slab</span>
                            <span />
                          </div>
                          {/* Slab rows */}
                          {apitSlabs.map((slab, index) => {
                            const width = slab.max !== null ? slab.max - slab.min : null;
                            const incomeTierLabel =
                              slab.min === 0 && slab.max !== null
                                ? `First LKR ${slab.max.toLocaleString()}`
                                : slab.max !== null
                                ? `Next LKR ${width!.toLocaleString()} (Up to ${slab.max.toLocaleString()})`
                                : `Balance (Above ${slab.min.toLocaleString()})`;
                            const taxablePortionLabel =
                              slab.rate === 0
                                ? 'Tax-Free Allowance'
                                : slab.max !== null
                                ? `LKR ${width!.toLocaleString()}`
                                : 'Remaining Amount';
                            const maxTaxLabel =
                              slab.rate === 0
                                ? 'LKR 0'
                                : slab.max !== null
                                ? `LKR ${Math.round(width! * slab.rate / 100).toLocaleString()}`
                                : 'No Limit';
                            return (
                              <div
                                key={slab.id}
                                className="grid grid-cols-[2fr_1.3fr_80px_90px_32px] items-center border-b border-slate-100/80 px-3 py-2.5 last:border-b-0 hover:bg-white/50 transition-colors"
                              >
                                {/* Income Tier */}
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-semibold text-slate-700 leading-tight">{incomeTierLabel}</span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <input
                                      type="number"
                                      value={slab.min}
                                      onChange={(e) =>
                                        setApitSlabs((prev) =>
                                          prev.map((sl, i) => i === index ? { ...sl, min: Number(e.target.value) } : sl)
                                        )
                                      }
                                      className="w-[68px] rounded border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 focus:border-violet-400 focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-400">→</span>
                                    <input
                                      type="number"
                                      value={slab.max ?? ''}
                                      onChange={(e) =>
                                        setApitSlabs((prev) =>
                                          prev.map((sl, i) =>
                                            i === index
                                              ? { ...sl, max: e.target.value === '' ? null : Number(e.target.value) }
                                              : sl
                                          )
                                        )
                                      }
                                      placeholder="∞"
                                      className="w-[68px] rounded border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 placeholder-slate-300 focus:border-violet-400 focus:outline-none"
                                    />
                                  </div>
                                </div>
                                {/* Taxable Portion */}
                                <div>
                                  <span className={`text-xs font-semibold ${slab.rate === 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {taxablePortionLabel}
                                  </span>
                                </div>
                                {/* Tax Rate */}
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    value={slab.rate}
                                    onChange={(e) =>
                                      setApitSlabs((prev) =>
                                        prev.map((sl, i) => i === index ? { ...sl, rate: Number(e.target.value) } : sl)
                                      )
                                    }
                                    className="w-10 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs font-black text-violet-700 text-center focus:border-violet-400 focus:outline-none"
                                  />
                                  <span className="text-xs font-bold text-slate-500">%</span>
                                </div>
                                {/* Max Tax per Slab */}
                                <div className="text-right pr-1">
                                  <span className={`text-xs font-bold tabular-nums ${slab.max === null && slab.rate > 0 ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                                    {maxTaxLabel}
                                  </span>
                                </div>
                                {/* Delete */}
                                <div className="flex items-center justify-center">
                                  {apitSlabs.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setApitSlabs((prev) => prev.filter((_, i) => i !== index))}
                                      className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setApitSlabs((prev) => [
                              ...prev,
                              { id: Date.now(), min: 0, max: null, rate: 0 },
                            ])
                          }
                          className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Add Tax Slab
                        </button>
                        <p className="mt-1.5 text-xs font-medium text-slate-500">APIT slabs persist to the database and drive payroll deductions.</p>
                      </div>
                    </div>

                    {/* Stamp Duty */}
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="inline-flex rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-sm font-black text-amber-800">STAMP</span>
                        <span className="text-sm font-semibold text-slate-700">Stamp Duty</span>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">LKR</span>
                            <input
                              type="number"
                              min={0}
                              value={stampDutyAmount}
                              onChange={(e) => setStampDutyAmount(Math.max(0, Number(e.target.value) || 0))}
                              className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                              Apply when gross ≥
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">LKR</span>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={stampDutyThresholdLkr}
                              onChange={(e) =>
                                setStampDutyThresholdLkr(Math.max(0, Number(e.target.value) || 0))
                              }
                              className="w-28 px-2 py-1 text-xs font-bold border border-slate-300 rounded bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                        </div>
                        <p className="text-xs font-medium text-slate-500">
                          Fixed deduction of LKR {stampDutyAmount.toLocaleString()} applied when monthly gross is at or above LKR {stampDutyThresholdLkr.toLocaleString()}. Used in payroll, payslips, and wage simulations below.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Days Divisor */}
                  <div className="border-t border-slate-200/70 pt-5">
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      <Calculator className="h-3.5 w-3.5 text-violet-600" />
                      Standard Monthly Days Divisor
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        step="1"
                        min={20}
                        max={31}
                        value={s.monthlyDaysDivisor}
                        onChange={(e) => set('monthlyDaysDivisor', parseInt(e.target.value, 10) || 26)}
                        className={`${inputCls} w-28 text-center`}
                      />
                      <p className="text-sm font-medium text-slate-600">Daily rate = Basic &divide; this divisor &nbsp;(standard: 26 working days)</p>
                    </div>
                  </div>

                </div>
              </ExecutiveGlassCard>

              <SettingsSectionHeading
                title="Pay architecture by operational group"
                sub="SM compensation mode, HO flat salary rules, café OT cap, and cross-deployment loaned-guard pay"
              />

              {/* ── Corporate Pay Group Mapping ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Briefcase}
                  iconClassName="border-violet-200/80 bg-violet-50/80 text-violet-700"
                  title="Corporate Pay Group Mapping"
                  sub="Canonical compensation architecture governing how each operational group is paid"
                  sectionId="payGroup"
                  audit={sectionAudit('payGroup')}
                  saving={sectionSaving === 'payGroup'}
                  saved={sectionSaved.payGroup}
                  onSave={saveSection('payGroup')}
                />

                <div className="p-6 space-y-4">

                  {/* Block 1: Guard (Field Operations) */}
                  <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-100/80">
                        <Shield className="h-5 w-5 text-blue-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800">Guard (Field Operations)</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Pay dictated by Dynamic Day-Type Formula Engine — daily rate is calculated from the guard&apos;s basic salary, varying by day type: weekday, Sunday, Poya, public holiday, and Saturday.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-blue-50 border border-blue-200/70 rounded text-xs font-bold text-blue-700 flex items-center gap-1">
                            <Sun className="h-3 w-3" /> Weekday: 1× daily rate
                          </span>
                          <span className="px-3 py-1 bg-indigo-50 border border-indigo-200/70 rounded text-xs font-bold text-indigo-700 flex items-center gap-1">
                            <Moon className="h-3 w-3" /> Sunday: statutory OT bundle
                          </span>
                          <span className="px-3 py-1 bg-rose-50 border border-rose-200/70 rounded text-xs font-bold text-rose-700 flex items-center gap-1">
                            <Star className="h-3 w-3" /> Poya: 1.5× daily + OT
                          </span>
                          <span className="px-3 py-1 bg-violet-50 border border-violet-200/70 rounded text-xs font-bold text-violet-700 flex items-center gap-1">
                            <Flag className="h-3 w-3" /> Public Holiday: full day formula
                          </span>
                          <span className="px-3 py-1 bg-slate-50 border border-slate-200/70 rounded text-xs font-bold text-slate-600 flex items-center gap-1">
                            No OT — attendance-based
                          </span>
                        </div>
                        <div className="mt-3 rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-2">Poya Day Formula</p>
                          <p className="font-mono text-xs font-bold text-slate-800 break-all">{guardFormulas.poyaDay}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            1.5× daily rate plus statutory OT component — editable in Guard Pay Formulas below.
                          </p>
                          <p className="mt-1 font-mono text-[10px] tabular-nums text-blue-800">
                            @ B = LKR {guardPreviewBasic.toLocaleString()}: {fmtSimLKR(evaluateFormulaAtB(guardFormulas.poyaDay, guardPreviewBasic))}
                          </p>
                        </div>
                        {/* Month Simulation Preview */}
                        <div className="mt-3">
                          <MonthSimulator
                            basic={guardPreviewBasic}
                            qty={guardPreviewQty}
                            onBasicChange={setGuardPreviewBasic}
                            onQtyChange={setGuardPreviewQty}
                            guardFormulas={guardFormulas}
                            apitSlabs={apitSlabs}
                            stampDutyAmount={stampDutyAmount}
                            stampDutyThresholdLkr={stampDutyThresholdLkr}
                          />
                          <p className="mt-1.5 text-xs font-medium text-slate-500">
                            Month simulation counts persist when you save this section.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Block 2: Sector Managers */}
                  <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-100/80">
                        <Users className="h-5 w-5 text-indigo-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800">Sector Managers (SM)</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Pay dictated by Global SM Compensation Settings (Fixed Base vs. Per-Visit).</p>

                        {/* SM Pay Mode Selector — nested inline */}
                        <div className="mt-4 rounded-xl border border-indigo-200/60 bg-white/60 p-4">
                          <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">Compensation Mode</p>
                          <div className="space-y-2">
                            {SM_MODES.map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() => set('smPayMode', mode.id)}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                                  s.smPayMode === mode.id
                                    ? 'border-indigo-300/80 bg-indigo-50/90 shadow-sm'
                                    : 'border-slate-200/60 bg-white/50 hover:bg-white/80'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                                    s.smPayMode === mode.id
                                      ? 'border-indigo-600 bg-indigo-600 shadow-[0_0_6px_rgba(99,102,241,0.5)]'
                                      : 'border-slate-300 bg-white'
                                  }`} />
                                  <div>
                                    <p className={`text-sm font-bold ${s.smPayMode === mode.id ? 'text-indigo-900' : 'text-slate-800'}`}>{mode.label}</p>
                                    <p className="text-xs text-slate-500">{mode.desc}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-indigo-200/80 bg-indigo-50/60 px-3 py-2.5">
                            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-600" />
                            <p className="text-xs font-semibold text-indigo-800">
                              Basic Pay is dynamically pulled from the Master Nominal Roll (HR). Site bonuses are pulled from individual Site Profiles.
                            </p>
                          </div>
                          {/* SM Live Wage Preview */}
                          <div className="bg-slate-100 border border-slate-200 rounded-md p-3 mt-3 shadow-inner">
                            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                              <Calculator className="h-3 w-3 flex-shrink-0" />
                              Live Wage Preview
                            </p>
                            {/* Formula input row — inputs shown/hidden based on active compensation mode */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              {s.smPayMode !== 'PER_VISIT_ONLY' && (
                                <div className="flex flex-col gap-0.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fixed Basic</p>
                                  <input
                                    type="number"
                                    value={s.smFixedBasic}
                                    onChange={(e) => set('smFixedBasic', parseInt(e.target.value, 10) || 0)}
                                    className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold w-24 text-sm"
                                  />
                                </div>
                              )}
                              {s.smPayMode === 'FIXED_AND_PER_VISIT' && (
                                <>
                                  <span className="text-sm font-bold text-slate-500 mt-4">+</span>
                                  <span className="text-sm font-bold text-slate-400 mt-4">(</span>
                                </>
                              )}
                              {s.smPayMode !== 'FIXED_ONLY' && (
                                <>
                                  <div className="flex flex-col gap-0.5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Visits</p>
                                    <input
                                      type="number"
                                      value={smVisits}
                                      onChange={(e) => setSmVisits(parseInt(e.target.value, 10) || 0)}
                                      className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold w-20 text-sm"
                                    />
                                  </div>
                                  <span className="text-sm font-bold text-slate-500 mt-4">&times;</span>
                                  <div className="flex flex-col gap-0.5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Rate / Visit</p>
                                    <input
                                      type="number"
                                      value={s.smPerVisitBonus}
                                      onChange={(e) => set('smPerVisitBonus', parseInt(e.target.value, 10) || 0)}
                                      className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold w-24 text-sm"
                                    />
                                  </div>
                                  {s.smPayMode === 'FIXED_AND_PER_VISIT' && (
                                    <span className="text-sm font-bold text-slate-400 mt-4">)</span>
                                  )}
                                </>
                              )}
                            </div>
                            {(() => {
                              const visitIncome = smVisits * s.smPerVisitBonus;
                              const gross =
                                s.smPayMode === 'FIXED_ONLY'
                                  ? s.smFixedBasic
                                  : s.smPayMode === 'PER_VISIT_ONLY'
                                    ? visitIncome
                                    : s.smFixedBasic + visitIncome;
                              const epfEmp      = Math.round(gross * s.epfEmployeeRate / 100);
                              const epfEr       = Math.round(gross * s.epfEmployerRate / 100);
                              const etf         = Math.round(gross * s.etfRate / 100);
                              const apit        = calcApit(gross, apitSlabs);
                              const stampDuty   = calcStampDutyLkr(
                                gross,
                                stampDutyAmount,
                                stampDutyThresholdLkr,
                              );
                              const net         = gross - epfEmp - apit - stampDuty;
                              const breakdown =
                                s.smPayMode === 'FIXED_ONLY'
                                  ? 'Fixed salary only'
                                  : s.smPayMode === 'PER_VISIT_ONLY'
                                    ? `${smVisits} visits × LKR ${s.smPerVisitBonus.toLocaleString()}`
                                    : `LKR ${s.smFixedBasic.toLocaleString()} + (${smVisits} visits × LKR ${s.smPerVisitBonus.toLocaleString()})`;
                              return (
                                <div className="space-y-2">
                                  <div className="border-b border-slate-200 pb-2 mb-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Gross</p>
                                    <p className="mt-0.5 text-sm tabular-nums font-black text-indigo-800">LKR {gross.toLocaleString()}</p>
                                    <p className="text-[9px] font-medium text-slate-400 mt-0.5">{breakdown}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    <div className="min-w-[130px]">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">EPF 8% (Deducted)</p>
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">− LKR {epfEmp.toLocaleString()}</p>
                                    </div>
                                    {apit > 0 && (
                                      <div className="min-w-[130px]">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">APIT (Deducted)</p>
                                        <p className="mt-0.5 text-xs tabular-nums font-semibold text-violet-700">− LKR {apit.toLocaleString()}</p>
                                      </div>
                                    )}
                                    <div className="min-w-[130px]">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Stamp Duty (Deducted)</p>
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">
                                        {stampDuty > 0 ? `− LKR ${stampDuty.toLocaleString()}` : '—'}
                                      </p>
                                    </div>
                                    <div className="min-w-[130px]">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Net Take-Home</p>
                                      <p className="mt-0.5 text-xs tabular-nums font-black text-slate-900">LKR {net.toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <div className="border-t border-slate-200 pt-2 flex flex-wrap gap-3">
                                    <div className="min-w-[130px]">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-teal-600">EPF 12% (Company Cost)</p>
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-teal-700">LKR {epfEr.toLocaleString()}</p>
                                    </div>
                                    <div className="min-w-[130px]">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-teal-600">ETF 3% (Company Cost)</p>
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-teal-700">LKR {etf.toLocaleString()}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Block 3: Head Office (HO) */}
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80">
                        <Building2 className="h-5 w-5 text-slate-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800">Head Office (HO)</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Flat Monthly Salary. Zero OT applied. Ad-hoc expenses strictly via FM/MD approval vault.</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 rounded border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-bold text-slate-700">
                            Flat Monthly Salary
                          </span>
                          <span className="flex items-center gap-1 rounded border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-bold text-slate-700">
                            Zero OT
                          </span>
                          <span className="flex items-center gap-1 rounded border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-bold text-slate-700">
                            FM/MD Approval Vault Only
                          </span>
                          <button
                            type="button"
                            onClick={() => scrollToRankPaySection('head-office')}
                            className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] px-3 py-1 text-xs font-bold text-[color:var(--cvs-accent)] transition-all hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent-hover)]"
                          >
                            Manage HO ranks
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          HO pay policy is fixed. Edit rank basic pay in the Master Rank ledger below.
                        </p>
                        {/* HO Live Wage Preview */}
                        <div className="bg-slate-100 border border-slate-200 rounded-md p-3 mt-3 shadow-inner">
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                              <Calculator className="h-3 w-3 flex-shrink-0" />
                              Live Wage Preview
                            </p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Salary</p>
                              <input
                                type="number"
                                value={hoSalary}
                                onChange={(e) => setHoSalary(parseInt(e.target.value, 10) || 0)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold w-28 text-xs"
                              />
                            </div>
                          </div>
                          {(() => {
                            const basic      = hoSalary;
                            const epfEmp     = Math.round(basic * s.epfEmployeeRate / 100);
                            const epfEr      = Math.round(basic * s.epfEmployerRate / 100);
                            const etf        = Math.round(basic * s.etfRate / 100);
                            const apit       = calcApit(basic, apitSlabs);
                            const stampDuty  = calcStampDutyLkr(
                              basic,
                              stampDutyAmount,
                              stampDutyThresholdLkr,
                            );
                            const net        = basic - epfEmp - apit - stampDuty;
                            return (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-3">
                                  {apit > 0 && (
                                    <div className="min-w-[130px]">
                                      <div className="flex items-center gap-1">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">APIT (Deducted)</p>
                                        <span className="inline-flex rounded border border-violet-200/80 bg-violet-50/80 px-1 py-px text-[8px] font-black text-violet-700">Active</span>
                                      </div>
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-violet-700">− LKR {apit.toLocaleString()}</p>
                                    </div>
                                  )}
                                  <div className="min-w-[130px]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">EPF 8% (Deducted)</p>
                                    <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">− LKR {epfEmp.toLocaleString()}</p>
                                  </div>
                                  <div className="min-w-[130px]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Stamp Duty (Deducted)</p>
                                    <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">
                                      {stampDuty > 0 ? `− LKR ${stampDuty.toLocaleString()}` : '—'}
                                    </p>
                                  </div>
                                  <div className="min-w-[130px]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Net Take-Home</p>
                                    <p className="mt-0.5 text-xs tabular-nums font-black text-slate-900">LKR {net.toLocaleString()}</p>
                                  </div>
                                </div>
                                <div className="border-t border-slate-200 pt-2 flex flex-wrap gap-3">
                                  <div className="min-w-[130px]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-teal-600">EPF 12% (Company Cost)</p>
                                    <p className="mt-0.5 text-xs tabular-nums font-semibold text-teal-700">LKR {epfEr.toLocaleString()}</p>
                                  </div>
                                  <div className="min-w-[130px]">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-teal-600">ETF 3% (Company Cost)</p>
                                    <p className="mt-0.5 text-xs tabular-nums font-semibold text-teal-700">LKR {etf.toLocaleString()}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Block 4: Café Operations */}
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/80">
                        <Coffee className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800">Café Operations</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">9-hour shift base. OT rate applies only to hours above the weekly threshold (Mon–Sun rollup). Minutes worked after the OT stop time are excluded from OT pay.</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="px-3 py-1 bg-amber-50 border border-amber-200/70 rounded text-xs font-bold text-amber-700 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> 9-Hour Shift Base
                          </span>
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 whitespace-nowrap">Weekly OT after</p>
                            <input
                              type="number"
                              min={0}
                              max={168}
                              value={s.cafeWeeklyOtThresholdHours}
                              onChange={(e) => set('cafeWeeklyOtThresholdHours', Math.max(0, Math.min(168, parseInt(e.target.value, 10) || 0)))}
                              className="w-16 rounded border border-amber-200 bg-white px-2 py-0.5 text-xs font-black text-amber-900 text-center"
                            />
                            <span className="text-[9px] font-bold text-amber-600">hrs / week</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 whitespace-nowrap">OT stop time</p>
                            <input
                              type="time"
                              value={s.cafeOtCutoffTime}
                              onChange={(e) => set('cafeOtCutoffTime', e.target.value)}
                              className="rounded border border-amber-200 bg-white px-1 py-0.5 text-xs font-black text-amber-900"
                            />
                          </div>
                        </div>
                        {/* Café Month Simulation */}
                        <div className="mt-3">
                          <CafeMonthSimulator
                            basic={cafePreviewBasic}
                            qty={cafePreviewQty}
                            otHours={cafePreviewOtHours}
                            formulas={cafeFormulas}
                            onBasicChange={setCafePreviewBasic}
                            onQtyChange={setCafePreviewQty}
                            onOtHoursChange={setCafePreviewOtHours}
                            apitSlabs={apitSlabs}
                            stampDutyAmount={stampDutyAmount}
                            stampDutyThresholdLkr={stampDutyThresholdLkr}
                          />
                          <p className="mt-1.5 text-xs font-medium text-slate-500">
                            Basic, day-type counts, and OT hours persist when you save this section.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </ExecutiveGlassCard>

              {/* ── Guard Retention & Salary Release Rules ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={ShieldAlert}
                  iconClassName="border-rose-200/80 bg-rose-50/80 text-rose-700"
                  title="Guard Retention & Salary Release Rules"
                  sub="Dynamically configure the minimum shift thresholds required to release previous month salaries. This prevents active roster desertion."
                  sectionId="guardRetention"
                  audit={sectionAudit('guardRetention')}
                  saving={sectionSaving === 'guardRetention'}
                  saved={sectionSaved.guardRetention}
                  onSave={saveSection('guardRetention')}
                />

                <div className="p-6 space-y-5">

                  {/* Decision Matrix Legend */}
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Release Decision Matrix</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {([
                        { label: 'FULL_SALARY',  color: 'emerald', desc: 'Prev ≥ threshold & Curr ≥ threshold' },
                        { label: 'HALF_SALARY',  color: 'amber',   desc: 'Prev ≥ threshold, Curr below threshold' },
                        { label: 'STOP_PAYMENT', color: 'rose',    desc: 'Prev below threshold (halts in all scenarios)' },
                      ] as const).map(({ label, color, desc }) => (
                        <div key={label} className={`rounded-lg border border-${color}-200/70 bg-${color}-50/50 px-3 py-2`}>
                          <p className={`text-[10px] font-black uppercase tracking-wide text-${color}-700`}>{label.replace(/_/g, ' ')}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-600">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Threshold Configuration Blocks */}
                  <div className="grid grid-cols-2 gap-4">

                    {/* Block 1: Previous Month Threshold */}
                    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-violet-200/80 bg-violet-100/80">
                          <History className="h-4 w-4 text-violet-700" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">Previous Month Threshold</p>
                      </div>
                      <p className="mb-4 text-xs font-semibold text-slate-500">Min. shifts worked in the ended month to qualify for retention logic.</p>
                      <label className={labelCls}>Min. Shifts (Prev. Month)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={prevMonthThreshold}
                          onChange={(e) => setPrevMonthThreshold(Math.max(1, Math.min(31, Number(e.target.value))))}
                          className={inputCls}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">shifts</span>
                      </div>
                      <p className="mt-2 text-[10px] font-medium text-slate-400">Valid range: 1 – 31 shifts per month</p>
                    </div>

                    {/* Block 2: Salary Month Threshold */}
                    <div className="rounded-2xl border border-teal-200/70 bg-teal-50/40 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-teal-200/80 bg-teal-100/80">
                          <Banknote className="h-4 w-4 text-teal-700" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">Salary Month Threshold</p>
                      </div>
                      <p className="mb-4 text-xs font-semibold text-slate-500">Min. shifts required in the current active month to release full pay.</p>
                      <label className={labelCls}>Min. Shifts (Current Month)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={salaryMonthThreshold}
                          onChange={(e) => setSalaryMonthThreshold(Math.max(1, Math.min(31, Number(e.target.value))))}
                          className={inputCls}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">shifts</span>
                      </div>
                      <p className="mt-2 text-[10px] font-medium text-slate-400">Valid range: 1 – 31 shifts per month</p>
                    </div>

                  </div>

                </div>
              </ExecutiveGlassCard>

              <AdvanceSalarySettingsCard />

              {/* ── Dynamic Statutory Formula Builder Guards ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={FlaskConical}
                  iconClassName="border-teal-200/80 bg-teal-50/80 text-teal-700"
                  title="Dynamic Statutory Formula Builder Guards"
                  sub="Construct the algebraic string used by the payroll engine to compute statutory entitlements for guard (field operations) employees"
                  sectionId="guardFormulas"
                  audit={sectionAudit('guardFormulas')}
                  saving={sectionSaving === 'guardFormulas'}
                  saved={sectionSaved.guardFormulas}
                  onSave={saveSection('guardFormulas')}
                />

                <div className="p-6 space-y-6">

                  {/* Day-Type Formula Matrix */}
                  <div className="flex flex-col w-full">
                    {GUARD_FORMULA_ROWS.map(({ key, title, icon }) => (
                      <FormulaRow
                        key={key}
                        title={title}
                        icon={icon}
                        formula={guardFormulas[key]}
                        onChange={(value) => setGuardFormulas((prev) => ({ ...prev, [key]: value }))}
                      />
                    ))}
                  </div>

                  {/* Variable Legend */}
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 px-5 py-4">
                    <p className="mb-3 text-sm font-black uppercase tracking-widest text-slate-600">Variable Legend</p>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2">
                        <span className="font-mono text-sm font-black tracking-wider text-teal-800">B</span>
                        <span className="text-sm font-semibold text-slate-600">=</span>
                        <span className="text-sm font-semibold text-slate-700">Basic Pay</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">
                      Invalid expressions will be rejected by the engine at compile-time. Test formula changes on a sandbox payroll before committing to production.
                    </p>
                  </div>
                </div>

              </ExecutiveGlassCard>

              {/* ── Dynamic Statutory Formula Builder — Café Staff ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Coffee}
                  iconClassName="border-amber-200/80 bg-amber-50/80 text-amber-700"
                  title="Dynamic Statutory Formula Builder Cafe Staff"
                  sub="Construct the algebraic string used by the payroll engine to compute statutory entitlements for café employees"
                  sectionId="cafeFormulas"
                  audit={sectionAudit('cafeFormulas')}
                  saving={sectionSaving === 'cafeFormulas'}
                  saved={sectionSaved.cafeFormulas}
                  onSave={saveSection('cafeFormulas')}
                />

                <div className="p-6 space-y-6">

                  {/* Day-Type Formula Matrix — Café */}
                  <div className="flex flex-col w-full">
                    {CAFE_FORMULA_ROWS.map(({ key, title, icon }) => (
                      <FormulaRow
                        key={key}
                        title={title}
                        icon={icon}
                        formula={cafeFormulas[key]}
                        onChange={(value) => setCafeFormulas((prev) => ({ ...prev, [key]: value }))}
                      />
                    ))}
                  </div>

                  {/* Calculation Note */}
                  <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 px-5 py-4 space-y-2">
                    <p className="text-sm font-black uppercase tracking-widest text-sky-700">Café Payment Rules</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-xl border border-sky-200/70 bg-white/70 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1">Poya Day</p>
                        <p className="font-mono font-bold text-slate-800">OT_RATE × HRS</p>
                        <p className="text-xs text-slate-500 mt-0.5">OT rate × hours worked that day</p>
                      </div>
                      <div className="rounded-xl border border-sky-200/70 bg-white/70 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1">Statutory / Public Holiday</p>
                        <p className="font-mono font-bold text-slate-800">OT_RATE × HRS</p>
                        <p className="text-xs text-slate-500 mt-0.5">OT rate × hours worked that day</p>
                      </div>
                      <div className="rounded-xl border border-sky-200/70 bg-white/70 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-1">Other Days</p>
                        <p className="font-mono font-bold text-slate-800">B / 26</p>
                        <p className="text-xs text-slate-500 mt-0.5">Standard daily rate</p>
                      </div>
                    </div>
                  </div>

                  {/* Variable Legend */}
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 px-5 py-4">
                    <p className="mb-3 text-sm font-black uppercase tracking-widest text-slate-600">Variable Legend</p>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2">
                        <span className="font-mono text-sm font-black tracking-wider text-amber-800">B</span>
                        <span className="text-sm font-semibold text-slate-600">=</span>
                        <span className="text-sm font-semibold text-slate-700">Basic Pay</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2">
                        <span className="font-mono text-sm font-black tracking-wider text-amber-800">OT_RATE</span>
                        <span className="text-sm font-semibold text-slate-600">=</span>
                        <span className="text-sm font-semibold text-slate-700">(B/26/9) × 1.5 — hourly OT rate</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2">
                        <span className="font-mono text-sm font-black tracking-wider text-amber-800">HRS</span>
                        <span className="text-sm font-semibold text-slate-600">=</span>
                        <span className="text-sm font-semibold text-slate-700">Actual hours worked on that day</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">
                      Invalid expressions will be rejected by the engine at compile-time. Minutes worked after the OT stop time are excluded before any OT formula is applied.
                    </p>
                  </div>
                </div>

              </ExecutiveGlassCard>

              {/* ── Cross-Deployment Pay Rules ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={ArrowRightLeft}
                  iconClassName="border-sky-200/80 bg-sky-50/80 text-sky-700"
                  title="Cross-Deployment Pay Rules"
                  sub="Controls how pay is calculated when a guard is loaned to a non-default site"
                  sectionId="crossDeployment"
                  audit={sectionAudit('crossDeployment')}
                  saving={sectionSaving === 'crossDeployment'}
                  saved={sectionSaved.crossDeployment}
                  onSave={saveSection('crossDeployment')}
                />

                <div className="divide-y divide-slate-200/60 p-6 space-y-4">

                  {/* Toggle 1 */}
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/50 px-5 py-4 shadow-inner">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">Enforce Flat Site Rate for Loaned Guards</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        If a guard works at a non-default site, pay them the flat site rate regardless of the day type (ignores Sunday / OT multipliers).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEnforceFlatSiteRate((v) => !v);
                        if (enforceFlatSiteRate) setAllowPoyaOnFlatRate(false);
                      }}
                      className="mt-0.5 flex-shrink-0"
                      aria-label="Toggle flat site rate"
                    >
                      {enforceFlatSiteRate
                        ? <ToggleRight className="h-10 w-10 text-sky-600" />
                        : <ToggleLeft  className="h-10 w-10 text-slate-400" />
                      }
                    </button>
                  </div>

                  {/* Toggle 2 — dependent / indented */}
                  <div className={`ml-6 flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 transition-all ${
                    enforceFlatSiteRate
                      ? 'border-sky-200/80 bg-sky-50/40 shadow-inner'
                      : 'border-slate-200/50 bg-white/20 opacity-50 cursor-not-allowed'
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${enforceFlatSiteRate ? 'text-slate-900' : 'text-slate-500'}`}>
                          Exception: Allow Poya Day Multipliers on Flat Rates
                        </p>
                        {!enforceFlatSiteRate && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 text-sm font-bold text-slate-500">
                            <Lock className="h-3 w-3" />
                            Requires Toggle 1
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        If ON, Poya multipliers will still apply even if the guard is at a non-default loaned site.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => enforceFlatSiteRate && setAllowPoyaOnFlatRate((v) => !v)}
                      disabled={!enforceFlatSiteRate}
                      className="mt-0.5 flex-shrink-0 disabled:cursor-not-allowed"
                      aria-label="Toggle Poya exception"
                    >
                      {allowPoyaOnFlatRate
                        ? <ToggleRight className="h-10 w-10 text-sky-600" />
                        : <ToggleLeft  className="h-10 w-10 text-slate-400" />
                      }
                    </button>
                  </div>

                </div>
              </ExecutiveGlassCard>

              <SettingsSectionHeading
                title="Branding & legal entities"
                sub="Company logo and division names on invoices, payslips, and portals"
              />

          {/* ── Legal Entity Branding ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <SettingsCardHeader
              icon={Globe2}
              iconClassName="border-indigo-200/80 bg-indigo-50/80 text-indigo-700"
              title="Legal Entity Branding & Names"
              sub="Canonical division names used across all generated documents and portals"
              sectionId="entityBranding"
              audit={sectionAudit('entityBranding')}
              saving={sectionSaving === 'entityBranding'}
              saved={sectionSaved.entityBranding}
              onSave={saveSection('entityBranding')}
            />

            <div className="p-6">

              {/* ── Company Logo Upload ── */}
              <div className="mb-6 rounded-2xl border border-indigo-100/80 bg-indigo-50/30 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-black uppercase tracking-wide text-slate-700">Company Logo</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5">
                  {/* Preview */}
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-sm">
                    {companyLogo ? (
                      <img src={companyLogo} alt="Company logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-indigo-200" />
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-semibold text-slate-600">
                      Upload a PNG or SVG logo — shown in the executive sidebar, guard portal background, and payslips.
                      Recommended size: <strong>256 × 256 px</strong> or larger, square format.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200/80 bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50/80">
                        <Upload className="h-4 w-4" />
                        {companyLogo ? 'Replace Logo' : 'Upload Logo'}
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/svg+xml,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLogoFile(file);
                          }}
                        />
                      </label>

                      {companyLogo && (
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          className="flex items-center gap-2 rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm font-bold text-rose-600 shadow-sm transition-all hover:bg-rose-50/80"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              </div>

              {/* Three entity inputs */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">

                {/* Security */}
                <div className="group">
                  <label className={labelCls}>Security Division Name</label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-600 transition-colors" />
                    <input
                      type="text"
                      value={entities.security}
                      onChange={(e) => setEntities((p) => ({ ...p, security: e.target.value }))}
                      className={`${inputCls} pl-9`}
                      placeholder="e.g. Classic Venture Security"
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Used on security invoices, payroll slips &amp; field portal headers</p>
                </div>

                {/* Hospitality */}
                <div className="group">
                  <label className={labelCls}>Hospitality Division Name</label>
                  <div className="relative">
                    <Coffee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 group-focus-within:text-amber-600 transition-colors" />
                    <input
                      type="text"
                      value={entities.hospitality}
                      onChange={(e) => setEntities((p) => ({ ...p, hospitality: e.target.value }))}
                      className={`${inputCls} pl-9`}
                      placeholder="e.g. Café Tasha"
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Printed on café staff payslips &amp; compliance audit reports</p>
                </div>

                {/* Real Estate */}
                <div className="group">
                  <label className={labelCls}>Real Estate Division Name</label>
                  <div className="relative">
                    <Home className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-600 transition-colors" />
                    <input
                      type="text"
                      value={entities.realEstate}
                      onChange={(e) => setEntities((p) => ({ ...p, realEstate: e.target.value }))}
                      className={`${inputCls} pl-9`}
                      placeholder="e.g. Shalom Residence"
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Shown on rental receipts, OTA confirmations &amp; booking registers</p>
                </div>
              </div>

              {/* Divider */}
              <div className="my-5 border-t border-slate-200/70" />

              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Global propagation note */}
                <div className="flex items-start gap-2 text-sm text-slate-600 max-w-xl">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                  <span>
                    These names will <strong>globally update</strong> across all executive dashboards, PDF invoices, and field staff portals. Changes take effect immediately on the next page load or document generation.
                  </span>
                </div>

              </div>
            </div>
          </ExecutiveGlassCard>

              <SettingsSectionHeading
                title="Billing calendar & café payroll guards"
                sub="OT cutoff, billing cycle dates, rank ledger, gratuity, and welfare fund"
              />

          {/* ── Row 1: Café OT Kill-Switch + Billing Cycle ── */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

            {/* Café OT Cutoff */}
            <ExecutiveGlassCard className="p-6">
              <SectionHeader
                Icon={Clock}
                title="Café OT Time-Cutoff Kill-Switch"
                sub="Blocks the OT multiplier for any minutes worked past this time"
                accent="text-rose-700"
                audit={sectionAudit('cafeOtCutoff')}
                onSave={saveSection('cafeOtCutoff')}
                saving={sectionSaving === 'cafeOtCutoff'}
                saved={sectionSaved.cafeOtCutoff}
              />

              <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4">
                <label className={labelCls}>OT Cutoff Time</label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-600" />
                  <input
                    type="time"
                    value={s.cafeOtCutoffTime}
                    onChange={(e) => set('cafeOtCutoffTime', e.target.value)}
                    className="w-full rounded-xl border border-rose-200/80 bg-white/95 py-2.5 pl-10 pr-3 text-sm font-black text-rose-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                  />
                </div>
                <p className="mt-2 text-sm text-rose-700 font-semibold">
                  Any minutes worked after <strong>{s.cafeOtCutoffTime}</strong> will NOT be multiplied by the OT rate.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-amber-700" />
                  <p className="text-sm font-black uppercase tracking-wide text-amber-900">
                    Café Front Check-in Hours
                  </p>
                </div>
                <p className="mb-4 text-xs font-semibold text-amber-800">
                  Counter staff can only GPS check-in during this window. Portal stays open 1 hour after close; check-out requires GPS + selfie.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Opens</label>
                    <input
                      type="time"
                      value={cafeOpenStart}
                      onChange={(e) => setCafeOpenStart(e.target.value)}
                      className="w-full rounded-xl border border-amber-200/80 bg-white/95 px-3 py-2.5 text-sm font-black text-amber-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Closes</label>
                    <input
                      type="time"
                      value={cafeOpenEnd}
                      onChange={(e) => setCafeOpenEnd(e.target.value)}
                      className="w-full rounded-xl border border-amber-200/80 bg-white/95 px-3 py-2.5 text-sm font-black text-amber-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-amber-800">
                  Active window: <strong>{cafeOpenStart}</strong> – <strong>{cafeOpenEnd}</strong>
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Morning shift (9h): <strong>{cafeOpenStart}</strong> –{' '}
                  <strong>
                    {(() => {
                      const [sh, sm] = cafeOpenStart.split(':').map(Number);
                      const endMins = sh * 60 + sm + 9 * 60;
                      const eh = Math.floor(endMins / 60) % 24;
                      const em = endMins % 60;
                      return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
                    })()}
                  </strong>
                  {' · '}
                  Evening shift (9h):{' '}
                  <strong>
                    {(() => {
                      const [eh, em] = cafeOpenEnd.split(':').map(Number);
                      const startMins = eh * 60 + em - 9 * 60;
                      const sh = Math.floor(startMins / 60) % 24;
                      const sm = startMins % 60;
                      return `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
                    })()}
                  </strong>
                  {' – '}
                  <strong>{cafeOpenEnd}</strong>
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                Changing this affects all future Café payroll calculations immediately.
              </div>
            </ExecutiveGlassCard>

            {/* Billing Cycle */}
            <ExecutiveGlassCard className="p-6">
              <SectionHeader
                Icon={Calendar}
                title="Dynamic Billing Cycle Parameters"
                sub="Invoice dispatch, payroll target, and collection warning dates"
                audit={sectionAudit('billingCycle')}
                onSave={saveSection('billingCycle')}
                saving={sectionSaving === 'billingCycle'}
                saved={sectionSaved.billingCycle}
              />

              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Invoice Dispatch Date (Day of Month)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1} max={28}
                      value={s.invoiceDispatchDay}
                      onChange={(e) => set('invoiceDispatchDay', parseInt(e.target.value) || 1)}
                      className={`${inputCls} w-24 text-center`}
                    />
                    <span className="text-sm text-slate-500">Default: 1st of every month</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Payroll Target Date (Day of Month)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1} max={28}
                      value={s.payrollTargetDay}
                      onChange={(e) => set('payrollTargetDay', parseInt(e.target.value) || 10)}
                      className={`${inputCls} w-24 text-center`}
                    />
                    <span className="text-sm text-slate-500">Default: 10th of every month</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Collection Warning Threshold Date (Day of Month)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1} max={28}
                      value={s.collectionWarningDay}
                      onChange={(e) => set('collectionWarningDay', parseInt(e.target.value) || 6)}
                      className={`${inputCls} w-24 text-center`}
                    />
                    <span className="text-sm text-slate-500">Red-alert dispatched to Exec Admin if cash low by this day</span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-2xl border border-violet-200/70 bg-violet-50/40 px-5 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">Require Deductions Admin lock before FM payroll lock</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      When on, Finance must lock the month on Deductions Admin and send it to FM before she can lock payroll groups. Turn off to skip that gate and hide the FM desk warning.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequireDeductionMonthLock((value) => !value)}
                    className="mt-0.5 flex-shrink-0"
                    aria-label="Toggle deductions admin lock requirement"
                  >
                    {requireDeductionMonthLock
                      ? <ToggleRight className="h-10 w-10 text-violet-600" />
                      : <ToggleLeft className="h-10 w-10 text-slate-400" />
                    }
                  </button>
                </div>

                <div>
                  <label className={labelCls}>Default uniform monthly instalment (LKR)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={uniformMonthlyInstalmentLkr}
                      onChange={(e) =>
                        setUniformMonthlyInstalmentLkr(Math.max(0, Math.round(Number(e.target.value) || 0)))
                      }
                      className={`${inputCls} w-36 text-right font-mono`}
                    />
                    <span className="text-sm text-slate-500">
                      Used when HQ Deductions Admin has no saved uniform amount and no uniform issue this month (guards with shifts only).
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual cycle summary */}
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
                {[
                  { label: 'Invoice Out', day: s.invoiceDispatchDay, color: 'text-indigo-800' },
                  { label: 'Collection Alert', day: s.collectionWarningDay, color: 'text-rose-800' },
                  { label: 'Payroll Day', day: s.payrollTargetDay, color: 'text-emerald-800' },
                ].map((item, i, arr) => (
                  <React.Fragment key={item.label}>
                    <div className="text-center">
                      <p className={`text-lg font-black tabular-nums ${item.color}`}>{item.day}</p>
                      <p className="text-sm font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
                    </div>
                    {i < arr.length - 1 && <div className="text-slate-300 font-mono text-sm">→</div>}
                  </React.Fragment>
                ))}
              </div>
            </ExecutiveGlassCard>
          </div>

          {/* ── Master Rank & Pay Matrix ── */}
          <ExecutiveGlassCard className="overflow-hidden">

            {/* Card header */}
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
                    <DollarSign className="h-5 w-5 text-emerald-800" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-800">Master Rank Basic Pay Ledger</h3>
                    <p className="text-sm font-medium text-slate-600">
                      Rank titles for Head Office (including Sector Managers), Guards, and Café.
                      Base pay and annual increment apply to field guards only — HO, SM, and café pay is set per employee in MNR.
                      HR can only assign ranks defined here during onboarding — no free-text ranks.
                      MD and OD are always listed under Head Office and cannot be removed; only MD or OD can edit those rows (others can view).
                    </p>
                    <SettingsTraceability audit={sectionAudit('rankPay')} />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <SectionSaveButton
                    saving={sectionSaving === 'rankPay' || rankMatrixSaving}
                    saved={sectionSaved.rankPay}
                    onClick={saveSection('rankPay')}
                  />
                </div>
              </div>
            </div>

            {vaultBlocksSave ? (
              <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] px-4 py-3">
                <p className="text-sm font-semibold text-[color:var(--cvs-accent)] leading-relaxed">
                  Vault is locked. Unlock with your 4-digit PIN before editing or deleting ranks.
                </p>
                <button
                  type="button"
                  onClick={() => vault?.requestUnlock()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--cvs-accent)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[color:var(--cvs-accent-hover)] transition-all"
                >
                  <Lock className="h-4 w-4" />
                  Unlock Vault
                </button>
              </div>
            ) : null}

            {rankMatrixError ? (
              <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {rankMatrixError}
              </div>
            ) : null}

            <RankPayLedgerSections
              rankPay={s.rankPay}
              editingRankId={editingRankId}
              editDraft={editDraft}
              addingRankSection={addingRankSection}
              newRankDraft={newRankDraft}
              rankMatrixSaving={rankMatrixSaving}
              canManageExecutiveRanks={canManageExecutiveRanks}
              vaultLocked={vaultBlocksSave}
              onRequestVaultUnlock={() => {
                setRankMatrixError(
                  'Vault is locked. Enter your 4-digit PIN to unlock, then try again.',
                );
                vault?.requestUnlock();
              }}
              onStartEdit={startEditRank}
              onCancelEdit={cancelEditRank}
              onEditDraftChange={setEditDraft}
              onCommitEdit={() => void commitEditRank()}
              onDelete={(id) => void deleteRank(id)}
              onStartAdd={(sectionId) => {
                if (!promptVaultUnlockForRankMatrix()) return;
                setEditingRankId(null);
                setAddingRankSection(sectionId);
                setNewRankDraft(blankRankDraftForSection(sectionId));
              }}
              onCancelAdd={() => {
                setAddingRankSection(null);
                setNewRankDraft(BLANK_RANK);
              }}
              onNewRankDraftChange={setNewRankDraft}
              onCommitAdd={() => void commitAddRank()}
            />

            {/* Footer */}
            <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  {s.rankPay.length} rank{s.rankPay.length !== 1 ? 's' : ''} defined
                  {s.rankPay.some((r) => r.operationalGroup === 'GUARD_FIELD' || r.operationalGroup === 'GUARD')
                    ? ' · Guard adjusted basic = base + (annual increment × completed years)'
                    : ''}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {rankMatrixSaving
                    ? 'Saving rank ledger…'
                    : vaultBlocksSave
                      ? 'Unlock the vault, then click ✓ on a row to save that rank immediately.'
                      : 'Click ✓ on a row to save that rank immediately, or use Save to commit the full matrix.'}
                </p>
              </div>
            </div>

          </ExecutiveGlassCard>

          {/* ── Gratuity provision (Sri Lanka) ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <SettingsCardHeader
              icon={Scale}
              iconClassName="border-violet-200/80 bg-violet-50/80 text-violet-800"
              title="Gratuity Provision Settings"
              sub="Sri Lanka: (monthly basic ÷ divisor) × years of service when tenure meets minimum. Does not apply to café employees (shared with FM, shown on HR clearance)."
              sectionId="gratuity"
              audit={sectionAudit('gratuity')}
              saving={sectionSaving === 'gratuity'}
              saved={sectionSaved.gratuity}
              onSave={saveSection('gratuity')}
            />
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Minimum years of service
                </span>
                <input
                  type="number"
                  min={0}
                  value={gratuitySettings.minYears}
                  onChange={(e) =>
                    setGratuitySettings((g) => ({
                      ...g,
                      minYears: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <p className="mt-1.5 text-xs font-medium text-slate-500">Typically 5 years under Sri Lankan employment law.</p>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Divide monthly basic by
                </span>
                <input
                  type="number"
                  min={1}
                  value={gratuitySettings.monthlyBasicDivisor}
                  onChange={(e) =>
                    setGratuitySettings((g) => ({
                      ...g,
                      monthlyBasicDivisor: Math.max(1, parseInt(e.target.value, 10) || 2),
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <p className="mt-1.5 text-xs font-medium text-slate-500">
                  Default 2 → half-month salary per completed year: (basic ÷ 2) × years.
                </p>
              </label>
            </div>
            {gratuityError && (
              <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-2">
                <p className="text-xs font-bold text-red-700">{gratuityError}</p>
              </div>
            )}
          </ExecutiveGlassCard>

          <ExecutiveGlassCard className="overflow-hidden">
            <SettingsCardHeader
              icon={HeartHandshake}
              iconClassName="border-teal-200/80 bg-teal-50/80 text-teal-800"
              title="Employee Welfare Fund"
              sub="Fixed monthly deduction from every employee on payroll (shared with FM · shown on Batch Execution desk)"
              sectionId="welfareFund"
              audit={sectionAudit('welfareFund')}
              saving={sectionSaving === 'welfareFund'}
              saved={sectionSaved.welfareFund}
              onSave={saveSection('welfareFund')}
            />
            <div className="p-6">
              <label className="block max-w-md">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Monthly deduction per employee (LKR)
                </span>
                <input
                  type="number"
                  min={0}
                  value={welfareFundSettings.monthlyDeductionLkr}
                  onChange={(e) =>
                    setWelfareFundSettings({
                      monthlyDeductionLkr: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <p className="mt-1.5 text-xs font-medium text-slate-500">
                  Batch total each month = this amount × active payroll headcount. FM can view monthly fund totals from the welfare card on the deductions ledger.
                </p>
              </label>
            </div>
            {welfareFundError && (
              <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-2">
                <p className="text-xs font-bold text-red-700">{welfareFundError}</p>
              </div>
            )}
          </ExecutiveGlassCard>

            </div>
          )}

          {activeTab === 'OPERATIONS' && (
            <div className="space-y-6">

              <SettingsSectionHeading
                title="Operations & field deployment"
                sub="Geofence, shift windows, and internal locations — save each section independently"
              />

              {/* ── Default site geofence radius ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={MapPin}
                  iconClassName="border-emerald-200/80 bg-emerald-50/80 text-emerald-700"
                  title="Default Site Geofence Radius"
                  sub="Pre-fills new site registrations. OM cannot change radius — only captures GPS coordinates."
                  sectionId="geofence"
                  audit={sectionAudit('geofence')}
                  saving={sectionSaving === 'geofence'}
                  saved={sectionSaved.geofence}
                  onSave={saveSection('geofence')}
                />
                <div className="p-6 space-y-4">
                  <div className="max-w-xs">
                    <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                      Radius (meters)
                    </label>
                    <input
                      type="number"
                      min={MIN_GEOFENCE_RADIUS_M}
                      max={MAX_GEOFENCE_RADIUS_M}
                      value={defaultGeofenceRadiusM}
                      onChange={(e) => setDefaultGeofenceRadiusM(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                    />
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      Maximum {MAX_GEOFENCE_RADIUS_M} m. Guards and SMs must be within this distance of site GPS to check in.
                    </p>
                  </div>
                  <p className="pt-4 border-t border-slate-100 text-[10px] font-medium text-slate-400">
                    Override per site in Site Directory. Save this section to commit the company default.
                  </p>
                </div>
              </ExecutiveGlassCard>

              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Building2}
                  iconClassName="border-slate-200/80 bg-slate-50/80 text-slate-700"
                  title="Head Office & Café Branch GPS"
                  sub="Configure internal Classic Venture locations for HO and café staff check-in — not client guard sites"
                  sectionId="internalWorkLocations"
                  audit={sectionAudit('internalWorkLocations')}
                  saving={sectionSaving === 'internalWorkLocations'}
                  saved={sectionSaved.internalWorkLocations}
                  onSave={saveSection('internalWorkLocations')}
                />
                <div className="p-6">
                  <InternalWorkLocationsPanel
                    value={internalWorkLocations}
                    onChange={setInternalWorkLocations}
                  />
                </div>
              </ExecutiveGlassCard>

              {/* ── Global Shift Timing Defaults for Guards ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Clock}
                  iconClassName="border-indigo-200/80 bg-indigo-50/80 text-indigo-700"
                  title="Global Shift Timing Defaults for Guards"
                  sub="Baseline roster hours applied across all guard (field operations) sites — overridable per-site"
                  sectionId="shiftTimes"
                  audit={sectionAudit('shiftTimes')}
                  saving={sectionSaving === 'shiftTimes'}
                  saved={sectionSaved.shiftTimes}
                  onSave={saveSection('shiftTimes')}
                />

                <div className="p-6 space-y-5">
                  {/* Two-column grid */}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

                    {/* Day Shift Roster */}
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Sun className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        <span className="text-sm font-black uppercase tracking-wide text-slate-700">Day Shift Roster</span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={dayShiftStart}
                            onChange={(e) => setDayShiftStart(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={dayShiftEnd}
                            onChange={(e) => setDayShiftEnd(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Night Shift Roster */}
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Moon className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                        <span className="text-sm font-black uppercase tracking-wide text-slate-700">Night Shift Roster</span>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={nightShiftStart}
                            onChange={(e) => setNightShiftStart(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={nightShiftEnd}
                            onChange={(e) => setNightShiftEnd(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                      </div>
                      <p className="mt-4 text-sm font-medium italic text-slate-500">
                        Note: Night shift automatically inherits the inverse of the Day shift by default, but can be manually overridden per site requirements.
                      </p>
                    </div>

                  </div>

                </div>
              </ExecutiveGlassCard>

              {/* ── Global Shift Timing Defaults for Café ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <SettingsCardHeader
                  icon={Coffee}
                  iconClassName="border-amber-200/80 bg-amber-50/80 text-amber-700"
                  title="Global Shift Timing Defaults for Café"
                  sub="Café operating window — café employees are only paid for hours worked within this period"
                  sectionId="cafeOperatingWindow"
                  audit={sectionAudit('cafeOperatingWindow')}
                  saving={sectionSaving === 'cafeOperatingWindow'}
                  saved={sectionSaved.cafeOperatingWindow}
                  onSave={saveSection('cafeOperatingWindow')}
                />

                <div className="p-6 space-y-5">
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">
                      Café staff attendance is only billable within the defined operating window. Any hours logged outside this window are excluded from payroll calculations.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

                    {/* Café Open */}
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Sun className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        <span className="text-sm font-black uppercase tracking-wide text-slate-700">Café Opens (Start of Paid Window)</span>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                          Opening Time
                        </label>
                        <input
                          type="time"
                          value={cafeOpenStart}
                          onChange={(e) => setCafeOpenStart(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                        />
                        <p className="mt-1.5 text-xs font-medium text-slate-500">Default: 07:00 AM</p>
                      </div>
                    </div>

                    {/* Café Close */}
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-5">
                      <div className="mb-4 flex items-center gap-2">
                        <Moon className="h-4 w-4 flex-shrink-0 text-amber-700" />
                        <span className="text-sm font-black uppercase tracking-wide text-slate-700">Café Closes (End of Paid Window)</span>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-slate-600">
                          Closing Time
                        </label>
                        <input
                          type="time"
                          value={cafeOpenEnd}
                          onChange={(e) => setCafeOpenEnd(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                        />
                        <p className="mt-1.5 text-xs font-medium text-slate-500">Default: 07:00 PM</p>
                      </div>
                    </div>

                  </div>

                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-5 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">Paid Operating Window</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {cafeOpenStart} – {cafeOpenEnd} ({(() => {
                            const [sh, sm] = cafeOpenStart.split(':').map(Number);
                            const [eh, em] = cafeOpenEnd.split(':').map(Number);
                            const diff = (eh * 60 + em) - (sh * 60 + sm);
                            const hrs = Math.floor(Math.abs(diff) / 60);
                            const mins = Math.abs(diff) % 60;
                            return `${hrs}h${mins > 0 ? ` ${mins}m` : ''}`;
                          })()} total)
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-xs font-bold text-amber-800">
                      <Coffee className="h-3.5 w-3.5" />
                      Café Window Active
                    </span>
                  </div>
                </div>
              </ExecutiveGlassCard>

              <SettingsSectionHeading
                title="Bulk data migration"
                sub="Excel workbook import and export for employees, sites, and SM guard links"
              />
              <BulkDataImportPanel />

            </div>
          )}

        </ExecutivePageBody>
      </ExecutivePageShell>
    </>
  );
}
