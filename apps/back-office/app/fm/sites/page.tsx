'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
  MAX_GEOFENCE_RADIUS_M,
  MIN_GEOFENCE_RADIUS_M,
} from '../../../lib/site-geofence';
import {
  activateMasterSite,
  archiveMasterSite,
  createMasterSite,
  fetchMasterSiteDirectory,
  restoreMasterSite,
  updateMasterSiteConfig,
  updateMasterSiteRates,
  type InternalStaffOption,
  type MasterSite,
  type SectorManagerOption,
  type SiteConfigUpdate,
  type SiteRegistrationKind,
} from '../../actions/site-directory-actions';
import {
  Plus,
  MapPin,
  User,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Building2,
  Phone,
  FileText,
  DollarSign,
  Car,
  CheckCircle2,
  Zap,
  Lock,
  Save,
  History,
  Pencil,
  Layers,
  Receipt,
  Trash2,
  Archive,
  FolderArchive,
  ArchiveRestore,
  Camera,
  Fingerprint,
  List,
  Clock,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { SiteWelfareFields } from '../../../components/site/SiteWelfareFields';
import {
  EMPTY_SITE_MEALS,
  formatSmPhoneDisplay,
  looksLikeNfcTagId,
  type SiteMealsProvided,
} from '../../../lib/site-welfare';
import FmSubnav from '../components/FmSubnav';

// ─── Types ────────────────────────────────────────────────────────────────────

type SiteStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'ARCHIVED';

interface RankRateEntry {
  qty: number;
  invoiceRate: number;  // LKR per shift per guard
  payRate: number;      // LKR per shift per guard
}

interface RateAudit {
  editedBy: string;
  editedAt: string;   // ISO 8601
}

type Site = MasterSite;

type RankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

const RANKS: RankKey[] = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'];

// ─── Register Site & Client form ──────────────────────────────────────────────

type ClientMode = 'existing' | 'new';

type ModalRankKey = 'OIC' | 'SSO' | 'JSO' | 'LSO' | 'LADY Guard';
const MODAL_RANKS: ModalRankKey[] = ['OIC', 'SSO', 'JSO', 'LSO', 'LADY Guard'];

interface RankRow {
  id: number;           // stable key for React list
  rank: ModalRankKey;
  shiftType: 'both' | 'day' | 'night';
  headcount: string;
  invoiceRate: string;  // what the client pays (LKR)
  payRate: string;      // what the guard is paid (LKR)
}

interface RegisterSiteForm {
  siteKind: SiteRegistrationKind;
  clientMode: ClientMode;
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
  assignedStaffEpf: string;
  assignedStaffEpfs: string[];
  perVisitCharge: string;
  rankRows: RankRow[];
  mealsProvided: SiteMealsProvided;
  providesAccommodation: boolean;
}

let _rowId = 0;
const nextRowId = () => ++_rowId;

const BLANK_REGISTER_FORM: RegisterSiteForm = {
  siteKind: 'client',
  clientMode: 'existing',
  existingClientName: '',
  newClientName: '',
  newClientBillingAddress: '',
  siteCode: '',
  siteName: '',
  locationAddress: '',
  contractStart: '',
  contractEnd: '',
  gpsCoords: '',
  geofenceRadiusM: String(DEFAULT_GEOFENCE_RADIUS_M),
  requestOMGPS: false,
  sectorManagerEpf: '',
  assignedStaffEpf: '',
  assignedStaffEpfs: [],
  perVisitCharge: '',
  rankRows: [],
  mealsProvided: { ...EMPTY_SITE_MEALS },
  providesAccommodation: false,
};

// ─── ISO 18788 Verification Mode Types ────────────────────────────────────────

type VerificationMode = 'A' | 'B' | 'C';

const MODE_META: Record<VerificationMode, { label: string; Icon: React.FC<{ className?: string }>; badge: string; dot: string }> = {
  A: {
    label: 'Mode A: SM Roster Only',
    Icon: List,
    badge: 'bg-slate-700/70 text-slate-200 border-slate-600/60',
    dot: 'bg-slate-400',
  },
  B: {
    label: 'Mode B: SM Roster + Edge App (GPS & Live Selfie)',
    Icon: Camera,
    badge: 'bg-sky-900/70 text-sky-200 border-sky-700/60',
    dot: 'bg-sky-400',
  },
  C: {
    label: 'Mode C: SM Roster + Edge App (RFID & Live Selfie)',
    Icon: Fingerprint,
    badge: 'bg-emerald-900/70 text-emerald-200 border-emerald-700/60',
    dot: 'bg-emerald-400',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString()}`;
}

function calcMargin(s: Site) {
  const revenue = s.clientInvoiceRate * s.shiftsCompleted + s.perVisitCharge * s.visitsLogged;
  const cost    = s.guardPayRate * s.shiftsCompleted + s.deductions;
  return revenue - cost;
}

function sumMargins(sites: Site[]) {
  return sites.reduce((s, site) => s + calcMargin(site), 0);
}

type GridViewMode = 'all' | 'sector' | 'client';
type GridSortField = 'margin' | 'status' | 'site' | 'sector' | 'manager';

const STATUS_STYLES: Record<SiteStatus, string> = {
  ACTIVE:    'bg-emerald-100/90 text-emerald-900 border-emerald-200',
  SUSPENDED: 'bg-rose-100/90    text-rose-900    border-rose-200',
  PENDING:   'bg-amber-100/90   text-amber-900   border-amber-200',
  ARCHIVED:  'bg-slate-100/90   text-slate-600   border-slate-200',
};

// ─── Register Site & Client Modal ────────────────────────────────────────────

function RegisterSiteModal({
  open,
  onClose,
  onSave,
  parentClients,
  sectorManagers,
  existingSiteCodes,
  saving,
  saveError,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (f: RegisterSiteForm) => void | Promise<void>;
  parentClients: string[];
  sectorManagers: SectorManagerOption[];
  existingSiteCodes: string[];
  saving: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = useState<RegisterSiteForm>(BLANK_REGISTER_FORM);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(BLANK_REGISTER_FORM);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  const set = (k: keyof RegisterSiteForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSave(form);
    } catch {
      /* saveError is set by the page handler */
    }
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm transition-all';
  const labelCls = 'mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500';

  const isExisting = form.clientMode === 'existing';

  const clientFilled = isExisting
    ? form.existingClientName !== ''
    : form.newClientName.trim() !== '';

  const siteBasicsFilled =
    form.siteCode.trim() !== '' &&
    form.siteName.trim() !== '' &&
    form.locationAddress.trim() !== '' &&
    form.contractStart !== '';

  const clientBillingFilled = form.rankRows.length > 0;

  const normalizedSiteCode = form.siteCode.trim().toUpperCase();
  const siteCodeTaken =
    normalizedSiteCode !== '' && existingSiteCodes.includes(normalizedSiteCode);

  const gpsFilled = form.gpsCoords.trim() !== '';
  const canSubmit =
    siteBasicsFilled &&
    clientFilled &&
    clientBillingFilled &&
    !siteCodeTaken &&
    (gpsFilled || form.requestOMGPS);

  const missingFields: string[] = [];
  if (!clientFilled) missingFields.push(isExisting ? 'Parent client' : 'New parent client name');
  if (!form.siteCode.trim()) missingFields.push('Site code');
  if (siteCodeTaken) missingFields.push('Unique site code');
  if (!form.siteName.trim()) missingFields.push('Site name');
  if (!form.locationAddress.trim()) missingFields.push('Location / address');
  if (!form.contractStart) missingFields.push('Contract start date');
  if (form.rankRows.length === 0) missingFields.push('At least one guard rank');
  if (!gpsFilled && !form.requestOMGPS) {
    missingFields.push('GPS coordinates (or OM field capture)');
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        data-site-modal-version="v2-location-picker"
        className="relative flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.3)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute -top-20 right-0 h-56 w-56 rounded-full bg-emerald-400/20 blur-[72px]" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-indigo-400/10 blur-[64px]" />

        <div className="relative shrink-0 border-b border-slate-200/80 bg-[#eef2f6]">
          <div className="flex items-start justify-between px-6 pt-6 pb-3">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Register Site Location
              </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Client guard site — cluster under an existing or new parent client
          </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <ExecutiveGlassCard className="p-5">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-indigo-800">
                Step 2 — Client Assignment
              </p>

              {/* Radio toggle */}
              <div className="mb-5 flex gap-2">
                {(
                  [
                    { value: 'existing', label: 'Assign to Existing Client' },
                    { value: 'new',      label: 'Create New Client Entity'  },
                  ] as { value: ClientMode; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, clientMode: value }))}
                    className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all ${
                      form.clientMode === value
                        ? value === 'existing'
                          ? 'border-indigo-300/80 bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                          : 'border-emerald-300/80 bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                        : 'border-slate-200/80 bg-white/70 text-slate-600 hover:bg-white/90'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Conditional client fields */}
              {isExisting ? (
                <div>
                  <label className={labelCls}>Parent Client</label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={form.existingClientName}
                      onChange={set('existingClientName')}
                      required
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white/95 py-2.5 pl-9 pr-8 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                    >
                      <option value="" disabled>Select a parent client…</option>
                      {parentClients.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>New Parent Client Name</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Arpico Industries Group"
                      value={form.newClientName}
                      onChange={set('newClientName')}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Corporate Billing Address</label>
                    <input
                      className={inputCls}
                      placeholder="Registered head office address"
                      value={form.newClientBillingAddress}
                      onChange={set('newClientBillingAddress')}
                    />
                  </div>
                </div>
              )}
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-5">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                Site Details
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>
                      Site Code{' '}
                      <span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <input
                      className={
                        inputCls +
                        ' font-mono tracking-widest uppercase' +
                        (siteCodeTaken ? ' border-rose-300 ring-1 ring-rose-200' : '')
                      }
                      placeholder="e.g., LKH-01"
                      value={form.siteCode}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, siteCode: e.target.value.toUpperCase() }))
                      }
                      required
                    />
                    {siteCodeTaken ? (
                      <p className="mt-1 text-[10px] font-semibold text-rose-600">
                        This site code is already assigned to another site.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelCls}>
                      Site Name{' '}
                      <span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Outpatient Wing"
                      value={form.siteName}
                      onChange={set('siteName')}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Location / Address</label>
                    <input
                      className={inputCls}
                      placeholder="Street address, City"
                      value={form.locationAddress}
                      onChange={set('locationAddress')}
                      required
                    />
                  </div>
                </div>

                {/* ── Contract & Location sub-section ── */}
                <div className="rounded-xl border border-slate-200/80 bg-white/40 p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Contract &amp; Location
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Contract Start Date</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={form.contractStart}
                        onChange={set('contractStart')}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Contract End Date{' '}
                        <span className="normal-case font-semibold tracking-normal text-slate-400">(Optional)</span>
                      </label>
                      <input
                        type="date"
                        className={inputCls}
                        placeholder="Open-ended / Rolling"
                        value={form.contractEnd}
                        onChange={set('contractEnd')}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Google Maps Coordinates</label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className={inputCls + ' pl-9 font-mono'}
                          placeholder="e.g., 6.9271, 79.8612"
                          value={form.gpsCoords}
                          onChange={set('gpsCoords')}
                          disabled={form.requestOMGPS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Geofence radius (m)</label>
                      <input
                        type="number"
                        min={MIN_GEOFENCE_RADIUS_M}
                        max={MAX_GEOFENCE_RADIUS_M}
                        className={inputCls + ' max-w-[140px] font-mono'}
                        value={form.geofenceRadiusM}
                        onChange={set('geofenceRadiusM')}
                      />
                      <p className="mt-1 text-[10px] text-slate-500">
                        {MAX_GEOFENCE_RADIUS_M}m max
                      </p>
                    </div>
                    {(
                      <div className="col-span-2">
                        <label
                          className={`flex cursor-pointer select-none items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
                            form.requestOMGPS
                              ? 'border-amber-300/80 bg-amber-50/70'
                              : 'border-slate-200/80 bg-white/50 hover:bg-white/80'
                          }`}
                        >
                          <span className="mt-px flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={form.requestOMGPS}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  requestOMGPS: e.target.checked,
                                  gpsCoords: e.target.checked ? '' : p.gpsCoords,
                                }))
                              }
                              className="h-4 w-4 cursor-pointer rounded border-amber-400 accent-amber-500 focus:ring-amber-400/40"
                            />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className={`text-xs font-bold ${form.requestOMGPS ? 'text-amber-800' : 'text-slate-700'}`}>
                              Request OM Field GPS Capture
                            </span>
                            <span className={`text-[10px] leading-relaxed ${form.requestOMGPS ? 'text-amber-700' : 'text-slate-500'}`}>
                              Dispatches a pending GPS verification task to the assigned Sector Manager. GPS coordinates will be captured on-site via the field app.
                            </span>
                          </span>
                        </label>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className={labelCls}>Sector Manager</label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          value={form.sectorManagerEpf}
                          onChange={set('sectorManagerEpf')}
                          className="w-full appearance-none rounded-xl border border-slate-200 bg-white/95 py-2.5 pl-9 pr-8 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                        >
                          <option value="">— Assign later —</option>
                          {sectorManagers.map((person) => (
                            <option key={person.epf} value={person.epf}>{person.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <label className={labelCls + ' mb-0'}>Guard Rank &amp; Billing Matrix</label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          rankRows: [
                            ...p.rankRows,
                            { id: nextRowId(), rank: 'JSO', shiftType: 'both', headcount: '', invoiceRate: '', payRate: '' },
                          ],
                        }))
                      }
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300/80 bg-indigo-50/60 px-3 py-1.5 text-[11px] font-bold text-indigo-700 transition-all hover:border-indigo-400 hover:bg-indigo-100/60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Rank Requirement
                    </button>
                  </div>

                  {form.rankRows.length === 0 ? (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/50 py-6 text-xs text-slate-400">
                      No ranks added yet — click &ldquo;Add Rank Requirement&rdquo; above
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1.2fr_90px_60px_1fr_1fr_28px] gap-2 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rank</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Shift Type</span>
                        <span className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Qty</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Invoice Rate</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500">Pay Rate</span>
                        <span />
                      </div>

                      {form.rankRows.map((row) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[1.2fr_90px_60px_1fr_1fr_28px] items-center gap-2"
                        >
                          {/* Rank dropdown */}
                          <div className="relative">
                            <select
                              value={row.rank}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  rankRows: p.rankRows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, rank: e.target.value as ModalRankKey }
                                      : r
                                  ),
                                }))
                              }
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white/95 py-2 pl-3 pr-7 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                            >
                              {MODAL_RANKS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>

                          {/* Shift Type */}
                          <select
                            value={row.shiftType}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                rankRows: p.rankRows.map((r) =>
                                  r.id === row.id
                                    ? { ...r, shiftType: e.target.value as RankRow['shiftType'] }
                                    : r
                                ),
                              }))
                            }
                            className="text-xs border border-slate-300 rounded bg-white text-slate-800 py-1 px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          >
                            <option value="both">Both (24H)</option>
                            <option value="day">Day Only</option>
                            <option value="night">Night Only</option>
                          </select>

                          {/* Qty */}
                          <input
                            type="number"
                            min="1"
                            max="50"
                            placeholder="1"
                            value={row.headcount}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                rankRows: p.rankRows.map((r) =>
                                  r.id === row.id ? { ...r, headcount: e.target.value } : r
                                ),
                              }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white/95 py-2 px-2 text-center text-sm font-black text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />

                          {/* Invoice Rate LKR */}
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-semibold text-emerald-500">
                              LKR
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={row.invoiceRate}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  rankRows: p.rankRows.map((r) =>
                                    r.id === row.id ? { ...r, invoiceRate: e.target.value } : r
                                  ),
                                }))
                              }
                              className="w-full rounded-xl border border-emerald-200/60 bg-white/95 py-2 pl-9 pr-2 text-sm font-mono text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                            />
                          </div>

                          {/* Pay Rate LKR */}
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-semibold text-rose-400">
                              LKR
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={row.payRate}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  rankRows: p.rankRows.map((r) =>
                                    r.id === row.id ? { ...r, payRate: e.target.value } : r
                                  ),
                                }))
                              }
                              className="w-full rounded-xl border border-rose-200/60 bg-white/95 py-2 pl-9 pr-2 text-sm font-mono text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-400/40 transition-all"
                            />
                          </div>

                          {/* Remove */}
                          <button
                            type="button"
                            title="Remove rank"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                rankRows: p.rankRows.filter((r) => r.id !== row.id),
                              }))
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 text-slate-300 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per-Visit Patrol Charge (optional — patrol-billed sites only) */}
                  <div className="mt-4 pt-3 border-t border-slate-200/60">
                    <div>
                      <label className={labelCls}>Per-Visit Patrol Charge (LKR) — optional</label>
                      <div className="relative max-w-xs">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400">
                          LKR
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          placeholder="Leave blank if shift-rate only"
                          className={inputCls + ' pl-10 font-mono'}
                          value={form.perVisitCharge}
                          onChange={set('perVisitCharge')}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      Only for sites that bill SM patrol visits separately. Shift-rate-only sites can leave this blank — MD fixed shift rates apply regardless.
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-200/60 pt-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-800">
                      Guard Welfare on Site
                    </p>
                    <SiteWelfareFields
                      mealsProvided={form.mealsProvided}
                      providesAccommodation={form.providesAccommodation}
                      onMealsChange={(mealsProvided) =>
                        setForm((p) => ({ ...p, mealsProvided }))
                      }
                      onAccommodationChange={(providesAccommodation) =>
                        setForm((p) => ({ ...p, providesAccommodation }))
                      }
                    />
                  </div>
                </div>
              </div>
            </ExecutiveGlassCard>

            {!canSubmit && missingFields.length > 0 && !saving ? (
              <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs font-semibold text-amber-900">
                Complete required fields to save: {missingFields.join(' · ')}
              </p>
            ) : null}

            {saveError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {saveError}
              </p>
            ) : null}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 bg-white/70 py-3 text-sm font-bold text-slate-700 hover:bg-white/90 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit || saving}
                className={`flex-[2] flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wider transition-all ${
                  canSubmit && !saving
                    ? form.requestOMGPS
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 hover:bg-amber-400'
                      : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400 opacity-50'
                }`}
              >
                <Save className="h-4 w-4" />
                {saving
                  ? 'Saving…'
                  : form.requestOMGPS
                    ? 'Save & Dispatch to OM'
                    : 'Save and Cluster Site'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAuditTs(iso: string) {
  const [datePart, timePart] = iso.split('T');
  return `${datePart} at ${(timePart ?? '').slice(0, 5)}`;
}

function resolveSectorManagerLabel(
  site: Pick<Site, 'sectorManagerEpf' | 'sectorManager'>,
  sectorManagers: SectorManagerOption[] = [],
): string {
  if (site.sectorManagerEpf) {
    const match = sectorManagers.find((sm) => sm.epf === site.sectorManagerEpf);
    if (match) return match.label;
  }
  if (
    site.sectorManager &&
    site.sectorManager !== 'Unassigned' &&
    site.sectorManager !== site.sectorManagerEpf
  ) {
    return site.sectorManager;
  }
  return 'Unassigned';
}

// Weighted-blended rates from a rank matrix (for margin preview)
function blendedRates(matrix: Partial<Record<RankKey, RankRateEntry>>) {
  const entries = (Object.values(matrix).filter(Boolean) as RankRateEntry[])
    .filter((r) => r.qty > 0);
  const totalQty = entries.reduce((s, r) => s + r.qty, 0);
  if (totalQty === 0) return { inv: 0, pay: 0 };
  return {
    inv: entries.reduce((s, r) => s + r.qty * r.invoiceRate, 0) / totalQty,
    pay: entries.reduce((s, r) => s + r.qty * r.payRate, 0) / totalQty,
  };
}

// ─── God-Mode Grid Row ────────────────────────────────────────────────────────

function buildDraftConfig(site: Site) {
  return {
    siteName: site.siteName,
    siteCode: site.siteCode,
    address: site.address,
    clientName: site.clientName,
    parentClient: site.parentClient ?? site.clientName,
    clientBillingAddress: site.clientBillingAddress,
    perVisitCharge: String(site.perVisitCharge),
    geofenceRadiusM: String(site.geofenceRadiusM),
    lat: String(site.lat),
    lng: String(site.lng),
    contractStart: site.contractStart,
    contractEnd: site.contractEnd,
    sectorManagerEpf: site.sectorManagerEpf ?? '',
    smPhone: site.smPhone,
    mealsProvided: { ...site.mealsProvided },
    providesAccommodation: site.providesAccommodation,
  };
}

function SiteRow({
  site,
  allSites,
  sectorManagers,
  onActivate,
  onUpdateRates,
  onSaveAll,
  onArchive,
  isGrouped = false,
}: {
  site: Site;
  allSites: Site[];
  sectorManagers: SectorManagerOption[];
  onActivate: (id: string, smEpf: string) => void | Promise<void>;
  onUpdateRates: (id: string, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onSaveAll: (id: string, config: SiteConfigUpdate, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
  isGrouped?: boolean;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [selectedSM, setSelectedSM] = useState(site.sectorManagerEpf ?? sectorManagers[0]?.epf ?? '');
  const [activating, setActivating] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // ── ISO 18788 Verification Mode per-site ──────────────────────────────────
  const [siteVerificationMode, setSiteVerificationMode] = useState<VerificationMode>(
    site.verificationMode,
  );
  const [draftMealsProvided, setDraftMealsProvided] = useState<SiteMealsProvided>(
    () => ({ ...site.mealsProvided }),
  );
  const [draftProvidesAccommodation, setDraftProvidesAccommodation] = useState(
    site.providesAccommodation,
  );

  // ── Edit Configuration mode (archive + advanced toolbar) ─────────────────────
  const [configMode, setConfigMode] = useState(false);
  const [draftConfig, setDraftConfig] = useState(() => buildDraftConfig(site));
  const [configSaved, setConfigSaved] = useState(false);
  const [addRankOpen, setAddRankOpen] = useState(false);
  const [rankToAdd,   setRankToAdd]   = useState<RankKey>('CSO');

  // Sync drafts when site changes (e.g. after save propagates back)
  useEffect(() => {
    setDraftConfig(buildDraftConfig(site));
    setSiteVerificationMode(site.verificationMode);
    setDraftMealsProvided({ ...site.mealsProvided });
    setDraftProvidesAccommodation(site.providesAccommodation);
    setSelectedSM(site.sectorManagerEpf ?? sectorManagers[0]?.epf ?? '');
  }, [site, sectorManagers]);

  const exitConfigMode = () => {
    setConfigMode(false);
    setDraftConfig(buildDraftConfig(site));
    setSiteVerificationMode(site.verificationMode);
    setDraftMealsProvided({ ...site.mealsProvided });
    setDraftProvidesAccommodation(site.providesAccommodation);
  };

  // ── Draft billing rate matrix ──────────────────────────────────────────────
  const [draftMatrix, setDraftMatrix] = useState<Partial<Record<RankKey, RankRateEntry>>>(
    () => structuredClone(site.rateMatrix),
  );
  const [rateSaved, setRateSaved] = useState(false);

  useEffect(() => {
    setDraftMatrix(structuredClone(site.rateMatrix));
  }, [site.rateMatrix]);

  // ── Live computed values ───────────────────────────────────────────────────
  const {
    liveInv,
    livePay,
    liveMarginVal,
    liveIsProfitable,
    isDirtyRates,
    isDirtyConfig,
    isDirtyAny,
    draftPerVisitCharge,
  } = useMemo(() => {
    const { inv, pay } = blendedRates(draftMatrix);
    const liveInv = inv || site.clientInvoiceRate;
    const livePay = pay || site.guardPayRate;
    const draftPerVisitCharge = parseFloat(draftConfig.perVisitCharge) || site.perVisitCharge;
    const liveMarginVal = Math.round(
      liveInv * site.shiftsCompleted + draftPerVisitCharge * site.visitsLogged
      - livePay * site.shiftsCompleted - site.deductions,
    );
    const isDirtyRates = JSON.stringify(draftMatrix) !== JSON.stringify(site.rateMatrix);
    const isDirtyConfig =
      draftConfig.siteName !== site.siteName ||
      draftConfig.siteCode !== site.siteCode ||
      draftConfig.address !== site.address ||
      draftConfig.clientName !== site.clientName ||
      draftConfig.parentClient !== (site.parentClient ?? site.clientName) ||
      draftConfig.clientBillingAddress !== site.clientBillingAddress ||
      draftConfig.perVisitCharge !== String(site.perVisitCharge) ||
      draftConfig.geofenceRadiusM !== String(site.geofenceRadiusM) ||
      draftConfig.lat !== String(site.lat) ||
      draftConfig.lng !== String(site.lng) ||
      draftConfig.contractStart !== site.contractStart ||
      draftConfig.contractEnd !== site.contractEnd ||
      draftConfig.sectorManagerEpf !== (site.sectorManagerEpf ?? '') ||
      siteVerificationMode !== site.verificationMode ||
      JSON.stringify(draftMealsProvided) !== JSON.stringify(site.mealsProvided) ||
      draftProvidesAccommodation !== site.providesAccommodation;
    return {
      liveInv,
      livePay,
      liveMarginVal,
      liveIsProfitable: liveMarginVal >= 0,
      isDirtyRates,
      isDirtyConfig,
      isDirtyAny: isDirtyRates || isDirtyConfig,
      draftPerVisitCharge,
    };
  }, [draftMatrix, draftConfig, site, siteVerificationMode, draftMealsProvided, draftProvidesAccommodation]);

  // ── Matrix handlers ────────────────────────────────────────────────────────
  const setRankField = (rank: RankKey, field: keyof RankRateEntry, raw: string) => {
    const val = Math.max(0, parseInt(raw) || 0);
    setRateSaved(false); setConfigSaved(false);
    setDraftMatrix((prev) => ({ ...prev, [rank]: { ...(prev[rank]!), [field]: val } }));
  };

  const addableRanks = RANKS.filter((r) => !draftMatrix[r]);

  const handleAddRank = () => {
    if (!rankToAdd || !addableRanks.includes(rankToAdd)) return;
    setDraftMatrix((prev) => ({
      ...prev,
      [rankToAdd]: { qty: 1, invoiceRate: site.clientInvoiceRate, payRate: site.guardPayRate },
    }));
    setAddRankOpen(false);
    const next = addableRanks.find((r) => r !== rankToAdd);
    if (next) setRankToAdd(next);
  };

  const handleRemoveRank = (rank: RankKey) => {
    setRateSaved(false);
    setDraftMatrix((prev) => { const n = { ...prev }; delete n[rank]; return n; });
  };

  // ── Save handlers ──────────────────────────────────────────────────────────
  const handleSaveRates = async () => {
    await onUpdateRates(site.id, draftMatrix);
    setRateSaved(true);
    setTimeout(() => setRateSaved(false), 3000);
  };

  const handleSaveAll = async () => {
    const normalizedCode = draftConfig.siteCode.trim().toUpperCase();
    if (normalizedCode && reservedSiteCodes.includes(normalizedCode)) return;

    const perVisitRaw = draftConfig.perVisitCharge.trim();
    await onSaveAll(site.id, {
      siteName: draftConfig.siteName.trim() || site.siteName,
      siteCode: normalizedCode,
      address: draftConfig.address.trim() || site.address,
      clientName: draftConfig.clientName.trim() || site.clientName,
      parentClient: draftConfig.parentClient.trim() || draftConfig.clientName.trim() || site.clientName,
      clientBillingAddress: draftConfig.clientBillingAddress.trim(),
      lat: parseFloat(draftConfig.lat) || site.lat,
      lng: parseFloat(draftConfig.lng) || site.lng,
      contractStart: draftConfig.contractStart || site.contractStart,
      contractEnd: draftConfig.contractEnd || site.contractEnd,
      sectorManagerEpf: draftConfig.sectorManagerEpf || site.sectorManagerEpf || '',
      perVisitCharge: perVisitRaw === '' ? 0 : parseFloat(perVisitRaw) || 0,
      minDwellTimeMinutes: 0,
      geofenceRadiusM: clampGeofenceRadiusM(
        parseInt(draftConfig.geofenceRadiusM, 10) || site.geofenceRadiusM,
      ),
      verificationMode: siteVerificationMode,
      mealsProvided: draftMealsProvided,
      providesAccommodation: draftProvidesAccommodation,
    }, draftMatrix);
    setConfigSaved(true);
    setConfigMode(false);
    setTimeout(() => setConfigSaved(false), 3500);
  };

  // ── Collapsed row values ───────────────────────────────────────────────────
  const margin = calcMargin(site);
  const isProfitable = margin >= 0;
  const marginRate = site.clientInvoiceRate > 0
    ? Math.round(((site.clientInvoiceRate - site.guardPayRate) / site.clientInvoiceRate) * 100) : 0;

  const handleActivate = () => {
    setActivating(true);
    setTimeout(() => { onActivate(site.id, selectedSM); setActivating(false); }, 500);
  };

  const handleArchive = async () => {
    if (
      !window.confirm(
        `Archive "${site.siteName}"? It will move to the archive folder at the bottom. Sites cannot be deleted.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await onArchive(site.id);
      setConfigMode(false);
      setExpanded(false);
    } finally {
      setArchiving(false);
    }
  };

  const smDisplayName = resolveSectorManagerLabel(site, sectorManagers);
  const isClientSiteRow = site.siteKind === 'client';
  const reservedSiteCodes = useMemo(
    () =>
      allSites
        .filter((s) => s.id !== site.id)
        .map((s) => s.siteCode.trim().toUpperCase())
        .filter(Boolean),
    [allSites, site.id],
  );
  const normalizedDraftSiteCode = draftConfig.siteCode.trim().toUpperCase();
  const siteCodeConflict =
    normalizedDraftSiteCode !== '' && reservedSiteCodes.includes(normalizedDraftSiteCode);

  // Derived rank requirements label from live draft matrix
  const derivedRankReqs = (Object.entries(draftMatrix) as [RankKey, RankRateEntry][])
    .filter(([, r]) => r.qty > 0)
    .map(([rank, r]) => `${r.qty}× ${rank}`)
    .join(', ') || site.rankRequirements;

  const ic = 'w-full rounded-lg border bg-white/90 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-2 transition-all placeholder:text-slate-400';

  return (
    <>
      {/* ── Collapsed row ── */}
      <tr
        className={`group cursor-pointer transition-colors ${isGrouped ? 'bg-slate-50 border-l-4 border-l-indigo-200 hover:bg-white/60' : 'hover:bg-white/40'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className={`px-5 py-4 ${isGrouped ? 'pl-12' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-100 to-slate-50 shadow-sm">
              <Building2 className={`h-4 w-4 ${isGrouped ? 'text-indigo-500' : 'text-slate-600'}`} />
            </div>
            <div>
              <p className={`font-bold leading-tight ${isGrouped ? 'text-indigo-700 font-bold' : 'text-slate-900'}`}>{site.siteName}</p>
              <p className={`text-xs ${isGrouped ? 'text-indigo-500/80' : 'text-slate-500'}`}>{site.clientName}</p>
              {site.rateAudit && (
                <div className="text-[9px] font-medium text-slate-400 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  Last edited by {site.rateAudit.editedBy} on {formatAuditTs(site.rateAudit.editedAt)}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[site.status]}`}>
            {site.status}
          </span>
        </td>
        <td className="px-5 py-4">
          {isClientSiteRow ? (
            <span className="text-xs font-bold text-slate-700">{site.sector}</span>
          ) : (
            <span className="text-xs font-medium text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-4">
          {isClientSiteRow ? (
            <div className="flex items-center gap-1.5 text-sm text-slate-700">
              <User className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              {smDisplayName}
            </div>
          ) : (
            <span className="text-xs font-medium text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1 font-mono text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
            {site.lat.toFixed(4)}, {site.lng.toFixed(4)}
          </div>
        </td>
        <td className="px-5 py-4">
          {isClientSiteRow ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className={`text-base font-black tabular-nums transition-all ${isProfitable ? 'text-emerald-900' : 'animate-pulse text-rose-600 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]'}`}>
                {lkr(margin)}
              </span>
              <span className={`text-[10px] font-semibold ${isProfitable ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isProfitable ? `+${marginRate}% margin` : 'BELOW BREAK-EVEN'}
              </span>
            </div>
          ) : (
            <span className="block text-right text-xs font-medium text-slate-400">—</span>
          )}
        </td>
        <td className="px-5 py-4 text-right">
          <button type="button" className="text-slate-400 transition-colors group-hover:text-slate-700">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>

      {/* ── Expanded detail row ── */}
      {expanded && (
        <tr>
          <td colSpan={7} className="px-0 pb-2">
            <div className="mx-4 mb-2 overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl">

              {/* ── Top control bar ── */}
              <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5 transition-colors ${
                configMode ? 'border-indigo-200/70 bg-indigo-50/50' : 'border-slate-200/60 bg-slate-50/60'
              }`}>
                <div className="flex items-center gap-2">
                  {configMode
                    ? <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700"><Pencil className="h-3 w-3" />Configuration Edit Mode — Active</span>
                    : <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Site Details</span>
                  }
                  {configSaved && (
                    <span className="flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />All Changes Saved
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {configMode ? (
                    <button
                      type="button"
                      disabled={archiving}
                      onClick={(e) => { e.stopPropagation(); void handleArchive(); }}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-[10px] font-bold text-amber-900 transition-all hover:bg-amber-100/80 disabled:opacity-50"
                    >
                      <Archive className="h-3 w-3" />
                      {archiving ? 'Archiving…' : 'Archive Site'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); configMode ? exitConfigMode() : setConfigMode(true); }}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-bold transition-all ${
                      configMode
                        ? 'border-indigo-200/80 bg-white/80 text-indigo-700 hover:bg-indigo-50/60'
                        : 'border-slate-200/80 bg-white/70 text-slate-700 hover:bg-white/90'
                    }`}
                  >
                    {configMode
                      ? <><X className="h-3 w-3" />Exit Edit Mode</>
                      : <><Pencil className="h-3 w-3" />Edit Configuration</>
                    }
                  </button>
                </div>
              </div>

              {/* ── 4-panel grid ── */}
              <div className="grid grid-cols-2 gap-0 divide-x divide-slate-200/80 md:grid-cols-4">

                {/* ── Col 1: Margin breakdown (live) ── */}
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Margin Breakdown</p>
                    {isDirtyRates && (
                      <span className="rounded-full border border-indigo-200/80 bg-indigo-50/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-indigo-700">Preview</span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Invoice Revenue</span>
                      <span className={`font-mono font-bold ${isDirtyRates ? 'text-indigo-700' : 'text-emerald-800'}`}>
                        {lkr(Math.round(liveInv * site.shiftsCompleted))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Visit Charges</span>
                      <span className={`font-mono font-bold ${isDirtyConfig ? 'text-indigo-700' : 'text-emerald-800'}`}>
                        {lkr(Math.round(draftPerVisitCharge * site.visitsLogged))}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/80 pt-1.5">
                      <span className="text-slate-600">Guard Cost</span>
                      <span className={`font-mono font-bold ${isDirtyRates ? 'text-indigo-700' : 'text-rose-800'}`}>
                        −{lkr(Math.round(livePay * site.shiftsCompleted))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Deductions</span>
                      <span className="font-mono font-bold text-rose-800">−{lkr(site.deductions)}</span>
                    </div>
                    <div className={`flex justify-between border-t border-slate-200/80 pt-1.5 ${!liveIsProfitable ? 'text-rose-700' : 'text-emerald-800'}`}>
                      <span className="font-bold">Net Profit</span>
                      <span className={`font-black tabular-nums ${!liveIsProfitable ? 'animate-pulse text-rose-600' : ''}`}>{lkr(liveMarginVal)}</span>
                    </div>
                    {isDirtyRates && <p className="pt-0.5 text-[9px] italic text-indigo-500">↑ Live preview — unsaved changes</p>}
                  </div>
                </div>

                {/* ── Col 2: Site identity, contract & location ── */}
                <div className="p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Site &amp; Location</p>
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Site Name</label>
                      <input type="text" value={draftConfig.siteName}
                        onChange={(e) => setDraftConfig((p) => ({ ...p, siteName: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Site Code</label>
                      <input type="text" value={draftConfig.siteCode}
                        onChange={(e) => setDraftConfig((p) => ({ ...p, siteCode: e.target.value.toUpperCase() }))}
                        onClick={(e) => e.stopPropagation()}
                        className={`${ic} border-slate-200/80 font-mono focus:ring-indigo-500/40${siteCodeConflict ? ' border-rose-300 ring-1 ring-rose-200' : ''}`} />
                      {siteCodeConflict ? (
                        <p className="mt-1 text-[9px] font-semibold text-rose-600">
                          Already used by another site.
                        </p>
                      ) : null}
                    </div>
                    {isClientSiteRow ? (
                      <>
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Client Name</label>
                          <input type="text" value={draftConfig.clientName}
                            onChange={(e) => setDraftConfig((p) => ({ ...p, clientName: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Parent Client (grouping)</label>
                          <input type="text" value={draftConfig.parentClient}
                            onChange={(e) => setDraftConfig((p) => ({ ...p, parentClient: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Billing Address</label>
                          <input type="text" value={draftConfig.clientBillingAddress}
                            onChange={(e) => setDraftConfig((p) => ({ ...p, clientBillingAddress: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                        </div>
                      </>
                    ) : null}
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Site Address</label>
                      <input type="text" value={draftConfig.address}
                        onChange={(e) => setDraftConfig((p) => ({ ...p, address: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Contract Start</label>
                        <input type="date" value={draftConfig.contractStart}
                          onChange={(e) => setDraftConfig((p) => ({ ...p, contractStart: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Contract End</label>
                        <input type="date" value={draftConfig.contractEnd}
                          onChange={(e) => setDraftConfig((p) => ({ ...p, contractEnd: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          className={`${ic} border-slate-200/80 focus:ring-indigo-500/40`} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">GPS Lat</label>
                        <input type="number" step="0.0001" placeholder="6.9271" value={draftConfig.lat}
                          onChange={(e) => setDraftConfig((p) => ({ ...p, lat: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          className={`${ic} border-slate-200/80 font-mono focus:ring-emerald-500/40`} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">GPS Lng</label>
                        <input type="number" step="0.0001" placeholder="79.8612" value={draftConfig.lng}
                          onChange={(e) => setDraftConfig((p) => ({ ...p, lng: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          className={`${ic} border-slate-200/80 font-mono focus:ring-emerald-500/40`} />
                      </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Geofence (m)</label>
                        <input type="number" min={MIN_GEOFENCE_RADIUS_M} max={MAX_GEOFENCE_RADIUS_M}
                          value={draftConfig.geofenceRadiusM}
                          onChange={(e) => setDraftConfig((p) => ({ ...p, geofenceRadiusM: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          className={`${ic} border-slate-200/80 font-mono focus:ring-emerald-500/40`} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Rank Requirements</p>
                      <p className="text-xs font-semibold text-slate-700">{derivedRankReqs}</p>
                    </div>
                    <a href={`https://maps.google.com/?q=${draftConfig.lat},${draftConfig.lng}`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                      <MapPin className="h-3 w-3" />View in Maps
                    </a>
                  </div>
                </div>

                {/* ── Col 3: Billing Rate Matrix (qty + invoice + pay) ── */}
                <div className="p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Billing Rates</p>
                    {isDirtyRates && !configSaved && (
                      <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-700">Unsaved</span>
                    )}
                    {rateSaved && (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                        <CheckCircle2 className="h-2.5 w-2.5" />Saved
                      </span>
                    )}
                  </div>

                  {/* Column headers: Rank | Qty | Invoice | Pay | × */}
                  <div className="mb-1.5 grid grid-cols-[28px_28px_1fr_1fr_14px] gap-1 px-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Rank</span>
                    <span className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-400">Qty</span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Invoice</span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Pay</span>
                    <span />
                  </div>

                  <div className="space-y-1.5">
                    {(Object.entries(draftMatrix) as [RankKey, RankRateEntry][]).map(([rank, entry]) => {
                      const orig       = site.rateMatrix[rank];
                      const qtyChanged = orig && entry.qty         !== orig.qty;
                      const invChanged = orig && entry.invoiceRate !== orig.invoiceRate;
                      const payChanged = orig && entry.payRate     !== orig.payRate;
                      return (
                        <div key={rank} className="grid grid-cols-[28px_28px_1fr_1fr_14px] items-center gap-1">
                          <div className="flex h-6 items-center justify-center rounded-md border border-slate-200/80 bg-slate-100/80 text-[9px] font-black tracking-wider text-slate-700">{rank}</div>
                          {/* Qty */}
                          <input type="number" min="1" max="20" value={entry.qty}
                            onChange={(e) => setRankField(rank, 'qty', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className={`h-6 w-full rounded-md border py-0 text-center text-[11px] font-black text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all ${qtyChanged ? 'border-indigo-300/80 bg-indigo-50/60' : 'border-slate-200/80 bg-white/90'}`} />
                          {/* Invoice */}
                          <input type="number" min="0" step="100" value={entry.invoiceRate}
                            onChange={(e) => setRankField(rank, 'invoiceRate', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className={`h-6 w-full rounded-md border py-0 pl-1 text-[11px] font-mono font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all ${invChanged ? 'border-indigo-300/80 bg-indigo-50/60' : 'border-slate-200/80 bg-white/90'}`} />
                          {/* Pay */}
                          <input type="number" min="0" step="100" value={entry.payRate}
                            onChange={(e) => setRankField(rank, 'payRate', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className={`h-6 w-full rounded-md border py-0 pl-1 text-[11px] font-mono font-bold text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500/40 transition-all ${payChanged ? 'border-indigo-300/80 bg-indigo-50/60' : 'border-slate-200/80 bg-white/90'}`} />
                          {/* Remove */}
                          <button type="button" title={`Remove ${rank}`}
                            onClick={(e) => { e.stopPropagation(); handleRemoveRank(rank); }}
                            className="flex h-4 w-4 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* + Add Rank */}
                  {addableRanks.length > 0 && (
                    <div className="mt-2">
                      {addRankOpen ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <select value={rankToAdd} onChange={(e) => setRankToAdd(e.target.value as RankKey)}
                            className="flex-1 rounded-lg border border-slate-200/80 bg-white/90 py-1 px-1.5 text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                            {addableRanks.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button type="button" onClick={handleAddRank}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-indigo-500 transition-all">Add</button>
                          <button type="button" onClick={() => setAddRankOpen(false)}
                            className="rounded-lg border border-slate-200/70 px-1.5 py-1 text-slate-500 hover:bg-slate-50">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setRankToAdd(addableRanks[0]); setAddRankOpen(true); }}
                          className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300/80 px-2 py-1 text-[10px] font-bold text-slate-500 transition-all hover:border-indigo-300 hover:text-indigo-600">
                          <Plus className="h-3 w-3" />Add Rank
                        </button>
                      )}
                    </div>
                  )}

                  {/* Per-visit charge (optional) */}
                  <div className="mt-2.5 border-t border-slate-200/60 pt-2">
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-400">Per-Visit Charge (LKR) — optional</label>
                    <input type="number" min="0" step="100" placeholder="Shift-rate only — leave blank"
                      value={draftConfig.perVisitCharge}
                      onChange={(e) => setDraftConfig((p) => ({ ...p, perVisitCharge: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      className={`${ic} border-slate-200/80 font-mono focus:ring-emerald-500/40`} />
                  </div>

                  {/* Rate-only save (visible when not in configMode) */}
                  {!configMode && (
                    <button type="button" disabled={!isDirtyRates || rateSaved}
                      onClick={(e) => { e.stopPropagation(); handleSaveRates(); }}
                      className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                        rateSaved ? 'cursor-default border border-emerald-200/70 bg-emerald-50/80 text-emerald-700'
                          : isDirtyRates ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 hover:bg-slate-700'
                          : 'cursor-not-allowed border border-slate-200/60 bg-slate-100/80 text-slate-400'
                      }`}>
                      {rateSaved ? <><CheckCircle2 className="h-3 w-3" />Rate Changes Saved</> : <><Save className="h-3 w-3" />Save Rate Changes</>}
                    </button>
                  )}
                </div>

                {/* ── Col 4: SM Panel ── */}
                <div className="p-4">
                  {site.status === 'PENDING' ? (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Assign &amp; Activate</p>
                        <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-900">Pending</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Sector Manager</label>
                          <div className="relative">
                            <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <select value={selectedSM} onChange={(e) => setSelectedSM(e.target.value)} onClick={(e) => e.stopPropagation()}
                              className="w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-2 pl-8 pr-8 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all">
                              {sectorManagers.map((sm) => <option key={sm.epf} value={sm.epf}>{sm.label}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                        </div>
                        <button type="button" disabled={activating || !selectedSM} onClick={(e) => { e.stopPropagation(); handleActivate(); }}
                          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all ${activating ? 'cursor-wait bg-emerald-400' : 'bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-500'}`}>
                          {activating
                            ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Activating…</>
                            : <><Zap className="h-3.5 w-3.5" />Activate Site</>}
                        </button>
                        <div className="flex items-center gap-1.5 text-xs">
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          <a href={`https://maps.google.com/?q=${site.lat},${site.lng}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-semibold text-emerald-800 hover:underline">Verify Location in Maps</a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sector Manager</p>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Assigned SM</label>
                          <div className="relative">
                            <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <select
                              value={draftConfig.sectorManagerEpf}
                              onChange={(e) => {
                                const epf = e.target.value;
                                const sm = sectorManagers.find((s) => s.epf === epf);
                                setDraftConfig((p) => ({
                                  ...p,
                                  sectorManagerEpf: epf,
                                  smPhone: sm?.phone ?? p.smPhone,
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-2 pl-8 pr-8 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                            >
                              {sectorManagers.map((sm) => <option key={sm.epf} value={sm.epf}>{sm.label}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {formatSmPhoneDisplay(draftConfig.smPhone)}
                        </div>
                        {(site.nfcTagId || looksLikeNfcTagId(draftConfig.smPhone)) ? (
                          <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2.5 py-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-800">
                              NFC Tag ID (Mode C)
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[10px] text-emerald-900">
                              {site.nfcTagId ?? draftConfig.smPhone}
                            </p>
                          </div>
                        ) : null}
                        <div className="border-t border-slate-200/60 pt-3">
                          <SiteWelfareFields
                            compact
                            mealsProvided={draftMealsProvided}
                            providesAccommodation={draftProvidesAccommodation}
                            onMealsChange={setDraftMealsProvided}
                            onAccommodationChange={setDraftProvidesAccommodation}
                            onClickStop={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="border-t border-slate-200/60 pt-3">
                          <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-indigo-600">
                            ISO 18788 Verification Mode
                          </p>
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={siteVerificationMode}
                              onChange={(e) => setSiteVerificationMode(e.target.value as VerificationMode)}
                              className="w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-2 pl-3 pr-8 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                            >
                              <option value="A">Mode A: SM Roster Only</option>
                              <option value="B">Mode B: SM Roster + Edge App (GPS &amp; Live Selfie)</option>
                              <option value="C">Mode C: SM Roster + Edge App (RFID &amp; Live Selfie)</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                          {(() => {
                            const meta = MODE_META[siteVerificationMode];
                            const { Icon } = meta;
                            return (
                              <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                                <Icon className="h-3 w-3 flex-shrink-0" />
                                Mode {siteVerificationMode}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Bottom: Save All bar + audit trail ── */}
              <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 transition-colors ${
                isDirtyAny ? 'border-indigo-200/50 bg-indigo-50/30' : 'border-slate-200/60 bg-slate-50/60'
              }`}>
                {/* Audit trail */}
                <p className="flex items-center gap-1 text-[9px] italic text-slate-400">
                  <History className="h-2.5 w-2.5 flex-shrink-0" />
                  {site.rateAudit
                    ? <>Last edited by <span className="font-semibold not-italic text-slate-600">{site.rateAudit.editedBy}</span> on {formatAuditTs(site.rateAudit.editedAt)}</>
                    : 'No configuration edits recorded yet.'
                  }
                </p>

                {/* Save All */}
                <button type="button" disabled={!isDirtyAny || siteCodeConflict}
                  onClick={(e) => { e.stopPropagation(); handleSaveAll(); }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider transition-all ${
                    isDirtyAny
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500'
                      : 'cursor-not-allowed bg-slate-100/80 text-slate-400'
                  }`}>
                  <Save className="h-3.5 w-3.5" />
                  Save All Configuration Changes
                </button>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Parent Client Group Row ──────────────────────────────────────────────────

function ArchivedSitesFolder({
  sites,
  onRestore,
}: {
  sites: Site[];
  onRestore: (id: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (id: string, siteName: string) => {
    if (!window.confirm(`Restore "${siteName}" to the active site directory?`)) return;
    setRestoringId(id);
    try {
      await onRestore(id);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-100/70 px-5 py-4 text-left transition-colors hover:bg-slate-100/90"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/80 bg-white/80 shadow-sm">
            <FolderArchive className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Archive</h2>
            <p className="text-[10px] text-slate-500">
              {sites.length} archived site{sites.length !== 1 ? 's' : ''} · Sites are archived, not deleted
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {expanded ? (
        sites.length > 0 ? (
          <div className="divide-y divide-slate-200/60">
            {sites.map((site) => (
              <div
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100/80">
                    <Archive className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{site.siteName}</p>
                    <p className="truncate text-xs text-slate-500">{site.clientName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={restoringId === site.id}
                  onClick={() => void handleRestore(site.id, site.siteName)}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 transition-all hover:bg-emerald-100/80 disabled:opacity-50"
                >
                  <ArchiveRestore className="h-3 w-3" />
                  {restoringId === site.id ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-500">No archived sites. Use Edit Configuration → Archive Site to move a site here.</p>
        )
      ) : null}
    </ExecutiveGlassCard>
  );
}

function ParentClientGroupRow({
  parentClient,
  sites,
  allSites,
  sectorManagers,
  onActivate,
  onUpdateRates,
  onSaveAll,
  onArchive,
}: {
  parentClient: string;
  sites: Site[];
  allSites: Site[];
  sectorManagers: SectorManagerOption[];
  onActivate: (id: string, smEpf: string) => void | Promise<void>;
  onUpdateRates: (id: string, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onSaveAll: (id: string, config: SiteConfigUpdate, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);

  const groupMargin   = sites.reduce((s, site) => s + calcMargin(site), 0);
  const groupRevenue  = sites.reduce((s, site) => s + site.clientInvoiceRate * site.shiftsCompleted + site.perVisitCharge * site.visitsLogged, 0);
  const activeSites   = sites.filter((s) => s.status === 'ACTIVE').length;
  const isGroupProfit = groupMargin >= 0;

  return (
    <>
      {/* ── Parent client header row ── */}
      <tr
        className={`cursor-pointer select-none transition-colors ${expanded ? 'relative z-10 bg-white shadow-sm hover:bg-slate-50/80' : 'bg-indigo-50/50 hover:bg-indigo-50/80'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td colSpan={7} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: expand toggle + parent name + badge */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-100/80 text-indigo-600 transition-all">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-white/70">
                <Layers className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black uppercase tracking-tight text-indigo-900">{parentClient}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/80 bg-indigo-100/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-800">
                    <Receipt className="h-3 w-3" />
                    Consolidated Billing Active
                  </span>
                </div>
                <p className="text-[10px] text-indigo-600">
                  {sites.length} sites · {activeSites} active · {expanded ? 'Click to collapse' : 'Click to expand'}
                </p>
              </div>
            </div>

            {/* Right: aggregate stats */}
            <div className="flex items-center gap-6 pr-2">
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">Group Revenue</p>
                <p className="font-mono text-xs font-black text-indigo-800">{lkr(groupRevenue)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">Consolidated Net</p>
                <p className={`font-mono text-sm font-black tabular-nums ${isGroupProfit ? 'text-emerald-800' : 'animate-pulse text-rose-600'}`}>
                  {lkr(groupMargin)}
                </p>
              </div>
            </div>
          </div>
        </td>
      </tr>

      {/* ── Child site rows (visible when expanded) ── */}
      {expanded && sites.map((site) => (
        <SiteRow
          key={site.id}
          site={site}
          allSites={allSites}
          sectorManagers={sectorManagers}
          onActivate={onActivate}
          onUpdateRates={onUpdateRates}
          onSaveAll={onSaveAll}
          onArchive={onArchive}
          isGrouped
        />
      ))}

      {/* ── Bottom separator when collapsed ── */}
      {!expanded && (
        <tr>
          <td colSpan={7} className="border-b border-indigo-100/80 bg-indigo-50/20 py-0" />
        </tr>
      )}
    </>
  );
}

// ─── Sector Group Row ─────────────────────────────────────────────────────────

function SectorGroupRow({
  sector,
  sites,
  allSites,
  sectorManagers,
  onActivate,
  onUpdateRates,
  onSaveAll,
  onArchive,
}: {
  sector: string;
  sites: Site[];
  allSites: Site[];
  sectorManagers: SectorManagerOption[];
  onActivate: (id: string, smEpf: string) => void | Promise<void>;
  onUpdateRates: (id: string, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onSaveAll: (id: string, config: SiteConfigUpdate, matrix: Partial<Record<RankKey, RankRateEntry>>) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);

  const sectorMargin  = sumMargins(sites);
  const sectorRevenue = sites.reduce(
    (s, site) => s + site.clientInvoiceRate * site.shiftsCompleted + site.perVisitCharge * site.visitsLogged,
    0,
  );
  const activeSites   = sites.filter((s) => s.status === 'ACTIVE').length;
  const isSectorProfit = sectorMargin >= 0;

  return (
    <>
      <tr
        className={`cursor-pointer select-none transition-colors ${expanded ? 'relative z-10 bg-white shadow-sm hover:bg-slate-50/80' : 'bg-teal-50/50 hover:bg-teal-50/80'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td colSpan={7} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-teal-200/80 bg-teal-100/80 text-teal-600 transition-all">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-teal-200/80 bg-white/70">
                <MapPin className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black uppercase tracking-tight text-teal-900">{sector}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300/80 bg-teal-100/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-800">
                    Sector Roll-up
                  </span>
                </div>
                <p className="text-[10px] text-teal-600">
                  {sites.length} sites · {activeSites} active · {expanded ? 'Click to collapse' : 'Click to expand'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 pr-2">
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-teal-400">Sector Revenue</p>
                <p className="font-mono text-xs font-black text-teal-800">{lkr(sectorRevenue)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-teal-400">Sector Net Profit</p>
                <p className={`font-mono text-sm font-black tabular-nums ${isSectorProfit ? 'text-emerald-800' : 'animate-pulse text-rose-600'}`}>
                  {lkr(sectorMargin)}
                </p>
              </div>
            </div>
          </div>
        </td>
      </tr>

      {expanded && sites.map((site) => (
        <SiteRow
          key={site.id}
          site={site}
          allSites={allSites}
          sectorManagers={sectorManagers}
          onActivate={onActivate}
          onUpdateRates={onUpdateRates}
          onSaveAll={onSaveAll}
          onArchive={onArchive}
          isGrouped
        />
      ))}

      {!expanded && (
        <tr>
          <td colSpan={7} className="border-b border-teal-100/80 bg-teal-50/20 py-0" />
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function replaceSiteInList(sites: Site[], next: Site): Site[] {
  return sites.map((s) => (s.id === next.id ? next : s));
}

export default function FMSiteDirectoryPage() {
  const [sites, setSites]                 = useState<Site[]>([]);
  const [sectorManagers, setSectorManagers] = useState<SectorManagerOption[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [modalOpen, setModalOpen]         = useState(false);
  const [savingSite, setSavingSite]       = useState(false);
  const [saveSiteError, setSaveSiteError] = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  const loadDirectory = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMasterSiteDirectory();
      setSites(data.sites);
      setSectorManagers(data.sectorManagers);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load sites.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const activeSites = useMemo(
    () => sites.filter((s) => s.status !== 'ARCHIVED'),
    [sites],
  );
  const archivedSites = useMemo(
    () => sites.filter((s) => s.status === 'ARCHIVED'),
    [sites],
  );

  const parentClients = useMemo(
    () =>
      Array.from(
        new Set(
          activeSites
            .map((s) => s.parentClient || s.clientName)
            .filter(Boolean) as string[],
        ),
      ),
    [activeSites],
  );
  const existingSiteCodes = useMemo(
    () =>
      sites
        .map((s) => s.siteCode.trim().toUpperCase())
        .filter(Boolean),
    [sites],
  );
  const [gridView, setGridView]   = useState<GridViewMode>('client');
  const [sortField, setSortField] = useState<GridSortField | null>(null);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  const totalRevenue   = activeSites.reduce((s, x) => s + x.clientInvoiceRate * x.shiftsCompleted + x.perVisitCharge * x.visitsLogged, 0);
  const totalCost      = activeSites.reduce((s, x) => s + x.guardPayRate * x.shiftsCompleted + x.deductions, 0);
  const totalMargin    = totalRevenue - totalCost;
  const unprofitable   = activeSites.filter((x) => calcMargin(x) < 0).length;

  const sectorTotals = useMemo(() => {
    const map = new Map<string, { margin: number; count: number }>();
    for (const site of activeSites) {
      const key = site.sector || 'Unassigned';
      const prev = map.get(key) ?? { margin: 0, count: 0 };
      map.set(key, { margin: prev.margin + calcMargin(site), count: prev.count + 1 });
    }
    return [...map.entries()]
      .map(([sector, stats]) => ({ sector, ...stats }))
      .sort((a, b) => b.margin - a.margin);
  }, [activeSites]);

  const holidayCalendarIncomplete = true;

  const sorted = [...activeSites].sort((a, b) => {
    if (!sortField) return 0;
    const dir = sortDir === 'desc' ? -1 : 1;
    if (sortField === 'margin') {
      return dir * (calcMargin(a) - calcMargin(b));
    }
    if (sortField === 'site') {
      return dir * a.siteName.localeCompare(b.siteName);
    }
    if (sortField === 'sector') {
      return dir * a.sector.localeCompare(b.sector);
    }
    if (sortField === 'manager') {
      return dir * a.sectorManager.localeCompare(b.sectorManager);
    }
    return dir * a.status.localeCompare(b.status);
  });

  type DisplayItem =
    | { type: 'group'; parentClient: string; sites: Site[] }
    | { type: 'sectorGroup'; sector: string; sites: Site[] }
    | { type: 'standalone'; site: Site };

  const gridDisplay = useMemo<DisplayItem[]>(() => {
    if (gridView === 'all') {
      return sorted.map((site) => ({ type: 'standalone' as const, site }));
    }

    if (gridView === 'sector') {
      const sectorMap = new Map<string, Site[]>();
      for (const site of sorted) {
        const key = site.sector || 'Unassigned';
        const existing = sectorMap.get(key) ?? [];
        existing.push(site);
        sectorMap.set(key, existing);
      }

      let entries = [...sectorMap.entries()];
      if (sortField === 'margin') {
        entries = entries.sort((a, b) => {
          const diff = sumMargins(a[1]) - sumMargins(b[1]);
          return sortDir === 'desc' ? -diff : diff;
        });
      } else if (sortField === 'sector') {
        entries = entries.sort((a, b) =>
          sortDir === 'desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]),
        );
      } else {
        entries = entries.sort((a, b) => a[0].localeCompare(b[0]));
      }

      return entries.map(([sector, groupSites]) => ({
        type: 'sectorGroup' as const,
        sector,
        sites: groupSites,
      }));
    }

    const groupMap = new Map<string, Site[]>();
    const standalones: Site[] = [];

    for (const site of sorted) {
      if (site.parentClient) {
        const existing = groupMap.get(site.parentClient) ?? [];
        existing.push(site);
        groupMap.set(site.parentClient, existing);
      } else {
        standalones.push(site);
      }
    }

    const result: DisplayItem[] = [];
    for (const [parentClient, groupSites] of groupMap) {
      if (groupSites.length >= 2) {
        result.push({ type: 'group', parentClient, sites: groupSites });
      } else {
        standalones.push(groupSites[0]);
      }
    }
    for (const site of standalones) {
      result.push({ type: 'standalone', site });
    }
    return result;
  }, [sorted, gridView, sortField, sortDir]);

  const toggleSort = (field: GridSortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: GridSortField }) =>
    sortField === field
      ? (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)
      : null;

  const handleActivateSite = async (id: string, smEpf: string) => {
    setActionError(null);
    const result = await activateMasterSite({ siteId: id, smEpf });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    setSites((prev) => replaceSiteInList(prev, result.site));
  };

  const handleSaveAllConfig = async (
    id: string,
    config: SiteConfigUpdate,
    matrix: Partial<Record<RankKey, RankRateEntry>>,
  ) => {
    setActionError(null);
    const result = await updateMasterSiteConfig({ siteId: id, config, rateMatrix: matrix });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    setSites((prev) => replaceSiteInList(prev, result.site));
  };

  const handleUpdateRates = async (
    id: string,
    matrix: Partial<Record<RankKey, RankRateEntry>>,
  ) => {
    setActionError(null);
    const result = await updateMasterSiteRates({ siteId: id, rateMatrix: matrix });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    setSites((prev) => replaceSiteInList(prev, result.site));
  };

  const handleArchiveSite = async (id: string) => {
    setActionError(null);
    const result = await archiveMasterSite({ siteId: id });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    setSites((prev) => replaceSiteInList(prev, result.site));
  };

  const handleRestoreSite = async (id: string) => {
    setActionError(null);
    const result = await restoreMasterSite({ siteId: id });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    setSites((prev) => replaceSiteInList(prev, result.site));
  };

  const handleSaveSite = async (form: RegisterSiteForm) => {
    setSavingSite(true);
    setSaveSiteError(null);
    try {
      const result = await createMasterSite({
        siteKind: form.siteKind,
        clientMode: form.clientMode,
        existingClientName: form.existingClientName,
        newClientName: form.newClientName,
        newClientBillingAddress: form.newClientBillingAddress,
        siteCode: form.siteCode,
        siteName: form.siteName,
        locationAddress: form.locationAddress,
        contractStart: form.contractStart,
        contractEnd: form.contractEnd,
        gpsCoords: form.gpsCoords,
        geofenceRadiusM: form.geofenceRadiusM,
        requestOMGPS: form.requestOMGPS,
        sectorManagerEpf: form.sectorManagerEpf,
        assignedStaffEpf: form.assignedStaffEpf,
        assignedStaffEpfs: form.assignedStaffEpfs,
        perVisitCharge: form.perVisitCharge,
        minDwellTime: '',
        rankRows: form.rankRows.map(({ rank, shiftType, headcount, invoiceRate, payRate }) => ({
          rank,
          shiftType,
          headcount,
          invoiceRate,
          payRate,
        })),
        mealsProvided: form.mealsProvided,
        providesAccommodation: form.providesAccommodation,
      });
      if (!result.success) {
        setSaveSiteError(result.error);
        return;
      }
      setSites((prev) => [result.site, ...prev]);
      setModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not save this site. Try again.';
      setSaveSiteError(message);
    } finally {
      setSavingSite(false);
    }
  };

  return (
    <>
      <RegisterSiteModal
        open={modalOpen}
        onClose={() => {
          if (!savingSite) {
            setSaveSiteError(null);
            setModalOpen(false);
          }
        }}
        onSave={handleSaveSite}
        parentClients={parentClients}
        sectorManagers={sectorManagers}
        existingSiteCodes={existingSiteCodes}
        saving={savingSite}
        saveError={saveSiteError}
      />

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

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

          <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />

          {/* ── Page title bar ── */}
          <div className="mb-8 flex w-full items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
                  <Building2 className="h-4 w-4 text-blue-700" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Sites & setup
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Site Directory
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Client guard sites — margin desk, billing rates, and sector assignments.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add New Site
            </button>
          </div>

        <div className="flex flex-col gap-6">

          {loadError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800">
              {loadError}
              <button
                type="button"
                onClick={() => void loadDirectory()}
                className="ml-3 underline"
              >
                Retry
              </button>
            </div>
          ) : null}

          {actionError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
              {actionError}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-8 text-center text-sm font-semibold text-slate-600">
              Loading site directory from Supabase…
            </div>
          ) : null}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ExecutiveGlassCard className="p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Sites</p>
              <p className="text-3xl font-black text-slate-900">{activeSites.filter((s) => s.status === 'ACTIVE').length}</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/60 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Revenue</p>
              <div className="flex items-baseline gap-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <p className="text-3xl font-black text-slate-900">{lkr(totalRevenue)}</p>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-rose-50/60 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Cost</p>
              <div className="flex items-baseline gap-1">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                <p className="text-3xl font-black text-slate-900">{lkr(totalCost)}</p>
              </div>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Portfolio Net</p>
              <p className={`text-3xl font-black text-slate-900 tabular-nums ${totalMargin < 0 ? 'animate-pulse !text-rose-600' : ''}`}>
                {lkr(totalMargin)}
              </p>
              {unprofitable > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-rose-700">
                  <AlertTriangle className="h-3 w-3" />
                  {unprofitable} site{unprofitable > 1 ? 's' : ''} below break-even
                </p>
              )}
            </ExecutiveGlassCard>
          </div>

          {/* ── God-Mode Grid ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                  God-Mode Site Grid
                </h2>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-600">{activeSites.length} sites</span>
                  <span className="mx-1.5">·</span>
                  Click row to expand margin detail
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-1">View</span>
                {([
                  { id: 'all' as const, label: 'All Sites', icon: List },
                  { id: 'sector' as const, label: 'By Sector', icon: MapPin },
                  { id: 'client' as const, label: 'By Client', icon: Layers },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGridView(id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${
                      gridView === id
                        ? 'border-slate-800/20 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {gridView !== 'sector' && sectorTotals.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-slate-200/60 bg-slate-50/40 px-5 py-2.5">
                <span className="w-full text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:w-auto sm:py-1">
                  Sector net profit
                </span>
                {sectorTotals.map(({ sector, margin, count }) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => { setGridView('sector'); setSortField('sector'); setSortDir('asc'); }}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                      margin >= 0
                        ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/90'
                        : 'border-rose-200/80 bg-rose-50/80 text-rose-900 hover:bg-rose-100/90'
                    }`}
                  >
                    <span>{sector}</span>
                    <span className="text-slate-500 font-medium">({count})</span>
                    <span className={`font-mono tabular-nums ${margin < 0 ? 'animate-pulse' : ''}`}>{lkr(margin)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th
                      className="cursor-pointer px-5 py-3.5 hover:text-slate-800 transition-colors select-none"
                      onClick={() => toggleSort('site')}
                    >
                      <span className="flex items-center gap-1">
                        Site / Client
                        <SortIcon field="site" />
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-5 py-3.5 hover:text-slate-800 transition-colors select-none"
                      onClick={() => toggleSort('status')}
                    >
                      <span className="flex items-center gap-1">
                        Status
                        <SortIcon field="status" />
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-5 py-3.5 hover:text-slate-800 transition-colors select-none"
                      onClick={() => toggleSort('sector')}
                    >
                      <span className="flex items-center gap-1">
                        Sector
                        <SortIcon field="sector" />
                      </span>
                    </th>
                    <th
                      className="cursor-pointer px-5 py-3.5 hover:text-slate-800 transition-colors select-none"
                      onClick={() => toggleSort('manager')}
                    >
                      <span className="flex items-center gap-1">
                        Manager
                        <SortIcon field="manager" />
                      </span>
                    </th>
                    <th className="px-5 py-3.5">GPS</th>
                    <th
                      className="cursor-pointer px-5 py-3.5 text-right hover:text-slate-800 transition-colors select-none"
                      onClick={() => toggleSort('margin')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Net Profit
                        <SortIcon field="margin" />
                      </span>
                    </th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {gridDisplay.map((item) =>
                    item.type === 'group' ? (
                      <ParentClientGroupRow
                        key={item.parentClient}
                        parentClient={item.parentClient}
                        sites={item.sites}
                        allSites={sites}
                        sectorManagers={sectorManagers}
                        onActivate={handleActivateSite}
                        onUpdateRates={handleUpdateRates}
                        onSaveAll={handleSaveAllConfig}
                        onArchive={handleArchiveSite}
                      />
                    ) : item.type === 'sectorGroup' ? (
                      <SectorGroupRow
                        key={item.sector}
                        sector={item.sector}
                        sites={item.sites}
                        allSites={sites}
                        sectorManagers={sectorManagers}
                        onActivate={handleActivateSite}
                        onUpdateRates={handleUpdateRates}
                        onSaveAll={handleSaveAllConfig}
                        onArchive={handleArchiveSite}
                      />
                    ) : (
                      <SiteRow
                        key={item.site.id}
                        site={item.site}
                        allSites={sites}
                        sectorManagers={sectorManagers}
                        onActivate={handleActivateSite}
                        onUpdateRates={handleUpdateRates}
                        onSaveAll={handleSaveAllConfig}
                        onArchive={handleArchiveSite}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          </ExecutiveGlassCard>

          {/* ── Margin formula legend ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-5 py-3 backdrop-blur-md text-xs text-slate-600">
            <DollarSign className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-bold text-slate-700">Margin Formula:</span>
            <span className="font-mono">(Invoice Rate × Shifts) + (Visit Charge × Visits)</span>
            <span>−</span>
            <span className="font-mono">(Guard Pay × Shifts)</span>
            <span>−</span>
            <span className="font-mono">Deductions</span>
            <span>=</span>
            <span className="font-bold text-emerald-800">Net Site Profit</span>
            <span className="ml-auto flex items-center gap-1 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Red flash = below LKR 0
            </span>
          </div>

          <ArchivedSitesFolder sites={archivedSites} onRestore={handleRestoreSite} />

        </div>
        </div>
      </div>
    </>
  );
}
