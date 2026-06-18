'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Car,
  Navigation,
  AlertOctagon,
  Gauge,
  Droplets,
  MapPin,
  AlertTriangle,
  Plus,
  Eye,
  Clock,
  Shield,
  Info,
  ChevronRight,
  BarChart3,
  Tag,
  Pencil,
  Save,
  X,
  Radio,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Layers,
  Trash2,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  getFleetDashboard,
  registerFleetAsset,
  removeFleetAsset,
  updateFleetEfficiency,
} from './fleet-actions';
import type {
  FlaggedTrip,
  FuelRow,
  RegisterForm,
  RouteHistoryEntry,
  TripSeverity,
  VehicleAsset,
  VehicleColor,
  VehicleStatus,
} from './fleet-types';

const EMPTY_REGISTER: RegisterForm = {
  name: '',
  plate: '',
  driver: '',
  type: 'Sedan',
  fuelType: 'Petrol',
  trackerType: 'Hardwired GPS (Teltonika/SinoTrack)',
  tagId: '',
};

function tripPeriodBounds(period: 'D' | 'W' | 'M') {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === 'D') return { start: today, end: today };
  if (period === 'W') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { start: start.toISOString().slice(0, 10), end: today };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: today };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const VEHICLE_COLORS: Record<VehicleColor, { dot: string; ring: string; label: string; markerBg: string }> = {
  amber:   { dot: 'bg-amber-500',   ring: 'bg-amber-400/30',   label: 'bg-amber-100 text-amber-900 border-amber-300/70',   markerBg: '#f59e0b' },
  sky:     { dot: 'bg-sky-500',     ring: 'bg-sky-400/30',     label: 'bg-sky-100   text-sky-900   border-sky-300/70',     markerBg: '#0ea5e9' },
  emerald: { dot: 'bg-emerald-500', ring: 'bg-emerald-400/30', label: 'bg-emerald-100 text-emerald-900 border-emerald-300/70', markerBg: '#10b981' },
  violet:  { dot: 'bg-violet-500',  ring: 'bg-violet-400/30',  label: 'bg-violet-100 text-violet-900 border-violet-300/70',  markerBg: '#8b5cf6' },
};

const STATUS_BADGE: Record<VehicleStatus, string> = {
  ONLINE: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/70',
  PARKED: 'bg-slate-100/80  text-slate-600   border-slate-200/70',
  IDLE:   'bg-amber-100/80  text-amber-800   border-amber-200/70',
};

const SEVERITY_STYLE: Record<TripSeverity, { badge: string; glow: string; label: string }> = {
  RECKLESS:   { badge: 'bg-red-600     text-white         border-red-700',          glow: 'shadow-[0_0_14px_rgba(220,38,38,0.35)]',  label: 'RECKLESS DRIVING' },
  SPEEDING:   { badge: 'bg-amber-500   text-white         border-amber-600',        glow: 'shadow-[0_0_14px_rgba(245,158,11,0.35)]', label: 'SPEEDING' },
  AGGRESSIVE: { badge: 'bg-orange-600  text-white         border-orange-700',       glow: 'shadow-[0_0_14px_rgba(234,88,12,0.35)]',  label: 'AGGRESSIVE DRIVING' },
};

function varianceInfo(row: FuelRow) {
  const theoretical = row.gpsKm / row.efficiencyKmL;
  const excess      = row.allowanceLiters - theoretical;
  const pct         = theoretical > 0 ? (excess / theoretical) * 100 : 0;
  const severity: 'OK' | 'AMBER' | 'RED' =
    pct > 25 ? 'RED' : pct > 5 ? 'AMBER' : 'OK';
  return { theoretical, excess, pct, severity };
}

/** Returns a 2× zoomed SVG viewBox string centred on the vehicle marker */
function getVehicleViewBox(v: VehicleAsset): string {
  const w = 380;
  const h = 200;
  const x = Math.max(0, Math.min(800 - w, v.mapX - w / 2));
  const y = Math.max(0, Math.min(420 - h, v.mapY - h / 2));
  return `${Math.round(x)} ${Math.round(y)} ${w} ${h}`;
}

// ─── Register Asset Modal ─────────────────────────────────────────────────────

