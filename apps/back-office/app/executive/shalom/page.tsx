'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Home,
  Airplay,
  Globe,
  User,
  Lock,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Plus,
  RefreshCw,
  Upload,
  CloudUpload,
  Building2,
  Wifi,
  Ban,
  Brush,
  Check,
  Camera,
  Clock,
  ShieldCheck,
  Trash2,
  Settings2,
  Link2,
  Copy,
  CopyCheck,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'AIRBNB' | 'BOOKING' | 'DIRECT' | 'BLOCKED' | 'AUTO_BLOCK';

interface Booking {
  id: string;
  guestName: string;
  channel: Channel;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: number;
  totalRevenue: number;
  paid: boolean;
  notes?: string;
  /** Set to true once an admin manually verifies and enriches iCal-imported data */
  enriched?: boolean;
  /** Admin-verified guest contact number (stored after enrichment) */
  enrichedContact?: string;
}

interface Property {
  id: string;
  name: string;
  location: string;
  bedrooms: number;
  overhead: number;
  occupancyTarget: number;
  otaChannels: ('AIRBNB' | 'BOOKING')[];
  bookings: Booking[];
}

// ── Per-Property Settings (deep clean buffer + pricing) ──────────────────────

interface SeasonalRate {
  id: string;
  name: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  ratePerNight: number;
}

interface PropSettings {
  cleanBufferEnabled: boolean;
  cleanBufferDays: number;
  defaultRate: number;
  seasonalRates: SeasonalRate[];
}

// ── Caretaker Pre-Handover Audit ─────────────────────────────────────────────

interface AuditPhoto {
  photoId: string;
  /** Room label, e.g. "Living Room" */
  label: string;
  /** Display timestamp taken just before guest arrival */
  timestamp: string;
  bgGradient: string;
  iconColor: string;
}

interface AuditRecord {
  status: 'WAITING' | 'VERIFIED';
  verifiedAt?: string;
  photos?: AuditPhoto[];
}

// ─── Property Data ────────────────────────────────────────────────────────────

const NAWALA_BOOKINGS: Booking[] = [
  { id: 'N001', guestName: 'Amelia Chen',     channel: 'AIRBNB',  checkIn: '2026-05-01', checkOut: '2026-05-05', nights: 4, ratePerNight: 8500, totalRevenue: 34000, paid: true  },
  { id: 'N002', guestName: 'Ravi & Family',   channel: 'DIRECT',  checkIn: '2026-05-06', checkOut: '2026-05-10', nights: 4, ratePerNight: 7800, totalRevenue: 31200, paid: true  },
  { id: 'N003', guestName: 'Thomas Müller',   channel: 'BOOKING', checkIn: '2026-05-12', checkOut: '2026-05-16', nights: 4, ratePerNight: 9200, totalRevenue: 36800, paid: true  },
  { id: 'N004', guestName: 'Priya Sharma',    channel: 'AIRBNB',  checkIn: '2026-05-17', checkOut: '2026-05-21', nights: 4, ratePerNight: 8500, totalRevenue: 34000, paid: false, notes: 'Balance LKR 17,000 due on check-in' },
  { id: 'N005', guestName: 'Blocked',         channel: 'BLOCKED', checkIn: '2026-05-21', checkOut: '2026-05-23', nights: 2, ratePerNight: 0,    totalRevenue: 0,     paid: true  },
  { id: 'N006', guestName: 'Kenji Tanaka',    channel: 'BOOKING', checkIn: '2026-05-23', checkOut: '2026-05-28', nights: 5, ratePerNight: 9200, totalRevenue: 46000, paid: false, notes: 'Booking.com guarantee pending' },
  { id: 'N007', guestName: 'Airbnb Guest',   channel: 'AIRBNB',  checkIn: '2026-05-29', checkOut: '2026-06-01', nights: 3, ratePerNight: 0,    totalRevenue: 0,     paid: false, notes: 'Synced via Airbnb iCal — guest details not included in feed.' },
];

const KANDY_BOOKINGS: Booking[] = [
  { id: 'K001', guestName: 'Sophie Laurent',  channel: 'AIRBNB',  checkIn: '2026-05-03', checkOut: '2026-05-07', nights: 4, ratePerNight: 6200, totalRevenue: 24800, paid: true  },
  { id: 'K002', guestName: 'Dev Patel',        channel: 'DIRECT',  checkIn: '2026-05-09', checkOut: '2026-05-13', nights: 4, ratePerNight: 5800, totalRevenue: 23200, paid: true  },
  { id: 'K003', guestName: 'Blocked',          channel: 'BLOCKED', checkIn: '2026-05-13', checkOut: '2026-05-14', nights: 1, ratePerNight: 0,    totalRevenue: 0,     paid: true  },
  { id: 'K004', guestName: 'Yuki Tanaka',      channel: 'BOOKING', checkIn: '2026-05-18', checkOut: '2026-05-22', nights: 4, ratePerNight: 6800, totalRevenue: 27200, paid: false },
  { id: 'K005', guestName: 'Maria García',     channel: 'AIRBNB',  checkIn: '2026-05-25', checkOut: '2026-05-29', nights: 4, ratePerNight: 6200, totalRevenue: 24800, paid: false },
];

const PROPERTIES: Property[] = [
  {
    id: 'prop-nawala',
    name: 'Shalom Nawala',
    location: 'Nawala, Colombo',
    bedrooms: 3,
    overhead: 185_000,
    occupancyTarget: 65,
    otaChannels: ['AIRBNB', 'BOOKING'],
    bookings: NAWALA_BOOKINGS,
  },
  {
    id: 'prop-kandy',
    name: 'Kandy Apartment',
    location: 'Kandy City Centre',
    bedrooms: 2,
    overhead: 120_000,
    occupancyTarget: 55,
    otaChannels: ['AIRBNB', 'BOOKING'],
    bookings: KANDY_BOOKINGS,
  },
];

