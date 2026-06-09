'use client';

import React, { useState, useEffect } from 'react';
import { getRankPayMatrix, saveRankPayMatrix } from '../../executive/settings/rank-matrix-actions';
import { getGratuitySettings, saveGratuitySettings } from '../../executive/settings/gratuity-actions';
import { getWelfareFundSettings, saveWelfareFundSettings } from '../../executive/settings/welfare-fund-actions';
import { getMdEngineConstants } from '../../executive/settings/engine-constants-actions';
import type { GratuitySettings } from '../../../../../packages/gratuity';
import type { WelfareFundSettings } from '../../../../../packages/welfare-fund';
import Link from 'next/link';
import FmSubnav from '../components/FmSubnav';
import {
  Settings,
  Clock,
  Calendar,
  User,
  Car,
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
  CalendarDays,
  CalendarPlus,
  CalendarCheck,
  UserPlus,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';

// ─── Types ────────────────────────────────────────────────────────────────────

type SmPayMode = 'FIXED_ONLY' | 'PER_VISIT_ONLY' | 'FIXED_AND_PER_VISIT';

type RankFormula = 'STATUTORY_HOURLY' | 'FLAT_MONTHLY' | 'HOSPITALITY_HYBRID';

type OperationalGroup = 'GUARD_FIELD' | 'SECTOR_MANAGER' | 'HEAD_OFFICE' | 'CAFE';

type RankSalaryType = 'BANK' | 'CASH';

const OPERATIONAL_GROUPS: { id: OperationalGroup; label: string }[] = [
  { id: 'HEAD_OFFICE',    label: 'Head Office (HO)' },
  { id: 'GUARD_FIELD',    label: 'Guard (Field Operations)' },
  { id: 'CAFE',           label: 'Café Operations' },
  { id: 'SECTOR_MANAGER', label: 'Sector Manager (MD dictated)' },
];

const SALARY_TYPES: { id: RankSalaryType; label: string }[] = [
  { id: 'BANK', label: 'Bank' },
  { id: 'CASH', label: 'Cash' },
];

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

  // Statutory
  vatRate: number;
  ssclRate: number;
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
}

// ─── Initial demo state ───────────────────────────────────────────────────────

