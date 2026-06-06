'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Coffee,
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Clock,
  X,
  Trash2,
  TrendingDown,
  TrendingUp,
  Eye,
  ShieldAlert,
  Zap,
  ChevronDown,
  ChevronUp,
  Package,
  FlaskConical,
  BadgeAlert,
  Gavel,
  CalendarDays,
  Info,
  ChevronLeft,
  ChevronRight,
  VideoOff,
  ChefHat,
  Utensils,
  Layers,
  Tag,
  Smartphone,
  Plus,
  Upload,
  Satellite,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  name: string;
  role: string;
  dailyRate: number;
  daysWorked: number;
  deductionsMTD: number;
}

type TaskStatus = 'COMPLETE' | 'PENDING' | 'OVERDUE';
type TaskFreq   = 'DAILY' | 'WEEKLY';

interface Task {
  id: string;
  name: string;
  freq: TaskFreq;
  assignedTo: string;
  status: TaskStatus;
  proofUploadedAt?: string;
  purgeDate?: string;
}

interface DailyStockItem {
  id: string;
  name: string;
  unit: string;
  openingStock: number;
  closingStock: number;
  posSold: number;
  loggedWastage: number; // staff-logged wastage with photo proof
  assignedTo: string;
}

interface BulkStockItem {
  id: string;
  name: string;
  unit: string;
  theoreticalStock: number;
  physicalCount: number;
  periodDays: number;
  assignedTo: string;
}

interface Void {
  id: string;
  time: string;
  item: string;
  amount: number;
  voidedBy: string;
  reason: string;
  flagged: boolean;
}

// ─── Predictive Prep Engine Types ─────────────────────────────────────────────

interface PrepItem {
  id: string;
  name: string;
  currentStock: number;
  unit: string;
  rollingAvg14d: number;  // average daily usage over past 14 days
  shelfLifeDays: number;  // MD-configured spoilage limit
}

interface DisplayItem {
  id: string;
  name: string;
  currentWhole: number;   // whole units in stock (e.g., whole cakes)
  currentSlices: number;  // loose slices already cut
  slicesPerWhole: number; // how many slices one whole unit yields
  rollingAvg14d: number;  // average daily slice sales over 14 days
  shelfLifeDays: number;  // MD-configured display shelf limit
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const TODAY_STR = '2026-05-21';

// Mutable in component via state
const INITIAL_STAFF: StaffMember[] = [
  { id: 'S1', name: 'Nirosha Silva',    role: 'Head Barista',     dailyRate: 1800, daysWorked: 20, deductionsMTD: 0    },
  { id: 'S2', name: 'Chamari Perera',   role: 'Counter Staff',    dailyRate: 1500, daysWorked: 18, deductionsMTD: 1500 },
  { id: 'S3', name: 'Thilina Bandara',  role: 'Kitchen Assist',   dailyRate: 1400, daysWorked: 21, deductionsMTD: 0    },
  { id: 'S4', name: 'Ayasha Fernando',  role: 'Cashier',          dailyRate: 1600, daysWorked: 19, deductionsMTD: 0    },
  { id: 'S5', name: 'Dinuka Weerasena', role: 'Delivery / Floor', dailyRate: 1400, daysWorked: 15, deductionsMTD: 2800 },
];

const DEMO_TASKS: Task[] = [
  { id: 'T1',  name: 'Morning Station Prep',          freq: 'DAILY',  assignedTo: 'Nirosha',  status: 'COMPLETE', proofUploadedAt: '2026-05-21', purgeDate: '2026-06-04' },
  { id: 'T2',  name: 'Counter & Display Wipe',        freq: 'DAILY',  assignedTo: 'Chamari',  status: 'COMPLETE', proofUploadedAt: '2026-05-21', purgeDate: '2026-06-04' },
  { id: 'T3',  name: 'Fridge Temperature Log',        freq: 'DAILY',  assignedTo: 'Thilina',  status: 'COMPLETE', proofUploadedAt: '2026-05-21', purgeDate: '2026-06-04' },
  { id: 'T4',  name: 'Waste Disposal & Bin Seal',     freq: 'DAILY',  assignedTo: 'Dinuka',   status: 'PENDING',  proofUploadedAt: undefined,    purgeDate: undefined    },
  { id: 'T5',  name: 'Evening Floor Mop',             freq: 'DAILY',  assignedTo: 'Thilina',  status: 'PENDING',  proofUploadedAt: undefined,    purgeDate: undefined    },
  { id: 'T6',  name: 'Closing Cash Seal',             freq: 'DAILY',  assignedTo: 'Ayasha',   status: 'PENDING',  proofUploadedAt: undefined,    purgeDate: undefined    },
  { id: 'T7',  name: 'Deep Fridge & Freezer Clean',   freq: 'WEEKLY', assignedTo: 'Thilina',  status: 'COMPLETE', proofUploadedAt: '2026-05-18', purgeDate: '2026-06-01' },
  { id: 'T8',  name: 'Hood & Exhaust Vent Degrease',  freq: 'WEEKLY', assignedTo: 'Thilina',  status: 'OVERDUE',  proofUploadedAt: undefined,    purgeDate: undefined    },
  { id: 'T9',  name: 'Full Floor Scrub (after close)', freq: 'WEEKLY', assignedTo: 'Dinuka',  status: 'OVERDUE',  proofUploadedAt: undefined,    purgeDate: undefined    },
  { id: 'T10', name: 'Inventory Restock Count',       freq: 'WEEKLY', assignedTo: 'Nirosha',  status: 'COMPLETE', proofUploadedAt: '2026-05-18', purgeDate: '2026-06-01' },
];

// Historical task snapshots keyed by date offset (0 = today, 1 = yesterday, etc.)
function getTasksForOffset(offset: number): Task[] {
  if (offset === 0) return DEMO_TASKS;
  // Simulate historical data: older days have more complete tasks, some purged proofs
  return DEMO_TASKS.map((t) => {
    if (offset >= 3) {
      // 3+ days ago: most things were done, some proofs still available
      const purged = offset > 10 && t.proofUploadedAt;
      return {
        ...t,
        status: t.status === 'OVERDUE' && offset >= 5 ? 'PENDING' : t.status === 'PENDING' ? 'COMPLETE' : t.status,
        proofUploadedAt: purged ? undefined : t.proofUploadedAt,
        purgeDate: t.purgeDate,
      };
    }
    return { ...t };
  });
}

// ─── List A: Daily Stock ──────────────────────────────────────────────────────

const DEMO_LIST_A: DailyStockItem[] = [
  { id: 'A1', name: 'Coffee Beans (250g)',  unit: 'packs',   openingStock: 12, closingStock: 5,  posSold: 5,  loggedWastage: 0, assignedTo: 'Nirosha'  },
  { id: 'A2', name: 'Fresh Milk (1L)',      unit: 'cartons', openingStock: 24, closingStock: 8,  posSold: 14, loggedWastage: 1, assignedTo: 'Nirosha'  },
  { id: 'A3', name: 'Sandwich Bread',       unit: 'loaves',  openingStock: 10, closingStock: 3,  posSold: 6,  loggedWastage: 0, assignedTo: 'Thilina'  },
  { id: 'A4', name: 'Pastries / Croissants',unit: 'pcs',     openingStock: 28, closingStock: 7,  posSold: 18, loggedWastage: 2, assignedTo: 'Chamari'  },
  { id: 'A5', name: 'Soft Drinks (330ml)',  unit: 'cans',    openingStock: 48, closingStock: 30, posSold: 18, loggedWastage: 0, assignedTo: 'Dinuka'   },
  { id: 'A6', name: 'Juice Bottles (350ml)',unit: 'btls',    openingStock: 30, closingStock: 17, posSold: 11, loggedWastage: 0, assignedTo: 'Dinuka'   },
  { id: 'A7', name: 'Sugar Sachets',        unit: 'boxes',   openingStock: 8,  closingStock: 4,  posSold: 2,  loggedWastage: 0, assignedTo: 'Chamari'  },
  { id: 'A8', name: 'Takeaway Cups (Med)',  unit: 'sleeves', openingStock: 5,  closingStock: 2,  posSold: 3,  loggedWastage: 0, assignedTo: 'Nirosha'  },
];

// ─── List B: 3-Day Bulk Stock ─────────────────────────────────────────────────

const DEMO_LIST_B: BulkStockItem[] = [
  { id: 'B1', name: 'All-Purpose Flour',   unit: 'kg',   theoreticalStock: 18.0, physicalCount: 15.2, periodDays: 3, assignedTo: 'Thilina'  },
  { id: 'B2', name: 'Cooking Oil (5L)',    unit: 'tins', theoreticalStock: 8,    physicalCount: 7,    periodDays: 3, assignedTo: 'Thilina'  },
  { id: 'B3', name: 'Granulated Sugar',    unit: 'kg',   theoreticalStock: 12.0, physicalCount: 9.5,  periodDays: 3, assignedTo: 'Chamari'  },
  { id: 'B4', name: 'Coffee Syrup (1L)',   unit: 'btls', theoreticalStock: 6,    physicalCount: 5,    periodDays: 3, assignedTo: 'Nirosha'  },
  { id: 'B5', name: 'Chicken (Frozen kg)', unit: 'kg',   theoreticalStock: 15.0, physicalCount: 14.4, periodDays: 3, assignedTo: 'Thilina'  },
  { id: 'B6', name: 'Cheese Blocks',       unit: 'pcs',  theoreticalStock: 12,   physicalCount: 8,    periodDays: 3, assignedTo: 'Thilina'  },
];

// ─── Void Data ─────────────────────────────────────────────────────────────────

const DEMO_VOIDS: Void[] = [
  { id: 'V1', time: '09:14', item: 'Iced Latte × 2',     amount: 1600, voidedBy: 'Ayasha',  reason: 'Wrong order placed',        flagged: false },
  { id: 'V2', time: '11:47', item: 'Club Sandwich',       amount: 1200, voidedBy: 'Ayasha',  reason: 'Customer changed mind',      flagged: false },
  { id: 'V3', time: '14:02', item: 'Chicken Rice Bowl',   amount: 1450, voidedBy: 'Ayasha',  reason: 'No reason provided',         flagged: true  },
  { id: 'V4', time: '15:55', item: 'Jumbo Smoothie × 3',  amount: 2700, voidedBy: 'Chamari', reason: 'Manager override — discount', flagged: true  },
];

// ─── Menu Engineering Types & Data ───────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  category: string;
  /** Sum of raw ingredient costs from linked recipe (BOM) */
  recipeCost: number;
  targetMargin: number; // gross margin %
  hasImage: boolean;
}