// ─── Channel meta ─────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; bg: string; text: string; border: string; icon: React.ElementType }> = {
  AIRBNB:     { label: 'Airbnb',      bg: 'bg-rose-100/90',    text: 'text-rose-900',    border: 'border-rose-200',    icon: Airplay   },
  BOOKING:    { label: 'Booking.com', bg: 'bg-blue-100/90',    text: 'text-blue-900',    border: 'border-blue-200',    icon: Globe     },
  DIRECT:     { label: 'Direct',      bg: 'bg-emerald-100/90', text: 'text-emerald-900', border: 'border-emerald-200', icon: User      },
  BLOCKED:    { label: 'Blocked',     bg: 'bg-slate-100/90',   text: 'text-slate-500',   border: 'border-slate-200',   icon: Lock      },
  AUTO_BLOCK: { label: 'Auto-Clean',  bg: 'bg-orange-100/90',  text: 'text-orange-700',  border: 'border-orange-200',  icon: Brush     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  if (n >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `LKR ${(n / 1_000).toFixed(1)}K`;
  return `LKR ${n.toLocaleString()}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY_NAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Audit Photo Factory & Data ───────────────────────────────────────────────

const ROOM_PALETTE: { label: string; bg: string; icon: string }[] = [
  { label: 'Living Room',    bg: 'bg-gradient-to-br from-amber-100/80 to-orange-50/60',  icon: 'text-amber-600'  },
  { label: 'Master Bedroom', bg: 'bg-gradient-to-br from-blue-100/80 to-indigo-50/60',   icon: 'text-blue-600'   },
  { label: 'Kitchen',        bg: 'bg-gradient-to-br from-teal-100/80 to-emerald-50/60',  icon: 'text-teal-600'   },
  { label: 'Main Bathroom',  bg: 'bg-gradient-to-br from-sky-100/80 to-cyan-50/60',      icon: 'text-sky-600'    },
  { label: 'Bedroom 2',      bg: 'bg-gradient-to-br from-violet-100/80 to-purple-50/60', icon: 'text-violet-600' },
];

function makePhotos(checkIn: string, count = 4): AuditPhoto[] {
  const [y, m, d] = checkIn.split('-');
  const dateLabel = `${d} ${MONTH_SHORT[parseInt(m) - 1]} ${y}`;
  const mins = [12, 17, 21, 26, 30];
  return ROOM_PALETTE.slice(0, count).map((r, i) => ({
    photoId: `${checkIn}-p${i + 1}`,
    label: r.label,
    timestamp: `${dateLabel} · 08:${mins[i]} AM`,
    bgGradient: r.bg,
    iconColor: r.icon,
  }));
}

// ─── Per-Property Default Settings ───────────────────────────────────────────

function defaultPropSettings(propId: string): PropSettings {
  const nawalaRates: SeasonalRate[] = [
    { id: 'n-s1', name: 'December Peak',  startDate: '2026-12-15', endDate: '2027-01-05', ratePerNight: 14_000 },
    { id: 'n-s2', name: 'Long Weekend',   startDate: '2026-05-17', endDate: '2026-05-18', ratePerNight: 10_500 },
  ];
  const kandyRates: SeasonalRate[] = [
    { id: 'k-s1', name: 'Kandy Esala',   startDate: '2026-08-01', endDate: '2026-08-15', ratePerNight: 9_500 },
    { id: 'k-s2', name: 'Year-End',      startDate: '2026-12-20', endDate: '2027-01-03', ratePerNight: 10_000 },
  ];
  return {
    cleanBufferEnabled: true,
    cleanBufferDays: 1,
    defaultRate: propId === 'prop-nawala' ? 8_500 : propId === 'prop-kandy' ? 6_200 : 0,
    seasonalRates: propId === 'prop-nawala' ? nawalaRates : propId === 'prop-kandy' ? kandyRates : [],
  };
}

/**
 * Keyed by booking ID. Bookings not listed here show no audit section.
 * BLOCKED / AUTO_BLOCK bookings are intentionally excluded.
 */
const BOOKING_AUDIT: Partial<Record<string, AuditRecord>> = {
  // Shalom Nawala — 3BR (5 rooms)
  N001: { status: 'VERIFIED', verifiedAt: '01 May 2026 · 08:45 AM', photos: makePhotos('2026-05-01', 5) },
  N002: { status: 'VERIFIED', verifiedAt: '06 May 2026 · 08:45 AM', photos: makePhotos('2026-05-06', 5) },
  N003: { status: 'VERIFIED', verifiedAt: '12 May 2026 · 08:45 AM', photos: makePhotos('2026-05-12', 5) },
  N004: { status: 'WAITING' },
  N006: { status: 'WAITING' },
  // Kandy Apartment — 2BR (4 rooms)
  K001: { status: 'VERIFIED', verifiedAt: '03 May 2026 · 08:45 AM', photos: makePhotos('2026-05-03', 4) },
  K002: { status: 'VERIFIED', verifiedAt: '09 May 2026 · 08:45 AM', photos: makePhotos('2026-05-09', 4) },
  K004: { status: 'WAITING' },
  K005: { status: 'WAITING' },
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function OtaToast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-[200]">
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-600/30">
        <CheckCircle2 className="h-4 w-4" />
        {msg}
      </div>
    </div>
  );
}

// ─── Property Selector ────────────────────────────────────────────────────────

function PropertySelector({
  properties,
  selected,
  onSelect,
  onAdd,
  onRemove,
  onOpenSettings,
}: {
  properties: Property[];
  selected: Property;
  onSelect: (p: Property) => void;
  onAdd: () => void;
  onRemove: () => void;
  onOpenSettings: () => void;
}) {
  const [open,           setOpen]           = useState(false);
  const [confirmRemove,  setConfirmRemove]   = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white/55 px-4 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-xl hover:bg-white/70 transition-all"
        >
          <Building2 className="h-4 w-4 text-slate-500" />
          <span>{selected.name}</span>
          <span className="text-[10px] font-semibold text-slate-400">{selected.location}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-40 mt-1.5 min-w-[240px] overflow-hidden rounded-2xl border border-white/75 bg-white/95 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
              <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                Your Properties
              </div>
              {properties.map((p) => {
                const active = p.id === selected.id;
                return (
                  <button key={p.id} type="button" onClick={() => { onSelect(p); setOpen(false); }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-emerald-50/80' : 'hover:bg-slate-50/80'}`}
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border text-[10px] font-black ${active ? 'border-emerald-200 bg-emerald-100/80 text-emerald-800' : 'border-slate-200 bg-slate-100/80 text-slate-600'}`}>
                      {p.bedrooms}BR
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>{p.name}</p>
                      <p className="text-[10px] text-slate-500">{p.location}</p>
                    </div>
                    <div className="flex gap-1">
                      {p.otaChannels.map((ch) => {
                        const cm = CHANNEL_META[ch];
                        return <cm.icon key={ch} className={`h-3.5 w-3.5 ${cm.text}`} />;
                      })}
                    </div>
                    {active && <Check className="h-4 w-4 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Property button */}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-2xl border border-dashed border-slate-300/80 bg-white/40 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white/60 hover:border-emerald-300 hover:text-emerald-800 transition-all"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Property (OTA Sync)
      </button>

      {/* Property Settings button */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/55 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/75 hover:border-emerald-300 hover:text-emerald-800 transition-all"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Property Settings
      </button>

      {/* Remove Property — inline confirmation */}
      {!confirmRemove ? (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={properties.length <= 1}
          title={properties.length <= 1 ? 'Cannot remove the last property' : `Remove ${selected.name}`}
          className="flex items-center gap-1.5 rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-3 py-2 text-xs font-bold text-rose-400 hover:border-rose-300 hover:bg-rose-50/60 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30 transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove Property
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-3 py-1.5">
          <p className="text-[10px] font-bold text-rose-800">Remove &quot;{selected.name}&quot;?</p>
          <button
            type="button"
            onClick={() => setConfirmRemove(false)}
            className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-white transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onRemove(); setConfirmRemove(false); }}
            className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-rose-700 transition-all"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Add Property Modal ───────────────────────────────────────────────────────

const EMPTY_ADD_FORM = {
  name: '', location: '', bedrooms: '2', overhead: '', occupancy: '60',
  airbnb: true, booking: true,
  airbnbIcal: '', bookingIcal: '',
};

function AddPropertyModal({
  open,
  onClose,
  onConnect,
}: {
  open: boolean;
  onClose: () => void;
  onConnect: (p: Property) => void;
}) {
  const [form, setForm] = useState(EMPTY_ADD_FORM);

  // Reset form each time the modal is opened
  useEffect(() => {
    if (open) setForm(EMPTY_ADD_FORM);
  }, [open]);

  if (!open) return null;

  const canSubmit = form.name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const channels: ('AIRBNB' | 'BOOKING')[] = [
      ...(form.airbnb  ? ['AIRBNB'   as const] : []),
      ...(form.booking ? ['BOOKING'  as const] : []),
    ];
    const newProp: Property = {
      id: `prop-${Date.now()}`,
      name: form.name.trim(),
      location: form.location.trim() || 'Unknown location',
      bedrooms: Math.max(1, parseInt(form.bedrooms) || 2),
      overhead: parseInt(form.overhead) || 0,
      occupancyTarget: Math.max(1, Math.min(100, parseInt(form.occupancy) || 60)),
      otaChannels: channels,
      bookings: [],
    };
    onConnect(newProp);
    onClose();
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-emerald-400/18 blur-[72px]" />
        <div className="relative p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Multi-Property OTA Manager</p>
              <h2 className="mt-0.5 text-xl font-black text-slate-900">Add Property + OTA Sync</h2>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-4">
            <ExecutiveGlassCard className="p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-800">Property Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Property Name</label>
                  <input type="text" placeholder="e.g. Garden Suite Borella" value={form.name} onChange={(e) => setForm((p) => ({...p, name: e.target.value}))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Location</label>
                  <input type="text" placeholder="City / Area" value={form.location} onChange={(e) => setForm((p) => ({...p, location: e.target.value}))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Bedrooms</label>
                  <input type="number" min="1" max="10" value={form.bedrooms} onChange={(e) => setForm((p) => ({...p, bedrooms: e.target.value}))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Monthly Overhead (LKR)</label>
                  <input type="number" min="0" placeholder="0" value={form.overhead} onChange={(e) => setForm((p) => ({...p, overhead: e.target.value}))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Target Occupancy %</label>
                  <input type="number" min="1" max="100" value={form.occupancy} onChange={(e) => setForm((p) => ({...p, occupancy: e.target.value}))} className={inputCls} />
                </div>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-800">OTA Channel Sync</p>
              <div className="space-y-3">
                {([
                  { id: 'airbnb',  icalKey: 'airbnbIcal',  label: 'Airbnb',      Icon: Airplay, cls: 'text-rose-700 border-rose-200 bg-rose-50/80', placeholder: 'https://www.airbnb.com/calendar/ical/...' },
                  { id: 'booking', icalKey: 'bookingIcal', label: 'Booking.com', Icon: Globe,   cls: 'text-blue-700 border-blue-200 bg-blue-50/80', placeholder: 'https://ical.booking.com/v1/...' },
                ] as const).map(({ id, icalKey, label, Icon, cls, placeholder }) => {
                  const enabled   = id === 'airbnb' ? form.airbnb : form.booking;
                  const icalValue = id === 'airbnb' ? form.airbnbIcal : form.bookingIcal;
                  return (
                    <div key={id}>
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, [id]: !enabled }))}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${enabled ? cls : 'border-slate-200/60 bg-white/40 text-slate-400'}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-bold">{label}</span>
                        {enabled && <Check className="ml-auto h-3.5 w-3.5" />}
                      </button>
                      {enabled && (
                        <div className="mt-2 space-y-1">
                          <label className={labelCls}>iCal Sync URL · {label}</label>
                          <input
                            type="url"
                            placeholder={placeholder}
                            value={icalValue}
                            onChange={(e) => setForm((p) => ({ ...p, [icalKey]: e.target.value }))}
                            className={inputCls}
                          />
                          <p className="text-[9px] text-slate-400">
                            Paste the iCal export URL from your {label} listing settings. Used for two-way availability sync.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] text-slate-500">Availability blocks and rate updates will be pushed to enabled channels.</p>
            </ExecutiveGlassCard>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                title={!canSubmit ? 'Enter a property name to continue' : undefined}
                className={`flex-[2] rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all ${
                  canSubmit
                    ? 'bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-500'
                    : 'cursor-not-allowed bg-slate-300 shadow-none'
                }`}
              >
                Connect Property
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Property Configuration Modal ────────────────────────────────────────────

function PropertyConfigModal({
  open,
  onClose,
  property,
  settings,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  property: Property;
  settings: PropSettings;
  onSave: (s: PropSettings) => void;
}) {
  const [draft,  setDraft]  = useState<PropSettings>(settings);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) { setDraft(settings); setCopied(false); }
  }, [open, settings]);

  if (!open) return null;

  const icalExportUrl = `https://erp.pearzen.com/api/ical/export/${property.id}.ics`;

  const handleCopy = () => {
    navigator.clipboard.writeText(icalExportUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  const addRate = () =>
    setDraft((prev) => ({
      ...prev,
      seasonalRates: [
        ...prev.seasonalRates,
        { id: Date.now().toString(), name: '', startDate: '', endDate: '', ratePerNight: 0 },
      ],
    }));

  const removeRate = (id: string) =>
    setDraft((prev) => ({ ...prev, seasonalRates: prev.seasonalRates.filter((r) => r.id !== id) }));

  const updateRate = (id: string, field: keyof SeasonalRate, value: string | number) =>
    setDraft((prev) => ({
      ...prev,
      seasonalRates: prev.seasonalRates.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    }));

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-emerald-400/18 blur-[72px]" />

        <div className="relative p-6">
          {/* ── Header ── */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Property Configuration</p>
              <h2 className="mt-0.5 text-xl font-black text-slate-900">{property.name}</h2>
              <p className="text-[10px] text-slate-500">{property.location} · {property.bedrooms}BR</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5">
            {/* ── Outbound iCal Export ── */}
            <ExecutiveGlassCard className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-50/80">
                  <Link2 className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-800">
                    Two-Way Sync: Outbound iCal Link
                  </p>
                  <p className="text-[9px] text-slate-500">Export this property's ERP calendar to your OTA channels</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    readOnly
                    value={icalExportUrl}
                    className="w-full rounded-xl border border-sky-200/60 bg-white/90 py-2.5 pl-3 pr-3 text-[11px] font-mono text-slate-600 shadow-sm focus:outline-none select-all cursor-text"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[11px] font-black uppercase tracking-widest shadow-sm transition-all ${
                    copied
                      ? 'border-emerald-300/70 bg-emerald-100/80 text-emerald-800 shadow-emerald-200/60'
                      : 'border-sky-300/70 bg-sky-100/80 text-sky-800 hover:bg-sky-200/80 shadow-sky-200/60'
                  }`}
                >
                  {copied
                    ? <><CopyCheck className="h-3.5 w-3.5" /> Copied!</>
                    : <><Copy     className="h-3.5 w-3.5" /> Copy Link</>
                  }
                </button>
              </div>

              <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500">
                Paste this link into Airbnb&apos;s &ldquo;Step 2&rdquo; or Booking.com&apos;s import settings. This pushes your
                internal ERP date blocks to the OTAs to prevent double-booking.
              </p>
            </ExecutiveGlassCard>

            {/* ── Deep Clean Buffer ── */}
            <ExecutiveGlassCard className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-orange-200/80 bg-orange-50/80">
                  <Brush className="h-3.5 w-3.5 text-orange-600" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-800">
                  Deep Clean Buffer
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Enable/disable toggle */}
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, cleanBufferEnabled: !prev.cleanBufferEnabled }))}
                  className={`relative h-6 w-11 rounded-full border-2 transition-all ${
                    draft.cleanBufferEnabled ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-slate-200'
                  }`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                    draft.cleanBufferEnabled ? 'left-[22px]' : 'left-0.5'
                  }`} />
                </button>
                {/* Days input */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-orange-900">Auto-Block</label>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={draft.cleanBufferDays}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        cleanBufferDays: Math.max(1, Math.min(7, parseInt(e.target.value) || 1)),
                      }))
                    }
                    disabled={!draft.cleanBufferEnabled}
                    className="w-14 rounded-xl border border-orange-200/80 bg-white/80 px-2 py-1.5 text-center text-sm font-black text-orange-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-40 transition-all"
                  />
                  <span className="text-xs font-bold text-orange-800">
                    day{draft.cleanBufferDays > 1 ? 's' : ''} post-checkout
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                Post-checkout dates are automatically blocked on all connected OTAs for deep cleaning. Saved per property.
              </p>
            </ExecutiveGlassCard>

            {/* ── Dynamic Rate Engine ── */}
            <ExecutiveGlassCard className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50/80">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                  Dynamic Rate Engine
                </p>
              </div>

              {/* Default rate */}
              <div className="mb-5">
                <label className={labelCls}>Standard Default Nightly Rate (LKR)</label>
                <div className="relative max-w-xs">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                    LKR
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={draft.defaultRate}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, defaultRate: parseInt(e.target.value) || 0 }))
                    }
                    className={`${inputCls} pl-10`}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Base rate applied to all unbooked dates not covered by a seasonal override.
                </p>
              </div>

              {/* Seasonal Overrides */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black text-slate-700">Seasonal Overrides</p>
                  <button
                    type="button"
                    onClick={addRate}
                    className="flex items-center gap-1 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100/80 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                    Add Seasonal Rate
                  </button>
                </div>

                {draft.seasonalRates.length === 0 ? (
                  <p className="py-4 text-center text-[10px] text-slate-400">
                    No seasonal overrides. All dates use the standard rate above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_auto_auto] gap-2 px-2">
                      {['Rule Name', 'Start Date', 'End Date', 'Rate / Night', ''].map((h) => (
                        <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                          {h}
                        </span>
                      ))}
                    </div>
                    {draft.seasonalRates.map((r) => (
                      <div
                        key={r.id}
                        className="grid grid-cols-[1.5fr_1fr_1fr_auto_auto] items-center gap-2 rounded-xl border border-slate-200/60 bg-white/50 px-3 py-2.5"
                      >
                        <input
                          type="text"
                          placeholder="e.g. December Peak"
                          value={r.name}
                          onChange={(e) => updateRate(r.id, 'name', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                        />
                        <input
                          type="date"
                          value={r.startDate}
                          onChange={(e) => updateRate(r.id, 'startDate', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                        />
                        <input
                          type="date"
                          value={r.endDate}
                          onChange={(e) => updateRate(r.id, 'endDate', e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                        />
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-400">
                            LKR
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={r.ratePerNight}
                            onChange={(e) => updateRate(r.id, 'ratePerNight', parseInt(e.target.value) || 0)}
                            className="w-28 rounded-lg border border-slate-200 bg-white/80 pl-8 pr-2 py-1.5 text-xs font-black tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRate(r.id)}
                          title="Remove rule"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200/70 bg-rose-50/70 text-rose-500 hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-[10px] text-slate-500">
                  These custom rates will automatically push to the connected OTA iCal links for the specified dates.
                </p>
              </div>
            </ExecutiveGlassCard>
          </div>

          {/* ── Actions ── */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onSave(draft); onClose(); }}
              className="flex-[2] rounded-xl bg-emerald-600 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month Selector Bar ───────────────────────────────────────────────────────

function MonthSelectorBar({
  year, month,
  onPrev, onNext,
  onSelect,
}: {
  year: number; month: number;
  onPrev: () => void; onNext: () => void;
  onSelect: (m: number) => void;
}) {
  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-800">Calendar Period</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-all"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="min-w-[90px] text-center text-sm font-black text-slate-900">{year}</span>
          <button type="button" onClick={onNext} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-all"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1 p-3 sm:grid-cols-12">
        {MONTH_SHORT.map((m, i) => {
          const mNum = i + 1;
          const active = mNum === month;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelect(mNum)}
              className={`rounded-xl py-1.5 text-xs font-bold transition-all ${
                active
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Manual Block Modal ───────────────────────────────────────────────────────

function ManualBlockModal({
  date,
  onConfirm,
  onClose,
}: {
  date: string | null;
  onConfirm: (date: string, reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  if (!date) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-orange-300/15 blur-[56px]" />
        <div className="relative p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100/80">
                <Ban className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Manual Block</p>
                <h3 className="text-base font-black text-slate-900">{date}</h3>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          <ExecutiveGlassCard className="p-4">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600">Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Owner stay, maintenance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/30 transition-all"
            />
          </ExecutiveGlassCard>

          <p className="mt-3 text-[10px] text-slate-500">This date will be blocked across all OTA channels when you push blocks.</p>

          <div className="mt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all">Cancel</button>
            <button type="button" onClick={() => { onConfirm(date, reason); setReason(''); onClose(); }} className="flex-[2] rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition-all">
              Block This Date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Booking Detail Modal ─────────────────────────────────────────────────────

function BookingModal({
  booking,
  onClose,
  onEnrich,
}: {
  booking: Booking | null;
  onClose: () => void;
  onEnrich: (bookingId: string, data: { name: string; contact: string; payout: number }) => void;
}) {
  const [photoViewOpen, setPhotoViewOpen] = useState(false);
  const [enrichName,    setEnrichName]    = useState('');
  const [enrichContact, setEnrichContact] = useState('');
  const [enrichPayout,  setEnrichPayout]  = useState('');

  useEffect(() => {
    setPhotoViewOpen(false);
    setEnrichName('');
    setEnrichContact('');
    setEnrichPayout('');
  }, [booking?.id]);

  if (!booking) return null;

  const cm             = CHANNEL_META[booking.channel];
  const isGuest        = booking.channel !== 'BLOCKED' && booking.channel !== 'AUTO_BLOCK';
  const audit          = isGuest ? BOOKING_AUDIT[booking.id] : undefined;
  const isVerified     = audit?.status === 'VERIFIED';
  const isWaiting      = audit?.status === 'WAITING';
  const needsEnrichment = isGuest && booking.totalRevenue === 0 && !booking.enriched;
  const isEnriched     = !!booking.enriched;

  const canSaveEnrich = enrichName.trim().length > 0 && Number(enrichPayout) > 0;

  const handleEnrichSave = () => {
    if (!canSaveEnrich) return;
    onEnrich(booking.id, {
      name:    enrichName.trim(),
      contact: enrichContact.trim(),
      payout:  parseInt(enrichPayout) || 0,
    });
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none sticky top-0 right-0 -mt-10 -mr-8 float-right h-40 w-40 rounded-full bg-emerald-400/20 blur-[64px]" />

        <div className="relative p-6">
          {/* ── Header ── */}
          <div className="mb-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${cm.border} ${cm.bg}`}>
                <cm.icon className={`h-5 w-5 ${cm.text}`} />
              </div>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${cm.text}`}>{cm.label}</p>
                <h3 className="text-lg font-black text-slate-900">{booking.guestName}</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Admin Data Enrichment (iCal bookings) ── */}
          {isGuest && (needsEnrichment || isEnriched) && (
            <div className={`mb-5 rounded-2xl border p-4 ${
              isEnriched
                ? 'border-emerald-300/70 bg-emerald-50/80'
                : 'border-amber-300/70 bg-amber-50/80'
            }`}>
              {/* ── Status badge ── */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                  isEnriched
                    ? 'border-emerald-300/70 bg-emerald-100/80'
                    : 'border-amber-300/70 bg-amber-100/80'
                }`}>
                  {isEnriched
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                    : <AlertTriangle className="h-3 w-3 text-amber-700" />
                  }
                  <span className={`text-[9px] font-black uppercase tracking-wider ${
                    isEnriched ? 'text-emerald-800' : 'text-amber-800'
                  }`}>
                    {isEnriched ? 'Data Verified' : 'Requires Admin Enrichment'}
                  </span>
                </div>
                <p className={`text-[10px] ${isEnriched ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {isEnriched
                    ? 'Admin-verified guest data logged for financial calculations.'
                    : 'iCal import — guest details not provided by OTA feed.'}
                </p>
              </div>

              {isEnriched ? (
                /* ── Verified summary ── */
                <div className="space-y-1.5">
                  {booking.enrichedContact && (
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                      <p className="text-[11px] font-semibold text-emerald-900">{booking.enrichedContact}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-emerald-700">
                      Platform payout:&nbsp;
                      <span className="font-black">LKR {booking.totalRevenue.toLocaleString()}</span>
                      &nbsp;· logged to revenue dashboard
                    </p>
                  </div>
                </div>
              ) : (
                /* ── Enrichment form ── */
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Verified Guest Name</label>
                    <input
                      type="text"
                      value={enrichName}
                      onChange={(e) => setEnrichName(e.target.value)}
                      placeholder="Full name as verified"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Guest Contact Number</label>
                    <input
                      type="text"
                      value={enrichContact}
                      onChange={(e) => setEnrichContact(e.target.value)}
                      placeholder="+94 7X XXX XXXX"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Total Platform Payout (LKR)</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
                      <input
                        type="number"
                        min={0}
                        value={enrichPayout}
                        onChange={(e) => setEnrichPayout(e.target.value)}
                        placeholder="0"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnrichSave}
                    disabled={!canSaveEnrich}
                    className={`w-full rounded-xl py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-md transition-all ${
                      canSaveEnrich
                        ? 'bg-amber-600 shadow-amber-600/25 hover:bg-amber-500'
                        : 'cursor-not-allowed bg-slate-300 shadow-none'
                    }`}
                  >
                    Save &amp; Enrich Booking
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Guest Details ── */}
          <div className="grid grid-cols-2 gap-3">
            <ExecutiveGlassCard className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Check-In</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{booking.checkIn}</p>
            </ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Check-Out</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{booking.checkOut}</p>
            </ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nights</p>
              <p className="mt-1 text-xl font-black text-slate-900">{booking.nights}</p>
            </ExecutiveGlassCard>
            <ExecutiveGlassCard className="p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Rate / Night</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{lkr(booking.ratePerNight)}</p>
            </ExecutiveGlassCard>
            {isGuest && (
              <ExecutiveGlassCard className="col-span-2 bg-gradient-to-br from-white/70 to-emerald-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Revenue</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-900">{lkr(booking.totalRevenue)}</p>
                <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${booking.paid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {booking.paid
                    ? <><CheckCircle2 className="h-3 w-3" /> Paid</>
                    : <><AlertTriangle className="h-3 w-3" /> Payment Pending</>
                  }
                </span>
              </ExecutiveGlassCard>
            )}
          </div>

          {booking.notes && (
            <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
              {booking.notes}
            </div>
          )}

          {/* ── Caretaker Pre-Handover Audit ── */}
          {isGuest && audit && (
            <div className="mt-5">
              {/* Section divider + title */}
              <div className="mb-3 flex items-center gap-2.5 border-t border-slate-200/60 pt-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70">
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Caretaker Pre-Handover Audit
                </p>
              </div>

              {/* ── 14-Day Auto-Purge badge ── */}
              <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-800">
                    14-Day Photo Auto-Purge Active
                  </p>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-amber-700">
                    Condition photos are permanently deleted 14 days after check-in to optimise storage. The &apos;Verified&apos; compliance status remains permanently logged.
                  </p>
                </div>
              </div>

              {/* ── Status Pipeline ── */}
              <div className="flex items-stretch gap-2">
                {/* Step 1: Upload */}
                <div className={`flex flex-1 flex-col gap-1 rounded-2xl border px-3 py-2.5 transition-colors ${
                  isWaiting
                    ? 'border-amber-300/70 bg-amber-50/80'
                    : 'border-slate-200/50 bg-slate-50/50'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {isVerified
                      ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      : <span className="h-3.5 w-3.5 flex-shrink-0 animate-pulse rounded-full border-2 border-amber-400 bg-amber-100" />
                    }
                    <p className={`text-[9px] font-black uppercase tracking-wider ${
                      isWaiting ? 'text-amber-800' : 'text-slate-400'
                    }`}>
                      {isVerified ? 'Photos Uploaded' : 'Waiting for Caretaker Upload'}
                    </p>
                  </div>
                  <p className="pl-5 text-[9px] text-slate-400">
                    Caretaker photographs every room before guest arrival
                  </p>
                </div>

                {/* Arrow connector */}
                <div className="flex flex-shrink-0 items-center">
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>

                {/* Step 2: Verified */}
                <div className={`flex flex-1 flex-col gap-1 rounded-2xl border px-3 py-2.5 transition-colors ${
                  isVerified
                    ? 'border-emerald-300/70 bg-emerald-50/80'
                    : 'border-dashed border-slate-200/60 bg-slate-50/30 opacity-50'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {isVerified
                      ? <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                      : <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-slate-300" />
                    }
                    <p className={`text-[9px] font-black uppercase tracking-wider ${
                      isVerified ? 'text-emerald-800' : 'text-slate-400'
                    }`}>
                      Property Verified
                    </p>
                  </div>
                  <p className={`pl-5 text-[9px] ${isVerified ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                    {isVerified ? audit.verifiedAt : 'Awaiting upload'}
                  </p>
                </div>
              </div>

              {/* ── View Condition Photos button ── */}
              {isVerified && audit.photos && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhotoViewOpen((v) => !v)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 py-2.5 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-100/80 hover:shadow-sm"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {photoViewOpen ? 'Hide Condition Photos' : 'View Condition Photos'}
                    <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[9px]">
                      {audit.photos.length} photos
                    </span>
                  </button>

                  {/* ── Photo Gallery ── */}
                  {photoViewOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      {audit.photos.map((photo) => (
                        <div
                          key={photo.photoId}
                          className="overflow-hidden rounded-2xl border border-slate-200/60 shadow-sm"
                        >
                          {/* Simulated photo thumbnail */}
                          <div className={`flex h-24 items-center justify-center ${photo.bgGradient}`}>
                            <Camera className={`h-9 w-9 opacity-25 ${photo.iconColor}`} />
                          </div>
                          {/* Photo metadata */}
                          <div className="bg-white/75 px-3 py-2">
                            <p className="text-[10px] font-black text-slate-800">{photo.label}</p>
                            <div className="mt-0.5 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5 flex-shrink-0 text-slate-400" />
                              <p className="text-[9px] text-slate-500">{photo.timestamp}</p>
                            </div>
                            <span className="mt-1.5 inline-flex items-center gap-0.5 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                              <CheckCircle2 className="h-2 w-2" />
                              Time-stamped
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl border border-slate-200 bg-white/70 py-2.5 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Break-Even Calculator ────────────────────────────────────────────────────

function BreakEvenCalculator({ property }: { property: Property }) {
  const [overhead,    setOverhead]    = useState(String(property.overhead));
  const [daysInMonth, setDaysInMonth] = useState('31');
  const [occupancy,   setOccupancy]   = useState(String(property.occupancyTarget));

  // Reset when property changes
  React.useEffect(() => {
    setOverhead(String(property.overhead));
    setOccupancy(String(property.occupancyTarget));
  }, [property.id, property.overhead, property.occupancyTarget]);

  const minRate = useMemo(() => {
    const oh   = parseFloat(overhead)    || 0;
    const days = parseFloat(daysInMonth) || 1;
    const occ  = parseFloat(occupancy)   / 100 || 0.01;
    return Math.ceil(oh / (days * occ));
  }, [overhead, daysInMonth, occupancy]);

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <ExecutiveGlassCard className="p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
          <Calculator className="h-5 w-5 text-emerald-700" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Break-Even Base Rate Calculator</h3>
          <p className="text-[10px] text-slate-500">Monthly Overhead ÷ (Days × Occupancy %) = Minimum Nightly Rate</p>
        </div>
      </div>

      {/* Dynamic property context label */}
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-3 py-2 text-[10px] text-indigo-800">
        <Building2 className="h-3 w-3 flex-shrink-0" />
        <span>Dynamically loaded from <strong>{property.name}</strong> — {property.location}. Changing the property selector above will reset these values.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Monthly Overhead (LKR)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
            <input type="number" min="0" value={overhead} onChange={(e) => setOverhead(e.target.value)} className={`${inputCls} pl-10`} />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Electricity, water, wages, maintenance</p>
        </div>
        <div>
          <label className={labelCls}>Days in Month</label>
          <input type="number" min="28" max="31" value={daysInMonth} onChange={(e) => setDaysInMonth(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Target Occupancy %</label>
          <div className="relative">
            <input type="number" min="1" max="100" value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className={`${inputCls} pr-8`} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">%</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white/70 px-5 py-4 shadow-inner">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Minimum Nightly Base Rate — {property.name}</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-emerald-900">{lkr(minRate)}</p>
          <p className="mt-1 text-[10px] text-emerald-700">Dynamic pricing algorithms are locked below this floor for this property.</p>
        </div>
        <div className="hidden flex-shrink-0 sm:block">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200/80 bg-white/70 shadow-sm">
            <TrendingUp className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: 'Booked Revenue', value: lkr(minRate * Math.floor(31 * (parseFloat(occupancy) / 100))), color: 'text-emerald-800' },
          { label: 'Break-Even Nights', value: `${Math.ceil((parseFloat(overhead) || 0) / (minRate || 1))} nights`, color: 'text-slate-700' },
          { label: 'Occupancy Buffer', value: `${Math.max(0, 100 - parseFloat(occupancy)).toFixed(0)}% margin`, color: 'text-slate-500' },
        ].map((item) => (
          <ExecutiveGlassCard key={item.label} className="p-2.5 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className={`mt-1 font-black tabular-nums ${item.color}`}>{item.value}</p>
          </ExecutiveGlassCard>
        ))}
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  year, month,
  bookings,
  manualBlocks,
  autoBlockDays,
  autoBlockEnabled,
  defaultRate,
  seasonalRates,
  onBookingClick,
  onEmptyDayClick,
}: {
  year: number;
  month: number;
  bookings: Booking[];
  manualBlocks: string[];
  autoBlockDays: number;
  autoBlockEnabled: boolean;
  defaultRate?: number;
  seasonalRates?: SeasonalRate[];
  onBookingClick: (b: Booking) => void;
  onEmptyDayClick: (date: string) => void;
}) {
  // Build auto-block date set from checkout dates
  const autoBlockSet = useMemo(() => {
    const set = new Set<string>();
    if (!autoBlockEnabled || autoBlockDays < 1) return set;
    bookings
      .filter((b) => b.channel !== 'BLOCKED' && b.channel !== 'AUTO_BLOCK')
      .forEach((b) => {
        for (let i = 0; i < autoBlockDays; i++) {
          set.add(addDays(b.checkOut, i));
        }
      });
    return set;
  }, [bookings, autoBlockDays, autoBlockEnabled]);

  const manualBlockSet = useMemo(() => new Set(manualBlocks), [manualBlocks]);

  const bookingForDay = useCallback((day: number) => {
    const key = dateKey(year, month, day);
    return bookings.find((b) => key >= b.checkIn && key < b.checkOut) ?? null;
  }, [bookings, year, month]);

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth    = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="h-14 rounded-xl" />;

          const key       = dateKey(year, month, day);
          const booking   = bookingForDay(day);
          const isAuto    = !booking && autoBlockSet.has(key);
          const isManual  = !booking && !isAuto && manualBlockSet.has(key);
          const isToday   = isCurrentMonth && today.getDate() === day;

          const cm = booking ? CHANNEL_META[booking.channel]
                   : isAuto  ? CHANNEL_META['AUTO_BLOCK']
                   : isManual ? CHANNEL_META['BLOCKED']
                   : null;

          const occupied = booking || isAuto || isManual;

          // ── Rate display ─────────────────────────────────────────────────────
          const activeOverride = seasonalRates?.find(
            (r) => r.startDate && r.endDate && key >= r.startDate && key <= r.endDate,
          );
          const isSeasonalOverride = !!activeOverride && !booking && !isAuto && !isManual;
          const displayRate = (() => {
            if (!defaultRate) return undefined;
            if (booking && booking.channel !== 'BLOCKED' && booking.channel !== 'AUTO_BLOCK')
              return booking.ratePerNight;
            if (isAuto || isManual) return undefined;
            return activeOverride ? activeOverride.ratePerNight : defaultRate;
          })();
          const rateLabel = displayRate
            ? displayRate >= 1000
              ? `${(displayRate / 1000).toFixed(1).replace(/\.0$/, '')}K`
              : String(displayRate)
            : '';

          return (
            <div
              key={day}
              onClick={() => {
                if (booking) { onBookingClick(booking); return; }
                if (!isAuto && !isManual) onEmptyDayClick(key);
              }}
              title={isAuto ? `Auto-block: post-checkout deep clean (${autoBlockDays}d)` : isManual ? 'Manual block' : 'Click to manually block'}
              className={[
                'group relative flex h-14 flex-col items-center justify-start overflow-hidden rounded-xl border pt-1.5 transition-all select-none',
                occupied ? `cursor-pointer ${cm!.bg} ${cm!.border} hover:scale-[1.04] hover:shadow-md`
                         : 'cursor-pointer border-slate-200/60 bg-white/40 hover:border-slate-300 hover:bg-white/70',
                isToday ? 'ring-2 ring-emerald-500/60' : '',
              ].join(' ')}
            >
              <span className={['text-xs font-bold',
                isToday ? 'text-emerald-700' : cm ? cm.text : 'text-slate-600',
              ].join(' ')}>
                {day}
              </span>

              {booking && booking.channel !== 'BLOCKED' && booking.channel !== 'AUTO_BLOCK' && (
                <span className={`mt-0.5 truncate px-1.5 text-[8px] font-bold leading-tight ${cm!.text}`}>
                  {booking.guestName.split(' ')[0]}
                </span>
              )}

              {(booking?.channel === 'BLOCKED' || isManual) && <Lock className="mt-0.5 h-3 w-3 text-slate-500" />}
              {isAuto && <Brush className="mt-0.5 h-3 w-3 text-orange-600" />}

              {/* Empty day hover hint */}
              {!occupied && (
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Ban className="h-4 w-4 text-slate-300" />
                </span>
              )}

              {/* Check-in indicator */}
              {booking && key === booking.checkIn && (
                <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                  booking.channel === 'AIRBNB'  ? 'bg-rose-500'    :
                  booking.channel === 'BOOKING' ? 'bg-blue-500'    :
                  booking.channel === 'DIRECT'  ? 'bg-emerald-500' : 'bg-slate-400'
                }`} />
              )}

              {/* Active rate — faint corner label */}
              {rateLabel && booking?.channel !== 'BLOCKED' && !isManual && (
                <span className={`absolute bottom-0.5 right-1 font-mono text-[7px] font-semibold tabular-nums leading-none ${
                  isSeasonalOverride ? 'text-indigo-400' : 'text-slate-400/70'
                }`}>
                  {rateLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShalomPage() {
  const [properties, setProperties]  = useState<Property[]>(PROPERTIES);
  const [selectedProp, setSelectedProp] = useState<Property>(PROPERTIES[0]);
  const [viewYear,  setViewYear]     = useState(2026);
  const [viewMonth, setViewMonth]    = useState(5);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [blockDate, setBlockDate]    = useState<string | null>(null);
  const [manualBlocks,    setManualBlocks]    = useState<Record<string, string[]>>({});
  const [propSettings,    setPropSettings]    = useState<Record<string, PropSettings>>(() =>
    Object.fromEntries(PROPERTIES.map((p) => [p.id, defaultPropSettings(p.id)])),
  );
  const [addPropOpen,     setAddPropOpen]     = useState(false);
  const [propSettingsOpen, setPropSettingsOpen] = useState(false);
  const [toast, setToast]                    = useState<string | null>(null);

  // Sync selected prop when properties list changes
  useEffect(() => {
    setSelectedProp((prev) => properties.find((p) => p.id === prev.id) ?? properties[0]);
  }, [properties]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const currentBlocks = manualBlocks[selectedProp.id] ?? [];

  const handleConfirmBlock = (date: string, _reason: string) => {
    setManualBlocks((prev) => ({
      ...prev,
      [selectedProp.id]: [...(prev[selectedProp.id] ?? []), date],
    }));
  };

  const currentSettings: PropSettings =
    propSettings[selectedProp.id] ?? defaultPropSettings(selectedProp.id);

  const handleSavePropSettings = useCallback(
    (s: PropSettings) => setPropSettings((prev) => ({ ...prev, [selectedProp.id]: s })),
    [selectedProp.id],
  );

  const handleRemoveProp = useCallback(() => {
    setProperties((prev) => prev.filter((p) => p.id !== selectedProp.id));
  }, [selectedProp.id]);

  const handleConnect = useCallback((newProp: Property) => {
    setProperties((prev) => [...prev, newProp]);
    setSelectedProp(newProp);
    setPropSettings((prev) => ({
      ...prev,
      [newProp.id]: { cleanBufferEnabled: true, cleanBufferDays: 1, defaultRate: 0, seasonalRates: [] },
    }));
    setToast(`Property "${newProp.name}" successfully connected and synced.`);
  }, []);

  const handleEnrich = useCallback((
    bookingId: string,
    data: { name: string; contact: string; payout: number },
  ) => {
    const updater = (b: Booking): Booking => {
      if (b.id !== bookingId) return b;
      return {
        ...b,
        guestName:       data.name,
        totalRevenue:    data.payout,
        ratePerNight:    b.nights > 0 ? Math.round(data.payout / b.nights) : 0,
        paid:            false,
        enriched:        true,
        enrichedContact: data.contact || undefined,
      };
    };
    setProperties((prev) => prev.map((p) => ({ ...p, bookings: p.bookings.map(updater) })));
    setSelectedBooking((prev) => (prev ? updater(prev) : null));
  }, []);

  const handlePushRates = () => setToast(`Rates pushed to ${selectedProp.otaChannels.join(' & ')} for ${selectedProp.name}`);
  const handlePushBlocks = () => setToast(`Availability blocks synced to OTAs for ${selectedProp.name}`);

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
  const monthBookings = useMemo(() =>
    selectedProp.bookings.filter((b) => b.checkIn.startsWith(monthPrefix) || b.checkOut.startsWith(monthPrefix)),
    [selectedProp.bookings, monthPrefix],
  );

  const daysInViewMonth    = new Date(viewYear, viewMonth, 0).getDate();
  const paidRevenue        = monthBookings.filter((b) => b.paid && b.channel !== 'BLOCKED').reduce((s, b) => s + b.totalRevenue, 0);
  const pendingRevenue     = monthBookings.filter((b) => !b.paid && b.channel !== 'BLOCKED').reduce((s, b) => s + b.totalRevenue, 0);
  const bookedNights       = monthBookings.filter((b) => b.channel !== 'BLOCKED').reduce((s, b) => s + b.nights, 0);
  const occupancyPct       = Math.round((bookedNights / daysInViewMonth) * 100);

  return (
    <>
      {toast && <OtaToast msg={toast} onDone={() => setToast(null)} />}
      <BookingModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} onEnrich={handleEnrich} />
      <ManualBlockModal date={blockDate} onConfirm={handleConfirmBlock} onClose={() => setBlockDate(null)} />
      <AddPropertyModal
        open={addPropOpen}
        onClose={() => setAddPropOpen(false)}
        onConnect={handleConnect}
      />
      <PropertyConfigModal
        open={propSettingsOpen}
        onClose={() => setPropSettingsOpen(false)}
        property={selectedProp}
        settings={currentSettings}
        onSave={handleSavePropSettings}
      />

      <div className="w-full flex-grow flex flex-col pb-12 font-sans">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 md:px-12 2xl:px-24 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">Shalom Residences</h1>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Multi-Property OTA Manager · Channel Calendar · Break-Even Pricing</p>
              </div>
              <PropertySelector
                properties={properties}
                selected={selectedProp}
                onSelect={setSelectedProp}
                onAdd={() => setAddPropOpen(true)}
                onRemove={handleRemoveProp}
                onOpenSettings={() => setPropSettingsOpen(true)}
              />
            </div>
          </div>
        </header>

        <div className="px-6 md:px-12 2xl:px-24 space-y-6 pt-8">

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ExecutiveGlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Booked Nights</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{bookedNights}</p>
              <p className="text-[10px] text-slate-500">of {daysInViewMonth} days · {MONTH_NAMES[viewMonth - 1]}</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Occupancy Rate</p>
              <p className={`mt-2 text-3xl font-black tabular-nums ${occupancyPct >= selectedProp.occupancyTarget ? 'text-emerald-900' : 'text-amber-900'}`}>{occupancyPct}%</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div className={`h-full rounded-full transition-all ${occupancyPct >= selectedProp.occupancyTarget ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(occupancyPct, 100)}%` }} />
              </div>
              <p className="mt-1 text-[9px] text-slate-400">Target: {selectedProp.occupancyTarget}%</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Paid Revenue</p>
              <div className="mt-2 flex items-baseline gap-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <p className="text-3xl font-black tabular-nums text-emerald-900">{lkr(paidRevenue)}</p>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-amber-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pending Collection</p>
              <div className="mt-2 flex items-baseline gap-1">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                <p className="text-3xl font-black tabular-nums text-amber-900">{lkr(pendingRevenue)}</p>
              </div>
            </ExecutiveGlassCard>
          </div>

          {/* ── Month Selector (directly above calendar) ── */}
          <MonthSelectorBar
            year={viewYear} month={viewMonth}
            onPrev={prevMonth} onNext={nextMonth}
            onSelect={setViewMonth}
          />

          {/* ── Unified Channel Calendar ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            {/* Calendar header: title + legend + OTA sync buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-500" />
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase">Unified Channel Calendar</h2>
                  <p className="text-[10px] text-slate-500">{selectedProp.name} · {MONTH_NAMES[viewMonth - 1]} {viewYear}</p>
                </div>
              </div>

              {/* Channel legend */}
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                {(['AIRBNB','BOOKING','DIRECT','BLOCKED','AUTO_BLOCK'] as Channel[]).map((ch) => {
                  const cm = CHANNEL_META[ch];
                  return (
                    <span key={ch} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${cm.bg} ${cm.text} ${cm.border}`}>
                      <cm.icon className="h-2.5 w-2.5" />{cm.label}
                    </span>
                  );
                })}
              </div>

              {/* OTA Sync Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePushRates}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-200/80 bg-blue-50/80 px-3 py-1.5 text-[10px] font-bold text-blue-800 hover:bg-blue-100/80 transition-all"
                >
                  <Upload className="h-3 w-3" />
                  Push Rates to OTA
                </button>
                <button
                  type="button"
                  onClick={handlePushBlocks}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200/80 transition-all"
                >
                  <CloudUpload className="h-3 w-3" />
                  Push Blocks to OTA
                </button>
              </div>
            </div>

            <div className="p-5">
              <CalendarGrid
                year={viewYear}
                month={viewMonth}
                bookings={selectedProp.bookings}
                manualBlocks={currentBlocks}
                autoBlockDays={currentSettings.cleanBufferDays}
                autoBlockEnabled={currentSettings.cleanBufferEnabled}
                defaultRate={currentSettings.defaultRate}
                seasonalRates={currentSettings.seasonalRates}
                onBookingClick={setSelectedBooking}
                onEmptyDayClick={setBlockDate}
              />
            </div>

            <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5 text-[10px] text-slate-500">
              Click a coloured day to view booking details. Click any empty day to manually block it. Bottom bar = check-in day. Green ring = today.
            </div>
          </ExecutiveGlassCard>

          {/* ── Break-Even Calculator (property-aware) ── */}
          <BreakEvenCalculator property={selectedProp} />

          {/* ── Booking Register ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 uppercase">Booking Register — {selectedProp.name}</h2>
              <span className="text-[10px] text-slate-500">{monthBookings.filter((b) => b.channel !== 'BLOCKED').length} active bookings · {MONTH_NAMES[viewMonth - 1]}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60">
                  <tr>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Guest</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Channel</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Check-In</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Check-Out</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Nights</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {selectedProp.bookings.filter((b) => b.channel !== 'BLOCKED').map((b) => {
                    const cm = CHANNEL_META[b.channel];
                    return (
                      <tr key={b.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">{b.guestName}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cm.bg} ${cm.text} ${cm.border}`}>
                            <cm.icon className="h-3 w-3" />{cm.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 font-mono">{b.checkIn}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 font-mono">{b.checkOut}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 text-center font-bold">{b.nights}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 text-right font-black tabular-nums">{lkr(b.totalRevenue)}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.paid ? 'bg-emerald-100/90 text-emerald-900 border-emerald-200' : 'bg-amber-100/90 text-amber-900 border-amber-200'}`}>
                            {b.paid ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {b.paid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ExecutiveGlassCard>

        </div>
      </div>
    </>
  );
}