const INITIAL: SettingsState = {
  cafeOtCutoffTime: '19:00',

  invoiceDispatchDay: 1,
  payrollTargetDay: 10,
  collectionWarningDay: 6,

  rankPay: [
    { id: 'rp-1', rankCode: 'CSO', fullTitle: 'Chief Security Officer',  basicPay: 35000, annualIncrement: 2000, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-2', rankCode: 'OIC', fullTitle: 'Officer In Charge',        basicPay: 33000, annualIncrement: 1800, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-3', rankCode: 'SSO', fullTitle: 'Senior Security Officer',  basicPay: 32000, annualIncrement: 1500, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-4', rankCode: 'JSO', fullTitle: 'Junior Security Officer',  basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
    { id: 'rp-5', rankCode: 'LSO', fullTitle: 'Lady Security Officer', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  ],

  smPayMode: 'FIXED_AND_PER_VISIT',
  smFixedBasic: 55000,
  smPerVisitBonus: 2500,

  fuelSurplusCorrection: true,

  vatRate: 18,
  ssclRate: 2.5,
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,

  payrollEpfEmployer: 12,
  payrollEtfEmployer: 3,
  monthlyDaysDivisor: 26,
  rankFormulaMap: {},

  cafeOtMaxMonthlyHours: 20,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  return `LKR ${n.toLocaleString()}`;
}

function calcApit(gross: number, slabs: Array<{ id: number; min: number; max: number | null; rate: number }>) {
  if (slabs.length === 0 || gross <= 0) return 0;
  const sorted = [...slabs].sort((a, b) => a.min - b.min);
  let tax = 0;
  for (const slab of sorted) {
    if (gross <= slab.min) break;
    const slabTop = slab.max !== null ? slab.max : Infinity;
    const taxable = Math.min(gross, slabTop) - slab.min;
    if (taxable > 0 && slab.rate > 0) {
      tax += taxable * slab.rate / 100;
    }
  }
  return Math.round(tax);
}

// ── Shared simulation helpers ─────────────────────────────────────────────────

const SIM_EPF_EMP = 0.08;
const SIM_STAMP   = 25;

const simApit = (gross: number): number => {
  const slabs = [
    { min: 0,      max: 150000,   rate: 0  },
    { min: 150000, max: 233333,   rate: 6  },
    { min: 233333, max: 275000,   rate: 18 },
    { min: 275000, max: 316667,   rate: 24 },
    { min: 316667, max: 358334,   rate: 30 },
    { min: 358334, max: Infinity, rate: 36 },
  ];
  let tax = 0;
  for (const slab of slabs) {
    if (gross <= slab.min) break;
    const taxable = Math.min(gross, slab.max) - slab.min;
    if (taxable > 0 && slab.rate > 0) tax += (taxable * slab.rate) / 100;
  }
  return Math.round(tax);
};

const fmtSimLKR = (n: number) =>
  `LKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Month Simulation Panel — Guard (B = LKR 30,000) ──────────────────────────

const MonthSimulator = () => {
  const B = 30_000;
  const [qty, setQty] = React.useState({ std: 20, sun: 4, poya: 1, pubHol: 0, sat: 4 });

  const rates = {
    std:    B / 26 + (B / 26) * (14 / 12) * (1 / 26) + (B / 200) * 1.5 * 3,
    sun:    (B / 200) * 1.5 * 11,
    poya:   (B / 200) * (2 * 11),
    pubHol: B / 26 + (B / 26) * (14 / 12) * (1 / 26) + (B / 200) * 1.5 * 3,
    sat:    (B / 26) * (6 / 8) + (B / 200) * 1.5 * 5,
  };

  const gross =
    qty.std * rates.std +
    qty.sun * rates.sun +
    qty.poya * rates.poya +
    qty.pubHol * rates.pubHol +
    qty.sat * rates.sat;

  const epfEmp   = Math.round(gross * SIM_EPF_EMP);
  const apit     = simApit(gross);
  const net      = gross - epfEmp - apit - SIM_STAMP;

  const bump = (key: keyof typeof qty, delta: number) =>
    setQty((p) => ({ ...p, [key]: Math.max(0, Math.min(31, p[key] + delta)) }));

  const SimRow = ({
    label,
    k,
    rate,
  }: {
    label: string;
    k: keyof typeof qty;
    rate: number;
  }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[10px] font-semibold text-amber-900">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => bump(k, -1)}
          className="flex h-5 w-5 items-center justify-center rounded border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-black leading-none"
        >
          −
        </button>
        <span className="w-5 text-center font-mono text-xs font-black tabular-nums text-amber-900">
          {qty[k]}
        </span>
        <button
          type="button"
          onClick={() => bump(k, 1)}
          className="flex h-5 w-5 items-center justify-center rounded border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-black leading-none"
        >
          +
        </button>
        <span className="w-28 text-right font-mono text-[10px] tabular-nums text-amber-800">
          {fmtSimLKR(qty[k] * rate)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-200/60 min-w-[300px]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Month Simulation
        </p>
        <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
          B = LKR 30,000
        </span>
      </div>
      <div className="space-y-1.5">
        <SimRow label="Std Working Days"  k="std"    rate={rates.std} />
        <SimRow label="Sundays"           k="sun"    rate={rates.sun} />
        <SimRow label="Poya Days"         k="poya"   rate={rates.poya} />
        <SimRow label="Public Holidays"   k="pubHol" rate={rates.pubHol} />
        <SimRow label="Saturdays (½ Day)" k="sat"    rate={rates.sat} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-amber-300/70 pt-2">
        <span className="text-[10px] font-semibold text-amber-700">Est. Month Gross</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-amber-800">
          {fmtSimLKR(gross)}
        </span>
      </div>
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-rose-600">Stamp Duty</span>
          <span className="font-mono text-[10px] tabular-nums text-rose-600">− {fmtSimLKR(SIM_STAMP)}</span>
        </div>
      </div>
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

const CafeMonthSimulator = () => {
  const [cafeB,   setCafeB]   = React.useState(38_000);
  const [otHours, setOtHours] = React.useState(0);

  const dailyRate = cafeB / 26;
  const otRate    = (dailyRate / 9) * 1.5;
  const otPay     = Math.round(otRate * otHours);
  const gross     = cafeB + otPay;
  const epfEmp    = Math.round(gross * SIM_EPF_EMP);
  const apit      = simApit(gross);
  const net       = gross - epfEmp - apit - SIM_STAMP;

  const bumpOt = (delta: number) =>
    setOtHours((p) => Math.max(0, Math.min(200, p + delta)));

  return (
    <div className="rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-200/60 min-w-[300px]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Month Simulation
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Basic</span>
          <input
            type="number"
            value={cafeB}
            onChange={(e) => setCafeB(parseInt(e.target.value, 10) || 0)}
            className="w-20 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-amber-900"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="truncate text-[10px] font-semibold text-amber-900">OT Hours (Month)</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bumpOt(-1)}
            className="flex h-5 w-5 items-center justify-center rounded border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-black leading-none"
          >
            −
          </button>
          <span className="w-8 text-center font-mono text-xs font-black tabular-nums text-amber-900">
            {otHours}
          </span>
          <button
            type="button"
            onClick={() => bumpOt(1)}
            className="flex h-5 w-5 items-center justify-center rounded border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-black leading-none"
          >
            +
          </button>
          <span className="w-28 text-right font-mono text-[10px] tabular-nums text-amber-800">
            {fmtSimLKR(otPay)}
          </span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-amber-300/70 pt-2">
        <span className="text-[10px] font-semibold text-amber-700">
          Est. Month Gross
          {otPay > 0 && (
            <span className="ml-1 text-[9px] font-medium text-amber-600">
              (Basic + OT)
            </span>
          )}
        </span>
        <span className="font-mono text-xs font-semibold tabular-nums text-amber-800">
          {fmtSimLKR(gross)}
        </span>
      </div>
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-rose-600">Stamp Duty</span>
          <span className="font-mono text-[10px] tabular-nums text-rose-600">− {fmtSimLKR(SIM_STAMP)}</span>
        </div>
      </div>
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

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
const labelCls = 'mb-1 block text-sm font-bold uppercase tracking-wide text-slate-700';

// ─── Shared Edit Traceability ─────────────────────────────────────────────────

function TraceabilityBlock() {
  return null;
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ Icon, title, sub, accent = 'text-emerald-800' }: { Icon: React.ElementType; title: string; sub: string; accent?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="text-sm font-medium text-slate-700">{sub}</p>
        <TraceabilityBlock />
      </div>
    </div>
  );
}

// ─── Save Toast ───────────────────────────────────────────────────────────────

function SaveToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/30">
        <CheckCircle2 className="h-4 w-4" />
        Settings saved to engine
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

// ─── Security & Sessions ──────────────────────────────────────────────────────

type VaultRole = 'MD' | 'OD' | 'Exec Admin';
type SessionStatus = 'ONLINE' | 'IDLE';

interface VaultSession {
  id: string;
  user: string;
  role: VaultRole;
  device: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  status: SessionStatus;
  isCurrent: boolean;
}

const INITIAL_SESSIONS: VaultSession[] = [
  {
    id: 'S-001',
    user: 'Managing Director',
    role: 'MD',
    device: 'macOS 14 · Chrome 124',
    ipAddress: '112.134.18.42',
    location: 'Colombo, LK',
    lastActive: 'Just now',
    status: 'ONLINE',
    isCurrent: true,
  },
  {
    id: 'S-002',
    user: 'Operations Developer',
    role: 'OD',
    device: 'Windows 11 · Edge 123',
    ipAddress: '112.134.92.17',
    location: 'Colombo, LK',
    lastActive: '4 min ago',
    status: 'ONLINE',
    isCurrent: false,
  },
  {
    id: 'S-003',
    user: 'Exec Admin — Finance',
    role: 'Exec Admin',
    device: 'iPadOS 17 · Safari',
    ipAddress: '203.115.44.88',
    location: 'Kandy, LK',
    lastActive: '18 min ago',
    status: 'IDLE',
    isCurrent: false,
  },
  {
    id: 'S-004',
    user: 'Exec Admin — HR',
    role: 'Exec Admin',
    device: 'Android 14 · Chrome Mobile',
    ipAddress: '112.134.55.201',
    location: 'Colombo, LK',
    lastActive: '1 hr ago',
    status: 'IDLE',
    isCurrent: false,
  },
];

const ROLE_META: Record<VaultRole, { label: string; cls: string }> = {
  MD:         { label: 'MD',         cls: 'border-indigo-200/80 bg-indigo-50/80 text-indigo-800' },
  OD:         { label: 'OD',         cls: 'border-sky-200/80 bg-sky-50/80 text-sky-800' },
  'Exec Admin': { label: 'Exec Admin', cls: 'border-slate-200/80 bg-slate-100/80 text-slate-700' },
};

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'ONLINE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-sm font-black uppercase tracking-wider text-emerald-800">
        <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
        Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-sm font-black uppercase tracking-wider text-amber-800">
      <Clock className="h-3 w-3" />
      Idle
    </span>
  );
}

function SecuritySessionsPanel() {
  const [sessions, setSessions] = useState<VaultSession[]>(INITIAL_SESSIONS);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const revokeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    showToast('Vault session revoked — user signed out remotely.');
  };

  const terminateAllOthers = () => {
    setSessions((prev) => prev.filter((s) => s.isCurrent));
    showToast('All other vault sessions terminated.');
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {toast && (
        <div className="border-b border-emerald-200/80 bg-emerald-50/80 px-5 py-2.5">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {toast}
          </p>
        </div>
      )}

      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
              <Shield className="h-5 w-5 text-rose-700" />
            </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Active Vault Sessions</h3>
                <p className="text-sm font-medium text-slate-600">
                  Monitor executive portal logins and revoke unauthorized or stale access in real time.
                </p>
                <TraceabilityBlock />
              </div>
          </div>

          <button
            type="button"
            onClick={terminateAllOthers}
            disabled={otherCount === 0}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black uppercase tracking-widest shadow-sm transition-all ${
              otherCount === 0
                ? 'cursor-not-allowed border-slate-200/80 bg-slate-100/80 text-slate-600'
                : 'border-rose-300/80 bg-rose-600 text-white shadow-rose-600/25 hover:bg-rose-500'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            Terminate All Other Sessions
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Device</th>
              <th className="px-6 py-3">IP Address &amp; Location</th>
              <th className="px-6 py-3">Last Active</th>
              <th className="px-6 py-3 text-center">Status</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {sessions.map((session) => {
              const roleMeta = ROLE_META[session.role];
              return (
                <tr
                  key={session.id}
                  className={`transition-colors ${
                    session.isCurrent ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-white/40'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80">
                        <User className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{session.user}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-black ${roleMeta.cls}`}>
                            {roleMeta.label}
                          </span>
                          {session.isCurrent && (
                            <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-100/80 px-2 py-0.5 text-sm font-black text-emerald-800">
                              Current Session
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                      <span className="text-sm font-semibold text-slate-700">{session.device}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-800">{session.ipAddress}</p>
                        <p className="text-sm text-slate-500">{session.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-slate-700">{session.lastActive}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <SessionStatusBadge status={session.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    {session.isCurrent ? (
                      <span className="text-sm font-semibold text-emerald-700">Protected</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => revokeSession(session.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/80 bg-rose-50/80 px-3 py-1.5 text-sm font-black uppercase tracking-wider text-rose-800 transition-all hover:bg-rose-100/80 hover:shadow-sm"
                      >
                        <OctagonX className="h-3 w-3" />
                        Revoke Access
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sessions.length === 0 && (
        <div className="px-6 py-10 text-center text-sm text-slate-500">No active vault sessions.</div>
      )}

      <div className="border-t border-slate-200/80 bg-slate-50/60 px-6 py-3">
        <p className="text-sm text-slate-500">
          {sessions.length} active session{sessions.length !== 1 ? 's' : ''} ·{' '}
          {sessions.filter((s) => s.status === 'ONLINE').length} online ·{' '}
          Revoked sessions are immediately invalidated and require re-authentication.
        </p>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Vault PIN Configuration Panel ───────────────────────────────────────────

const MFA_VALID_CODE = '000000'; // mock

function VaultPinConfigPanel() {
  const [idleTimeout,    setIdleTimeout]    = useState(30);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [mfaCode,        setMfaCode]        = useState('');
  const [newPin,         setNewPin]         = useState('');
  const [confirmPin,     setConfirmPin]     = useState('');
  const [mfaError,       setMfaError]       = useState(false);
  const [pinMismatch,    setPinMismatch]    = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [timeoutSaved,   setTimeoutSaved]   = useState(false);

  const pinReady =
    mfaCode.length === 6 &&
    newPin.length === 4 &&
    confirmPin.length === 4;

  const handleUpdatePin = () => {
    setMfaError(false);
    setPinMismatch(false);

    if (mfaCode !== MFA_VALID_CODE) {
      setMfaError(true);
      setMfaCode('');
      return;
    }
    if (newPin !== confirmPin) {
      setPinMismatch(true);
      setConfirmPin('');
      return;
    }

    setSaved(true);
    setMfaCode('');
    setNewPin('');
    setConfirmPin('');
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTimeoutSave = () => {
    setTimeoutSaved(true);
    setTimeout(() => setTimeoutSaved(false), 2500);
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Card header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
            <KeyRound className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Vault PIN Configuration
            </h3>
            <p className="text-sm font-medium text-slate-600">
              Control idle auto-lock behaviour and update the master vault PIN with MFA verification
            </p>
            <TraceabilityBlock />
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-200/60">

        {/* ── Idle Auto-Lock Timeout ── */}
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50/80">
                <Timer className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Idle Auto-Lock Timeout</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  The vault will soft-lock after this many minutes of inactivity. Any mouse or keyboard event then triggers the PIN screen.
                </p>
              </div>
            </div>
            {timeoutSaved && (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Timeout updated
              </span>
            )}
          </div>

          {/* ── Enable Auto-Lock master toggle ── */}
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                {autoLockEnabled
                  ? <ShieldCheck className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                  : <Unlock className="h-4 w-4 text-rose-500 flex-shrink-0" />
                }
                <span className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Enable Auto-Lock
                </span>
              </div>
              {/* Toggle pill */}
              <button
                type="button"
                role="switch"
                aria-checked={autoLockEnabled}
                onClick={() => setAutoLockEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                  autoLockEnabled
                    ? 'border-indigo-300/80 bg-indigo-600'
                    : 'border-slate-300/80 bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
                    autoLockEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Warning when auto-lock is disabled */}
            {!autoLockEnabled && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/70 px-3.5 py-2.5">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
                <p className="text-sm font-semibold leading-snug text-rose-700">
                  Warning: Disabling auto-lock leaves the vault permanently open while unattended.
                </p>
              </div>
            )}
          </div>

          <div className={`mt-4 flex flex-wrap items-center gap-4 transition-opacity duration-200 ${autoLockEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <Clock className="h-3 w-3 text-amber-600" />
                Idle Auto-Lock Timeout (Minutes)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={idleTimeout}
                  disabled={!autoLockEnabled}
                  onChange={(e) => setIdleTimeout(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                  className="w-24 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-sm font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all disabled:cursor-not-allowed"
                />
                <span className="text-sm font-semibold text-slate-500">
                  minute{idleTimeout !== 1 ? 's' : ''} of inactivity
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTimeoutSave}
              disabled={!autoLockEnabled}
              className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2 text-sm font-black uppercase tracking-widest text-amber-800 transition-all hover:bg-amber-100/80 hover:shadow-sm disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              Apply Timeout
            </button>
          </div>

          {autoLockEnabled && (
            <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              idleTimeout <= 2
                ? 'border-rose-200/80 bg-rose-50/60 text-rose-800'
                : idleTimeout <= 5
                  ? 'border-amber-200/80 bg-amber-50/60 text-amber-800'
                  : 'border-slate-200/60 bg-slate-50/60 text-slate-600'
            }`}>
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Vault will soft-lock after <strong className="mx-1">{idleTimeout} min</strong> of inactivity.
              {idleTimeout <= 2 && ' High-security mode — very aggressive lockout.'}
              {idleTimeout > 2 && idleTimeout <= 5 && ' Recommended range for executive sessions.'}
              {idleTimeout > 5 && ' Recommended range for executive sessions.'}
            </div>
          )}
        </div>

        {/* ── Change Master PIN ── */}
        <div className="px-6 py-5">
          <div className="mb-5 flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-rose-200/80 bg-rose-50/80">
              <Lock className="h-4 w-4 text-rose-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Change Master PIN</p>
              <p className="mt-0.5 text-sm text-slate-500">
                MFA verification is required before setting a new vault PIN. The current PIN is used for idle-lock resumption.
              </p>
            </div>
          </div>

          {saved && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              Vault PIN updated successfully. New PIN is now active.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            {/* MFA Code */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <ShieldCheck className="h-3 w-3 text-indigo-600" />
                Current Google Auth Code (MFA)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => {
                  setMfaError(false);
                  setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="6-digit code"
                className={`${inputCls} font-mono tracking-widest ${
                  mfaError ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''
                }`}
              />
              {mfaError && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" />
                  Invalid MFA code
                </p>
              )}
            </div>

            {/* New PIN */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3 text-slate-500" />
                New 4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className={`${inputCls} text-center tracking-[0.4em]`}
              />
              {newPin.length > 0 && newPin.length < 4 && (
                <p className="mt-1 text-sm text-slate-600">{4 - newPin.length} digit{4 - newPin.length !== 1 ? 's' : ''} remaining</p>
              )}
            </div>

            {/* Confirm PIN */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3 text-slate-500" />
                Confirm New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setPinMismatch(false);
                  setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className={`${inputCls} text-center tracking-[0.4em] ${
                  pinMismatch ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''
                }`}
              />
              {pinMismatch && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" />
                  PINs do not match
                </p>
              )}
              {confirmPin.length === 4 && newPin.length === 4 && confirmPin === newPin && !pinMismatch && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  PINs match
                </p>
              )}
            </div>
          </div>

          {/* Security advisory */}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
            <span>
              Your new PIN will replace the current vault PIN immediately. Avoid simple sequences (e.g. 1234, 0000).
              The MFA code must be verified first — this action is logged to the vault audit trail.
            </span>
          </div>

          {/* Update PIN button */}
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
              <Lock className="h-3 w-3" />
              MFA-gated · Audit logged · Cannot be undone without re-verification
            </div>
            <button
              type="button"
              onClick={handleUpdatePin}
              disabled={!pinReady}
              className={`flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all ${
                pinReady
                  ? 'bg-slate-900 shadow-slate-900/20 hover:bg-slate-700'
                  : 'cursor-not-allowed bg-slate-300 shadow-none'
              }`}
            >
              <Lock className="h-4 w-4" />
              Update PIN
            </button>
          </div>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── MFA Enrollment Panel ─────────────────────────────────────────────────────

const MOCK_SETUP_KEY = 'A1B2 C3D4 E5F6 G7H8 I9J0';

function MfaEnrollmentPanel() {
  const [otpCode,   setOtpCode]   = useState('');
  const [enabled,   setEnabled]   = useState(false);
  const [otpError,  setOtpError]  = useState(false);
  const [toast,     setToast]     = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleEnable = () => {
    setOtpError(false);
    if (otpCode.length !== 6) { setOtpError(true); return; }
    // mock: any 6-digit code is accepted
    setEnabled(true);
    setOtpCode('');
    showToast('Two-Factor Authentication has been enabled on this account.');
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {toast && (
        <div className="border-b border-emerald-200/80 bg-emerald-50/80 px-5 py-2.5">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {toast}
          </p>
        </div>
      )}

      {/* Card Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
            <Smartphone className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Two-Factor Authentication (MFA) Setup
            </h3>
            <p className="text-sm font-medium text-slate-600">
              Bind your Google Authenticator app to this executive vault account for an additional layer of access security.
            </p>
            <TraceabilityBlock />
          </div>
          {enabled && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-sm font-black uppercase tracking-wider text-emerald-800">
              <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
              MFA Active
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr]">

          {/* QR Code Block */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-44 w-44 flex-col items-center justify-center rounded-2xl border-4 border-slate-800 bg-slate-800 shadow-lg shadow-slate-900/30 select-none">
              {/* Simulated QR pattern */}
              <div className="mb-2 grid grid-cols-7 gap-0.5">
                {Array.from({ length: 49 }).map((_, i) => {
                  const corners = [0,1,2,3,4,5,6,7,13,14,20,21,27,28,34,35,42,43,44,45,46,47,48];
                  const isFilled = corners.includes(i) || Math.random() > 0.6;
                  return (
                    <div
                      key={i}
                      className={`h-3.5 w-3.5 rounded-[2px] ${isFilled ? 'bg-white' : 'bg-slate-700'}`}
                    />
                  );
                })}
              </div>
              <p className="mt-2 px-2 text-center text-sm font-bold uppercase tracking-wider text-slate-600 leading-tight">
                Scan with<br />Google Authenticator
              </p>
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-600">
              Step 1 — Scan QR Code
            </p>
          </div>

          {/* Setup Fields */}
          <div className="flex flex-col justify-center gap-5">

            {/* Manual Setup Key */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3 text-slate-500" />
                Manual Setup Key
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={MOCK_SETUP_KEY}
                  className="w-full rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 font-mono text-sm font-bold tracking-widest text-slate-700 shadow-inner focus:outline-none cursor-default select-all"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-sm font-bold uppercase tracking-wider text-slate-600">
                  Read Only
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Use this key if you cannot scan the QR code — enter it manually in Google Authenticator.
              </p>
            </div>

            {/* OTP Verify */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <ShieldCheck className="h-3 w-3 text-indigo-600" />
                Verify 6-Digit Code
              </label>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => {
                      setOtpError(false);
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    placeholder="Enter the 6-digit code from your app"
                    disabled={enabled}
                    className={`${inputCls} font-mono tracking-[0.35em] ${
                      otpError ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''
                    } ${enabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  />
                  {otpError && (
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                      <ShieldAlert className="h-3 w-3" />
                      A 6-digit code is required
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={enabled}
                  className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all ${
                    enabled
                      ? 'cursor-not-allowed bg-emerald-400 shadow-none'
                      : 'bg-indigo-600 shadow-indigo-600/25 hover:bg-indigo-500'
                  }`}
                >
                  {enabled ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      MFA Enabled
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Enable MFA
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Advisory */}
            <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span>
                Once enabled, every vault login will require both your password and a time-based 6-digit code.
                Disabling MFA requires full admin re-verification via the audit trail.
              </span>
            </div>
          </div>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── RBAC Matrix Panel ────────────────────────────────────────────────────────

type AccessLevel = 'FULL' | 'READ' | 'NONE';

interface RbacState {
  [role: string]: { [portal: string]: AccessLevel };
}

const RBAC_ROLES = [
  { id: 'fm',      label: 'FM',            sub: 'Finance Manager'     },
  { id: 'hr',      label: 'HR Admin',      sub: 'HR Administrator'    },
  { id: 'om',      label: 'OM',            sub: 'Operations Manager'  },
  { id: 'exec',    label: 'Exec Admin',    sub: 'Executive Admin'     },
  { id: 'cafe_mgr',label: 'Café Manager',  sub: 'Hospitality Manager' },
];

const RBAC_PORTALS = [
  { id: 'financials', label: 'Financials',         sub: 'Invoices / Payables'  },
  { id: 'hr_radar',   label: 'HR Radar',            sub: 'Staff & Payroll'      },
  { id: 'ops',        label: 'Operations Command',  sub: 'Field & Scheduling'   },
  { id: 'cafe_pos',   label: 'Café POS & Menu',     sub: 'Hospitality Portal'   },
  { id: 'settings',   label: 'Master Settings',     sub: 'Engine Config'        },
];

const INITIAL_RBAC: RbacState = {
  fm:       { financials: 'FULL', hr_radar: 'READ', ops: 'READ', cafe_pos: 'NONE', settings: 'NONE'  },
  hr:       { financials: 'READ', hr_radar: 'FULL', ops: 'READ', cafe_pos: 'NONE', settings: 'NONE'  },
  om:       { financials: 'READ', hr_radar: 'READ', ops: 'FULL', cafe_pos: 'READ', settings: 'NONE'  },
  exec:     { financials: 'FULL', hr_radar: 'FULL', ops: 'FULL', cafe_pos: 'FULL', settings: 'READ'  },
  cafe_mgr: { financials: 'NONE', hr_radar: 'NONE', ops: 'NONE', cafe_pos: 'FULL', settings: 'NONE'  },
};

const ACCESS_META: Record<AccessLevel, { label: string; cls: string; dotCls: string; selectCls: string }> = {
  FULL: {
    label:     'Full Access',
    cls:       'border-emerald-200/80 bg-emerald-50/80 text-emerald-900',
    dotCls:    'bg-emerald-500',
    selectCls: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 focus:ring-emerald-500/40',
  },
  READ: {
    label:     'Read Only',
    cls:       'border-amber-200/80 bg-amber-50/80 text-amber-900',
    dotCls:    'bg-amber-400',
    selectCls: 'border-amber-200/80 bg-amber-50/80 text-amber-900 focus:ring-amber-500/40',
  },
  NONE: {
    label:     'No Access',
    cls:       'border-slate-200/80 bg-slate-100/80 text-slate-500',
    dotCls:    'bg-slate-300',
    selectCls: 'border-slate-200/80 bg-slate-50/80 text-slate-500 focus:ring-slate-400/40',
  },
};

function RbacMatrixPanel() {
  const [matrix, setMatrix] = useState<RbacState>(INITIAL_RBAC);
  const [saved,  setSaved]  = useState(false);

  const setCell = (roleId: string, portalId: string, val: AccessLevel) =>
    setMatrix((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], [portalId]: val },
    }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <ExecutiveGlassCard className="overflow-hidden">

        {/* Card Header */}
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
                <Users className="h-5 w-5 text-violet-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Role-Based Access Control Matrix
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  Define the permission level each internal role holds across every system portal. Changes are enforced on the next session.
                </p>
                <TraceabilityBlock />
              </div>
            </div>

            {saved && (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Permissions saved
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="border-b border-slate-200/60 bg-white/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-bold uppercase tracking-widest text-slate-600">Access Levels:</span>
            {(Object.entries(ACCESS_META) as [AccessLevel, typeof ACCESS_META[AccessLevel]][]).map(([key, meta]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-black uppercase tracking-wider ${meta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls}`} />
                {meta.label}
              </span>
            ))}
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60">
              <tr>
                <th className="w-44 px-6 py-3 text-left text-sm font-bold uppercase tracking-widest text-slate-500">
                  Role
                </th>
                {RBAC_PORTALS.map((portal) => (
                  <th
                    key={portal.id}
                    className="px-4 py-3 text-center text-sm font-bold uppercase tracking-widest text-slate-500"
                  >
                    <div>{portal.label}</div>
                    <div className="mt-0.5 text-sm font-semibold normal-case tracking-normal text-slate-600">
                      {portal.sub}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {RBAC_ROLES.map((role, ri) => (
                <tr
                  key={role.id}
                  className={`transition-colors hover:bg-white/40 ${ri % 2 === 0 ? 'bg-white/20' : ''}`}
                >
                  {/* Role label */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-violet-200/80 bg-violet-50/80">
                        <User className="h-3.5 w-3.5 text-violet-700" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{role.label}</p>
                        <p className="text-sm text-slate-600">{role.sub}</p>
                      </div>
                    </div>
                  </td>

                  {/* Portal cells */}
                  {RBAC_PORTALS.map((portal) => {
                    const level = matrix[role.id][portal.id] as AccessLevel;
                    const meta  = ACCESS_META[level];
                    return (
                      <td key={portal.id} className="px-4 py-3 text-center">
                        <div className="relative inline-block">
                          <select
                            value={level}
                            onChange={(e) => setCell(role.id, portal.id, e.target.value as AccessLevel)}
                            className={`appearance-none rounded-xl border py-1.5 pl-3 pr-7 text-sm font-black uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 transition-all cursor-pointer ${meta.selectCls}`}
                          >
                            <option value="FULL">Full Access</option>
                            <option value="READ">Read Only</option>
                            <option value="NONE">No Access</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-2 text-sm text-slate-600 max-w-xl">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <span>
                Permission changes are logged to the executive audit trail and propagated to all active sessions on the next heartbeat.
                The MD and OD roles are immutable — contact system engineering to modify root-level access.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="flex flex-shrink-0 items-center gap-2 rounded-2xl bg-violet-700 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-violet-700/25 hover:bg-violet-600 transition-all"
            >
              <Save className="h-4 w-4" />
              Commit Permissions
            </button>
          </div>
        </div>
      </ExecutiveGlassCard>
    </div>
  );
}

const MASTER_BANK_FORMATS = [
  { id: 'commercial_csv', label: 'Commercial Bank — CSV' },
  { id: 'commercial_txt', label: 'Commercial Bank — TXT' },
];


// ─── Catalog Types & Initial Data ─────────────────────────────────────────────

interface PenaltyEntry   { id: string; offense: string; fine: number; }
interface ReplacementEntry { id: string; item: string; cost: number; }

const INITIAL_PENALTIES: PenaltyEntry[] = [
  { id: 'p1', offense: 'Sleeping on Post',               fine: 5000 },
  { id: 'p2', offense: 'Absence Without Notice',          fine: 3500 },
  { id: 'p3', offense: 'Uniform Non-Compliance',          fine: 1500 },
  { id: 'p4', offense: 'Mobile Phone Misuse on Duty',     fine: 2000 },
  { id: 'p5', offense: 'Abandoning Post',                 fine: 8000 },
  { id: 'p6', offense: 'Late Reporting (>30 min)',        fine: 1000 },
  { id: 'p7', offense: 'Insubordination',                 fine: 6000 },
  { id: 'p8', offense: 'Failure to Log Patrol Visit',     fine: 2500 },
];

const INITIAL_REPLACEMENTS: ReplacementEntry[] = [
  { id: 'r1', item: 'Broken TV — Main Lounge',            cost: 95000 },
  { id: 'r2', item: 'Lost Master Keys',                    cost: 12000 },
  { id: 'r3', item: 'Damaged Air Conditioner',             cost: 45000 },
  { id: 'r4', item: 'Missing Remote Controls (Set)',       cost:  8000 },
  { id: 'r5', item: 'Broken Window (Standard)',            cost: 25000 },
  { id: 'r6', item: 'Lost Access Card / Door Fob',        cost:  3500 },
  { id: 'r7', item: 'Damaged Bed Frame',                   cost: 38000 },
  { id: 'r8', item: 'Stained / Torn Linen Set',           cost:  6500 },
];

// ─── Asset Catalogs Panel ─────────────────────────────────────────────────────

function AssetCatalogsPanel() {
  const [penalties,     setPenalties]     = useState<PenaltyEntry[]>(INITIAL_PENALTIES);
  const [replacements,  setReplacements]  = useState<ReplacementEntry[]>(INITIAL_REPLACEMENTS);
  const [catalogSaved,  setCatalogSaved]  = useState(false);

  const showSaved = () => { setCatalogSaved(true); setTimeout(() => setCatalogSaved(false), 2500); };

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
              <TraceabilityBlock />
            </div>
          </div>
          {catalogSaved && (
            <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />Catalogs saved
            </span>
          )}
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
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
            <Home className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Shalom Replacement Costs</h3>
            <p className="text-sm font-medium text-slate-600">Standard asset replacement values used to bill tenants or guests for damaged / missing items</p>
            <TraceabilityBlock />
          </div>
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

      {/* ── Save bar ── */}
      <div className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/40 px-5 py-3.5 backdrop-blur-md">
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
          <span>These catalogs are referenced during payroll processing and tenant billing. Changes take effect on the next deduction cycle.</span>
        </div>
        <button
          type="button"
          onClick={showSaved}
          className="ml-4 flex flex-shrink-0 items-center gap-2 rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-slate-900/20 hover:bg-slate-700 transition-all"
        >
          <Save className="h-4 w-4" />
          Save Catalogs
        </button>
      </div>

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

const FormulaRow = ({ title, icon: Icon, defaultFormula }: { title: string; icon: any; defaultFormula: string }) => {
  const [formula, setFormula] = React.useState(defaultFormula);
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {title}
      </div>
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-md p-3 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400">
        <FileText className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          className="flex-1 text-sm font-mono text-slate-800 outline-none bg-transparent"
        />
        <div className="px-2 py-1 bg-indigo-50 border border-indigo-100 rounded text-xs font-bold text-indigo-700 whitespace-nowrap">
          B=30K: {evaluatePreview(formula)}
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────

export default function FMSettingsPage() {
  const [s, setS]               = useState<SettingsState>(INITIAL);
  const [saved, setSaved]       = useState(false);
  const [entities, setEntities] = useState<EntityNames>(INITIAL_ENTITY_NAMES);
  const [entitySaved, setEntitySaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRankPayMatrix().then((matrix) => {
      if (!cancelled) setS((prev) => ({ ...prev, rankPay: matrix }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [gratuitySettings, setGratuitySettings] = useState<GratuitySettings>({
    minYears: 5,
    monthlyBasicDivisor: 2,
  });
  const [gratuitySaved, setGratuitySaved] = useState(false);
  const [gratuitySaving, setGratuitySaving] = useState(false);
  const [gratuityError, setGratuityError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getGratuitySettings().then((cfg) => {
      if (!cancelled) setGratuitySettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGratuitySave = async () => {
    setGratuitySaving(true);
    setGratuityError('');
    const result = await saveGratuitySettings(gratuitySettings);
    setGratuitySaving(false);
    if (result.success) {
      setGratuitySaved(true);
      setTimeout(() => setGratuitySaved(false), 2500);
    } else {
      setGratuityError(result.error ?? 'Failed to save gratuity settings.');
    }
  };

  const [welfareFundSettings, setWelfareFundSettings] = useState<WelfareFundSettings>({
    monthlyDeductionLkr: 500,
  });
  const [welfareFundSaved, setWelfareFundSaved] = useState(false);
  const [welfareFundSaving, setWelfareFundSaving] = useState(false);
  const [welfareFundError, setWelfareFundError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWelfareFundSettings().then((cfg) => {
      if (!cancelled) setWelfareFundSettings(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWelfareFundSave = async () => {
    setWelfareFundSaving(true);
    setWelfareFundError('');
    const result = await saveWelfareFundSettings(welfareFundSettings);
    setWelfareFundSaving(false);
    if (result.success) {
      setWelfareFundSaved(true);
      setTimeout(() => setWelfareFundSaved(false), 2500);
    } else {
      setWelfareFundError(result.error ?? 'Failed to save welfare fund settings.');
    }
  };

  // ── Financial Config state ──────────────────────────────────────────────────
  const [masterBankFormat,      setMasterBankFormat]      = useState(MASTER_BANK_FORMATS[0].id);
  const [enforceBankFormat,     setEnforceBankFormat]     = useState(true);
  const [isolateExternalBank,   setIsolateExternalBank]   = useState(true);
  const [bankConfigSaved,       setBankConfigSaved]       = useState(false);

  const handleBankConfigSave = () => {
    setBankConfigSaved(true);
    setTimeout(() => setBankConfigSaved(false), 2500);
  };

  // ── Formula Engine state ────────────────────────────────────────────────────
  const [formulaEngineSaved, setFormulaEngineSaved] = useState(false);
  const handleFormulaEngineSave = () => {
    setFormulaEngineSaved(true);
    setTimeout(() => setFormulaEngineSaved(false), 2500);
  };

  // ── Dynamic Statutory Formula Builder state ─────────────────────────────────
  const [formulaBuilderSaved, setFormulaBuilderSaved] = useState(false);
  const handleFormulaBuilderSave = () => {
    setFormulaBuilderSaved(true);
    setTimeout(() => setFormulaBuilderSaved(false), 2500);
  };

  // ── Dynamic Statutory Formula Builder — Cafe Staff state ─────────────────────
  const [formulaBuilderCafeSaved, setFormulaBuilderCafeSaved] = useState(false);
  const handleFormulaBuilderCafeSave = () => {
    setFormulaBuilderCafeSaved(true);
    setTimeout(() => setFormulaBuilderCafeSaved(false), 2500);
  };

  // ── Guard Retention & Salary Release Rules state ─────────────────────────────
  const [prevMonthThreshold,      setPrevMonthThreshold]      = useState(30);
  const [salaryMonthThreshold,    setSalaryMonthThreshold]    = useState(10);
  const [retentionRulesSaved,     setRetentionRulesSaved]     = useState(false);
  const handleRetentionRulesSave = () => {
    setRetentionRulesSaved(true);
    setTimeout(() => setRetentionRulesSaved(false), 2500);
  };

  // ── Cross-Deployment Pay Rules state ────────────────────────────────────────
  const [enforceFlatSiteRate, setEnforceFlatSiteRate] = useState(true);
  const [allowPoyaOnFlatRate, setAllowPoyaOnFlatRate] = useState(false);

  // ── Live Wage Preview calculator state ───────────────────────────────────────
  const [smBasic,      setSmBasic]      = useState(55000);
  const [smVisits,     setSmVisits]     = useState(70);
  const [smVisitRate,  setSmVisitRate]  = useState(2000);
  const [hoSalary,     setHoSalary]     = useState(180000);

  useEffect(() => {
    let cancelled = false;
    getMdEngineConstants().then((engine) => {
      if (cancelled) return;
      setSmVisits(engine.smPreviewVisits);
      setHoSalary(engine.hoPreviewSalary);
      setSmBasic(engine.smFixedBasic);
      setSmVisitRate(engine.smPerVisitBonus);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [takeHomeFloor, setTakeHomeFloor] = React.useState(40);
  const [maxDeductionPct, setMaxDeductionPct] = React.useState(5);
  const [complianceSaved, setComplianceSaved] = React.useState(false);
  const [complianceSaving, setComplianceSaving] = React.useState(false);
  const [complianceLastEditor, setComplianceLastEditor] = React.useState<string | null>(null);
  const handleComplianceSave = () => {
    setComplianceSaving(true);
    setTimeout(() => {
      setComplianceSaving(false);
      setComplianceSaved(true);
      setComplianceLastEditor('Finance Manager (FM)');
      setTimeout(() => setComplianceSaved(false), 2500);
    }, 800);
  };

  // ── Operational Compliance state ─────────────────────────────────────────────
  const [hardBlockEnabled,  setHardBlockEnabled]  = useState(true);

  // ── Global Shift Timing Defaults state ───────────────────────────────────────
  const [dayShiftStart,   setDayShiftStart]   = useState('07:00');
  const [dayShiftEnd,     setDayShiftEnd]     = useState('19:00');
  const [nightShiftStart, setNightShiftStart] = useState('19:00');
  const [nightShiftEnd,   setNightShiftEnd]   = useState('07:00');

  // ── Finance & Compensation — Holiday Calendar state ──────────────────────────
  type HolidayEntry = { id: string; date: string; label: string; type: 'POYA' | 'STATUTORY' | 'PUBLIC_HOLIDAY' };

  const [holidayEntries, setHolidayEntries] = useState<HolidayEntry[]>([
    { id: 'h1', date: '2026-06-11', label: 'Poson Poya',           type: 'POYA' },
    { id: 'h2', date: '2026-07-10', label: 'Esala Poya',           type: 'POYA' },
    { id: 'h3', date: '2026-08-08', label: 'Nikini Poya',          type: 'POYA' },
    { id: 'h4', date: '2026-09-07', label: 'Binara Poya',          type: 'POYA' },
    { id: 'h5', date: '2026-02-04', label: 'Independence Day',     type: 'PUBLIC_HOLIDAY' },
    { id: 'h6', date: '2026-04-13', label: 'Sinhala & Tamil New Year', type: 'STATUTORY' },
    { id: 'h7', date: '2026-05-01', label: 'Labour Day',           type: 'STATUTORY' },
  ]);
  const [showHolidayModal, setShowHolidayModal]   = useState(false);
  const [newHolidayDate,   setNewHolidayDate]     = useState('');
  const [newHolidayLabel,  setNewHolidayLabel]    = useState('');
  const [newHolidayType,   setNewHolidayType]     = useState<HolidayEntry['type']>('POYA');
  const [holidayCalSaved,  setHolidayCalSaved]    = useState(false);

  const addHolidayEntry = () => {
    if (!newHolidayDate || !newHolidayLabel.trim()) return;
    setHolidayEntries((prev) => [
      ...prev,
      { id: `h-${Date.now()}`, date: newHolidayDate, label: newHolidayLabel.trim(), type: newHolidayType },
    ]);
    setNewHolidayDate('');
    setNewHolidayLabel('');
    setNewHolidayType('POYA');
    setShowHolidayModal(false);
  };

  const removeHolidayEntry = (id: string) =>
    setHolidayEntries((prev) => prev.filter((e) => e.id !== id));

  const saveHolidayCalendar = () => {
    setHolidayCalSaved(true);
    setTimeout(() => setHolidayCalSaved(false), 2500);
  };

  // Determine if holiday calendar is filled at least 1 year ahead
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const latestPoya       = holidayEntries.filter((e) => e.type === 'POYA').sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestStatutory  = holidayEntries.filter((e) => e.type === 'STATUTORY' || e.type === 'PUBLIC_HOLIDAY').sort((a, b) => b.date.localeCompare(a.date))[0];
  const poyaFilled       = latestPoya     && new Date(latestPoya.date)     >= oneYearFromNow;
  const statutoryFilled  = latestStatutory && new Date(latestStatutory.date) >= oneYearFromNow;
  const holidayCalendarIncomplete = !poyaFilled || !statutoryFilled;

  // ── Rank Pay Matrix state ───────────────────────────────────────────────────
  const BLANK_RANK: Omit<RankPay, 'id'> = { rankCode: '', fullTitle: '', basicPay: 0, annualIncrement: 0, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' };
  const [editingRankId,  setEditingRankId]  = useState<string | null>(null);
  const [editDraft,      setEditDraft]      = useState<Omit<RankPay, 'id'>>(BLANK_RANK);
  const [showAddRank,    setShowAddRank]    = useState(false);
  const [newRankDraft,   setNewRankDraft]   = useState<Omit<RankPay, 'id'>>(BLANK_RANK);
  const [rankMatrixSaved, setRankMatrixSaved] = useState(false);
  const [rankMatrixSaving, setRankMatrixSaving] = useState(false);
  const [rankMatrixError, setRankMatrixError] = useState('');

  const [stampDutyAmount, setStampDutyAmount] = useState(25);
  const [apitSlabs, setApitSlabs] = useState([
    { id: 1, min: 0,      max: 150000 as number | null, rate: 0  },
    { id: 2, min: 150001, max: 233333 as number | null, rate: 6  },
    { id: 3, min: 233334, max: 275000 as number | null, rate: 18 },
    { id: 4, min: 275001, max: 316666 as number | null, rate: 24 },
    { id: 5, min: 316667, max: 358333 as number | null, rate: 30 },
    { id: 6, min: 358334, max: null,                    rate: 36 },
  ]);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const startEditRank = (r: RankPay) => {
    setEditingRankId(r.id);
    setEditDraft({ rankCode: r.rankCode, fullTitle: r.fullTitle, basicPay: r.basicPay, annualIncrement: r.annualIncrement, salaryType: r.salaryType, operationalGroup: r.operationalGroup });
    setShowAddRank(false);
  };

  const cancelEditRank = () => {
    setEditingRankId(null);
    setEditDraft(BLANK_RANK);
  };

  const commitEditRank = () => {
    if (!editDraft.rankCode.trim() || !editDraft.fullTitle.trim()) return;
    setS((prev) => ({
      ...prev,
      rankPay: prev.rankPay.map((r) =>
        r.id === editingRankId ? { ...r, ...editDraft } : r
      ),
    }));
    setEditingRankId(null);
    setEditDraft(BLANK_RANK);
  };

  const deleteRank = (id: string) =>
    setS((prev) => ({ ...prev, rankPay: prev.rankPay.filter((r) => r.id !== id) }));

  const commitAddRank = () => {
    if (!newRankDraft.rankCode.trim() || !newRankDraft.fullTitle.trim()) return;
    setS((prev) => ({
      ...prev,
      rankPay: [
        ...prev.rankPay,
        { id: `rp-${Date.now()}`, ...newRankDraft },
      ],
    }));
    setNewRankDraft(BLANK_RANK);
    setShowAddRank(false);
  };

  const handleRankMatrixSave = async () => {
    setRankMatrixSaving(true);
    setRankMatrixError('');
    const result = await saveRankPayMatrix(s.rankPay);
    setRankMatrixSaving(false);
    if (result.success) {
      setRankMatrixSaved(true);
      setTimeout(() => setRankMatrixSaved(false), 2500);
    } else {
      setRankMatrixError(result.error ?? 'Failed to save rank matrix.');
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleEntitySave = () => {
    setEntitySaved(true);
    setTimeout(() => setEntitySaved(false), 2500);
  };

  const SM_MODES: { id: SmPayMode; label: string; desc: string }[] = [
    { id: 'FIXED_ONLY',          label: 'Fixed Basic Only',         desc: 'Monthly flat salary, no per-visit component' },
    { id: 'PER_VISIT_ONLY',      label: 'Per-Visit Bonus Only',     desc: 'Paid purely based on patrol visits logged' },
    { id: 'FIXED_AND_PER_VISIT', label: 'Fixed Basic + Per-Visit',  desc: 'Combination: base salary + per-visit top-up' },
  ];

  return (
    <>
      <SaveToast visible={saved} />

      <div className="min-h-screen bg-slate-50">
        {/* Dot-grid texture */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 opacity-25"
          style={{
            backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative z-10">

        <div className="mx-auto max-w-7xl px-4 pt-8 pb-0 sm:px-6 lg:px-8">
          <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />
        </div>

        <div className="min-h-0 pb-24 font-sans">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex w-full items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Settings & Compensations
              </h1>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                Master Configurator · Financial Engine Constants · Statutory Modifiers
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
            >
              <Save className="h-4 w-4" />
              Save All
            </button>
          </div>
        </header>

        <div className="w-full space-y-6 px-6 lg:px-12 2xl:px-24 py-8">

          <div className="space-y-6">

              {/* ── Corporate Bank Integration ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
                      <Landmark className="h-5 w-5 text-indigo-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Corporate Bank Integration</h3>
                      <p className="text-sm font-medium text-slate-600">
                        Set the master bank export format and enforce it globally across all payroll desks
                      </p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                  {bankConfigSaved && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Bank config saved &amp; enforced
                    </span>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      <Banknote className="h-3.5 w-3.5 text-indigo-600" />
                      Master Export Format
                    </label>
                    <select
                      value={masterBankFormat}
                      onChange={(e) => setMasterBankFormat(e.target.value)}
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
                          <p className="text-sm font-bold text-slate-800">Consolidated Master Batch</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">Guards</span>
                          <span className="text-xs font-bold text-slate-400">+</span>
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">Sector Managers</span>
                          <span className="text-xs font-bold text-slate-400">+</span>
                          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">HQ Staff</span>
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

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleBankConfigSave}
                      className="flex items-center gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-all"
                    >
                      <Save className="h-4 w-4" />
                      Save Bank Config
                    </button>
                  </div>
                </div>
              </ExecutiveGlassCard>

              {/* ── Compensation & Engine · Statutory Modifiers (2-col cluster) ── */}
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">

              {/* ── Global Statutory Modifiers ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
                      <Percent className="h-5 w-5 text-emerald-800" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Global Statutory Modifiers</h3>
                      <p className="text-sm font-medium text-slate-600">Invoice taxes, payroll deduction percentages, and daily rate divisor applied across all companies</p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                </div>

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
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="inline-flex rounded-lg border border-violet-200/80 bg-violet-50/80 px-2 py-0.5 text-sm font-black text-violet-800">APIT</span>
                        <span className="text-sm font-semibold text-slate-700">Income Tax</span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col gap-2 mt-2 w-full">
                          {apitSlabs.map((slab, index) => (
                            <div key={slab.id || index} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-500">LKR</span>
                              <input
                                type="number"
                                defaultValue={slab.min}
                                className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                              />
                              <span className="text-xs text-slate-400">to</span>
                              <input
                                type="number"
                                defaultValue={slab.max || ''}
                                placeholder="Upwards"
                                className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                              />
                              <span className="text-xs font-bold text-slate-500">— Tax:</span>
                              <input
                                type="number"
                                defaultValue={slab.rate}
                                className="w-16 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                              />
                              <span className="text-xs font-bold text-slate-500">%</span>
                              <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600 cursor-pointer ml-1" />
                            </div>
                          ))}
                          <button className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer uppercase tracking-wider mt-2 w-fit text-left">
                            + Add Tax Slab
                          </button>
                        </div>
                        <p className="text-xs font-medium text-slate-500">Progressive APIT engine locked to current IRD monthly thresholds.</p>
                      </div>
                    </div>

                    {/* Stamp Duty */}
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="inline-flex rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-sm font-black text-amber-800">STAMP</span>
                        <span className="text-sm font-semibold text-slate-700">Stamp Duty</span>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">LKR</span>
                          <input
                            type="number"
                            value={stampDutyAmount}
                            onChange={(e) => setStampDutyAmount(Number(e.target.value))}
                            className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <p className="text-xs font-medium text-slate-500">Fixed deduction applied to all salaries exceeding LKR 30,000.</p>
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

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
                    >
                      <Save className="h-4 w-4" />
                      Save Statutory Config
                    </button>
                  </div>

                </div>
              </ExecutiveGlassCard>

              {/* ── Corporate Pay Group Mapping ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
                      <Briefcase className="h-5 w-5 text-violet-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Corporate Pay Group Mapping</h3>
                      <p className="text-sm font-medium text-slate-600">Canonical compensation architecture governing how each operational group is paid</p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">

                  {/* Block 1: Guard (Field Operations) */}
                  <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-100/80">
                        <Shield className="h-5 w-5 text-blue-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800">Guard (Field Operations)</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">Pay dictated by Dynamic Day-Type Formula Engine — daily rate is calculated from the guard&apos;s basic salary, varying by day type: weekday (1×), weekend (1.25×), or public holiday (1.5×).</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-blue-50 border border-blue-200/70 rounded text-xs font-bold text-blue-700 flex items-center gap-1">
                            <Sun className="h-3 w-3" /> Weekday: 1× daily rate
                          </span>
                          <span className="px-3 py-1 bg-indigo-50 border border-indigo-200/70 rounded text-xs font-bold text-indigo-700 flex items-center gap-1">
                            <Star className="h-3 w-3" /> Weekend: 1.25×
                          </span>
                          <span className="px-3 py-1 bg-violet-50 border border-violet-200/70 rounded text-xs font-bold text-violet-700 flex items-center gap-1">
                            <Moon className="h-3 w-3" /> Public Holiday: 1.5×
                          </span>
                          <span className="px-3 py-1 bg-slate-50 border border-slate-200/70 rounded text-xs font-bold text-slate-600 flex items-center gap-1">
                            No OT — attendance-based
                          </span>
                        </div>
                        {/* Month Simulation Preview */}
                        <div className="mt-3">
                          <MonthSimulator />
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
                                    value={smBasic}
                                    onChange={(e) => setSmBasic(parseInt(e.target.value, 10) || 0)}
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
                                      value={smVisitRate}
                                      onChange={(e) => setSmVisitRate(parseInt(e.target.value, 10) || 0)}
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
                              const visitIncome = smVisits * smVisitRate;
                              const gross =
                                s.smPayMode === 'FIXED_ONLY'
                                  ? smBasic
                                  : s.smPayMode === 'PER_VISIT_ONLY'
                                    ? visitIncome
                                    : smBasic + visitIncome;
                              const epfEmp      = Math.round(gross * s.epfEmployeeRate / 100);
                              const epfEr       = Math.round(gross * s.epfEmployerRate / 100);
                              const etf         = Math.round(gross * s.etfRate / 100);
                              const apit        = calcApit(gross, apitSlabs);
                              const stampDuty   = stampDutyAmount;
                              const net         = gross - epfEmp - apit - stampDuty;
                              const breakdown =
                                s.smPayMode === 'FIXED_ONLY'
                                  ? 'Fixed salary only'
                                  : s.smPayMode === 'PER_VISIT_ONLY'
                                    ? `${smVisits} visits × LKR ${smVisitRate.toLocaleString()}`
                                    : `LKR ${smBasic.toLocaleString()} + (${smVisits} visits × LKR ${smVisitRate.toLocaleString()})`;
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
                                      <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">− LKR {stampDuty.toLocaleString()}</p>
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" className="px-3 py-1 bg-slate-50 border border-slate-200 border-dashed rounded text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-all flex items-center gap-1">
                            Flat Monthly Salary
                            <Pencil className="h-3 w-3 text-slate-400" />
                          </button>
                          <button type="button" className="px-3 py-1 bg-slate-50 border border-slate-200 border-dashed rounded text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-all flex items-center gap-1">
                            Zero OT
                            <Pencil className="h-3 w-3 text-slate-400" />
                          </button>
                          <button type="button" className="px-3 py-1 bg-slate-50 border border-slate-200 border-dashed rounded text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-all flex items-center gap-1">
                            FM/MD Approval Vault Only
                            <Pencil className="h-3 w-3 text-slate-400" />
                          </button>
                        </div>
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
                            const stampDuty  = stampDutyAmount;
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
                                    <p className="mt-0.5 text-xs tabular-nums font-semibold text-rose-700">− LKR {stampDuty.toLocaleString()}</p>
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
                        <p className="mt-1 text-sm font-semibold text-slate-600">9-Hour standard shift base. OT accumulates after 9 hours per shift, up to the MD-set monthly maximum.</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="px-3 py-1 bg-amber-50 border border-amber-200/70 rounded text-xs font-bold text-amber-700 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> 9-Hour Shift Base
                          </span>
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 whitespace-nowrap">Max OT / Month</p>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={s.cafeOtMaxMonthlyHours}
                              onChange={(e) => set('cafeOtMaxMonthlyHours', Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                              className="w-16 rounded border border-amber-200 bg-white px-2 py-0.5 text-xs font-black text-amber-900 text-center"
                            />
                            <span className="text-[9px] font-bold text-amber-600">hrs</span>
                          </div>
                        </div>
                        {/* Café Month Simulation */}
                        <div className="mt-3">
                          <CafeMonthSimulator />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </ExecutiveGlassCard>

              {/* ── Guard Retention & Salary Release Rules ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                        <ShieldAlert className="h-5 w-5 text-rose-700" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">Guard Retention &amp; Salary Release Rules</h3>
                        <p className="text-sm font-medium text-slate-600">Dynamically configure the minimum shift thresholds required to release previous month salaries. This prevents active roster desertion.</p>
                        <TraceabilityBlock />
                      </div>
                    </div>
                    {retentionRulesSaved && (
                      <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Rules saved to engine
                      </span>
                    )}
                  </div>
                </div>

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

                  {/* Save Button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleRetentionRulesSave}
                      className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:bg-rose-700 active:scale-95"
                    >
                      <Save className="h-4 w-4" />
                      Save Retention Rules
                    </button>
                  </div>

                </div>
              </ExecutiveGlassCard>

              {/* COMPLIANCE & DEDUCTION LIMITS CARD */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Compliance & Deduction Limits</h3>
                  </div>
                  {complianceSaved && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Saved to engine
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-5">Configure statutory take-home limits and deduction caps. These values are enforced by both the FM payroll engine and the OM recovery plan builder.</p>

                <div className="space-y-3">
                  <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-lg">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-slate-700">Statutory Take-Home Floor (%)</h4>
                      <p className="text-[10px] text-slate-500 mt-1">Minimum percentage of Gross Pay an employee must take home legally. FM payroll engine pauses and rolls over deductions that breach this.</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded-md shadow-inner">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={takeHomeFloor}
                        onChange={(e) => setTakeHomeFloor(Number(e.target.value))}
                        className="w-12 text-lg font-black text-slate-800 outline-none text-center"
                      />
                      <span className="text-lg font-black text-slate-400">%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-lg">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-slate-700">Max Monthly Deduction Cap (%)</h4>
                      <p className="text-[10px] text-slate-500 mt-1">Maximum percentage of Basic Salary that can be deducted per month. Enforced by the OM recovery plan builder (Guard Legal Max).</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded-md shadow-inner">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={maxDeductionPct}
                        onChange={(e) => setMaxDeductionPct(Number(e.target.value))}
                        className="w-12 text-lg font-black text-slate-800 outline-none text-center"
                      />
                      <span className="text-lg font-black text-slate-400">%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {complianceLastEditor ? `Saved — ${complianceLastEditor}` : 'Not yet saved to database'}
                  </div>
                  <button
                    type="button"
                    onClick={handleComplianceSave}
                    disabled={complianceSaving}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-indigo-600/25 transition-all hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {complianceSaving ? 'Saving…' : 'Save Compliance Rules'}
                  </button>
                </div>
              </div>

              {/* ── Dynamic Statutory Formula Builder Guards ── */}
              <ExecutiveGlassCard className="overflow-hidden xl:col-span-2">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-teal-200/80 bg-teal-50/80">
                      <FlaskConical className="h-5 w-5 text-teal-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Dynamic Statutory Formula Builder Guards</h3>
                      <p className="text-sm font-medium text-slate-600">
                        Construct the algebraic string used by the payroll engine to compute statutory entitlements for guard (field operations) employees
                      </p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {formulaBuilderSaved && (
                      <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Formula saved to engine
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">

                  {/* Day-Type Formula Matrix */}
                  <div className="flex flex-col w-full">
                    <FormulaRow title="STANDARD WORKING DAY" icon={Sun} defaultFormula="(B/26) + ((B/200) * 1.5 * 3)" />
                    <FormulaRow title="OT RATE (PER HOUR)" icon={Clock} defaultFormula="(B/200) * 1.5" />
                    <FormulaRow title="POYA DAY" icon={Star} defaultFormula="(B/200) * (2 * 11)" />
                    <FormulaRow title="PUBLIC HOLIDAY" icon={Flag} defaultFormula="(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)" />
                    <FormulaRow title="STATUTORY" icon={Scale} defaultFormula="(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)" />
                    <FormulaRow title="WEEKLY HOLIDAY (SUNDAY)" icon={Moon} defaultFormula="(B/200) * 1.5 * 11" />
                    <FormulaRow title="SATURDAY (HALF-DAY BASELINE)" icon={Calendar} defaultFormula="((B/26) * (6/8)) + ((B/200) * 1.5 * 5)" />
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

                <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleFormulaBuilderSave}
                    className="flex items-center gap-2 rounded-2xl bg-teal-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-teal-600/25 hover:bg-teal-500 transition-all"
                  >
                    <Save className="h-4 w-4" />
                    Commit Formula to Engine
                  </button>
                </div>
              </ExecutiveGlassCard>

              {/* ── Dynamic Statutory Formula Builder — Café Staff ── */}
              <ExecutiveGlassCard className="overflow-hidden xl:col-span-2">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-50/80">
                      <Coffee className="h-5 w-5 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Dynamic Statutory Formula Builder Cafe Staff</h3>
                      <p className="text-sm font-medium text-slate-600">
                        Construct the algebraic string used by the payroll engine to compute statutory entitlements for café employees
                      </p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {formulaBuilderCafeSaved && (
                      <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Formula saved to engine
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">

                  {/* Day-Type Formula Matrix — Café */}
                  <div className="flex flex-col w-full">
                    <FormulaRow title="STANDARD SHIFT / OTHER DAYS" icon={Sun}      defaultFormula="(B/26)" />
                    <FormulaRow title="OT RATE (PER HOUR)"           icon={Clock}    defaultFormula="(B/26/9) * 1.5" />
                    <FormulaRow title="POYA DAY"                      icon={Star}     defaultFormula="((B/26/9) * 1.5) * HRS" />
                    <FormulaRow title="PUBLIC HOLIDAY"                icon={Flag}     defaultFormula="(B/26)" />
                    <FormulaRow title="STATUTORY HOLIDAY"             icon={Scale}    defaultFormula="((B/26/9) * 1.5) * HRS" />
                    <FormulaRow title="WEEKLY HOLIDAY (SUNDAY)"       icon={Moon}     defaultFormula="(B/26)" />
                    <FormulaRow title="SATURDAY SHIFT"                icon={Calendar} defaultFormula="(B/26)" />
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
                      Invalid expressions will be rejected by the engine at compile-time. Café staff OT is capped at the MD-set monthly maximum before any formula is applied.
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleFormulaBuilderCafeSave}
                    className="flex items-center gap-2 rounded-2xl bg-amber-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-amber-600/25 hover:bg-amber-500 transition-all"
                  >
                    <Save className="h-4 w-4" />
                    Commit Formula to Engine
                  </button>
                </div>
              </ExecutiveGlassCard>

              </div>{/* end xl:grid-cols-2 cluster */}

              {/* ── Cross-Deployment Pay Rules ── */}
              <ExecutiveGlassCard className="overflow-hidden">
                <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-50/80">
                      <ArrowRightLeft className="h-5 w-5 text-sky-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Cross-Deployment Pay Rules</h3>
                      <p className="text-sm font-medium text-slate-600">
                        Controls how pay is calculated when a guard is loaned to a non-default site
                      </p>
                      <TraceabilityBlock />
                    </div>
                  </div>
                </div>

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

          {/* ── Legal Entity Branding ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            {/* Card header */}
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
                  <Globe2 className="h-5 w-5 text-indigo-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Legal Entity Branding &amp; Names</h3>
                  <p className="text-sm font-medium text-slate-600">Canonical division names used across all generated documents and portals</p>
                  <TraceabilityBlock />
                </div>
              </div>

              {/* Inline save confirmation */}
              {entitySaved && (
                <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Entity names saved
                </span>
              )}
            </div>

            <div className="p-6">
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

                {/* Save button */}
                <button
                  type="button"
                  onClick={handleEntitySave}
                  className="flex items-center gap-2 rounded-2xl border border-indigo-200/80 bg-indigo-600 px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-all"
                >
                  <Save className="h-4 w-4" />
                  Save Entity Names
                </button>
              </div>
            </div>
          </ExecutiveGlassCard>

          {/* ── Row 1: Café OT Kill-Switch + Billing Cycle ── */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

            {/* Café OT Cutoff */}
            <ExecutiveGlassCard className="p-6">
              <SectionHeader Icon={Clock} title="Café OT Time-Cutoff Kill-Switch" sub="Blocks the OT multiplier for any minutes worked past this time" accent="text-rose-700" />

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

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                Changing this affects all future Café payroll calculations immediately.
              </div>
            </ExecutiveGlassCard>

            {/* Billing Cycle */}
            <ExecutiveGlassCard className="p-6">
              <SectionHeader Icon={Calendar} title="Dynamic Billing Cycle Parameters" sub="Invoice dispatch, payroll target, and collection warning dates" />

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
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
                    <DollarSign className="h-5 w-5 text-emerald-800" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Master Rank Basic Pay Ledger</h3>
                    <p className="text-sm font-medium text-slate-600">MD-defined base pay, salary type (Bank/Cash), and pay category per rank — HO, Guard (Field Operations), Café Operations, or SM (MD dictated). Increment applies each completed service year.</p>
                    <TraceabilityBlock />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {rankMatrixSaved && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Matrix saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowAddRank((v) => !v); setEditingRankId(null); }}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black uppercase tracking-widest shadow-sm transition-all ${
                      showAddRank
                        ? 'border-slate-300/80 bg-slate-100/80 text-slate-600'
                        : 'border-emerald-300/80 bg-emerald-600 text-white shadow-emerald-600/25 hover:bg-emerald-500'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add New Rank
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="w-28 px-6 py-3">Rank Code</th>
                    <th className="px-6 py-3">Full Title</th>
                    <th className="px-6 py-3 text-right">Base Monthly Pay (LKR)</th>
                    <th className="px-6 py-3">Salary Type</th>
                    <th className="px-6 py-3">Pay Category</th>
                    <th className="px-6 py-3 text-right">Annual Increment (LKR)</th>
                    <th className="w-24 px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {s.rankPay.map((r, i) => {
                    const isEditing = editingRankId === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isEditing
                            ? 'bg-emerald-50/40'
                            : i % 2 === 0
                            ? 'bg-white/20 hover:bg-white/40'
                            : 'hover:bg-white/40'
                        }`}
                      >
                        {/* Rank Code */}
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft.rankCode}
                              onChange={(e) => setEditDraft((d) => ({ ...d, rankCode: e.target.value.toUpperCase().slice(0, 6) }))}
                              placeholder="e.g. OIC"
                              className="w-24 rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-center font-mono text-sm font-black uppercase tracking-widest text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            />
                          ) : (
                            <span className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100/80 px-3 font-mono text-sm font-black tracking-widest text-slate-800">
                              {r.rankCode}
                            </span>
                          )}
                        </td>

                        {/* Full Title */}
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft.fullTitle}
                              onChange={(e) => setEditDraft((d) => ({ ...d, fullTitle: e.target.value }))}
                              placeholder="e.g. Officer In Charge"
                              className="w-full max-w-xs rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            />
                          ) : (
                            <span className="text-sm font-semibold text-slate-800">{r.fullTitle}</span>
                          )}
                        </td>

                        {/* Base Pay */}
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-mono text-slate-600">LKR</span>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.basicPay}
                                onChange={(e) => setEditDraft((d) => ({ ...d, basicPay: parseInt(e.target.value) || 0 }))}
                                className="w-32 rounded-lg border border-emerald-200/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-sm font-black tabular-nums text-slate-900">
                              {r.basicPay.toLocaleString()}
                            </span>
                          )}
                        </td>

                        {/* Salary Type */}
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <select
                              value={editDraft.salaryType}
                              onChange={(e) => setEditDraft((d) => ({ ...d, salaryType: e.target.value as RankSalaryType }))}
                              className="w-full rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            >
                              {SALARY_TYPES.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold ${
                              r.salaryType === 'CASH'
                                ? 'border-amber-200/80 bg-amber-50/80 text-amber-800'
                                : 'border-slate-200/80 bg-slate-100/80 text-slate-700'
                            }`}>
                              {SALARY_TYPES.find((t) => t.id === r.salaryType)?.label ?? r.salaryType}
                            </span>
                          )}
                        </td>

                        {/* Pay Category */}
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <select
                              value={editDraft.operationalGroup}
                              onChange={(e) => setEditDraft((d) => ({ ...d, operationalGroup: e.target.value as OperationalGroup }))}
                              className="w-full min-w-[12rem] rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            >
                              {OPERATIONAL_GROUPS.map((g) => (
                                <option key={g.id} value={g.id}>{g.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-sm font-bold text-slate-700">
                              {OPERATIONAL_GROUPS.find((g) => g.id === r.operationalGroup)?.label ?? r.operationalGroup}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-mono text-slate-600">+</span>
                              <input
                                type="number"
                                min={0}
                                value={editDraft.annualIncrement}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    annualIncrement: parseInt(e.target.value, 10) || 0,
                                  }))
                                }
                                className="w-28 rounded-lg border border-emerald-200/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-sm font-bold tabular-nums text-emerald-800">
                              +{r.annualIncrement.toLocaleString()}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={commitEditRank}
                                disabled={!editDraft.rankCode.trim() || !editDraft.fullTitle.trim()}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Save"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditRank}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:text-slate-600"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditRank(r)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-indigo-200/80 hover:bg-indigo-50/80 hover:text-indigo-600"
                                title="Edit rank"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRank(r.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-rose-200/80 hover:bg-rose-50/80 hover:text-rose-600"
                                title="Delete rank"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Add new rank inline form */}
                  {showAddRank && (
                    <tr className="bg-emerald-50/30">
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={newRankDraft.rankCode}
                          onChange={(e) => setNewRankDraft((d) => ({ ...d, rankCode: e.target.value.toUpperCase().slice(0, 6) }))}
                          placeholder="e.g. DSO"
                          autoFocus
                          className="w-24 rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-center font-mono text-sm font-black uppercase tracking-widest text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={newRankDraft.fullTitle}
                          onChange={(e) => setNewRankDraft((d) => ({ ...d, fullTitle: e.target.value }))}
                          placeholder="e.g. Deputy Security Officer"
                          className="w-full max-w-xs rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-mono text-slate-600">LKR</span>
                          <input
                            type="number"
                            min={0}
                            value={newRankDraft.basicPay || ''}
                            onChange={(e) => setNewRankDraft((d) => ({ ...d, basicPay: parseInt(e.target.value) || 0 }))}
                            placeholder="0"
                            className="w-32 rounded-lg border border-emerald-300/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <select
                          value={newRankDraft.salaryType}
                          onChange={(e) => setNewRankDraft((d) => ({ ...d, salaryType: e.target.value as RankSalaryType }))}
                          className="w-full rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        >
                          {SALARY_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-3">
                        <select
                          value={newRankDraft.operationalGroup}
                          onChange={(e) => setNewRankDraft((d) => ({ ...d, operationalGroup: e.target.value as OperationalGroup }))}
                          className="w-full min-w-[12rem] rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        >
                          {OPERATIONAL_GROUPS.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-mono text-slate-600">+</span>
                          <input
                            type="number"
                            min={0}
                            value={newRankDraft.annualIncrement || ''}
                            onChange={(e) =>
                              setNewRankDraft((d) => ({
                                ...d,
                                annualIncrement: parseInt(e.target.value, 10) || 0,
                              }))
                            }
                            placeholder="0"
                            className="w-28 rounded-lg border border-emerald-300/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={commitAddRank}
                            disabled={!newRankDraft.rankCode.trim() || !newRankDraft.fullTitle.trim()}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Confirm add"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowAddRank(false); setNewRankDraft(BLANK_RANK); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:text-slate-600"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {s.rankPay.length === 0 && !showAddRank && (
              <div className="px-6 py-10 text-center text-sm text-slate-600">
                No ranks defined. Click &ldquo;Add New Rank&rdquo; to create the first entry.
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  {s.rankPay.length} rank{s.rankPay.length !== 1 ? 's' : ''} defined &middot; Adjusted basic = base + (annual increment × completed years)
                </p>
                {rankMatrixError && (
                  <p className="text-xs font-bold text-red-700 w-full sm:w-auto">{rankMatrixError}</p>
                )}
                <button
                  type="button"
                  onClick={handleRankMatrixSave}
                  disabled={rankMatrixSaving}
                  className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-white/80 px-4 py-2 text-sm font-black uppercase tracking-widest text-emerald-800 transition-all hover:bg-emerald-50 hover:shadow-sm disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {rankMatrixSaving ? 'Saving…' : 'Save Matrix'}
                </button>
              </div>
            </div>

          </ExecutiveGlassCard>

          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
                    <Scale className="h-5 w-5 text-violet-800" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Gratuity Provision Settings</h3>
                    <p className="text-sm font-medium text-slate-600">
                      Shared with MD — (monthly basic ÷ divisor) × years when tenure meets minimum. Excludes café employees; shown on HR clearance.
                    </p>
                    <TraceabilityBlock />
                  </div>
                </div>
                {gratuitySaved && (
                  <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
              </div>
            </div>
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
              </label>
            </div>
            <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              {gratuityError && (
                <p className="text-xs font-bold text-red-700">{gratuityError}</p>
              )}
              <button
                type="button"
                onClick={handleGratuitySave}
                disabled={gratuitySaving}
                className="ml-auto flex items-center gap-2 rounded-xl border border-violet-200/80 bg-white/80 px-4 py-2 text-sm font-black uppercase tracking-widest text-violet-800 transition-all hover:bg-violet-50 hover:shadow-sm disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {gratuitySaving ? 'Saving…' : 'Save Gratuity Settings'}
              </button>
            </div>
          </ExecutiveGlassCard>

          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-teal-200/80 bg-teal-50/80">
                    <HeartHandshake className="h-5 w-5 text-teal-800" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Employee Welfare Fund</h3>
                    <p className="text-sm font-medium text-slate-600">
                      MD-defined monthly deduction per employee — totals on Batch Execution → Welfare Fund card
                    </p>
                    <TraceabilityBlock />
                  </div>
                </div>
                {welfareFundSaved && (
                  <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
              </div>
            </div>
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
              </label>
            </div>
            <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              {welfareFundError && (
                <p className="text-xs font-bold text-red-700">{welfareFundError}</p>
              )}
              <button
                type="button"
                onClick={handleWelfareFundSave}
                disabled={welfareFundSaving}
                className="ml-auto flex items-center gap-2 rounded-xl border border-teal-200/80 bg-white/80 px-4 py-2 text-sm font-black uppercase tracking-widest text-teal-800 transition-all hover:bg-teal-50 hover:shadow-sm disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {welfareFundSaving ? 'Saving…' : 'Save Welfare Fund'}
              </button>
            </div>
          </ExecutiveGlassCard>

          {/* ── Row 3: Fuel Toggle ── */}
          <ExecutiveGlassCard className="p-6">
              <SectionHeader Icon={Car} title="Automated Fuel Surplus Correction" sub="Subtracts unverified mileage payouts from the next month's fuel advance" />

              <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/50 px-4 py-4 shadow-inner">
                <div>
                  <p className="text-sm font-bold text-slate-900">Fuel Surplus Auto-Correction</p>
                  <p className="text-sm text-slate-500">
                    {s.fuelSurplusCorrection
                      ? 'Active — unverified Google Maps mileage payouts will be clawed back next month'
                      : 'Inactive — no automatic fuel surplus recovery'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => set('fuelSurplusCorrection', !s.fuelSurplusCorrection)}
                  className="flex-shrink-0"
                >
                  {s.fuelSurplusCorrection
                    ? <ToggleRight className="h-10 w-10 text-emerald-600" />
                    : <ToggleLeft  className="h-10 w-10 text-slate-600" />
                  }
                </button>
              </div>

              <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                s.fuelSurplusCorrection
                  ? 'border-emerald-200/80 bg-emerald-50/60 text-emerald-800'
                  : 'border-slate-200/60 bg-slate-50/60 text-slate-500'
              }`}>
                {s.fuelSurplusCorrection
                  ? 'Mileage discrepancies flagged by the time engine will auto-deduct next cycle.'
                  : 'Toggle ON to enable automatic fuel surplus recovery.'}
              </div>
            </ExecutiveGlassCard>

          {/* ── Finance & Compensation — Holiday Calendar ── */}
          <ExecutiveGlassCard className="overflow-hidden" id="holiday-calendar">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                  <CalendarDays className="h-5 w-5 text-rose-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Finance &amp; Compensation — Holiday Calendar</h3>
                  <p className="text-sm font-medium text-slate-600">
                    Enter Poya, statutory, and public holiday dates. Applied globally across all payroll calculations.
                  </p>
                  <TraceabilityBlock />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {holidayCalSaved && (
                  <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    Calendar saved
                  </span>
                )}
                {holidayCalendarIncomplete && (
                  <span className="flex items-center gap-1.5 rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-1.5 text-sm font-bold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Dates not filled for 1 year ahead
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">

              {/* Incomplete warning banner */}
              {holidayCalendarIncomplete && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 px-5 py-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-black text-red-800">Action Required — Holiday Calendar Incomplete</p>
                    <p className="mt-1 text-sm font-semibold text-red-700">
                      {!poyaFilled && !statutoryFilled
                        ? 'Poya dates and statutory / public holiday dates must be entered at least 1 year ahead.'
                        : !poyaFilled
                        ? 'Poya dates must be entered at least 1 year ahead.'
                        : 'Statutory / public holiday dates must be entered at least 1 year ahead.'}
                      {' '}The payroll engine cannot accurately calculate holiday premiums without this data.
                    </p>
                  </div>
                </div>
              )}

              {/* Add new holiday button */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                  Configured Dates ({holidayEntries.length})
                </p>
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(true)}
                  className="flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 transition-all"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Add Holiday Date
                </button>
              </div>

              {/* Add holiday inline form */}
              {showHolidayModal && (
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-5 space-y-4">
                  <p className="text-sm font-black uppercase tracking-widest text-rose-700">New Holiday Entry</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Date</label>
                      <input
                        type="date"
                        value={newHolidayDate}
                        onChange={(e) => setNewHolidayDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Label / Name</label>
                      <input
                        type="text"
                        value={newHolidayLabel}
                        onChange={(e) => setNewHolidayLabel(e.target.value)}
                        placeholder="e.g. Esala Poya"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Type</label>
                      <select
                        value={newHolidayType}
                        onChange={(e) => setNewHolidayType(e.target.value as HolidayEntry['type'])}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all"
                      >
                        <option value="POYA">Poya Day</option>
                        <option value="STATUTORY">Statutory Holiday</option>
                        <option value="PUBLIC_HOLIDAY">Public Holiday</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={addHolidayEntry}
                      disabled={!newHolidayDate || !newHolidayLabel.trim()}
                      className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowHolidayModal(false); setNewHolidayDate(''); setNewHolidayLabel(''); }}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Holiday entries grouped by type */}
              {(['POYA', 'STATUTORY', 'PUBLIC_HOLIDAY'] as const).map((type) => {
                const entries = holidayEntries.filter((e) => e.type === type).sort((a, b) => a.date.localeCompare(b.date));
                const typeLabel = type === 'POYA' ? 'Poya Days' : type === 'STATUTORY' ? 'Statutory Holidays' : 'Public Holidays';
                const typeBadge = type === 'POYA'
                  ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                  : type === 'STATUTORY'
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-red-200 bg-red-50 text-red-700';
                const typeIcon = type === 'POYA' ? Star : type === 'STATUTORY' ? Scale : Flag;
                const TypeIcon = typeIcon;
                return (
                  <div key={type} className="rounded-2xl border border-slate-200/70 bg-white/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                      <TypeIcon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-black uppercase tracking-widest text-slate-600">{typeLabel}</span>
                      <span className={`ml-auto inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${typeBadge}`}>
                        {entries.length} date{entries.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {entries.length === 0 ? (
                      <p className="px-5 py-4 text-sm font-semibold text-slate-400 italic">No dates configured yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {entries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <CalendarCheck className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-bold text-slate-800">{entry.label}</p>
                                <p className="text-xs font-mono font-semibold text-slate-500">
                                  {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-LK', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeHolidayEntry(entry.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>

            <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-4 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                These dates are shared globally — all payroll calculations for Poya, statutory, and public holiday premiums reference this calendar.
              </p>
              <button
                type="button"
                onClick={saveHolidayCalendar}
                className="flex items-center gap-2 rounded-2xl bg-rose-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500 transition-all"
              >
                <Save className="h-4 w-4" />
                Save Calendar
              </button>
            </div>
          </ExecutiveGlassCard>

          {/* ── Sticky save bar ── */}
          <div className="sticky bottom-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
            >
              <Save className="h-4.5 w-4.5 h-4 w-4" />
              Commit All Settings to Engine
            </button>
          </div>

          </div>

        </div>
        </div>
        </div>
      </div>
    </>
  );
}