const MENU_DEFAULT_CATS = [
  'Hot Beverages',
  'Cold Beverages',
  'Pastries & Bakery',
  'Mains & Sandwiches',
  'Desserts',
];

const INITIAL_MENU: MenuItem[] = [
  { id: 'M1', name: 'Espresso (Single)',       category: 'Hot Beverages',      recipeCost: 100, targetMargin: 72, hasImage: true  },
  { id: 'M2', name: 'Iced Caramel Latte',      category: 'Cold Beverages',     recipeCost: 154, targetMargin: 70, hasImage: true  },
  { id: 'M3', name: 'Flat White',              category: 'Hot Beverages',      recipeCost: 117, targetMargin: 70, hasImage: true  },
  { id: 'M4', name: 'Mango Smoothie',          category: 'Cold Beverages',     recipeCost: 125, targetMargin: 68, hasImage: false },
  { id: 'M5', name: 'Butter Croissant',        category: 'Pastries & Bakery',  recipeCost: 79,  targetMargin: 68, hasImage: true  },
  { id: 'M6', name: 'Club Sandwich',           category: 'Mains & Sandwiches', recipeCost: 238, targetMargin: 64, hasImage: true  },
  { id: 'M7', name: 'Chicken Rice Bowl',       category: 'Mains & Sandwiches', recipeCost: 267, targetMargin: 63, hasImage: false },
  { id: 'M8', name: 'Choc Fudge Cake (Slice)', category: 'Desserts',           recipeCost: 129, targetMargin: 69, hasImage: true  },
  { id: 'M9', name: 'Cinnamon Danish',         category: 'Pastries & Bakery',  recipeCost: 73,  targetMargin: 67, hasImage: false },
];

/** Base Cost = recipe ingredient sum + global operational overhead % */
function calcBaseCost(recipeCost: number, overheadPct: number): number {
  return Math.round(recipeCost * (1 + overheadPct / 100));
}

/** Final selling price via gross-margin formula: price = cost / (1 − margin%) */
function calcSellingPrice(baseCost: number, margin: number): number {
  if (margin >= 99) return baseCost * 10;
  return Math.round(baseCost / (1 - margin / 100));
}

// Per-category palette used by both the pricing table thumbnail and customer preview
const CAT_PALETTE: Record<string, { gradFrom: string; gradTo: string; accent: string; light: string }> = {
  'Hot Beverages':      { gradFrom: '#f59e0b', gradTo: '#92400e', accent: 'text-amber-600',   light: 'bg-amber-50'   },
  'Cold Beverages':     { gradFrom: '#38bdf8', gradTo: '#0369a1', accent: 'text-sky-600',     light: 'bg-sky-50'     },
  'Pastries & Bakery':  { gradFrom: '#fb923c', gradTo: '#9a3412', accent: 'text-orange-600',  light: 'bg-orange-50'  },
  'Mains & Sandwiches': { gradFrom: '#34d399', gradTo: '#065f46', accent: 'text-emerald-600', light: 'bg-emerald-50' },
  'Desserts':           { gradFrom: '#c084fc', gradTo: '#6b21a8', accent: 'text-violet-600',  light: 'bg-violet-50'  },
};

function getCatPalette(cat: string) {
  return CAT_PALETTE[cat] ?? { gradFrom: '#94a3b8', gradTo: '#334155', accent: 'text-slate-600', light: 'bg-slate-50' };
}

function ItemThumb({ item, size }: { item: MenuItem; size: 'sm' | 'lg' }) {
  const { gradFrom, gradTo } = getCatPalette(item.category);
  const cls = size === 'sm'
    ? 'h-11 w-11 rounded-xl flex-shrink-0'
    : 'h-32 w-full rounded-2xl';
  return (
    <div
      className={`relative overflow-hidden ${cls}`}
      style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
    >
      {item.hasImage ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full bg-white/20" />
          <div className="absolute h-2.5 w-2.5 rounded-full bg-white/40" />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-60">
          <Upload className="h-3.5 w-3.5 text-white" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white">Upload</span>
        </div>
      )}
    </div>
  );
}

// ─── Predictive Prep Demo Data ────────────────────────────────────────────────

const DEMO_PREP_ITEMS: PrepItem[] = [
  { id: 'P1', name: 'Plain Baguette',        unit: 'pcs',   currentStock: 4,   rollingAvg14d: 18, shelfLifeDays: 1 },
  { id: 'P2', name: 'Sandwich Dough Balls',  unit: 'balls', currentStock: 10,  rollingAvg14d: 24, shelfLifeDays: 2 },
  { id: 'P3', name: 'Quiche Pastry Cases',   unit: 'pcs',   currentStock: 3,   rollingAvg14d: 8,  shelfLifeDays: 2 },
  { id: 'P4', name: 'Croissant Dough (raw)', unit: 'pcs',   currentStock: 6,   rollingAvg14d: 14, shelfLifeDays: 1 },
  { id: 'P5', name: 'Bread Rolls (dinner)',  unit: 'pcs',   currentStock: 12,  rollingAvg14d: 20, shelfLifeDays: 1 },
];

const DEMO_DISPLAY_ITEMS: DisplayItem[] = [
  { id: 'D1', name: 'Chocolate Fudge Cake',   currentWhole: 1,  currentSlices: 2,  slicesPerWhole: 10, rollingAvg14d: 7,  shelfLifeDays: 3 },
  { id: 'D2', name: 'Caramel Cheesecake',     currentWhole: 0,  currentSlices: 4,  slicesPerWhole: 10, rollingAvg14d: 5,  shelfLifeDays: 3 },
  { id: 'D3', name: 'Lemon Tart',             currentWhole: 2,  currentSlices: 0,  slicesPerWhole: 8,  rollingAvg14d: 6,  shelfLifeDays: 2 },
  { id: 'D4', name: 'Cinnamon Danish Pastry', currentWhole: 0,  currentSlices: 3,  slicesPerWhole: 6,  rollingAvg14d: 9,  shelfLifeDays: 1 },
  { id: 'D5', name: 'Blueberry Muffin (tray)',currentWhole: 1,  currentSlices: 5,  slicesPerWhole: 12, rollingAvg14d: 11, shelfLifeDays: 2 },
];