function RegisterTagModal({
  onClose,
  onRegister,
}: {
  onClose: () => void;
  onRegister: (form: RegisterForm) => Promise<{ success: boolean; error?: string }>;
}) {
  const [form, setForm] = useState<RegisterForm>(EMPTY_REGISTER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RegisterForm>(k: K, v: RegisterForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const result = await onRegister(form);
    setSaving(false);
    if (result.success) {
      onClose();
      return;
    }
    setError(result.error ?? 'Could not register asset.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-white/75 bg-white/95 shadow-[0_32px_80px_-16px_rgba(15,23,42,0.3)] backdrop-blur-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200/70 bg-emerald-100/60">
              <Tag className="h-4 w-4 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Register New Asset Tag</p>
              <p className="text-[10px] text-slate-500">Adds vehicle to Live Telematics Radar</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 px-6 py-5">
          {[
            { label: 'Asset / Vehicle Name', key: 'name', placeholder: 'e.g. Patrol Van 3' },
            { label: 'License Plate',        key: 'plate', placeholder: 'e.g. WP-AB-1234' },
            { label: 'Assigned Driver',      key: 'driver', placeholder: 'e.g. Kamal Perera' },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {label}
              </label>
              <input
                value={form[key as keyof RegisterForm]}
                onChange={(e) => set(key as keyof RegisterForm, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-300 outline-none focus:border-emerald-300/80 focus:bg-white transition-all"
              />
            </div>
          ))}

          {/* Tracker type + Tag ID — two-column row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tracker Device Type
              </label>
              <select
                value={form.trackerType}
                onChange={(e) => set('trackerType', e.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-300/80 focus:bg-white transition-all appearance-none"
              >
                {[
                  'Apple AirTag',
                  'Hardwired GPS (Teltonika/SinoTrack)',
                  'OBD2 Plug-in',
                  'Mobile Phone App',
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                GPS Tag ID / Serial
              </label>
              <input
                value={form.tagId}
                onChange={(e) => set('tagId', e.target.value)}
                placeholder="e.g. GT-00821"
                className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-300 outline-none focus:border-emerald-300/80 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Vehicle Type
              </label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none"
              >
                {['Sedan', 'SUV', 'Van', 'Pickup', 'Motorcycle'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Fuel Type
              </label>
              <select
                value={form.fuelType}
                onChange={(e) => set('fuelType', e.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none"
              >
                {['Petrol', 'Diesel', 'Electric', 'Hybrid'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mx-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200/80 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            {saving ? 'Registering…' : 'Register Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Per-Vehicle Map Modal ────────────────────────────────────────────────────

function VehicleMapModal({
  vehicle,
  routes,
  onClose,
}: {
  vehicle: VehicleAsset;
  routes: RouteHistoryEntry[];
  onClose: () => void;
}) {
  const c       = VEHICLE_COLORS[vehicle.color];
  const viewBox = getVehicleViewBox(vehicle);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/96 shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl">

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${c.label}`}>
              <Car className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">{vehicle.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="font-mono text-[10px] text-slate-500">{vehicle.plate}</p>
                <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-black ${STATUS_BADGE[vehicle.status]}`}>
                  {vehicle.status}
                </span>
                <p className="text-[10px] text-slate-500">
                  Driver: <span className="font-bold text-slate-700">{vehicle.driver}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/80 px-2.5 py-1 text-[9px] font-black text-amber-800">
              <RefreshCw className="h-2.5 w-2.5" />
              60-Day Route History
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Map (zoomed to this vehicle) ── */}
        <div className="relative overflow-hidden bg-slate-50/80">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <svg
            viewBox={viewBox}
            className="relative w-full"
            style={{ height: 'clamp(260px, 40vw, 360px)' }}
            aria-label={`Live map — ${vehicle.name}`}
          >
            {/* Road network (mirrored from master map) */}
            <g stroke="#cbd5e1" fill="none" strokeLinecap="round">
              <line x1="0"   y1="55"  x2="800" y2="55"  strokeWidth="4" />
              <line x1="0"   y1="145" x2="800" y2="145" strokeWidth="4" />
              <line x1="0"   y1="248" x2="800" y2="248" strokeWidth="4" />
              <line x1="0"   y1="355" x2="800" y2="355" strokeWidth="4" />
              <line x1="110" y1="0"   x2="110" y2="420" strokeWidth="4" />
              <line x1="310" y1="0"   x2="310" y2="420" strokeWidth="4" />
              <line x1="540" y1="0"   x2="540" y2="420" strokeWidth="4" />
              <line x1="680" y1="0"   x2="680" y2="420" strokeWidth="4" />
            </g>
            <g stroke="#94a3b8" fill="none" strokeLinecap="round">
              <line x1="0"   y1="195" x2="800" y2="195" strokeWidth="9" />
              <path d="M 0,300 Q 100,292 200,300 Q 350,310 500,298 Q 620,288 800,300" strokeWidth="9" />
              <line x1="420" y1="0"   x2="420" y2="420" strokeWidth="9" />
              <path d="M 0,80 Q 200,60 420,55 Q 600,50 800,75" strokeWidth="6" />
            </g>
            <g stroke="#b8c4d0" fill="none" strokeLinecap="round">
              <path d="M 110,195 Q 170,240 228,300" strokeWidth="5" />
              <path d="M 310,145 Q 360,170 420,195" strokeWidth="5" />
              <path d="M 420,195 Q 480,222 540,248" strokeWidth="5" />
              <path d="M 540,55  Q 590,100 610,145" strokeWidth="5" />
              <path d="M 110,300 Q 160,330 195,355" strokeWidth="5" />
              <path d="M 310,300 Q 360,330 420,355" strokeWidth="5" />
            </g>
            <g fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing="0.5">
              <text x="30"  y="190">BASELINE ROAD</text>
              <text x="30"  y="296">GALLE ROAD</text>
            </g>
            <g fill="#64748b" fontSize="9.5" fontWeight="700">
              {[
                { label: 'Nawala',        x: 148, y: 72  },
                { label: 'Borella',       x: 318, y: 182 },
                { label: 'Fort',          x: 32,  y: 210 },
                { label: 'Galle Face',    x: 82,  y: 315 },
                { label: 'Maradana',      x: 428, y: 137 },
                { label: 'Bambalapitiya', x: 170, y: 340 },
                { label: 'Wellawatte',    x: 162, y: 378 },
                { label: 'Nugegoda',      x: 545, y: 312 },
              ].map(({ label, x, y }) => (
                <g key={label}>
                  <circle cx={x - 6} cy={y - 3} r="2.5" fill="#94a3b8" />
                  <text x={x} y={y}>{label}</text>
                </g>
              ))}
            </g>

            {/* 60-day route history — older trips more faded */}
            {routes.map((route, i) => (
              <path
                key={i}
                d={route.path}
                stroke={route.isFlagged ? '#ef4444' : c.markerBg}
                strokeWidth={route.isFlagged ? '3' : '2.5'}
                strokeDasharray={route.isFlagged ? '7 4' : '5 4'}
                fill="none"
                strokeLinecap="round"
                opacity={Math.max(0.25, 0.8 - i * 0.12)}
              />
            ))}

            {/* Live vehicle marker */}
            <g transform={`translate(${vehicle.mapX}, ${vehicle.mapY})`}>
              {vehicle.status === 'ONLINE' && (
                <>
                  <circle r="20" fill={c.markerBg} opacity="0.1">
                    <animate attributeName="r" from="12" to="26" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.18" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle r="13" fill={c.markerBg} opacity="0.15">
                    <animate attributeName="r" from="8" to="18" dur="2s" begin="0.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.22" to="0" dur="2s" begin="0.4s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              <circle r="11" fill={c.markerBg} stroke="white" strokeWidth="3" />
              <circle r="4"  fill="white" />
              <rect x="-22" y="14" width="44" height="16" rx="5" fill="white" fillOpacity="0.94" stroke={c.markerBg} strokeWidth="1.5" />
              <text x="0" y="25" textAnchor="middle" fontSize="8.5" fontWeight="900" fill={c.markerBg}>
                LIVE
              </text>
            </g>
          </svg>

          {/* Floating badges */}
          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-white/85 px-2.5 py-1 shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800">Live Position</span>
          </div>
          <div className="absolute right-4 top-4 rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-[9px] shadow-sm backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-1.5">
              <div className="h-px w-5" style={{ background: c.markerBg, borderTop: '2px dashed' }} />
              <span className="font-bold text-slate-600">Route History</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-px w-5 border-t-2 border-dashed border-red-400" />
              <span className="font-bold text-red-600">Flagged Trip</span>
            </div>
          </div>
        </div>

        {/* ── 60-day trip history list ── */}
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
            60-Day Trip History · {routes.length} Logged Trips
          </p>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {routes.map((route, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  route.isFlagged
                    ? 'border-red-200/60 bg-red-50/50'
                    : 'border-slate-100/80 bg-slate-50/50'
                }`}
              >
                <div
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: route.isFlagged ? '#ef4444' : c.markerBg }}
                />
                <p className="flex-1 truncate text-xs font-bold text-slate-700">
                  {route.label}
                </p>
                <p className="flex-shrink-0 font-mono text-[10px] text-slate-500">
                  {route.date}
                </p>
                {route.isFlagged && (
                  <span className="flex-shrink-0 rounded-full border border-red-200/70 bg-red-100/70 px-1.5 py-0.5 text-[8px] font-black text-red-700">
                    FLAGGED
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Telematics Map ───────────────────────────────────────────────────────────

function TelematicsMap({
  vehicles,
  flaggedTrips,
  highlightedTripPath,
  highlightedVehicleId,
}: {
  vehicles: VehicleAsset[];
  flaggedTrips: FlaggedTrip[];
  highlightedTripPath: string | null;
  highlightedVehicleId: string | null;
}) {
  const onlineCount = vehicles.filter((v) => v.status === 'ONLINE').length;
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/70 bg-slate-50/80">
      {/* Map background grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* SVG road network + markers */}
      <svg
        viewBox="0 0 800 420"
        className="relative w-full"
        style={{ height: 'clamp(300px, 46vw, 420px)' }}
        aria-label="Fleet Telematics Map — Colombo Metropolitan Area"
      >
        {/* ─ Road fills (secondary) ─ */}
        <g stroke="#cbd5e1" fill="none" strokeLinecap="round">
          {/* Horizontal secondaries */}
          <line x1="0"   y1="55"  x2="800" y2="55"  strokeWidth="4" />
          <line x1="0"   y1="145" x2="800" y2="145" strokeWidth="4" />
          <line x1="0"   y1="248" x2="800" y2="248" strokeWidth="4" />
          <line x1="0"   y1="355" x2="800" y2="355" strokeWidth="4" />
          {/* Vertical secondaries */}
          <line x1="110" y1="0"   x2="110" y2="420" strokeWidth="4" />
          <line x1="310" y1="0"   x2="310" y2="420" strokeWidth="4" />
          <line x1="540" y1="0"   x2="540" y2="420" strokeWidth="4" />
          <line x1="680" y1="0"   x2="680" y2="420" strokeWidth="4" />
        </g>

        {/* ─ Main arteries ─ */}
        <g stroke="#94a3b8" fill="none" strokeLinecap="round">
          {/* Baseline Road (major horizontal) */}
          <line x1="0"   y1="195" x2="800" y2="195" strokeWidth="9" />
          {/* Galle Road (coastal, slightly curved) */}
          <path d="M 0,300 Q 100,292 200,300 Q 350,310 500,298 Q 620,288 800,300" strokeWidth="9" />
          {/* Main N-S artery */}
          <line x1="420" y1="0"   x2="420" y2="420" strokeWidth="9" />
          {/* Outer ring road */}
          <path d="M 0,80 Q 200,60 420,55 Q 600,50 800,75" strokeWidth="6" />
        </g>

        {/* ─ Connector / diagonal roads ─ */}
        <g stroke="#b8c4d0" fill="none" strokeLinecap="round">
          <path d="M 110,195 Q 170,240 228,300"  strokeWidth="5" />
          <path d="M 310,145 Q 360,170 420,195"  strokeWidth="5" />
          <path d="M 420,195 Q 480,222 540,248"  strokeWidth="5" />
          <path d="M 540,55  Q 590,100 610,145"  strokeWidth="5" />
          <path d="M 110,300 Q 160,330 195,355"  strokeWidth="5" />
          <path d="M 310,300 Q 360,330 420,355"  strokeWidth="5" />
        </g>

        {/* ─ Road name labels ─ */}
        <g fill="#94a3b8" fontSize="9" fontWeight="600" letterSpacing="0.5">
          <text x="30"  y="190" transform="rotate(-1, 30, 190)">BASELINE ROAD</text>
          <text x="30"  y="296">GALLE ROAD</text>
          <text x="424" y="30" writingMode="vertical-rl">MAIN ARTERIAL</text>
        </g>

        {/* ─ Location pins ─ */}
        <g fill="#64748b" fontSize="9.5" fontWeight="700">
          {[
            { label: 'Nawala',         x: 148, y: 72  },
            { label: 'Borella',        x: 318, y: 182 },
            { label: 'Fort',           x: 32,  y: 210 },
            { label: 'Galle Face',     x: 82,  y: 315 },
            { label: 'Maradana',       x: 428, y: 137 },
            { label: 'Bambalapitiya',  x: 170, y: 340 },
            { label: 'Rajagiriya',     x: 490, y: 72  },
            { label: 'Wellawatte',     x: 162, y: 378 },
            { label: 'Nugegoda',       x: 545, y: 312 },
          ].map(({ label, x, y }) => (
            <g key={label}>
              <circle cx={x - 6} cy={y - 3} r="2.5" fill="#94a3b8" />
              <text x={x} y={y}>{label}</text>
            </g>
          ))}
        </g>

        {/* ─ Highlighted flagged route ─ */}
        {highlightedTripPath && (
          <path
            d={highlightedTripPath}
            stroke="#ef4444"
            strokeWidth="3.5"
            strokeDasharray="8 5"
            fill="none"
            strokeLinecap="round"
            opacity="0.9"
          />
        )}

        {/* ─ Always-visible flagged-trip route ghost ─ */}
        {!highlightedTripPath && flaggedTrips.map((t) => (
          <path
            key={t.id}
            d={t.routePath}
            stroke="#fca5a5"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}

        {/* ─ Vehicle markers ─ */}
        {vehicles.map((v) => {
          const c = VEHICLE_COLORS[v.color];
          const isHighlighted = v.id === highlightedVehicleId;
          return (
            <g key={v.id} transform={`translate(${v.mapX}, ${v.mapY})`}>
              {/* Pulse ring */}
              {v.status === 'ONLINE' && (
                <>
                  <circle r="18" fill={c.markerBg} opacity="0.12">
                    <animate attributeName="r" from="12" to="22" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.18" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle r="12" fill={c.markerBg} opacity="0.18">
                    <animate attributeName="r" from="8" to="16" dur="2s" begin="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.25" to="0" dur="2s" begin="0.5s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {/* Highlight ring for active trip */}
              {isHighlighted && (
                <circle r="22" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="4 3" opacity="0.8">
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Marker body */}
              <circle r="9" fill={c.markerBg} stroke="white" strokeWidth="2.5" />
              {/* Dot */}
              <circle r="3.5" fill="white" />
              {/* Short label */}
              <rect x="-18" y="12" width="36" height="14" rx="4" fill="white" fillOpacity="0.92" stroke={c.markerBg} strokeWidth="1.2" />
              <text x="0" y="22" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={c.markerBg}>
                {v.plate.slice(-4)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ─ Map UI chrome ─ */}

      {/* LIVE badge */}
      <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-white/80 px-2.5 py-1 shadow-sm backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800">Live</span>
        <span className="text-[9px] text-slate-500">· {onlineCount} Active Tag{onlineCount === 1 ? '' : 's'}</span>
      </div>

      {/* 60-day purge badge */}
      <div className="absolute left-4 bottom-4 flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <RefreshCw className="h-3 w-3 text-amber-700" />
        <span className="text-[9px] font-black text-amber-800">
          Historical Route Data: 60-Day Rolling Auto-Purge Active
        </span>
      </div>

      {/* Map controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1.5">
        {[ZoomIn, ZoomOut, Layers].map((Icon, i) => (
          <button
            key={i}
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/70 bg-white/80 shadow-sm backdrop-blur-sm hover:bg-white/95 transition-colors"
          >
            <Icon className="h-3.5 w-3.5 text-slate-600" />
          </button>
        ))}
      </div>

      {/* Route legend */}
      <div className="absolute right-4 bottom-4 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-[9px] backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="h-0.5 w-5 border border-red-400 border-dashed" />
          <span className="text-slate-600 font-bold">Flagged Route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-5 bg-slate-400" />
          <span className="text-slate-500">Road Network</span>
        </div>
      </div>
    </div>
  );
}

// ─── Flagged Trip Radar ───────────────────────────────────────────────────────

function FlaggedTripRadar({
  trips,
  highlightedTripId,
  onHighlight,
}: {
  trips: FlaggedTrip[];
  highlightedTripId: string | null;
  onHighlight: (id: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {trips.map((trip) => {
        const sv   = SEVERITY_STYLE[trip.severity];
        const isHl = trip.id === highlightedTripId;
        const speedOverPct = Math.round(((trip.avgSpeedKmh - trip.speedLimitKmh) / trip.speedLimitKmh) * 100);
        const timeSavedPct = Math.round(((trip.expectedMins - trip.actualMins) / trip.expectedMins) * 100);

        return (
          <div
            key={trip.id}
            className={`rounded-2xl border p-4 transition-all ${
              isHl
                ? 'border-red-200/70 bg-red-50/50 ' + sv.glow
                : 'border-white/60 bg-white/40 hover:bg-white/60'
            }`}
          >
            {/* Trip header row */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${
                    trip.severity === 'RECKLESS'
                      ? 'border-red-200/70 bg-red-100/70'
                      : 'border-amber-200/70 bg-amber-100/70'
                  }`}
                >
                  <AlertOctagon
                    className={`h-4 w-4 ${
                      trip.severity === 'RECKLESS' ? 'text-red-700' : 'text-amber-700'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-900">{trip.vehicleName}</p>
                  <p className="text-[10px] text-slate-500">
                    Driver: <span className="font-bold text-slate-700">{trip.driver}</span>
                    {' · '}{trip.date}
                  </p>
                </div>
              </div>
              <span
                className={`flex-shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black ${sv.badge}`}
              >
                {sv.label}
              </span>
            </div>

            {/* Route */}
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-100/80 bg-slate-50/60 px-3 py-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <p className="text-xs font-bold text-slate-700 truncate">{trip.from}</p>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <p className="text-xs font-bold text-slate-700 truncate">{trip.to}</p>
            </div>

            {/* Algorithmic proof */}
            <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4">
              {[
                {
                  icon: Clock,
                  label: 'Actual Travel Time',
                  value: `${trip.actualMins} mins`,
                  color: 'text-red-700',
                },
                {
                  icon: Navigation,
                  label: 'Expected (Traffic API)',
                  value: `${trip.expectedMins} mins`,
                  color: 'text-slate-700',
                },
                {
                  icon: Gauge,
                  label: 'Avg Speed Recorded',
                  value: `${trip.avgSpeedKmh} km/h`,
                  color: 'text-red-700 font-black',
                },
                {
                  icon: Shield,
                  label: 'Posted Speed Limit',
                  value: `${trip.speedLimitKmh} km/h`,
                  color: 'text-slate-700',
                },
              ].map(({ icon: Icon, label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-100 bg-white/70 p-2.5"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <Icon className="h-3 w-3 text-slate-400" />
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">
                      {label}
                    </p>
                  </div>
                  <p className={`text-sm font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* AI analysis line */}
            <div
              className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2 ${
                trip.severity === 'RECKLESS'
                  ? 'border-red-200/60 bg-red-50/60'
                  : 'border-amber-200/60 bg-amber-50/60'
              }`}
            >
              <Info
                className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${
                  trip.severity === 'RECKLESS' ? 'text-red-600' : 'text-amber-600'
                }`}
              />
              <p
                className={`text-[10px] font-medium ${
                  trip.severity === 'RECKLESS' ? 'text-red-800' : 'text-amber-800'
                }`}
              >
                <strong>AI Analysis:</strong> Vehicle completed route{' '}
                <strong>{timeSavedPct}% faster</strong> than traffic conditions allow.
                Average speed <strong>{trip.avgSpeedKmh} km/h</strong> exceeds posted limit by{' '}
                <strong>
                  {trip.avgSpeedKmh - trip.speedLimitKmh} km/h (+{speedOverPct}%)
                </strong>
                . Route data retained for 60-day audit window.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onHighlight(isHl ? null : trip.id)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  isHl
                    ? 'border-red-300/70 bg-red-100/80 text-red-800'
                    : 'border-slate-200/80 bg-white/70 text-slate-700 hover:border-red-200/70 hover:bg-red-50/60'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                {isHl ? 'Hide Route on Map' : 'View Route on Map'}
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white/95 transition-colors"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Full Trip Log
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Fuel Reconciliation Engine ───────────────────────────────────────────────

function FuelTable({
  rows,
  onUpdateEfficiency,
}: {
  rows: FuelRow[];
  onUpdateEfficiency: (vehicleId: string, value: number) => void;
}) {
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [draftEfficiency, setDraft]   = useState<string>('');

  const startEdit = (row: FuelRow) => {
    setEditingId(row.vehicleId);
    setDraft(String(row.efficiencyKmL));
  };

  const commitEdit = (vehicleId: string) => {
    const v = parseFloat(draftEfficiency);
    if (!isNaN(v) && v > 0) onUpdateEfficiency(vehicleId, v);
    setEditingId(null);
  };

  const VARIANCE_STYLE = {
    OK:    'text-emerald-700 bg-emerald-50/80  border-emerald-200/60',
    AMBER: 'text-amber-800  bg-amber-50/80    border-amber-200/60',
    RED:   'text-red-800    bg-red-50/80      border-red-200/60',
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/50">
      <table className="min-w-full text-left">
        <thead>
          <tr className="border-b border-slate-100/80 bg-slate-50/60">
            {[
              'Vehicle',
              'Assigned Efficiency (km/L)',
              'GPS Logged KM',
              'Theoretical Fuel (L)',
              'Allowance Paid',
              'Variance',
            ].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/60">
          {rows.map((row) => {
            const { theoretical, excess, pct, severity } = varianceInfo(row);
            const isEditing = editingId === row.vehicleId;
            const varStyle  = VARIANCE_STYLE[severity];

            return (
              <tr key={row.vehicleId} className="hover:bg-slate-50/40 transition-colors">
                {/* Vehicle */}
                <td className="px-4 py-3.5">
                  <p className="text-xs font-black text-slate-900">{row.vehicleName}</p>
                  <p className="font-mono text-[10px] text-slate-500">{row.plate}</p>
                  <span
                    className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                      row.fuelType === 'Petrol'
                        ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                        : 'bg-sky-50 text-sky-700 border-sky-200/60'
                    }`}
                  >
                    {row.fuelType}
                  </span>
                </td>

                {/* Efficiency — editable */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="number"
                          step="0.1"
                          min="1"
                          value={draftEfficiency}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(row.vehicleId);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-16 rounded-lg border border-emerald-300/80 bg-emerald-50/60 px-2 py-1 text-xs font-black text-slate-900 outline-none"
                        />
                        <span className="text-xs text-slate-500">km/L</span>
                        <button
                          type="button"
                          onClick={() => commitEdit(row.vehicleId)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <Save className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200/80 text-slate-500 hover:bg-slate-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-black text-slate-900">
                          {row.efficiencyKmL} <span className="text-xs font-medium text-slate-500">km/L</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-200/70 text-slate-400 hover:border-emerald-300/70 hover:text-emerald-700 transition-colors"
                          title="Edit efficiency"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </td>

                {/* GPS KM */}
                <td className="px-4 py-3.5">
                  <p className="text-sm font-black text-slate-900">
                    {row.gpsKm.toLocaleString()}
                    <span className="ml-1 text-xs font-medium text-slate-500">km</span>
                  </p>
                </td>

                {/* Theoretical Fuel */}
                <td className="px-4 py-3.5">
                  <p className="text-sm font-black text-slate-700">
                    {theoretical.toFixed(1)}
                    <span className="ml-1 text-xs font-medium text-slate-500">L</span>
                  </p>
                  <p className="text-[9px] text-slate-400">
                    {row.gpsKm} ÷ {row.efficiencyKmL}
                  </p>
                </td>

                {/* Allowance paid */}
                <td className="px-4 py-3.5">
                  <p className="text-sm font-black text-slate-900">
                    {row.allowanceLiters}
                    <span className="ml-1 text-xs font-medium text-slate-500">L</span>
                  </p>
                  <p className="text-[10px] text-slate-500">{lkr(row.allowanceLkr)}</p>
                </td>

                {/* Variance */}
                <td className="px-4 py-3.5">
                  <div
                    className={`inline-flex flex-col rounded-xl border px-3 py-1.5 ${varStyle}`}
                  >
                    <span className="text-xs font-black">
                      {excess >= 0 ? '+' : ''}{excess.toFixed(1)} L
                    </span>
                    <span className="text-[9px] font-bold">
                      {excess >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                    {severity !== 'OK' && (
                      <span className="mt-0.5 text-[8px] font-black uppercase tracking-wide">
                        {severity === 'RED' ? '⚠ Potential Theft' : 'Review'}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footnote */}
      <div className="flex items-start gap-2 border-t border-slate-100/80 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        <p className="text-[10px] text-slate-500">
          Variance = Allowance Paid − (GPS KM ÷ Assigned Efficiency).{' '}
          <span className="font-bold text-amber-700">Amber</span> = &gt;5% overuse (possible unlogged private trips).{' '}
          <span className="font-bold text-red-700">Red</span> = &gt;25% overuse — potential fuel theft. MD can correct
          efficiency ratings by clicking the pencil icon; changes re-calculate all variances instantly.
          {' '}Settings → Automated Fuel Surplus Correction toggle subtracts confirmed overpayments from next month&apos;s advance.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TripPeriod = 'D' | 'W' | 'M';

export default function FleetPage() {
  const [vehicles, setVehicles]             = useState<VehicleAsset[]>([]);
  const [flaggedTrips, setFlaggedTrips]     = useState<FlaggedTrip[]>([]);
  const [routeHistory, setRouteHistory]     = useState<Record<string, RouteHistoryEntry[]>>({});
  const [fuelRows, setFuelRows]             = useState<FuelRow[]>([]);
  const [fuelPeriodLabel, setFuelPeriodLabel] = useState('');
  const [loading, setLoading]               = useState(true);
  const [loadError, setLoadError]           = useState<string | null>(null);
  const [showRegister, setShowRegister]     = useState(false);
  const [highlightedTripId, setHighlight]   = useState<string | null>(null);
  const [mapVehicleId, setMapVehicleId]     = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [tripPeriod, setTripPeriod]         = useState<TripPeriod>('M');

  const reloadFleet = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getFleetDashboard();
      setVehicles(data.vehicles);
      setFlaggedTrips(data.flaggedTrips);
      setRouteHistory(data.routeHistory);
      setFuelRows(data.fuelRows);
      setFuelPeriodLabel(data.fuelPeriodLabel);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load fleet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadFleet();
  }, [reloadFleet]);

  const filteredTrips = useMemo(() => {
    const { start, end } = tripPeriodBounds(tripPeriod);
    return flaggedTrips.filter((t) => t.date >= start && t.date <= end);
  }, [flaggedTrips, tripPeriod]);

  const highlightedTrip = useMemo(
    () => filteredTrips.find((t) => t.id === highlightedTripId) ?? null,
    [filteredTrips, highlightedTripId],
  );

  const mapVehicle = useMemo(
    () => vehicles.find((v) => v.id === mapVehicleId) ?? null,
    [vehicles, mapVehicleId],
  );

  const handleUpdateEfficiency = useCallback(async (vehicleId: string, value: number) => {
    const result = await updateFleetEfficiency(vehicleId, value);
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    setFuelRows((prev) =>
      prev.map((r) => (r.vehicleId === vehicleId ? { ...r, efficiencyKmL: value } : r)),
    );
  }, []);

  const handleRemoveVehicle = useCallback(async (vehicleId: string) => {
    const result = await removeFleetAsset(vehicleId);
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
    setFuelRows((prev) => prev.filter((r) => r.vehicleId !== vehicleId));
    setFlaggedTrips((prev) => prev.filter((t) => t.vehicleId !== vehicleId));
    setConfirmRemoveId(null);
    if (mapVehicleId === vehicleId) setMapVehicleId(null);
  }, [mapVehicleId]);

  const handleRegisterAsset = useCallback(async (form: RegisterForm) => {
    const result = await registerFleetAsset(form);
    if (result.success) {
      await reloadFleet();
      return { success: true };
    }
    return { success: false, error: result.error };
  }, [reloadFleet]);

  const onlineCount        = vehicles.filter((v) => v.status === 'ONLINE').length;
  const recklessCount      = filteredTrips.filter((t) => t.severity === 'RECKLESS').length;
  const totalFlaggedTrips  = filteredTrips.length;
  const fuelVarianceAlerts = fuelRows
    .filter((r) => vehicles.some((v) => v.id === r.vehicleId))
    .filter((r) => varianceInfo(r).severity !== 'OK').length;

  return (
    <div className="min-h-screen p-6 md:p-8 lg:p-10">

      {loadError ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/30 py-16 text-center">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm font-bold text-slate-500">Loading fleet data…</p>
        </div>
      ) : (
        <>

      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.22)]">
              <Navigation className="h-5 w-5 text-emerald-800" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Fleet & Assets</h1>
              <p className="text-sm font-medium text-slate-500">
                Telematics Radar · Reckless Driving AI · Fuel Reconciliation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register New Asset Tag
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: 'Active Tracking Tags',
              value: `${onlineCount} / ${vehicles.length}`,
              sub: 'Online right now',
              dot: 'bg-emerald-500 animate-pulse',
              color: 'text-emerald-700',
            },
            {
              label: 'Flagged Trips (MTD)',
              value: String(totalFlaggedTrips),
              sub: `${recklessCount} reckless driving`,
              dot: 'bg-red-500',
              color: 'text-red-700',
            },
            {
              label: 'Fuel Variance Alerts',
              value: String(fuelVarianceAlerts),
              sub: 'Vehicles over allowance',
              dot: 'bg-amber-500',
              color: 'text-amber-700',
            },
            {
              label: 'Route History Purge',
              value: '60 Days',
              sub: 'Auto-purge active',
              dot: 'bg-sky-500',
              color: 'text-sky-700',
            },
          ].map((s) => (
            <ExecutiveGlassCard key={s.label} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
              </div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-xs text-slate-400">{s.sub}</p>
            </ExecutiveGlassCard>
          ))}
        </div>
      </div>

      {/* ── Asset cards grid ── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-black text-slate-700">
            Registered Assets · Live Telematics
          </p>
          <span className="ml-auto text-xs text-slate-400">
            GPS accuracy ±8 m · Click a card to view individual map
          </span>
        </div>

        {vehicles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/30 py-14 text-center">
            <Car className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-400">No assets registered</p>
            <p className="text-xs text-slate-400">Use the button above to register a GPS tag</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {vehicles.map((v) => {
            const c = VEHICLE_COLORS[v.color];
            const isConfirming    = confirmRemoveId === v.id;
            const vehicleTrips    = flaggedTrips.filter((t) => t.vehicleId === v.id);

            return (
              <ExecutiveGlassCard key={v.id} className="relative overflow-hidden p-5">

                {/* ── Confirm-remove overlay ── */}
                {isConfirming && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/97 p-5 backdrop-blur-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 border border-red-200/60">
                      <Trash2 className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-slate-900">Remove Asset?</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Deregisters tag &amp; permanently deletes 60-day route history for{' '}
                        <strong className="text-slate-700">{v.plate}</strong>.
                      </p>
                    </div>
                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        className="flex-1 rounded-xl border border-slate-200/80 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveVehicle(v.id)}
                        className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-black text-white hover:bg-red-700 transition-colors"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Card content ── */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${c.label}`}>
                      <Car className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{v.name}</p>
                      <p className="font-mono text-xs text-slate-500">{v.plate}</p>
                    </div>
                  </div>
                  <span className={`flex-shrink-0 inline-flex rounded-full border px-2 py-0.5 text-xs font-black ${STATUS_BADGE[v.status]}`}>
                    {v.status}
                  </span>
                </div>

                <p className="text-xs text-slate-500 truncate mb-1">
                  <MapPin className="inline h-3 w-3 mr-0.5 text-slate-400" />
                  {v.location}
                </p>
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">
                    <Gauge className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                    {v.speedKmh} km/h
                  </span>
                  <span className="text-xs text-slate-400">{v.lastPing}</span>
                </div>

                {/* Flagged-trip alert strip */}
                {vehicleTrips.length > 0 && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200/60 bg-red-50/60 px-3 py-2">
                    <AlertOctagon className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                    <p className="text-xs font-bold text-red-700">
                      {vehicleTrips.length} flagged trip{vehicleTrips.length !== 1 ? 's' : ''} this month
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMapVehicleId(v.id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100/70 active:scale-[0.97] transition-all"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    View Live Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(v.id)}
                    title="Remove asset"
                    className="flex items-center justify-center rounded-xl border border-red-200/50 bg-red-50/30 px-3 py-2.5 text-red-400 hover:border-red-300/70 hover:bg-red-50/80 hover:text-red-600 active:scale-[0.97] transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </ExecutiveGlassCard>
            );
          })}
        </div>
      </div>

      {/* ── Flagged Trip Radar ── */}
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-red-600" />
            <p className="text-sm font-black text-slate-700">
              Reckless Driving AI Log
            </p>
            {recklessCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[9px] font-black text-white">
                {recklessCount}
              </span>
            )}
          </div>

          {/* D / W / M period toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-1">
            {(['D', 'W', 'M'] as TripPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setTripPeriod(p);
                  setHighlight(null);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-black transition-all ${
                  tripPeriod === p
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p === 'D' ? 'Today' : p === 'W' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-slate-400">
            Flagged when actual travel time &lt; Google Maps car estimate
          </span>
        </div>

        {filteredTrips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/30 py-12 text-center">
            <AlertOctagon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-400">No flagged trips for this period</p>
          </div>
        ) : (
          <FlaggedTripRadar
            trips={filteredTrips}
            highlightedTripId={highlightedTripId}
            onHighlight={setHighlight}
          />
        )}
      </div>

      {/* ── Fuel Reconciliation Engine ── */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Droplets className="h-4 w-4 text-sky-600" />
          <p className="text-sm font-black text-slate-700">
            Fuel Reconciliation — {fuelPeriodLabel || 'Current Month'}
          </p>
          {fuelVarianceAlerts > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-100/80 px-2 py-0.5 text-[9px] font-black text-amber-800">
              <AlertTriangle className="h-2.5 w-2.5" />
              {fuelVarianceAlerts} Variance Alert{fuelVarianceAlerts !== 1 ? 's' : ''}
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-400">
            Click <Pencil className="inline h-3 w-3" /> to adjust assigned efficiency per vehicle
          </span>
        </div>
        <FuelTable rows={fuelRows} onUpdateEfficiency={(id, value) => void handleUpdateEfficiency(id, value)} />
      </div>

      {/* ── Modals ── */}
      {showRegister && (
        <RegisterTagModal
          onClose={() => setShowRegister(false)}
          onRegister={handleRegisterAsset}
        />
      )}
      {mapVehicle && (
        <VehicleMapModal
          vehicle={mapVehicle}
          routes={routeHistory[mapVehicle.id] ?? []}
          onClose={() => setMapVehicleId(null)}
        />
      )}
        </>
      )}
    </div>
  );
}