// ─── Variance helpers ─────────────────────────────────────────────────────────

function listAVariance(item: DailyStockItem) {
  // Expected Closing = Opening Stock - POS Sold - Logged Wastage
  const expectedClosing = item.openingStock - item.posSold - item.loggedWastage;
  return item.closingStock - expectedClosing; // negative = unexplained missing stock
}

function listAPct(item: DailyStockItem) {
  const expectedClosing = Math.max(item.openingStock - item.posSold - item.loggedWastage, 1);
  return (listAVariance(item) / expectedClosing) * 100;
}

function listBVariance(item: BulkStockItem) {
  return item.physicalCount - item.theoreticalStock; // negative = missing
}

function listBPct(item: BulkStockItem) {
  return (listBVariance(item) / Math.max(item.theoreticalStock, 0.01)) * 100;
}

const THEFT_THRESHOLD = -10; // percent

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function offsetToDate(offset: number): string {
  const d = new Date(TODAY_STR);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function dateToOffset(dateStr: string): number {
  const today = new Date(TODAY_STR);
  const target = new Date(dateStr);
  return Math.round((today.getTime() - target.getTime()) / 86_400_000);
}

const STATUS_META: Record<TaskStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  COMPLETE: { label: 'Complete', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
  PENDING:  { label: 'Pending',  cls: 'bg-amber-100/90   text-amber-900   border-amber-200',   Icon: Clock        },
  OVERDUE:  { label: 'Overdue',  cls: 'bg-rose-100/90    text-rose-900    border-rose-200',    Icon: XCircle      },
};

// ─── Disciplinary Fine Modal ───────────────────────────────────────────────────

interface FineTarget {
  itemName: string;
  suggestedAmount: number;
  defaultStaffId: string;
  category: 'STOCK' | 'COMPLIANCE';
}

function DisciplinaryFineModal({
  target,
  staff,
  onConfirm,
  onClose,
}: {
  target: FineTarget | null;
  staff: StaffMember[];
  onConfirm: (staffId: string, amount: number, reason: string) => void;
  onClose: () => void;
}) {
  const [staffId,  setStaffId]  = useState(target?.defaultStaffId ?? staff[0]?.id ?? '');
  const [amount,   setAmount]   = useState(String(target?.suggestedAmount ?? 500));
  const [reason,   setReason]   = useState(
    target ? `Stock variance on "${target.itemName}" — see Theft Radar report ${TODAY_STR}` : ''
  );
  const [confirmed, setConfirmed] = useState(false);

  // Reset when target changes
  React.useEffect(() => {
    if (!target) return;
    setStaffId(target.defaultStaffId);
    setAmount(String(target.suggestedAmount));
    setReason(`Stock variance on "${target.itemName}" — see Theft Radar report ${TODAY_STR}`);
    setConfirmed(false);
  }, [target]);

  if (!target) return null;

  const selectedStaff = staff.find((s) => s.id === staffId);
  const gross = selectedStaff ? selectedStaff.dailyRate * selectedStaff.daysWorked : 0;
  const currentNet = selectedStaff ? gross - selectedStaff.deductionsMTD : 0;
  const fineAmt = parseFloat(amount) || 0;
  const projectedNet = currentNet - fineAmt;

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-12 right-0 h-44 w-44 rounded-full bg-rose-400/15 blur-[72px]" />

        <div className="relative p-6">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                <Gavel className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Disciplinary Action</p>
                <h2 className="text-lg font-black text-slate-900">Issue Disciplinary Fine</h2>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          {/* Linked violation */}
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200/70 bg-rose-50/50 px-3 py-2.5 text-[11px] text-rose-800">
            <BadgeAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
            <span>
              Linked violation: <strong>{target.itemName}</strong>
              {target.category === 'STOCK' ? ' — Stock Variance & Theft Radar flag' : ' — Compliance audit breach'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Staff selector */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Staff Member to Fine</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className={inputCls}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                ))}
              </select>

              {selectedStaff && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/60 p-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Gross MTD</p>
                    <p className="mt-0.5 text-xs font-black tabular-nums text-slate-800">{lkr(gross)}</p>
                  </div>
                  <div className="rounded-xl bg-white/60 p-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Current Net</p>
                    <p className="mt-0.5 text-xs font-black tabular-nums text-emerald-800">{lkr(currentNet)}</p>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${fineAmt > 0 ? 'bg-rose-50/80 ring-1 ring-rose-200/60' : 'bg-white/60'}`}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">After Fine</p>
                    <p className={`mt-0.5 text-xs font-black tabular-nums ${fineAmt > 0 ? 'text-rose-800' : 'text-slate-800'}`}>{lkr(projectedNet)}</p>
                  </div>
                </div>
              )}
            </ExecutiveGlassCard>

            {/* Amount */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Fine Amount (LKR)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputCls} pl-10`}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Deducted from staff's MTD salary immediately upon confirmation.</p>
            </ExecutiveGlassCard>

            {/* Reason */}
            <ExecutiveGlassCard className="p-4">
              <label className={labelCls}>Official Reason (for payslip record)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`${inputCls} resize-none`}
              />
            </ExecutiveGlassCard>

            {/* Confirm checkbox */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-rose-200/70 bg-rose-50/40 px-4 py-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-rose-600"
              />
              <span className="text-[11px] font-semibold text-rose-900">
                I, the MD, confirm this disciplinary deduction of <strong>LKR {(parseFloat(amount) || 0).toLocaleString()}</strong> from <strong>{selectedStaff?.name ?? '—'}</strong>'s MTD salary. This action is logged and non-reversible without a corrective entry.
              </span>
            </label>

            {/* Actions */}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Cancel</button>
              <button
                type="button"
                disabled={!confirmed || fineAmt <= 0}
                onClick={() => { onConfirm(staffId, fineAmt, reason); onClose(); }}
                className="flex-[2] rounded-xl bg-rose-700 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-rose-700/25 hover:bg-rose-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm & Deduct from MTD Salary
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Photo Proof Modal ────────────────────────────────────────────────────────

function PhotoModal({ task, lookbackDate, onClose }: { task: Task | null; lookbackDate: string; onClose: () => void }) {
  if (!task) return null;
  const st = STATUS_META[task.status];
  const offset = dateToOffset(lookbackDate);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full bg-emerald-400/18 blur-[60px]" />
        <div className="relative p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Task Photo Proof · {offset === 0 ? 'Today' : lookbackDate}
              </p>
              <h3 className="mt-0.5 text-lg font-black text-slate-900">{task.name}</h3>
              <p className="text-xs text-slate-500">Assigned to {task.assignedTo}</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          <ExecutiveGlassCard className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100/80">
              <Camera className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {task.proofUploadedAt ? 'Live photo of completed task' : 'No photo uploaded for this date'}
            </p>
            {task.proofUploadedAt && <p className="text-[10px] text-slate-400">Uploaded {task.proofUploadedAt}</p>}
          </ExecutiveGlassCard>

          {task.purgeDate && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[10px] text-amber-800">
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span><strong>Auto-Purge:</strong> Photo permanently deleted after <strong>{task.purgeDate}</strong>. Compliance score record is permanent.</span>
            </div>
          )}

          <div className="mt-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${st.cls}`}>
              <st.Icon className="h-3.5 w-3.5" />{st.label}
            </span>
          </div>

          <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock Variance & Theft Radar ─────────────────────────────────────────────

function VarianceBadge({ pct }: { pct: number }) {
  const isFlagged = pct < THEFT_THRESHOLD;
  const isWarn    = pct < 0 && !isFlagged;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${
      isFlagged ? 'border-rose-300 bg-rose-100/90 text-rose-900 animate-pulse' :
      isWarn    ? 'border-amber-200 bg-amber-50/80 text-amber-800' :
      'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    }`}>
      {isFlagged && <BadgeAlert className="h-2.5 w-2.5" />}
      {fmtPct(pct)}
    </span>
  );
}

function StockVarianceRadar({
  staff,
  onIssueFine,
}: {
  staff: StaffMember[];
  onIssueFine: (target: FineTarget) => void;
}) {
  const [tab, setTab]              = useState<'A' | 'B'>('A');
  const [showVoids, setShowVoids]  = useState(false);
  const [showWastageLog, setShowWastageLog] = useState(false);

  const flaggedA = DEMO_LIST_A.filter((i) => listAPct(i) < THEFT_THRESHOLD).length;
  const flaggedB = DEMO_LIST_B.filter((i) => listBPct(i) < THEFT_THRESHOLD).length;
  const totalFlagged = flaggedA + flaggedB;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Stock Variance & Theft Radar</h2>
              <p className="text-[10px] text-slate-500">Flags items with &gt;10% unexplained loss vs. POS records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalFlagged > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1 text-[10px] font-black text-rose-800 animate-pulse">
                <ShieldAlert className="h-3 w-3" />
                {totalFlagged} theft/loss flag{totalFlagged > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'A' as const, label: 'List A — Daily Stock', Icon: Package, flags: flaggedA },
            { key: 'B' as const, label: 'List B — 3-Day Bulk',  Icon: FlaskConical, flags: flaggedB },
          ].map(({ key, label, Icon, flags }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                tab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
              {flags > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === key ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-800'}`}>
                  {flags}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Live Camera enforcement note */}
        <div className="mt-2.5 flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50/80 px-3 py-1">
            <Camera className="h-3 w-3 text-emerald-700" />
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Live Camera Verified</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/60 px-3 py-1">
            <VideoOff className="h-3 w-3 text-slate-500" />
            <span className="text-[9px] font-semibold text-slate-600">
              Mobile app strictly restricted to Live Camera captures only — gallery uploads blocked to prevent delayed stock fraud.
            </span>
          </div>
        </div>
      </div>

      {/* Log Wastage action bar */}
      {tab === 'A' && (
        <div className="flex items-center gap-3 border-b border-slate-200/70 bg-white/30 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setShowWastageLog((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2 text-[10px] font-black text-amber-800 transition-all hover:bg-amber-100/80"
          >
            <Camera className="h-3.5 w-3.5" />
            + Log Wastage (Photo Required)
          </button>
          {showWastageLog && (
            <span className="flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[10px] text-amber-800">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              Live camera capture required — select item and quantity in field app to submit.
              <button type="button" onClick={() => setShowWastageLog(false)} className="ml-1 font-black text-amber-900 hover:text-amber-700">✕</button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {tab === 'A' && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3 text-center">Opening Stock</th>
                <th className="px-5 py-3 text-center">Evening Closing</th>
                <th className="px-5 py-3 text-center">POS Sold</th>
                <th className="px-5 py-3 text-center bg-amber-50/60">
                  <span className="text-amber-700">Logged Wastage</span>
                </th>
                <th className="px-5 py-3 text-center">Variance</th>
                <th className="px-5 py-3 text-center">% vs Expected</th>
                <th className="px-5 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {DEMO_LIST_A.map((item) => {
                const variance = listAVariance(item);
                const pct = listAPct(item);
                const isFlagged = pct < THEFT_THRESHOLD;
                const expectedClosing = item.openingStock - item.posSold - item.loggedWastage;
                const responsible = staff.find((s) => s.name.split(' ')[0] === item.assignedTo);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isFlagged
                        ? 'bg-rose-50/50 hover:bg-rose-50/70'
                        : 'hover:bg-white/40'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit} · {item.assignedTo}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.openingStock}</p>
                      <div className="mt-0.5 flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                          <Camera className="h-2 w-2" /> Cam Verified
                        </span>
                        <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View</button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.closingStock}</p>
                      <div className="mt-0.5 flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                          <Camera className="h-2 w-2" /> Cam Verified
                        </span>
                        <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View</button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="text-sm font-semibold text-slate-700">{item.posSold}</div>
                      <div className="text-[10px] text-slate-400">→ expect {expectedClosing} left</div>
                    </td>
                    <td className="px-5 py-3.5 text-center bg-amber-50/30">
                      {item.loggedWastage > 0 ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-black tabular-nums text-sm text-amber-800">{item.loggedWastage} {item.unit}</span>
                          <button type="button" className="text-[8px] font-black text-sky-600 hover:underline">📷 View proof</button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums text-sm ${variance < 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                        {variance >= 0 ? '+' : ''}{variance} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <VarianceBadge pct={pct} />
                    </td>
                    <td className="px-5 py-3.5">
                      {isFlagged ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900">
                            <BadgeAlert className="h-2.5 w-2.5" />
                            Review for Theft/Loss
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onIssueFine({
                                itemName: item.name,
                                suggestedAmount: 500,
                                defaultStaffId: responsible?.id ?? staff[0]?.id ?? '',
                                category: 'STOCK',
                              })
                            }
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Issue Disciplinary Fine (LKR)
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Within tolerance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'B' && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Bulk Item</th>
                <th className="px-5 py-3 text-center">Period</th>
                <th className="px-5 py-3 text-center">Theoretical Stock</th>
                <th className="px-5 py-3 text-center">Physical Count</th>
                <th className="px-5 py-3 text-center">Variance</th>
                <th className="px-5 py-3 text-center">% vs Theoretical</th>
                <th className="px-5 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {DEMO_LIST_B.map((item) => {
                const variance = listBVariance(item);
                const pct = listBPct(item);
                const isFlagged = pct < THEFT_THRESHOLD;
                const responsible = staff.find((s) => s.name.split(' ')[0] === item.assignedTo);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isFlagged
                        ? 'bg-rose-50/50 hover:bg-rose-50/70'
                        : 'hover:bg-white/40'
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit} · {item.assignedTo}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="rounded-lg border border-slate-200/80 bg-white/60 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.periodDays}-day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm font-semibold text-slate-700">{item.theoreticalStock} {item.unit}</td>
                    <td className="px-5 py-3.5 text-center">
                      <p className="font-mono text-sm font-semibold text-slate-700">{item.physicalCount} {item.unit}</p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2 py-0.5 text-[8px] font-black text-sky-700 transition-all hover:bg-sky-100/80 whitespace-nowrap"
                      >
                        <Camera className="h-2 w-2" /> View Timestamped Photo
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums text-sm ${variance < 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                        {variance >= 0 ? '+' : ''}{variance.toFixed(1)} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <VarianceBadge pct={pct} />
                    </td>
                    <td className="px-5 py-3.5">
                      {isFlagged ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900">
                            <BadgeAlert className="h-2.5 w-2.5" />
                            Review for Theft/Loss
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onIssueFine({
                                itemName: item.name,
                                suggestedAmount: 1000,
                                defaultStaffId: responsible?.id ?? staff[0]?.id ?? '',
                                category: 'STOCK',
                              })
                            }
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Issue Disciplinary Fine (LKR)
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Within tolerance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Threshold legend */}
      <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> RED = &gt;10% unexplained loss → "Review for Theft/Loss"</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> AMBER = 0–10% loss → monitor</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> GREEN = balanced or surplus</span>
        </div>
        <p className="text-[10px] font-semibold text-slate-600">
          Formula: <span className="font-black text-slate-800">Expected Closing = Opening Stock − POS Sold − Logged Wastage</span>. Variance = Actual Closing − Expected Closing.
        </p>
      </div>

      {/* Collapsible POS Void Register */}
      <div className="border-t border-slate-200/80">
        <button
          type="button"
          onClick={() => setShowVoids((v) => !v)}
          className="flex w-full items-center justify-between bg-slate-50/60 px-5 py-3"
        >
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">POS Void Register</span>
            {DEMO_VOIDS.filter((v) => v.flagged).length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 text-[9px] font-bold text-rose-800">
                <AlertTriangle className="h-2.5 w-2.5" />
                {DEMO_VOIDS.filter((v) => v.flagged).length} suspicious
              </span>
            )}
          </div>
          {showVoids ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showVoids && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Item(s)</th>
                  <th className="px-5 py-3">Voided By</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3 text-center">Flag</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {DEMO_VOIDS.map((v) => {
                  const staffMatch = INITIAL_STAFF.find((s) => s.name.split(' ')[0] === v.voidedBy);
                  return (
                    <tr key={v.id} className={`transition-colors ${v.flagged ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-white/40'}`}>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{v.time}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{v.item}</td>
                      <td className="px-5 py-3 text-slate-600">{v.voidedBy}</td>
                      <td className="px-5 py-3 text-right font-black tabular-nums text-rose-800">{lkr(v.amount)}</td>
                      <td className="px-5 py-3 text-xs italic text-slate-600">{v.reason}</td>
                      <td className="px-5 py-3 text-center">
                        {v.flagged
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-2 py-0.5 text-[9px] font-black text-rose-800"><AlertTriangle className="h-2.5 w-2.5" />Suspicious</span>
                          : <CheckCircle2 className="mx-auto h-4 w-4 text-slate-300" />}
                      </td>
                      <td className="px-5 py-3">
                        {v.flagged && (
                          <button
                            type="button"
                            onClick={() => {
                              // find staff for void
                              const sId = staffMatch?.id ?? INITIAL_STAFF.find((s) => s.name.split(' ')[0] === v.voidedBy)?.id ?? INITIAL_STAFF[0].id;
                              // This is just a stub — parent onIssueFine is not accessible here
                              // We'll handle this via a different mechanism; for now show tooltip
                            }}
                            className="flex items-center gap-1 rounded-xl border border-rose-200/80 bg-white/70 px-2 py-1 text-[10px] font-black text-rose-800 hover:bg-rose-50 transition-all whitespace-nowrap"
                          >
                            <Gavel className="h-3 w-3" />
                            Fine
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Predictive Prep & Wastage Control Engine ─────────────────────────────────

/** Returns the recommended prep quantity, capped so the kitchen never preps more
 *  than `shelfLifeDays` days worth of stock, and never less than 0. */
function calcPrepQty(item: PrepItem): number {
  const maxBatch = Math.ceil(item.rollingAvg14d * item.shelfLifeDays);
  const needed   = Math.max(0, item.rollingAvg14d - item.currentStock);
  return Math.min(needed, maxBatch);
}

/** Returns a bakery whole-unit action for a display item (no slice-cutting). */
function calcDisplayAction(item: DisplayItem): { text: string; urgent: boolean } {
  const totalAvail  = item.currentSlices + item.currentWhole * item.slicesPerWhole;
  const wholesToThaw = Math.max(1, Math.ceil((item.rollingAvg14d - item.currentWhole * item.slicesPerWhole) / item.slicesPerWhole));

  if (item.currentWhole === 0 && item.currentSlices === 0) {
    return { text: 'OUT OF STOCK — Reorder required', urgent: true };
  }
  if (totalAvail < item.rollingAvg14d * 0.5) {
    return { text: `⚡ Thaw ${wholesToThaw} Whole Unit${wholesToThaw > 1 ? 's' : ''} — Urgent`, urgent: true };
  }
  if (item.currentWhole === 0 && item.currentSlices < item.rollingAvg14d * 0.6) {
    return { text: '👨‍🍳 Bake 1 Batch — stock running low', urgent: false };
  }
  if (item.currentWhole > 0 && totalAvail < item.rollingAvg14d) {
    return { text: `⚡ Thaw ${wholesToThaw} Whole Unit${wholesToThaw > 1 ? 's' : ''}`, urgent: false };
  }
  return { text: '✓ Stock Adequate', urgent: false };
}

function PrepActionBadge({ text, urgent }: { text: string; urgent: boolean }) {
  if (text.startsWith('✓')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-black text-emerald-800">
        {text}
      </span>
    );
  }
  if (text.startsWith('OUT OF STOCK')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900 animate-pulse">
        <BadgeAlert className="h-2.5 w-2.5 flex-shrink-0" /> {text}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black ${
      urgent
        ? 'border-rose-300/80 bg-rose-100/90 text-rose-900 animate-pulse'
        : 'border-amber-200/80 bg-amber-50/80 text-amber-900'
    }`}>
      {text}
    </span>
  );
}

function PredictivePrepEngine() {
  const [activeTab,    setActiveTab]    = useState<'PREP' | 'DISPLAY'>('PREP');
  const [prepItems,    setPrepItems]    = useState<PrepItem[]>(DEMO_PREP_ITEMS);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>(DEMO_DISPLAY_ITEMS);

  const updatePrepShelf = (id: string, days: number) =>
    setPrepItems((prev) => prev.map((i) => (i.id === id ? { ...i, shelfLifeDays: Math.max(1, days) } : i)));

  const updateDisplayShelf = (id: string, days: number) =>
    setDisplayItems((prev) => prev.map((i) => (i.id === id ? { ...i, shelfLifeDays: Math.max(1, days) } : i)));

  const shelfInputCls = 'w-14 rounded-lg border border-violet-200/80 bg-white/90 px-1.5 py-1 text-center text-xs font-black text-violet-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 transition-all';

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <ChefHat className="h-4.5 w-4.5 text-violet-700" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Predictive Prep &amp; Wastage Control
              </h2>
              <p className="mt-0.5 max-w-xl text-[10px] leading-relaxed text-slate-500">
                Barista morning prep lists are automatically generated by subtracting current verified stock
                from the 14-day sales velocity, capped by the MD&apos;s spoilage limits.
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'PREP'    as const, label: 'Prep Items',    Icon: ChefHat   },
            { key: 'DISPLAY' as const, label: 'Display Items', Icon: Utensils  },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === key
                  ? 'bg-violet-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Prep Items Table ── */}
      {activeTab === 'PREP' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3 text-center">Current Stock</th>
                <th className="px-5 py-3 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3" /> 14-Day Rolling Avg
                  </span>
                </th>
                <th className="px-5 py-3 text-center">MD Shelf Life (Days)</th>
                <th className="px-5 py-3 text-center bg-violet-50/60">
                  <span className="text-violet-700">System Prep Qty</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {prepItems.map((item) => {
                const prepQty   = calcPrepQty(item);
                const isUrgent  = prepQty > 0 && item.currentStock < item.rollingAvg14d * 0.5;
                const isOut     = item.currentStock < item.rollingAvg14d * 0.2;
                return (
                  <tr key={item.id} className={`transition-colors ${
                    isOut    ? 'bg-rose-50/40 hover:bg-rose-50/60' :
                    isUrgent ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                    'hover:bg-white/40'
                  }`}>
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500">{item.unit}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-black tabular-nums ${
                        item.currentStock < item.rollingAvg14d * 0.3 ? 'text-rose-800' :
                        item.currentStock < item.rollingAvg14d * 0.6 ? 'text-amber-800' :
                        'text-slate-700'
                      }`}>
                        {item.currentStock} {item.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm text-slate-600">
                      {item.rollingAvg14d} <span className="text-[10px] text-slate-400">{item.unit}/day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={item.shelfLifeDays}
                          onChange={(e) => updatePrepShelf(item.id, parseInt(e.target.value) || 1)}
                          className={shelfInputCls}
                        />
                        <span className="text-[9px] font-bold text-violet-600">days</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center bg-violet-50/40">
                      {prepQty === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-black text-emerald-800">
                          <CheckCircle2 className="h-2.5 w-2.5" /> No prep needed
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-lg font-black tabular-nums ${isOut ? 'text-rose-800' : 'text-violet-800'}`}>
                            {prepQty}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-500">{item.unit} to prep</span>
                          {isOut && (
                            <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full border border-rose-300/80 bg-rose-100/90 px-1.5 py-0.5 text-[8px] font-black text-rose-900 animate-pulse">
                              <AlertTriangle className="h-2 w-2" /> Critical
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Display Items Table ── */}
      {activeTab === 'DISPLAY' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3 text-center">Whole Stock</th>
                <th className="px-5 py-3 text-center">Loose Slices</th>
                <th className="px-5 py-3 text-center">
                  <span className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3" /> 14-Day Sales Avg
                  </span>
                </th>
                <th className="px-5 py-3 text-center">MD Shelf Life</th>
                <th className="px-5 py-3 bg-violet-50/60">
                  <span className="text-violet-700">Action Required</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {displayItems.map((item) => {
                const action = calcDisplayAction(item);
                const totalSlices = item.currentSlices + item.currentWhole * item.slicesPerWhole;
                const lowStock = totalSlices < item.rollingAvg14d * 0.5;
                return (
                  <tr key={item.id} className={`transition-colors ${
                    action.urgent ? 'bg-rose-50/40 hover:bg-rose-50/60' :
                    lowStock      ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                    'hover:bg-white/40'
                  }`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/60">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{item.name}</p>
                          <p className="text-[10px] text-slate-500">{item.slicesPerWhole} portions per whole unit</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-black ${item.currentWhole === 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {item.currentWhole}
                      </span>
                      <p className="text-[9px] text-slate-400">whole</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-black ${item.currentSlices === 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {item.currentSlices}
                      </span>
                      <p className="text-[9px] text-slate-400">on display</p>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm text-slate-600">
                      {item.rollingAvg14d} <span className="text-[10px] text-slate-400">units/day</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={item.shelfLifeDays}
                          onChange={(e) => updateDisplayShelf(item.id, parseInt(e.target.value) || 1)}
                          className={shelfInputCls}
                        />
                        <span className="text-[9px] font-bold text-violet-600">days</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 bg-violet-50/40">
                      <PrepActionBadge text={action.text} urgent={action.urgent} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5">
        <p className="text-[10px] text-slate-500">
          Recommendations are computed live from verified stock counts and 14-day POS velocity. Shelf life limits
          prevent over-prepping beyond the MD&apos;s configured spoilage window.
        </p>
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Menu Engineering Desk ────────────────────────────────────────────────────

function CustomerMenuPreview({
  items,
  categories,
  logoUrl,
  overheadPct,
}: {
  items: MenuItem[];
  categories: string[];
  logoUrl: string | null;
  overheadPct: number;
}) {
  // Group items by category, preserving category order
  const grouped = categories
    .map((cat) => ({ cat, rows: items.filter((i) => i.category === cat) }))
    .filter(({ rows }) => rows.length > 0);

  // Any items with unknown category
  const knownCats = new Set(categories);
  const orphans = items.filter((i) => !knownCats.has(i.category));
  if (orphans.length) grouped.push({ cat: 'Other', rows: orphans });

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-200/90 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.12)]">
      {/* Phone chrome top bar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-5 py-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Customer Menu Preview</span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-0.5 text-[9px] font-black text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Café logo + menu header */}
      <div className="px-6 pt-6 pb-4 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Café Tasha logo" className="h-full w-full object-contain p-1.5" />
          ) : (
            <div className="flex flex-col items-center gap-1 px-2">
              <Coffee className="h-6 w-6 text-slate-300" />
              <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Café Logo</span>
            </div>
          )}
        </div>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">Café Tasha</p>
        <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">Our Menu</h3>
        <p className="mt-0.5 text-[10px] text-slate-500">All prices include service charge</p>
        <div className="mx-auto mt-3 h-px w-16 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* Category sections */}
      <div className="space-y-5 px-4 pb-6">
        {grouped.map(({ cat, rows }) => {
          const palette = getCatPalette(cat);
          return (
            <div key={cat}>
              {/* Category label */}
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span
                  className="rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ background: `${palette.gradFrom}18`, color: palette.gradFrom }}
                >
                  {cat}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Item cards grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {rows.map((item) => {
                  const baseCost = calcBaseCost(item.recipeCost, overheadPct);
                  const price = calcSellingPrice(baseCost, item.targetMargin);
                  return (
                    <div
                      key={item.id}
                      className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-all hover:border-slate-300/90 hover:shadow-md"
                    >
                      {/* Image */}
                      <div
                        className="h-24 w-full"
                        style={{ background: `linear-gradient(135deg, ${palette.gradFrom}33, ${palette.gradTo}55)` }}
                      >
                        {item.hasImage ? (
                          <div className="flex h-full items-center justify-center">
                            <div className="h-8 w-8 rounded-full bg-white/60" />
                            <div className="absolute h-4 w-4 rounded-full bg-white/80" />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Tag className="h-6 w-6 opacity-40" style={{ color: palette.gradFrom }} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <p className="text-[11px] font-bold leading-tight text-slate-900">{item.name}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">LKR</span>
                          <span
                            className="text-sm font-black tabular-nums"
                            style={{ color: palette.gradFrom }}
                          >
                            {price.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuEngineeringDesk() {
  const [items,      setItems]     = useState<MenuItem[]>(INITIAL_MENU);
  const [categories, setCategories] = useState<string[]>(MENU_DEFAULT_CATS);
  const [activeTab,  setActiveTab] = useState<'TABLE' | 'PREVIEW'>('TABLE');
  const [synced,     setSynced]    = useState(false);
  const [cafeLogoUrl, setCafeLogoUrl] = useState<string | null>(null);
  const [logoDragOver, setLogoDragOver] = useState(false);
  const [globalOverhead, setGlobalOverhead] = useState(20);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Tracks which row is entering a new category name
  const [newCatRow,   setNewCatRow]   = useState<string | null>(null);
  const [newCatInput, setNewCatInput] = useState('');

  const handleLogoFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setCafeLogoUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setLogoDragOver(false);
    handleLogoFile(e.dataTransfer.files[0]);
  };

  const updateItem = (id: string, field: keyof MenuItem, value: string | number | boolean) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: `M${Date.now()}`, name: 'New Item', category: categories[0] ?? 'Other', recipeCost: 83, targetMargin: 65, hasImage: false },
    ]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleCategoryChange = (rowId: string, value: string) => {
    if (value === '__NEW__') {
      setNewCatRow(rowId);
      setNewCatInput('');
    } else {
      updateItem(rowId, 'category', value);
    }
  };

  const commitNewCategory = (rowId: string) => {
    const name = newCatInput.trim();
    if (name) {
      setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
      updateItem(rowId, 'category', name);
    }
    setNewCatRow(null);
    setNewCatInput('');
  };

  const handleSync = () => {
    setSynced(true);
    setTimeout(() => setSynced(false), 3000);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40 transition-all';

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* ── Header ── */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
              <Tag className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Menu &amp; Pricing Engineering
              </h2>
              <p className="text-[10px] text-slate-500">
                Set margins, auto-calculate selling prices, and sync to the live POS &amp; online menu.
              </p>
            </div>
          </div>

          {/* Sync button */}
          <button
            type="button"
            onClick={handleSync}
            className={`flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-xs font-black uppercase tracking-widest shadow-md transition-all ${
              synced
                ? 'border-emerald-300/80 bg-emerald-100/80 text-emerald-800 shadow-emerald-200/60'
                : 'border-rose-300/80 bg-rose-600 text-white shadow-rose-600/30 hover:bg-rose-500'
            }`}
          >
            <Satellite className={`h-3.5 w-3.5 ${synced ? '' : 'animate-pulse'}`} />
            {synced ? 'Synced to POS & Menu!' : 'Sync Prices to Live POS & Online Menu'}
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'TABLE'   as const, label: 'MD: Pricing Engine', Icon: Tag        },
            { key: 'PREVIEW' as const, label: 'Customer: Live Preview', Icon: Smartphone },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pricing Table ── */}
      {activeTab === 'TABLE' && (
        <>
          {/* Brand Configuration */}
          <div className="border-b border-slate-200/80 bg-white/50 px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Brand Configuration</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Upload your café logo — it appears at the top of the customer-facing digital menu preview.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {cafeLogoUrl && (
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cafeLogoUrl} alt="Uploaded café logo" className="h-full w-full object-contain p-1" />
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => logoInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') logoInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setLogoDragOver(true); }}
                  onDragLeave={() => setLogoDragOver(false)}
                  onDrop={handleLogoDrop}
                  className={`flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-3 transition-all ${
                    logoDragOver
                      ? 'border-rose-400/80 bg-rose-50/80'
                      : 'border-slate-300/80 bg-slate-50/60 hover:border-rose-300/70 hover:bg-rose-50/40'
                  }`}
                >
                  <Upload className="h-4 w-4 text-rose-600" />
                  <span className="text-xs font-black text-slate-700">+ Upload Café Logo</span>
                </div>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />

                {cafeLogoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCafeLogoUrl(null);
                      if (logoInputRef.current) logoInputRef.current.value = '';
                    }}
                    className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-600 transition-all hover:border-rose-200/80 hover:text-rose-700"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>

            {/* BOM overhead */}
            <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 px-4 py-3">
              <div className="min-w-[200px]">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-indigo-800">
                  Global Operational Overhead (%)
                </label>
                <div className="relative max-w-[120px]">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={globalOverhead}
                    onChange={(e) => setGlobalOverhead(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className={`${inputCls} pr-8 text-center font-black text-indigo-900`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-indigo-400">%</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 text-[10px] leading-relaxed text-indigo-900/80">
                <strong>Strict BOM formula:</strong> Base Cost = (Sum of Raw Ingredients from Recipe) + Global Overhead&nbsp;%.
                <span className="block mt-0.5 text-indigo-700/70">
                  Example at {globalOverhead}%: LKR 100 recipe → LKR {calcBaseCost(100, globalOverhead)} base cost.
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-14">Image</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-center">Base Cost (LKR)</th>
                  <th className="px-4 py-3 text-center">Target Margin (%)</th>
                  <th className="px-4 py-3 text-center bg-emerald-50/60">
                    <span className="text-emerald-700">Selling Price (LKR)</span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((item) => {
                  const baseCost     = calcBaseCost(item.recipeCost, globalOverhead);
                  const sellingPrice = calcSellingPrice(baseCost, item.targetMargin);
                  const isLowMargin  = item.targetMargin < 55;
                  return (
                    <tr key={item.id} className="hover:bg-white/40 transition-colors group">
                      {/* Thumbnail */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, 'hasImage', !item.hasImage)}
                          className="transition-transform hover:scale-105"
                          title={item.hasImage ? 'Click to remove image' : 'Click to simulate upload'}
                        >
                          <ItemThumb item={item} size="sm" />
                        </button>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          className={`${inputCls} font-semibold`}
                        />
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 min-w-[180px]">
                        {newCatRow === item.id ? (
                          <input
                            type="text"
                            autoFocus
                            placeholder="New category name…"
                            value={newCatInput}
                            onChange={(e) => setNewCatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitNewCategory(item.id); if (e.key === 'Escape') { setNewCatRow(null); } }}
                            onBlur={() => commitNewCategory(item.id)}
                            className={`${inputCls} border-indigo-300/80 focus:ring-indigo-400/40`}
                          />
                        ) : (
                          <select
                            value={item.category}
                            onChange={(e) => handleCategoryChange(item.id, e.target.value)}
                            className={`${inputCls} appearance-none pr-6`}
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__NEW__">+ New Category…</option>
                          </select>
                        )}
                      </td>

                      {/* Base Cost — auto-calculated from BOM */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="rounded-xl border border-slate-200/80 bg-slate-100/80 px-3 py-1.5 font-mono text-sm font-black tabular-nums text-slate-800">
                            {baseCost.toLocaleString()}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            recipe {item.recipeCost.toLocaleString()} + {globalOverhead}%
                          </span>
                        </div>
                      </td>

                      {/* Target Margin */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={98}
                            value={item.targetMargin}
                            onChange={(e) => updateItem(item.id, 'targetMargin', Math.max(1, Math.min(98, parseInt(e.target.value) || 50)))}
                            className={`${inputCls} w-20 text-center font-mono ${isLowMargin ? 'border-amber-300/80 text-amber-800' : ''}`}
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                        {isLowMargin && (
                          <p className="mt-0.5 text-[9px] text-amber-700 font-semibold">Low margin</p>
                        )}
                      </td>

                      {/* Selling Price — auto-calculated */}
                      <td className="px-4 py-3 text-center bg-emerald-50/40">
                        <div className="flex flex-col items-center">
                          <span className="text-base font-black tabular-nums text-emerald-800">
                            {sellingPrice.toLocaleString()}
                          </span>
                          <span className="text-[9px] text-emerald-600 font-semibold">
                            +{baseCost > 0 ? Math.round(sellingPrice - baseCost) : 0} profit
                          </span>
                        </div>
                      </td>

                      {/* Remove */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-xl border border-slate-200/80 bg-white/60 p-1.5 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:border-rose-200/80 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add item row */}
          <div className="border-t border-slate-200/60 bg-slate-50/40 px-5 py-3">
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300/80 bg-white/60 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:border-emerald-300/80 hover:bg-emerald-50/60 hover:text-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Menu Item
            </button>
          </div>

          {/* Summary footer */}
          <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5">
            <div className="flex flex-wrap gap-5 text-[10px] text-slate-500">
              <span>{items.length} items · {[...new Set(items.map((i) => i.category))].length} categories</span>
              <span>Avg margin: <strong className="text-slate-700">
                {items.length ? Math.round(items.reduce((s, i) => s + i.targetMargin, 0) / items.length) : 0}%
              </strong></span>
              <span>Total menu value: <strong className="text-emerald-700">
                LKR {items.reduce((s, i) => s + calcSellingPrice(calcBaseCost(i.recipeCost, globalOverhead), i.targetMargin), 0).toLocaleString()}
              </strong> (sum of prices)</span>
            </div>
          </div>
        </>
      )}

      {/* ── Customer Menu Preview ── */}
      {activeTab === 'PREVIEW' && (
        <div className="bg-slate-100/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Simulates what customers see on their phone or table display
            </p>
            <span className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[10px] font-bold text-slate-600">
              {items.length} items · {[...new Set(items.map((i) => i.category))].length} categories
            </span>
          </div>
          <div className="mx-auto max-w-sm">
            <CustomerMenuPreview items={items} categories={categories} logoUrl={cafeLogoUrl} overheadPct={globalOverhead} />
          </div>
        </div>
      )}
    </ExecutiveGlassCard>
  );
}

// ─── Lookback Date Strip ──────────────────────────────────────────────────────

function LookbackDateStrip({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  // Build 14-day window (today back to 13 days ago)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(TODAY_STR);
    d.setDate(d.getDate() - i);
    return {
      date: d.toISOString().slice(0, 10),
      dayNum: d.getDate(),
      dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
      offset: i,
    };
  });

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <CalendarDays className="h-3.5 w-3.5" />
        Lookback:
      </div>
      {days.map(({ date, dayNum, dayName, offset }) => {
        const active = date === selected;
        const purged = offset >= 12; // last 2 days in window — proofs may be purged soon
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            title={date}
            className={`flex flex-shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 transition-all ${
              active
                ? 'border-emerald-300/80 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : purged
                ? 'border-amber-200/70 bg-amber-50/60 text-amber-800 hover:bg-amber-100/60'
                : 'border-slate-200/70 bg-white/50 text-slate-700 hover:bg-white/80'
            }`}
          >
            <span className={`text-[8px] font-bold uppercase ${active ? 'text-emerald-100' : purged ? 'text-amber-600' : 'text-slate-500'}`}>{dayName}</span>
            <span className={`text-sm font-black tabular-nums leading-tight ${active ? 'text-white' : ''}`}>{dayNum}</span>
            {offset === 0 && <span className={`text-[7px] font-black uppercase leading-tight ${active ? 'text-emerald-100' : 'text-emerald-700'}`}>TODAY</span>}
            {purged && offset > 0 && <span className="text-[7px] font-bold uppercase leading-tight text-amber-600">≈PURGE</span>}
          </button>
        );
      })}
      <div className="flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-[9px] text-amber-800">
        <Trash2 className="h-3 w-3" />
        14-day purge window
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CafePage() {
  const [staff, setStaff]             = useState<StaffMember[]>(INITIAL_STAFF);
  const [photoTask, setPhotoTask]     = useState<Task | null>(null);
  const [fineTarget, setFineTarget]   = useState<FineTarget | null>(null);
  const [lookbackDate, setLookbackDate] = useState(TODAY_STR);
  const [showVoids, setShowVoids]     = useState(false);

  const lookbackOffset = dateToOffset(lookbackDate);
  const activeTasks    = getTasksForOffset(lookbackOffset);
  const dailyTasks     = activeTasks.filter((t) => t.freq === 'DAILY');
  const weeklyTasks    = activeTasks.filter((t) => t.freq === 'WEEKLY');
  const overdue        = activeTasks.filter((t) => t.status === 'OVERDUE').length;
  const complete       = activeTasks.filter((t) => t.status === 'COMPLETE').length;
  const compliancePct  = Math.round((complete / activeTasks.length) * 100);

  const grossPayroll    = staff.reduce((s, m) => s + m.dailyRate * m.daysWorked, 0);
  const totalDeductions = staff.reduce((s, m) => s + m.deductionsMTD, 0);
  const netPayroll      = grossPayroll - totalDeductions;

  const flaggedA = DEMO_LIST_A.filter((i) => listAPct(i) < THEFT_THRESHOLD).length;
  const flaggedB = DEMO_LIST_B.filter((i) => listBPct(i) < THEFT_THRESHOLD).length;

  const handleIssueFine = (staffId: string, amount: number, _reason: string) => {
    setStaff((prev) => prev.map((s) =>
      s.id === staffId ? { ...s, deductionsMTD: s.deductionsMTD + amount } : s
    ));
  };

  // Render a single task row used in both daily and weekly sections
  const TaskRow = ({ task }: { task: Task }) => {
    const st = STATUS_META[task.status];
    const isFlagged = task.status === 'OVERDUE';
    return (
      <div className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
        task.status === 'COMPLETE' ? 'border-emerald-200/80 bg-emerald-50/40' :
        task.status === 'OVERDUE'  ? 'border-rose-200/80   bg-rose-50/40 animate-pulse' :
        'border-slate-200/60 bg-white/40'
      }`}>
        <st.Icon className={`h-4 w-4 flex-shrink-0 ${
          task.status === 'COMPLETE' ? 'text-emerald-600' :
          task.status === 'OVERDUE'  ? 'text-rose-600' :
          'text-amber-500'
        }`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900">{task.name}</p>
          <p className="text-[10px] text-slate-500">{task.assignedTo}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {task.proofUploadedAt ? (
            <button
              type="button"
              onClick={() => setPhotoTask(task)}
              className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-white/90 transition-all"
            >
              <Eye className="h-3 w-3" />
              Proof
            </button>
          ) : (
            task.status === 'OVERDUE'
              ? <span className="text-[9px] font-bold text-rose-700 animate-pulse">NO PROOF</span>
              : <Camera className="h-4 w-4 text-slate-300" />
          )}
          {isFlagged && (
            <button
              type="button"
              onClick={() => setFineTarget({
                itemName: task.name,
                suggestedAmount: 300,
                defaultStaffId: staff.find((s) => s.name.split(' ')[0] === task.assignedTo)?.id ?? staff[0]?.id ?? '',
                category: 'COMPLIANCE',
              })}
              className="flex items-center gap-1 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2 py-1 text-[9px] font-black text-rose-800 hover:bg-rose-100/80 transition-all whitespace-nowrap"
            >
              <Gavel className="h-3 w-3" />
              Fine
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PhotoModal task={photoTask} lookbackDate={lookbackDate} onClose={() => setPhotoTask(null)} />
      <DisciplinaryFineModal
        target={fineTarget}
        staff={staff}
        onConfirm={handleIssueFine}
        onClose={() => setFineTarget(null)}
      />

      <div className="w-full flex-grow flex flex-col pb-12 font-sans">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 md:px-12 2xl:px-24 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">Café Tasha Compliance Auditor</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              Labor Roster · Task Proof Lock · Stock Variance & Theft Radar
            </p>
          </div>
        </header>

        <div className="px-6 md:px-12 2xl:px-24 space-y-6 pt-8">

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ExecutiveGlassCard className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Staff Count</p>
              <p className="mt-2 text-4xl font-black text-slate-900">{staff.length}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">active café staff</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Gross MTD Accrual</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <p className="text-2xl font-black tabular-nums text-emerald-900">{lkr(grossPayroll)}</p>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Total Deductions</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <TrendingDown className="h-5 w-5 text-rose-600" />
                <p className="text-2xl font-black tabular-nums text-rose-900">{lkr(totalDeductions)}</p>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className={`p-5 ${flaggedA + flaggedB > 0 ? 'bg-gradient-to-br from-white/70 to-rose-50/50' : 'bg-gradient-to-br from-white/70 to-slate-50/50'}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Theft Radar Flags</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                {flaggedA + flaggedB > 0
                  ? <><ShieldAlert className="h-5 w-5 text-rose-600" /><p className="text-2xl font-black tabular-nums text-rose-900">{flaggedA + flaggedB} items</p></>
                  : <><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="text-2xl font-black tabular-nums text-emerald-900">Clear</p></>}
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">{flaggedA} daily · {flaggedB} bulk</p>
            </ExecutiveGlassCard>
          </div>

          {/* ── Labor Roster & MTD Salary Tracker ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-800 uppercase">Labor Roster — MTD Salary Tracker</h2>
              <span className="ml-auto text-[10px] text-slate-500">As of {TODAY_STR}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60">
                  <tr>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff Member</th>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Daily Rate</th>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Days Worked</th>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Deductions</th>
                    <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                        <Zap className="h-2.5 w-2.5" />
                        Live MTD Net
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {staff.map((s) => {
                    const gross = s.dailyRate * s.daysWorked;
                    const net   = gross - s.deductionsMTD;
                    return (
                      <tr key={s.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/80 text-xs font-black text-slate-600">{s.name.charAt(0)}</div>
                            <p className="font-bold text-slate-900">{s.name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">{s.role}</td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800 text-center font-mono">{lkr(s.dailyRate)}/day</td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-slate-900">{s.daysWorked}</span>
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-200/80">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((s.daysWorked / 21) * 100, 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800 text-right font-mono">
                          {s.deductionsMTD > 0 ? `−${lkr(s.deductionsMTD)}` : '—'}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-800 text-right">
                          <span className="inline-block rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-sm font-black tabular-nums text-emerald-900">{lkr(net)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200/80 bg-slate-50/60">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-xs font-bold text-slate-600">Total</td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-black text-rose-700">−{lkr(totalDeductions)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-block rounded-xl border border-emerald-200/80 bg-emerald-100/70 px-3 py-1 text-sm font-black tabular-nums text-emerald-900">{lkr(netPayroll)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ExecutiveGlassCard>

          {/* ── Visual Task Auditor ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex flex-wrap items-center gap-3">
              <Coffee className="h-4 w-4 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-800 uppercase">Visual Task Auditor</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{complete} Complete</span>
                {overdue > 0 && <span className="rounded-full border border-rose-200 bg-rose-50/80 px-2 py-0.5 text-[10px] font-bold text-rose-800">{overdue} Overdue</span>}
              </div>
              <span className={`ml-auto text-sm font-black ${compliancePct >= 80 ? 'text-emerald-800' : 'text-amber-800'}`}>{compliancePct}%</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">compliance</span>
              <div className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/70 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                <Trash2 className="h-2.5 w-2.5" />
                14-Day Photo Auto-Purge Active
              </div>
            </div>

            {/* ── Lookback Date Picker ── */}
            <div className="border-b border-slate-200/60 bg-white/30 px-5 py-3">
              <LookbackDateStrip selected={lookbackDate} onSelect={setLookbackDate} />
              {lookbackOffset > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-3 py-1.5 text-[10px] text-indigo-800">
                  <Info className="h-3 w-3 flex-shrink-0" />
                  <span>Viewing archived compliance data for <strong>{lookbackDate}</strong> ({lookbackOffset} day{lookbackOffset > 1 ? 's' : ''} ago). Photo proofs auto-purge after 14 days.</span>
                  <button type="button" onClick={() => setLookbackDate(TODAY_STR)} className="ml-auto rounded-lg border border-indigo-200 bg-white/70 px-2 py-0.5 font-bold text-indigo-700 hover:bg-indigo-50 transition-all">Back to Today</button>
                </div>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* Daily tasks */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Daily Checklist — {lookbackOffset === 0 ? 'Today' : lookbackDate}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {dailyTasks.map((task) => <TaskRow key={task.id} task={task} />)}
                </div>
              </div>

              {/* Weekly tasks */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-600">Weekly Deep-Cleaning</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {weeklyTasks.map((task) => <TaskRow key={task.id} task={task} />)}
                </div>
              </div>
            </div>
          </ExecutiveGlassCard>

          {/* ── Stock Variance & Theft Radar ── */}
          <StockVarianceRadar
            staff={staff}
            onIssueFine={setFineTarget}
          />

          {/* ── Predictive Prep & Wastage Control ── */}
          <PredictivePrepEngine />

          {/* ── Menu & Pricing Engineering ── */}
          <MenuEngineeringDesk />

        </div>
      </div>
    </>
  );
}
