'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Building2,
  Wifi,
  Check,
  Camera,
  Clock,
  ShieldCheck,
  Trash2,
  Settings2,
  Mail,
  Phone,
  Copy,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import { ShalomLoginDayDot } from '../../../components/shalom/ShalomLoginDayDot';
import {
  buildShalomLoginDateSet,
  formatShalomCollectLkr,
  hasCaretakerCollectAmount,
  parseCaretakerCollectLkr,
  resolveShalomLoginDotStatus,
} from '../../../lib/shalom-calendar';
import {
  SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE,
  SHALOM_DEFAULT_HANDOVER_ROOM_TEMPLATES,
  SHALOM_HANDOVER_PHOTO_RETENTION_DAYS,
  parseShalomStayOpsSettings,
  resolveHandoverRooms,
  stayOpsTotalDamages,
  type ShalomDamagePreset,
  type ShalomHandoverRoom,
  type ShalomPreHandoverPhoto,
  type ShalomRecordedDamage,
} from '../../../lib/shalom-stay-ops';
import {
  SHALOM_FRONT_EPF_MAX_LENGTH,
  shalomPortalLoginDateColombo,
} from '../../../lib/shalom-front-auth-shared';
import {
  deleteShalomBooking,
  deleteShalomProperty,
  assignShalomCaretakerAction,
  fetchShalomCaretakerLoginDates,
  fetchShalomProperties,
  getShalomGuestIdSignedUrlAction,
  syncShalomPropertyFromOtas,
  updateShalomPropertyBookingAlertEmailAction,
  upsertShalomProperty,
  upsertShalomBooking,
  updateShalomStayOpsSettingsAction,
  type ShalomPropertyRecord,
} from '../shalom-actions';
import { buildShalomIcalExportUrl } from './shalom-ical-url';
import ShalomPublicListingEditorModal from '../../../components/executive/ShalomPublicListingEditorModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'AIRBNB' | 'BOOKING' | 'BLOCKED';

const MANUAL_DELETABLE_CHANNELS = new Set(['DIRECT', 'BLOCKED', 'AUTO_BLOCK']);

interface Booking {
  id: string;
  guestName: string;
  channel: Channel;
  sourceChannel?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: number;
  totalRevenue: number;
  paid: boolean;
  notes?: string;
  otaImported?: boolean;
  /** Set to true once an admin manually verifies and enriches iCal-imported data */
  enriched?: boolean;
  /** Admin-verified guest contact number (stored after enrichment) */
  enrichedContact?: string;
  /** Amount caretaker should collect; undefined/null = personnel use only */
  caretakerCollectLkr?: number | null;
  damages?: ShalomRecordedDamage[];
  guestIdDocumentUrl?: string | null;
  invoiceEmail?: string | null;
  invoiceSentAt?: string | null;
  invoiceReference?: string | null;
  preHandoverPhotos?: Array<ShalomPreHandoverPhoto & { signedUrl?: string | null }>;
  preHandoverVerifiedAt?: string | null;
}

interface Property {
  id: string;
  name: string;
  location: string;
  bedrooms: number;
  overhead: number;
  occupancyTarget: number;
  otaChannels: ('AIRBNB' | 'BOOKING')[];
  airbnbIcalUrl: string;
  bookingIcalUrl: string;
  caretakerEpf: string | null;
  caretakerName: string | null;
  bookingAlertEmail: string | null;
  publicPublished: boolean;
  publicSlug: string;
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
  airbnbCommissionPct: number;
  bookingCommissionPct: number;
  seasonalRates: SeasonalRate[];
  collectInquiryPhone: string;
  damagePresets: ShalomDamagePreset[];
  handoverRooms: ShalomHandoverRoom[];
}

// ── Caretaker Pre-Handover Audit ─────────────────────────────────────────────

interface AuditPhoto {
  photoId: string;
  /** Room label, e.g. "Living Room" */
  label: string;
  /** Display timestamp taken just before guest arrival */
  timestamp: string;
  signedUrl?: string | null;
}

interface AuditRecord {
  status: 'WAITING' | 'IN_PROGRESS' | 'VERIFIED';
  verifiedAt?: string;
  photos?: AuditPhoto[];
}

// ─── Channel meta ─────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; bg: string; text: string; border: string; icon: React.ElementType }> = {
  AIRBNB:  { label: 'Airbnb',      bg: 'bg-rose-100/90',    text: 'text-rose-900',    border: 'border-rose-200',    icon: Airplay },
  BOOKING: { label: 'Booking.com', bg: 'bg-blue-100/90',    text: 'text-blue-900',    border: 'border-blue-200',    icon: Globe   },
  BLOCKED: { label: 'Blocked',     bg: 'bg-slate-100/90',   text: 'text-slate-500',   border: 'border-slate-200',   icon: Lock    },
};

function normalizeChannel(channel: string): Channel {
  if (channel === 'AIRBNB' || channel === 'BOOKING' || channel === 'BLOCKED') return channel;
  if (channel === 'DIRECT') return 'BOOKING';
  return 'BLOCKED';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lkr(n: number) {
  if (n >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `LKR ${(n / 1_000).toFixed(1)}K`;
  return `LKR ${n.toLocaleString()}`;
}

function lkrCost(n: number) {
  if (n <= 0) return '—';
  return `− ${lkr(n)}`;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetweenDates(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  const diff = Math.round((end - start) / 86_400_000);
  return diff > 0 ? diff : 0;
}

function nightsInMonth(checkIn: string, checkOut: string, monthStart: string, monthEndExclusive: string): number {
  const start = checkIn < monthStart ? monthStart : checkIn;
  const end = checkOut < monthEndExclusive ? checkOut : monthEndExclusive;
  if (start >= end) return 0;
  return nightsBetweenDates(start, end);
}

function monthRange(year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    monthStart: `${prefix}-01`,
    monthEndExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

function bookingOverlapsRange(
  booking: Booking,
  rangeStart: string,
  rangeEndExclusive: string,
): boolean {
  return (
    (booking.checkIn >= rangeStart && booking.checkIn < rangeEndExclusive) ||
    (booking.checkOut > rangeStart && booking.checkOut <= rangeEndExclusive) ||
    (booking.checkIn < rangeStart && booking.checkOut > rangeEndExclusive)
  );
}

const ROLLING_WINDOW_DAYS = 30;

function rolling30Range(): { rangeStart: string; rangeEndExclusive: string } {
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    rangeStart: addDays(todayIso, -(ROLLING_WINDOW_DAYS - 1)),
    rangeEndExclusive: addDays(todayIso, 1),
  };
}

function isAvailabilityBlock(booking: Booking): boolean {
  return (
    normalizeChannel(booking.channel) === 'BLOCKED' ||
    booking.guestName === 'Blocked' ||
    /blocked \/ unavailable/i.test(booking.notes ?? '')
  );
}

function isManualDeletableBooking(booking: Booking): boolean {
  if (booking.otaImported) return false;
  const source = (booking.sourceChannel ?? '').toUpperCase();
  if (MANUAL_DELETABLE_CHANNELS.has(source)) return true;
  return !booking.sourceChannel && normalizeChannel(booking.channel) === 'BLOCKED';
}

function isOtaReservation(booking: Booking): boolean {
  return Boolean(booking.otaImported) && !isAvailabilityBlock(booking);
}

function calendarDayLabel(booking: Booking): string {
  if (isAvailabilityBlock(booking)) return 'Block';
  if (booking.otaImported && normalizeChannel(booking.channel) === 'BOOKING') return 'B.com';
  if (isOtaReservation(booking)) return 'Reserved';
  const first = booking.guestName.split(' ')[0] ?? '';
  if (/^reserved\b/i.test(first) || first === 'Airbnb' || first === 'Booking.com') return 'Reserved';
  if (/^occupied\b/i.test(first)) return 'B.com';
  return first;
}

const DAY_NAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatAuditDisplayTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = MONTH_SHORT[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day} ${month} ${year} · ${hours}:${minutes} ${ampm}`;
}

function auditFromBooking(booking: Booking): AuditRecord {
  const photos = booking.preHandoverPhotos ?? [];
  const mapped = photos.map((photo) => ({
    photoId: photo.id,
    label: photo.label,
    timestamp: formatAuditDisplayTime(photo.capturedAt),
    signedUrl: photo.signedUrl,
  }));

  if (photos.length === 0) {
    return { status: 'WAITING' };
  }

  if (booking.preHandoverVerifiedAt) {
    return {
      status: 'VERIFIED',
      verifiedAt: formatAuditDisplayTime(booking.preHandoverVerifiedAt),
      photos: mapped,
    };
  }

  return { status: 'IN_PROGRESS', photos: mapped };
}

function defaultPropSettings(_propId: string): PropSettings {
  return {
    cleanBufferEnabled: true,
    cleanBufferDays: 1,
    defaultRate: 0,
    airbnbCommissionPct: 3,
    bookingCommissionPct: 15,
    seasonalRates: [],
    collectInquiryPhone: '',
    damagePresets: [],
    handoverRooms: [],
  };
}

function settingsFromRecord(raw: Record<string, unknown> | undefined, propId: string): PropSettings {
  const base = defaultPropSettings(propId);
  if (!raw || typeof raw !== 'object') return base;

  const seasonal = Array.isArray(raw.seasonalRates)
    ? (raw.seasonalRates as SeasonalRate[])
    : base.seasonalRates;
  const stayOps = parseShalomStayOpsSettings(raw);

  return {
    cleanBufferEnabled:
      typeof raw.cleanBufferEnabled === 'boolean' ? raw.cleanBufferEnabled : base.cleanBufferEnabled,
    cleanBufferDays:
      typeof raw.cleanBufferDays === 'number' ? raw.cleanBufferDays : base.cleanBufferDays,
    defaultRate: typeof raw.defaultRate === 'number' ? raw.defaultRate : base.defaultRate,
    airbnbCommissionPct:
      typeof raw.airbnbCommissionPct === 'number' ? raw.airbnbCommissionPct : base.airbnbCommissionPct,
    bookingCommissionPct:
      typeof raw.bookingCommissionPct === 'number' ? raw.bookingCommissionPct : base.bookingCommissionPct,
    seasonalRates: seasonal,
    collectInquiryPhone: stayOps.collectInquiryPhone,
    damagePresets: stayOps.damagePresets,
    handoverRooms: stayOps.handoverRooms,
  };
}

function handoverRoomsEqual(a: ShalomHandoverRoom[], b: ShalomHandoverRoom[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

// ─── Caretaker assignment (MD desk) ───────────────────────────────────────────

function CaretakerAssignPanel({
  property,
  saving,
  savingAlertEmail,
  assignError,
  alertEmailError,
  onAssign,
  onSaveAlertEmail,
}: {
  property: Property;
  saving: boolean;
  savingAlertEmail: boolean;
  assignError?: string | null;
  alertEmailError?: string | null;
  onAssign: (epf: string | null) => void | Promise<void>;
  onSaveAlertEmail: (email: string | null) => void | Promise<void>;
}) {
  const [epfDraft, setEpfDraft] = useState(property.caretakerEpf ?? '');
  const [emailDraft, setEmailDraft] = useState(property.bookingAlertEmail ?? '');

  useEffect(() => {
    setEpfDraft(property.caretakerEpf ?? '');
  }, [property.id, property.caretakerEpf]);

  useEffect(() => {
    setEmailDraft(property.bookingAlertEmail ?? '');
  }, [property.id, property.bookingAlertEmail]);

  const trimmed = epfDraft.trim();
  const assigned = property.caretakerEpf;
  const dirty = trimmed !== (assigned ?? '');
  const canSave = dirty && trimmed.length > 0;

  const trimmedEmail = emailDraft.trim();
  const savedEmail = property.bookingAlertEmail ?? '';
  const emailDirty = trimmedEmail !== savedEmail;
  const canSaveEmail = emailDirty;

  const handleSave = () => {
    if (!canSave || saving) return;
    void onAssign(trimmed);
  };

  const handleClear = () => {
    if (!assigned || saving) return;
    setEpfDraft('');
    void onAssign(null);
  };

  const handleSaveEmail = () => {
    if (!canSaveEmail || savingAlertEmail) return;
    void onSaveAlertEmail(trimmedEmail || null);
  };

  const handleClearEmail = () => {
    if (!savedEmail || savingAlertEmail) return;
    setEmailDraft('');
    void onSaveAlertEmail(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-100/90 bg-emerald-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-emerald-900">
          <User className="h-4 w-4 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest">Caretaker</span>
        </div>
        <input
          type="text"
          value={epfDraft}
          disabled={saving}
          onChange={(e) =>
            setEpfDraft(e.target.value.toUpperCase().slice(0, SHALOM_FRONT_EPF_MAX_LENGTH))
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          placeholder="EPF number"
          maxLength={SHALOM_FRONT_EPF_MAX_LENGTH}
          className="w-36 rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-800 shadow-sm placeholder:font-sans placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Assign
        </button>
        {assigned ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
        {property.caretakerEpf ? (
          <p className="text-xs font-semibold text-emerald-900">
            <span className="font-black">{property.caretakerName ?? 'Caretaker'}</span>
            <span className="mx-1.5 text-emerald-600">·</span>
            <span className="font-mono">{property.caretakerEpf}</span>
          </p>
        ) : (
          <p className="text-xs font-semibold text-slate-500">
            Enter any active MNR EPF — they will see this property on the front portal calendar.
          </p>
        )}
        {saving ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Saving…
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100/90 bg-sky-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sky-900">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest">Booking alerts</span>
        </div>
        <input
          type="email"
          value={emailDraft}
          disabled={savingAlertEmail}
          onChange={(e) => setEmailDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEmail();
          }}
          placeholder="Email for instant booking alerts"
          className="min-w-[min(100%,18rem)] flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm placeholder:font-medium placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSaveEmail}
          disabled={!canSaveEmail || savingAlertEmail}
          className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save email
        </button>
        {savedEmail ? (
          <button
            type="button"
            onClick={handleClearEmail}
            disabled={savingAlertEmail}
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
        <p className="w-full text-xs font-semibold text-sky-900/80">
          Instant email when Airbnb, Booking.com, or Shalom website bookings arrive for this
          property.
        </p>
        {savingAlertEmail ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Saving…
          </span>
        ) : null}
      </div>

      {assignError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {assignError}
        </p>
      ) : null}
      {alertEmailError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {alertEmailError}
        </p>
      ) : null}
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
  onOpenGuestWebsite,
}: {
  properties: Property[];
  selected: Property;
  onSelect: (p: Property) => void;
  onAdd: () => void;
  onRemove: () => void | Promise<void>;
  onOpenSettings: () => void;
  onOpenGuestWebsite: () => void;
}) {
  const [open,           setOpen]           = useState(false);
  const [confirmRemove,  setConfirmRemove]   = useState(false);
  const [removing,       setRemoving]        = useState(false);
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
          <span className="uppercase">{selected.name}</span>
          <span className="text-[10px] font-semibold uppercase text-slate-400">{selected.location}</span>
          {selected.publicPublished ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">
              Live
            </span>
          ) : null}
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
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-[var(--cvs-accent-soft)]/80' : 'hover:bg-slate-50/80'}`}
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border text-[10px] font-black ${active ? 'border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] text-[color:var(--cvs-accent)]' : 'border-slate-200 bg-slate-100/80 text-slate-600'}`}>
                      {p.bedrooms}BR
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold uppercase ${active ? 'text-[color:var(--cvs-accent)]' : 'text-slate-800'}`}>{p.name}</p>
                      <p className="text-[10px] uppercase text-slate-500">{p.location}</p>
                      {p.caretakerEpf ? (
                        <p className="mt-0.5 text-[9px] font-semibold text-emerald-700">
                          {p.caretakerName ?? 'Caretaker'} · {p.caretakerEpf}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[9px] font-semibold text-slate-400">No caretaker</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {p.otaChannels.map((ch) => {
                        const cm = CHANNEL_META[ch];
                        return <cm.icon key={ch} className={`h-3.5 w-3.5 ${cm.text}`} />;
                      })}
                    </div>
                    {active && <Check className="h-4 w-4 text-[color:var(--cvs-accent)]" />}
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
        className="flex items-center gap-1.5 rounded-2xl border border-dashed border-slate-300/80 bg-white/40 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white/60 hover:border-[color:var(--cvs-accent-muted)] hover:text-[color:var(--cvs-accent)] transition-all"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Property (OTA Sync)
      </button>

      {/* Property Settings button */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/55 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-xl hover:bg-white/75 hover:border-[color:var(--cvs-accent-muted)] hover:text-[color:var(--cvs-accent)] transition-all"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Property Settings
      </button>

      {/* Guest website listing editor */}
      <button
        type="button"
        onClick={onOpenGuestWebsite}
        className="flex items-center gap-1.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm backdrop-blur-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all"
      >
        <Globe className="h-3.5 w-3.5" />
        Guest Website
      </button>

      {/* Remove Property — inline confirmation */}
      {!confirmRemove ? (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={removing}
          title={`Remove ${selected.name}`}
          className="flex items-center gap-1.5 rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-3 py-2 text-xs font-bold text-rose-400 hover:border-rose-300 hover:bg-rose-50/60 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
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
            disabled={removing}
            className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-white transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              void (async () => {
                setRemoving(true);
                try {
                  await onRemove();
                  setConfirmRemove(false);
                } finally {
                  setRemoving(false);
                }
              })();
            }}
            className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-rose-700 transition-all disabled:opacity-60"
          >
            {removing ? 'Removing…' : 'Confirm'}
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
  onConnect: (input: {
    id: string;
    name: string;
    location: string;
    bedrooms: number;
    overhead: number;
    occupancyTarget: number;
    otaChannels: ('AIRBNB' | 'BOOKING')[];
    airbnbIcalUrl: string;
    bookingIcalUrl: string;
  }) => void | Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_ADD_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_ADD_FORM);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = form.name.trim().length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const channels: ('AIRBNB' | 'BOOKING')[] = [
      ...(form.airbnb  ? ['AIRBNB'   as const] : []),
      ...(form.booking ? ['BOOKING'  as const] : []),
    ];
    setSaving(true);
    try {
      await onConnect({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        location: form.location.trim() || 'Unknown location',
        bedrooms: Math.max(1, parseInt(form.bedrooms) || 2),
        overhead: parseInt(form.overhead) || 0,
        occupancyTarget: Math.max(1, Math.min(100, parseInt(form.occupancy) || 60)),
        otaChannels: channels,
        airbnbIcalUrl: form.airbnb ? form.airbnbIcal.trim() : '',
        bookingIcalUrl: form.booking ? form.bookingIcal.trim() : '',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--cvs-accent)]">Property Details</p>
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
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-800">Import from OTAs</p>
              <p className="mb-3 text-[9px] text-slate-500">Paste each platform&apos;s export URL below — pulls their bookings into Pearzen.</p>
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
                            Copy this from your {label} listing → Calendar → Export calendar.
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
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                title={!canSubmit ? 'Enter a property name to continue' : undefined}
                className={`flex-[2] rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all ${
                  canSubmit
                    ? 'bg-[color:var(--cvs-accent)] shadow-[color:var(--cvs-glow)] hover:bg-[color:var(--cvs-accent-hover)]'
                    : 'cursor-not-allowed bg-slate-300 shadow-none'
                }`}
              >
                {saving ? 'Saving…' : 'Connect Property'}
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
  onSave: (payload: {
    settings: PropSettings;
    airbnbIcalUrl: string;
    bookingIcalUrl: string;
  }) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<PropSettings>(settings);
  const [airbnbIcalUrl, setAirbnbIcalUrl] = useState(property.airbnbIcalUrl);
  const [bookingIcalUrl, setBookingIcalUrl] = useState(property.bookingIcalUrl);
  const [saving, setSaving] = useState(false);
  const [exportUrlCopied, setExportUrlCopied] = useState(false);

  const pearzenIcalExportUrl = useMemo(
    () => buildShalomIcalExportUrl(property.id),
    [property.id],
  );

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setAirbnbIcalUrl(property.airbnbIcalUrl);
      setBookingIcalUrl(property.bookingIcalUrl);
      setSaving(false);
      setExportUrlCopied(false);
    }
  }, [open, settings, property.airbnbIcalUrl, property.bookingIcalUrl]);

  if (!open) return null;

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

  const handleCopyExportUrl = async () => {
    try {
      await navigator.clipboard.writeText(pearzenIcalExportUrl);
      setExportUrlCopied(true);
      window.setTimeout(() => setExportUrlCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

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
            <ExecutiveGlassCard className="p-5">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                OTA calendar links
              </p>
              <p className="mb-3 text-[9px] text-slate-500">
                Paste each platform&apos;s export URL — Pearzen pulls bookings and blocked dates into the calendar.
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Airbnb iCal export URL</label>
                  <input
                    type="url"
                    placeholder="https://www.airbnb.com/calendar/ical/..."
                    value={airbnbIcalUrl}
                    onChange={(e) => setAirbnbIcalUrl(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Booking.com iCal export URL</label>
                  <input
                    type="url"
                    placeholder="https://ical.booking.com/v1/..."
                    value={bookingIcalUrl}
                    onChange={(e) => setBookingIcalUrl(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="mt-5 border-t border-slate-200/80 pt-4">
                <p className={labelCls}>Pearzen iCal export URL</p>
                <p className="mb-2 text-[9px] leading-relaxed text-slate-500">
                  Paste this into Airbnb or Booking.com as the import calendar link so OTAs see direct
                  bookings and blocked dates from Pearzen.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    readOnly
                    value={pearzenIcalExportUrl}
                    className={`${inputCls} font-mono text-xs text-slate-700`}
                    aria-label="Pearzen iCal export URL"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyExportUrl()}
                    className="inline-flex min-h-[42px] flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
                  >
                    {exportUrlCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </ExecutiveGlassCard>

            {/* ── Dynamic Rate Engine ── */}
            <ExecutiveGlassCard className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[color:var(--cvs-accent)]" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cvs-accent)]">
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
                  Also editable on the Break-Even calculator below — shown to caretakers for guest collection.
                </p>
              </div>

              {/* Seasonal Overrides */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black text-slate-700">Seasonal Overrides</p>
                  <button
                    type="button"
                    onClick={addRate}
                    className="flex items-center gap-1 rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] px-3 py-1.5 text-[10px] font-bold text-[color:var(--cvs-accent)] hover:bg-[var(--cvs-accent-soft)] transition-all"
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
                          className={`rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none ${CVS_BRAND_CLASSES.focusRing}`}
                        />
                        <input
                          type="date"
                          value={r.startDate}
                          onChange={(e) => updateRate(r.id, 'startDate', e.target.value)}
                          className={`rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none ${CVS_BRAND_CLASSES.focusRing}`}
                        />
                        <input
                          type="date"
                          value={r.endDate}
                          onChange={(e) => updateRate(r.id, 'endDate', e.target.value)}
                          className={`rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none ${CVS_BRAND_CLASSES.focusRing}`}
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
                            className={`w-28 rounded-lg border border-slate-200 bg-white/80 pl-8 pr-2 py-1.5 text-xs font-black tabular-nums text-slate-900 focus:outline-none ${CVS_BRAND_CLASSES.focusRing}`}
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
              disabled={saving}
              onClick={() => {
                void (async () => {
                  setSaving(true);
                  try {
                    await onSave({
                      settings: draft,
                      airbnbIcalUrl: airbnbIcalUrl.trim(),
                      bookingIcalUrl: bookingIcalUrl.trim(),
                    });
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
              className="flex-[2] rounded-xl bg-[color:var(--cvs-accent)] py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-[color:var(--cvs-glow)] hover:bg-[color:var(--cvs-accent-hover)] transition-all disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month Selector Bar ───────────────────────────────────────────────────────

function CollectInquiryPhonePanel({
  phone,
  savedPhone,
  saving,
  error,
  onChange,
  onSave,
}: {
  phone: string;
  savedPhone: string;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const unchanged = phone.trim() === savedPhone.trim();

  return (
    <div className="border-b border-slate-200/80 bg-amber-50/40 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-800" />
            <label
              htmlFor="shalom-collect-inquiry-phone"
              className="text-xs font-black uppercase tracking-widest text-slate-800"
            >
              Call for collect amount
            </label>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            Caretakers tap <span className="font-bold text-slate-800">Call MD</span> when no collect amount is set.
            Leave blank to clear; caretakers still reach the platform default until you save a number.
          </p>
          <input
            id="shalom-collect-inquiry-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
            }}
            placeholder={`e.g. ${SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE}`}
            className="mt-3 w-full max-w-md rounded-xl border border-amber-200/80 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
          {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || unchanged}
          className="shrink-0 rounded-xl border border-amber-300/80 bg-amber-600 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-md hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save phone'}
        </button>
      </div>
      {!savedPhone.trim() && unchanged ? (
        <p className="mt-2 text-[10px] text-slate-500">
          No number saved. Caretakers call the platform default ({SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE}).
        </p>
      ) : null}
    </div>
  );
}

function HandoverRoomsPanel({
  rooms,
  savedRooms,
  open,
  saving,
  error,
  onToggle,
  onChange,
  onAdd,
  onAddTemplates,
  onRemove,
  onSave,
}: {
  rooms: ShalomHandoverRoom[];
  savedRooms: ShalomHandoverRoom[];
  open: boolean;
  saving: boolean;
  error: string | null;
  onToggle: () => void;
  onChange: (id: string, label: string) => void;
  onAdd: () => void;
  onAddTemplates: () => void;
  onRemove: (id: string) => void;
  onSave: () => void;
}) {
  const unchanged = handoverRoomsEqual(rooms, savedRooms);
  const inputCls =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40';

  return (
    <div className="border-b border-slate-200/80 bg-white/50 px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-800">
            Pre-handover photo rooms
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Caretakers photograph each room live before guest arrival. Photos auto-delete after{' '}
            {SHALOM_HANDOVER_PHOTO_RETENTION_DAYS} days.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="mt-4 space-y-3">
          {rooms.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              No rooms yet. Add names below or load the starter list (Bedroom 1–3, Kitchen, Washroom
              1–3, Living Room).
            </p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/80 bg-white p-3 sm:grid-cols-[1fr_40px] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <input
                    type="text"
                    value={room.label}
                    onChange={(e) => onChange(room.id, e.target.value)}
                    placeholder="e.g. Bedroom 1"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(room.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 sm:mx-auto"
                    aria-label={`Remove ${room.label || 'room'}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAdd}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
            >
              + Add room
            </button>
            {rooms.length === 0 ? (
              <button
                type="button"
                onClick={onAddTemplates}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-sky-800 hover:bg-sky-100"
              >
                Load starter rooms
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || unchanged}
              className="rounded-xl border border-sky-300/80 bg-sky-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save rooms'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
                  ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
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

// ─── Booking Detail Modal ─────────────────────────────────────────────────────

function CaretakerStayOpsSummary({
  booking,
  onSaveCollect,
  savingCollect = false,
}: {
  booking: Booking;
  onSaveCollect?: (rawValue: string) => void;
  savingCollect?: boolean;
}) {
  const [guestIdUrl, setGuestIdUrl] = useState<string | null>(null);
  const [loadingGuestId, setLoadingGuestId] = useState(false);
  const [collectDraft, setCollectDraft] = useState('');

  useEffect(() => {
    setCollectDraft(
      booking.caretakerCollectLkr != null && booking.caretakerCollectLkr > 0
        ? String(booking.caretakerCollectLkr)
        : '',
    );
  }, [booking.id, booking.caretakerCollectLkr]);

  useEffect(() => {
    let cancelled = false;
    if (!booking.guestIdDocumentUrl) {
      setGuestIdUrl(null);
      return;
    }

    setLoadingGuestId(true);
    void getShalomGuestIdSignedUrlAction(booking.id).then((result) => {
      if (cancelled) return;
      setLoadingGuestId(false);
      if (result.success && result.signedUrl) {
        setGuestIdUrl(result.signedUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [booking.id, booking.guestIdDocumentUrl]);

  const damages = booking.damages ?? [];
  const damagesTotal = stayOpsTotalDamages(damages);
  const collectAmount = parseCaretakerCollectLkr(booking.caretakerCollectLkr);
  const rowLabelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';
  const rowValueCls = 'mt-1 text-sm font-semibold text-slate-900';

  const parsedDraft =
    collectDraft.trim() === '' ? null : Math.max(0, parseInt(collectDraft, 10) || 0);
  const nextCollect = parsedDraft === 0 ? null : parsedDraft;
  const currentCollect = booking.caretakerCollectLkr ?? null;
  const collectUnchanged =
    nextCollect === currentCollect || (nextCollect === 0 && currentCollect == null);

  const handleSaveCollect = () => {
    if (!onSaveCollect || collectUnchanged) return;
    onSaveCollect(collectDraft);
  };

  return (
    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/70 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
        Caretaker stay ops
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        Mirrors the caretaker view. Set collect amount below; other fields are read-only.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className={rowLabelCls}>Collect amount</p>
          {hasCaretakerCollectAmount(booking) && collectAmount != null ? (
            <p className={`${rowValueCls} text-emerald-800`}>
              Current: {formatShalomCollectLkr(collectAmount)}
            </p>
          ) : (
            <p className={`${rowValueCls} text-slate-600`}>Not set — caretaker sees “Call MD”</p>
          )}
          {onSaveCollect ? (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                  LKR
                </span>
                <input
                  type="number"
                  min={0}
                  value={collectDraft}
                  onChange={(e) => setCollectDraft(e.target.value)}
                  placeholder="Amount caretaker collects"
                  disabled={savingCollect}
                  className="w-full rounded-xl border border-slate-200 bg-white/95 py-2.5 pl-10 pr-3 text-sm font-bold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveCollect}
                disabled={savingCollect || collectUnchanged}
                className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-md shadow-amber-600/25 transition-all hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {savingCollect ? 'Saving…' : 'Save collect amount'}
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <p className={rowLabelCls}>Damages</p>
          {damages.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {damages.map((damage, index) => (
                <li
                  key={`${damage.id}-${damage.recordedAt}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-slate-800">{damage.label}</span>
                  <span className="font-bold text-slate-900">
                    {formatShalomCollectLkr(damage.amountLkr)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${rowValueCls} text-slate-600`}>None recorded</p>
          )}
          {damagesTotal > 0 ? (
            <p className="mt-2 text-sm font-bold text-slate-900">
              Damages total: {formatShalomCollectLkr(damagesTotal)}
            </p>
          ) : null}
        </div>

        <div>
          <p className={rowLabelCls}>Guest ID</p>
          {booking.guestIdDocumentUrl ? (
            loadingGuestId ? (
              <p className={`${rowValueCls} text-slate-600`}>Loading photo…</p>
            ) : guestIdUrl ? (
              <a
                href={guestIdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block"
              >
                <img
                  src={guestIdUrl}
                  alt="Guest NIC or passport"
                  className="max-h-36 rounded-xl border border-slate-200 object-contain bg-slate-50"
                />
                <p className="mt-1 text-xs font-semibold text-emerald-700">Open full size</p>
              </a>
            ) : (
              <p className={`${rowValueCls} text-slate-600`}>Uploaded — preview unavailable</p>
            )
          ) : (
            <p className={`${rowValueCls} text-slate-600`}>Not uploaded</p>
          )}
        </div>

        <div>
          <p className={rowLabelCls}>Invoice</p>
          {booking.invoiceReference ? (
            <div className="mt-1 space-y-1">
              <p className="text-sm font-black text-slate-900">{booking.invoiceReference}</p>
              {booking.invoiceSentAt ? (
                <p className="text-xs font-semibold text-emerald-700">
                  Sent {new Date(booking.invoiceSentAt).toLocaleString('en-GB')}
                  {booking.invoiceEmail ? ` to ${booking.invoiceEmail}` : ''}
                </p>
              ) : (
                <p className="text-xs text-slate-600">Generated — not emailed yet</p>
              )}
              {booking.invoiceEmail && !booking.invoiceSentAt ? (
                <p className="text-xs text-slate-600">Guest email: {booking.invoiceEmail}</p>
              ) : null}
            </div>
          ) : (
            <p className={`${rowValueCls} text-slate-600`}>Not generated</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingModal({
  booking,
  handoverRoomCount,
  onClose,
  onEnrich,
  onSaveCollect,
  onDelete,
  savingCollect = false,
  savingEnrich = false,
  deleting = false,
}: {
  booking: Booking | null;
  handoverRoomCount: number;
  onClose: () => void;
  onEnrich: (
    bookingId: string,
    data: {
      name: string;
      contact: string;
      payout: number;
      caretakerCollectLkr?: number | null;
    },
  ) => void | Promise<void>;
  onSaveCollect?: (rawValue: string) => void;
  onDelete?: () => void | Promise<void>;
  savingCollect?: boolean;
  savingEnrich?: boolean;
  deleting?: boolean;
}) {
  const [photoViewOpen, setPhotoViewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [enrichName,    setEnrichName]    = useState('');
  const [enrichContact, setEnrichContact] = useState('');
  const [enrichPayout,  setEnrichPayout]  = useState('');
  const [enrichCollect, setEnrichCollect] = useState('');

  useEffect(() => {
    setPhotoViewOpen(false);
    setConfirmDelete(false);
    setEnrichName('');
    setEnrichContact('');
    setEnrichPayout('');
    setEnrichCollect('');
  }, [booking?.id]);

  if (!booking) return null;

  const cm             = CHANNEL_META[normalizeChannel(booking.channel)];
  const isGuest        = !isAvailabilityBlock(booking);
  const audit          = isGuest ? auditFromBooking(booking) : undefined;
  const isVerified     = audit?.status === 'VERIFIED';
  const isInProgress   = audit?.status === 'IN_PROGRESS';
  const isWaiting      = audit?.status === 'WAITING';
  const hasAuditPhotos = Boolean(audit?.photos && audit.photos.length > 0);
  const needsEnrichment = isGuest && booking.totalRevenue === 0 && !booking.enriched;
  const isEnriched     = !!booking.enriched;
  const canDelete      = isManualDeletableBooking(booking);
  const deleteLabel    = isAvailabilityBlock(booking) ? 'Remove block' : 'Delete booking';

  const canSaveEnrich = enrichName.trim().length > 0 && Number(enrichPayout) > 0;

  const handleEnrichSave = () => {
    if (!canSaveEnrich || savingEnrich) return;
    const collectRaw = enrichCollect.trim();
    const caretakerCollectLkr =
      collectRaw === ''
        ? null
        : Math.max(0, parseInt(collectRaw, 10) || 0) || null;
    void onEnrich(booking.id, {
      name:    enrichName.trim(),
      contact: enrichContact.trim(),
      payout:  parseInt(enrichPayout) || 0,
      caretakerCollectLkr: caretakerCollectLkr === 0 ? null : caretakerCollectLkr,
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
                  <div>
                    <label className={labelCls}>Caretaker collect (LKR)</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
                      <input
                        type="number"
                        min={0}
                        value={enrichCollect}
                        onChange={(e) => setEnrichCollect(e.target.value)}
                        placeholder="Amount guest pays caretaker at check-in"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-amber-800">
                      Shown on caretaker front office ① Collect — leave blank to set later.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnrichSave}
                    disabled={!canSaveEnrich || savingEnrich}
                    className={`w-full rounded-xl py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-md transition-all ${
                      canSaveEnrich && !savingEnrich
                        ? 'bg-amber-600 shadow-amber-600/25 hover:bg-amber-500'
                        : 'cursor-not-allowed bg-slate-300 shadow-none'
                    }`}
                  >
                    {savingEnrich ? 'Saving…' : 'Save & Enrich Booking'}
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

          {isGuest ? (
            <CaretakerStayOpsSummary
              booking={booking}
              onSaveCollect={onSaveCollect}
              savingCollect={savingCollect}
            />
          ) : null}

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

              {/* ── 2-week auto-purge badge ── */}
              <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-800">
                    {SHALOM_HANDOVER_PHOTO_RETENTION_DAYS}-Day Photo Auto-Purge Active
                  </p>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-amber-700">
                    Condition photos are permanently deleted {SHALOM_HANDOVER_PHOTO_RETENTION_DAYS} days
                    after upload. The verified compliance timestamp stays on the booking record.
                  </p>
                </div>
              </div>

              {/* ── Status Pipeline ── */}
              <div className="flex items-stretch gap-2">
                {/* Step 1: Upload */}
                <div className={`flex flex-1 flex-col gap-1 rounded-2xl border px-3 py-2.5 transition-colors ${
                  isWaiting
                    ? 'border-amber-300/70 bg-amber-50/80'
                    : isInProgress
                      ? 'border-sky-300/70 bg-sky-50/80'
                      : 'border-slate-200/50 bg-slate-50/50'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {isVerified
                      ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      : isInProgress
                        ? <span className="h-3.5 w-3.5 flex-shrink-0 animate-pulse rounded-full border-2 border-sky-400 bg-sky-100" />
                        : <span className="h-3.5 w-3.5 flex-shrink-0 animate-pulse rounded-full border-2 border-amber-400 bg-amber-100" />
                    }
                    <p className={`text-[9px] font-black uppercase tracking-wider ${
                      isWaiting ? 'text-amber-800' : isInProgress ? 'text-sky-800' : 'text-slate-400'
                    }`}>
                      {isVerified
                        ? 'Photos Uploaded'
                        : isInProgress
                          ? `${audit.photos?.length ?? 0} of ${handoverRoomCount} rooms`
                          : 'Waiting for Caretaker Upload'}
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
              {hasAuditPhotos && audit.photos && (
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
                          {photo.signedUrl ? (
                            <button
                              type="button"
                              onClick={() => window.open(photo.signedUrl!, '_blank', 'noopener,noreferrer')}
                              className="block w-full"
                            >
                              <img
                                src={photo.signedUrl}
                                alt={`${photo.label} condition`}
                                className="h-24 w-full cursor-zoom-in object-cover bg-slate-100"
                              />
                            </button>
                          ) : (
                            <div className="flex h-24 items-center justify-center bg-slate-100">
                              <Camera className="h-9 w-9 text-slate-300" />
                            </div>
                          )}
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

          {canDelete && onDelete ? (
            <div className="mt-5 border-t border-slate-200/80 pt-4">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-200 bg-rose-50/70 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100/80 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteLabel}
                </button>
              ) : (
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3">
                  <p className="text-sm font-bold text-rose-900">
                    {isAvailabilityBlock(booking)
                      ? 'Remove this blocked period from the calendar?'
                      : `Delete "${booking.guestName}" (${booking.checkIn} → ${booking.checkOut})?`}
                  </p>
                  <p className="mt-1 text-[11px] text-rose-800">
                    This cannot be undone. OTA export calendars receive a cancellation when applicable.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void onDelete()}
                      className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {deleting ? 'Removing…' : 'Confirm delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

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

function BreakEvenCalculator({
  property,
  guestNightlyRate,
  airbnbCommissionPct,
  bookingCommissionPct,
  realNetProfit,
  netProfitMonthLabel,
  onSave,
  saving,
}: {
  property: Property;
  guestNightlyRate: number;
  airbnbCommissionPct: number;
  bookingCommissionPct: number;
  /** Actual net profit from caretaker collections minus monthly overhead */
  realNetProfit: number | null;
  netProfitMonthLabel: string;
  onSave: (payload: {
    defaultRate: number;
    overhead: number;
    occupancyTarget: number;
    airbnbCommissionPct: number;
    bookingCommissionPct: number;
  }) => void | Promise<void>;
  saving?: boolean;
}) {
  const [overhead, setOverhead] = useState(String(property.overhead));
  const [daysInMonth, setDaysInMonth] = useState('31');
  const [occupancy, setOccupancy] = useState(String(property.occupancyTarget));
  const [guestRate, setGuestRate] = useState(String(guestNightlyRate || ''));
  const [airbnbCommission, setAirbnbCommission] = useState(String(airbnbCommissionPct));
  const [bookingCommission, setBookingCommission] = useState(String(bookingCommissionPct));

  React.useEffect(() => {
    setOverhead(String(property.overhead));
    setOccupancy(String(property.occupancyTarget));
    setGuestRate(String(guestNightlyRate || ''));
    setAirbnbCommission(String(airbnbCommissionPct));
    setBookingCommission(String(bookingCommissionPct));
  }, [
    property.id,
    property.overhead,
    property.occupancyTarget,
    guestNightlyRate,
    airbnbCommissionPct,
    bookingCommissionPct,
  ]);

  const minRate = useMemo(() => {
    const oh = parseFloat(overhead) || 0;
    const days = parseFloat(daysInMonth) || 1;
    const occ = parseFloat(occupancy) / 100 || 0.01;
    return Math.ceil(oh / (days * occ));
  }, [overhead, daysInMonth, occupancy]);

  const guestRateNum = parseInt(guestRate, 10) || 0;
  const airbnbPct = Math.max(0, Math.min(100, parseFloat(airbnbCommission) || 0));
  const bookingPct = Math.max(0, Math.min(100, parseFloat(bookingCommission) || 0));
  const worstCommissionPct = useMemo(() => {
    const active: number[] = [];
    if (property.otaChannels.includes('AIRBNB')) active.push(airbnbPct);
    if (property.otaChannels.includes('BOOKING')) active.push(bookingPct);
    return active.length > 0 ? Math.max(...active) : 0;
  }, [property.otaChannels, airbnbPct, bookingPct]);

  const netPerNightAfterCosts =
    guestRateNum > 0 ? Math.round(guestRateNum * (1 - worstCommissionPct / 100)) : 0;
  const belowFloor = guestRateNum > 0 && guestRateNum < minRate;
  const breakEvenNights =
    guestRateNum > 0
      ? Math.ceil((parseFloat(overhead) || 0) / guestRateNum)
      : null;
  const netProfitAtTargetOccupancy = useMemo(() => {
    if (guestRateNum <= 0) return null;
    const days = parseFloat(daysInMonth) || 0;
    const occ = parseFloat(occupancy) / 100 || 0;
    const oh = parseFloat(overhead) || 0;
    const soldNights = days * occ;
    return Math.round(soldNights * netPerNightAfterCosts - oh);
  }, [guestRateNum, daysInMonth, occupancy, overhead, netPerNightAfterCosts]);

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  const handleSave = () => {
    void onSave({
      defaultRate: guestRateNum,
      overhead: parseInt(overhead, 10) || 0,
      occupancyTarget: Math.max(1, Math.min(100, parseInt(occupancy, 10) || property.occupancyTarget)),
      airbnbCommissionPct: airbnbPct,
      bookingCommissionPct: bookingPct,
    });
  };

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

      <div className="mb-4 flex items-center gap-2 rounded-xl border border-[color:var(--cvs-accent-muted)]/70 bg-[var(--cvs-accent-soft)]/50 px-3 py-2 text-[10px] text-[color:var(--cvs-accent)]">
        <Building2 className="h-3 w-3 flex-shrink-0" />
        <span>
          Pricing for <strong>{property.name}</strong> — {property.location}. Saved per property for caretaker collection.
        </span>
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

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/70 to-white/70 px-5 py-4 shadow-inner">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-800">Minimum nightly cost floor — {property.name}</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-rose-900">{lkrCost(minRate)}</p>
          <p className="mt-1 text-[10px] text-rose-700">Break-even floor from overhead and occupancy target.</p>
        </div>
        <div className="hidden flex-shrink-0 sm:block">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200/80 bg-white/70 shadow-sm">
            <TrendingDown className="h-8 w-8 text-rose-600" />
          </div>
        </div>
      </div>

      {/* Caretaker guest collection rate */}
      <div className="mt-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white/70 p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">Guest nightly rate — caretaker collection</p>
        <p className="mt-1 text-[10px] text-amber-800">
          Set the amount the caretaker should collect from the guest per night (cash or balance due at check-in).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className={labelCls}>Rate per night (LKR)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">LKR</span>
              <input
                type="number"
                min={0}
                value={guestRate}
                onChange={(e) => setGuestRate(e.target.value)}
                placeholder="e.g. 8500"
                className={`${inputCls} pl-10 text-lg font-black`}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || guestRateNum <= 0}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-600/20 transition-all hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {saving ? 'Saving…' : 'Save nightly rate'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Airbnb commission %</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={airbnbCommission}
                onChange={(e) => setAirbnbCommission(e.target.value)}
                className={`${inputCls} pr-8`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">%</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Booking.com commission %</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={bookingCommission}
                onChange={(e) => setBookingCommission(e.target.value)}
                className={`${inputCls} pr-8`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">%</span>
            </div>
          </div>
        </div>

        {guestRateNum > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/70 bg-white/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-900">Caretaker instruction</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-950">{lkr(guestRateNum)} <span className="text-base font-bold text-amber-800">per night</span></p>
            <p className="mt-1 text-[11px] text-amber-800">
              Collect from guest at {property.name} — multiply by number of nights for the stay total.
            </p>
            {worstCommissionPct > 0 ? (
              <p className="mt-2 text-[10px] text-amber-800">
                Net after OTA commission (up to {worstCommissionPct}%):{' '}
                <span className="font-bold tabular-nums">{lkr(netPerNightAfterCosts)}/night</span>
              </p>
            ) : null}
            {belowFloor ? (
              <p className="mt-2 text-[10px] font-semibold text-rose-700">
                Below break-even floor ({lkr(minRate)}/night) — may not cover monthly overhead at target occupancy.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[10px] text-slate-500">Enter a nightly rate and save so caretakers see the collection amount.</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          {
            label: 'Net Profit @ Target Occ.',
            value: netProfitAtTargetOccupancy != null ? lkr(netProfitAtTargetOccupancy) : 'Set guest rate',
            color:
              netProfitAtTargetOccupancy == null
                ? 'text-slate-400'
                : netProfitAtTargetOccupancy >= 0
                  ? 'text-emerald-800'
                  : 'text-rose-700',
          },
          {
            label: 'Nights to Break Even',
            value: breakEvenNights != null ? `${breakEvenNights} nights` : 'Set guest rate',
            color: breakEvenNights != null ? 'text-slate-700' : 'text-slate-400',
          },
          {
            label: 'Net Profit Made',
            value: realNetProfit != null ? lkr(realNetProfit) : 'Enter collections',
            color:
              realNetProfit == null
                ? 'text-slate-400'
                : realNetProfit >= 0
                  ? 'text-emerald-800'
                  : 'text-rose-700',
          },
        ].map((item) => (
          <ExecutiveGlassCard key={item.label} className="p-2.5 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className={`mt-1 font-black tabular-nums ${item.color}`}>{item.value}</p>
            {item.label === 'Net Profit Made' ? (
              <p className="mt-0.5 text-[8px] text-slate-400">{netProfitMonthLabel} collections − overhead</p>
            ) : null}
          </ExecutiveGlassCard>
        ))}
      </div>
    </ExecutiveGlassCard>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  bookings,
  caretakerLoginDates,
  onBookingClick,
}: {
  year: number;
  month: number;
  bookings: Booking[];
  caretakerLoginDates: Set<string>;
  onBookingClick: (b: Booking) => void;
}) {
  const bookingForDay = useCallback((day: number) => {
    const key = dateKey(year, month, day);
    return (
      bookings.find((b) => key >= b.checkIn && key < b.checkOut && !isAvailabilityBlock(b)) ??
      bookings.find((b) => key >= b.checkIn && key < b.checkOut) ??
      null
    );
  }, [bookings, year, month]);

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayKey = shalomPortalLoginDateColombo(today);

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

          const key = dateKey(year, month, day);
          const booking = bookingForDay(day);
          const isToday = isCurrentMonth && today.getDate() === day;
          const channel = booking ? normalizeChannel(booking.channel) : null;
          const cm = channel ? CHANNEL_META[channel] : null;
          const isBlockDay = Boolean(booking && isAvailabilityBlock(booking));
          const hasReservation = Boolean(booking && !isBlockDay);
          const loginDotStatus = resolveShalomLoginDotStatus(
            key,
            caretakerLoginDates,
            todayKey,
            { onlyOnBookingDays: true, hasBooking: hasReservation },
          );

          return (
            <div
              key={day}
              onClick={() => {
                if (booking) onBookingClick(booking);
              }}
              title={
                loginDotStatus
                  ? loginDotStatus === 'green'
                    ? 'Caretaker logged in'
                    : 'No login'
                  : booking
                    ? isBlockDay
                      ? 'Blocked — synced from OTA'
                      : 'Reserved — synced from OTA'
                    : undefined
              }
              className={[
                'group relative flex h-14 flex-col items-center justify-start overflow-hidden rounded-xl border pt-1.5 transition-all select-none',
                booking
                  ? `cursor-pointer ${cm!.bg} ${cm!.border} hover:scale-[1.04] hover:shadow-md${isBlockDay ? ' ring-1 ring-inset ring-slate-400/50' : ''}`
                  : 'border-slate-200/60 bg-white/40',
                isToday ? 'ring-2 ring-emerald-500/60' : '',
              ].join(' ')}
            >
              <ShalomLoginDayDot status={loginDotStatus} />
              <span className={['text-xs font-bold',
                isToday ? 'text-emerald-700' : cm ? cm.text : 'text-slate-600',
              ].join(' ')}>
                {day}
              </span>

              {booking && !isBlockDay && (
                <span className={`mt-0.5 truncate px-1.5 text-[8px] font-bold leading-tight ${cm!.text}`}>
                  {calendarDayLabel(booking)}
                </span>
              )}

              {isBlockDay && (
                <span className={`mt-0.5 flex items-center gap-0.5 text-[8px] font-bold leading-tight ${cm!.text}`}>
                  <Lock className="h-2.5 w-2.5" />
                  Block
                </span>
              )}

              {booking && key === booking.checkIn && (
                <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                  channel === 'AIRBNB' ? 'bg-rose-500' : channel === 'BOOKING' ? 'bg-blue-500' : 'bg-slate-400'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function recordToProperty(row: ShalomPropertyRecord): Property {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    bedrooms: row.bedrooms,
    overhead: row.overhead,
    occupancyTarget: row.occupancyTarget,
    otaChannels: row.otaChannels,
    airbnbIcalUrl: row.airbnbIcalUrl,
    bookingIcalUrl: row.bookingIcalUrl,
    caretakerEpf: row.caretakerEpf,
    caretakerName: row.caretakerName,
    bookingAlertEmail: row.bookingAlertEmail,
    publicPublished: row.publicPublished,
    publicSlug: row.publicSlug,
    bookings: row.bookings.map((b) => ({
      id: b.id,
      guestName: b.guestName,
      channel: normalizeChannel(b.channel),
      sourceChannel: b.channel,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      ratePerNight: b.ratePerNight,
      totalRevenue: b.totalRevenue,
      paid: b.paid,
      notes: b.notes,
      otaImported: b.otaImported,
      enriched: b.enriched,
      enrichedContact: b.enrichedContact,
      caretakerCollectLkr: b.caretakerCollectLkr ?? null,
      damages: b.damages ?? [],
      guestIdDocumentUrl: b.guestIdDocumentUrl ?? null,
      invoiceEmail: b.invoiceEmail ?? null,
      invoiceSentAt: b.invoiceSentAt ?? null,
      invoiceReference: b.invoiceReference ?? null,
      preHandoverPhotos: b.preHandoverPhotos ?? [],
      preHandoverVerifiedAt: b.preHandoverVerifiedAt ?? null,
    })),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShalomPage() {
  const now = new Date();
  const [properties, setProperties]  = useState<Property[]>([]);
  const [loadError, setLoadError]    = useState<string | null>(null);
  const [selectedProp, setSelectedProp] = useState<Property | null>(null);
  const [viewYear,  setViewYear]     = useState(now.getFullYear());
  const [viewMonth, setViewMonth]    = useState(now.getMonth() + 1);
  const [registerYear, setRegisterYear] = useState(now.getFullYear());
  const [registerMonth, setRegisterMonth] = useState(now.getMonth() + 1);
  const [savingCollectId, setSavingCollectId] = useState<string | null>(null);
  const [savingEnrichId, setSavingEnrichId] = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [propSettings,    setPropSettings]    = useState<Record<string, PropSettings>>({});
  const [addPropOpen,     setAddPropOpen]     = useState(false);
  const [propSettingsOpen, setPropSettingsOpen] = useState(false);
  const [guestWebsiteOpen, setGuestWebsiteOpen] = useState(false);
  const [importingOta,   setImportingOta]    = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [caretakerLoginDates, setCaretakerLoginDates] = useState<Set<string>>(new Set());
  const [savingCaretaker, setSavingCaretaker] = useState(false);
  const [caretakerAssignError, setCaretakerAssignError] = useState<string | null>(null);
  const [savingAlertEmail, setSavingAlertEmail] = useState(false);
  const [alertEmailError, setAlertEmailError] = useState<string | null>(null);
  const [toast, setToast]                    = useState<string | null>(null);
  const [collectPhoneDraft, setCollectPhoneDraft] = useState('');
  const [savingCollectPhone, setSavingCollectPhone] = useState(false);
  const [collectPhoneError, setCollectPhoneError] = useState<string | null>(null);
  const [handoverRoomsDraft, setHandoverRoomsDraft] = useState<ShalomHandoverRoom[]>([]);
  const [handoverRoomsOpen, setHandoverRoomsOpen] = useState(false);
  const [savingHandoverRooms, setSavingHandoverRooms] = useState(false);
  const [handoverRoomsError, setHandoverRoomsError] = useState<string | null>(null);
  const syncedOtaPropsRef = useRef(new Set<string>());

  const applyPropertyRecords = useCallback((records: ShalomPropertyRecord[], focusId?: string) => {
    const rows = records.map(recordToProperty);
    setProperties(rows);
    setSelectedProp((prev) => {
      const targetId = focusId ?? prev?.id;
      return rows.find((p) => p.id === targetId) ?? rows[0] ?? null;
    });
    setPropSettings((prev) => ({
      ...prev,
      ...Object.fromEntries(
        records.map((row) => [row.id, settingsFromRecord(row.settings, row.id)]),
      ),
    }));
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await fetchShalomProperties();
      if (result.properties.length === 0) {
        setLoadError(result.error ?? null);
        return;
      }

      let records = result.properties;
      const syncErrors: string[] = [];

      for (const prop of records) {
        if (!prop.airbnbIcalUrl && !prop.bookingIcalUrl) continue;
        if (syncedOtaPropsRef.current.has(prop.id)) continue;
        syncedOtaPropsRef.current.add(prop.id);
        const sync = await syncShalomPropertyFromOtas(prop.id);
        if (sync.properties?.length) records = sync.properties;
        if (sync.errors.length > 0) syncErrors.push(...sync.errors);
      }

      applyPropertyRecords(records, records[0]?.id);
      setLoadError(syncErrors.length > 0 ? syncErrors.join(' · ') : result.error ?? null);
    })();
  }, [applyPropertyRecords]);

  useEffect(() => {
    const epf = selectedProp?.caretakerEpf;
    if (!epf) {
      setCaretakerLoginDates(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await fetchShalomCaretakerLoginDates(epf, viewYear, viewMonth);
      if (cancelled) return;
      setCaretakerLoginDates(buildShalomLoginDateSet(result.loginDates));
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProp?.caretakerEpf, viewYear, viewMonth]);

  // Sync OTA calendars when switching to a property that has not been imported this session.
  useEffect(() => {
    if (!selectedProp) return;
    if (!selectedProp.airbnbIcalUrl && !selectedProp.bookingIcalUrl) return;
    if (syncedOtaPropsRef.current.has(selectedProp.id)) return;

    syncedOtaPropsRef.current.add(selectedProp.id);
    void (async () => {
      const sync = await syncShalomPropertyFromOtas(selectedProp.id);
      if (sync.properties?.length) {
        applyPropertyRecords(sync.properties, selectedProp.id);
      }
      syncedOtaPropsRef.current.add(selectedProp.id);
      if (sync.errors.length > 0) {
        setLoadError(sync.errors.join(' · '));
      }
    })();
  }, [applyPropertyRecords, selectedProp]);

  // Sync selected prop when properties list changes
  useEffect(() => {
    if (!properties.length) {
      setSelectedProp(null);
      return;
    }
    setSelectedProp((prev) => properties.find((p) => p.id === prev?.id) ?? properties[0]!);
  }, [properties]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };
  const prevRegisterMonth = () => {
    if (registerMonth === 1) { setRegisterMonth(12); setRegisterYear((y) => y - 1); }
    else setRegisterMonth((m) => m - 1);
  };
  const nextRegisterMonth = () => {
    if (registerMonth === 12) { setRegisterMonth(1); setRegisterYear((y) => y + 1); }
    else setRegisterMonth((m) => m + 1);
  };

  const currentSettings: PropSettings = selectedProp
    ? (propSettings[selectedProp.id] ?? defaultPropSettings(selectedProp.id))
    : defaultPropSettings('');

  useEffect(() => {
    setCollectPhoneDraft(currentSettings.collectInquiryPhone);
    setCollectPhoneError(null);
    setHandoverRoomsDraft(currentSettings.handoverRooms);
    setHandoverRoomsError(null);
  }, [
    selectedProp?.id,
    currentSettings.collectInquiryPhone,
    currentSettings.handoverRooms,
  ]);

  const handleSaveCollectInquiryPhone = useCallback(async () => {
    if (!selectedProp) return;
    setSavingCollectPhone(true);
    setCollectPhoneError(null);
    const result = await updateShalomStayOpsSettingsAction(selectedProp.id, {
      collectInquiryPhone: collectPhoneDraft,
    });
    setSavingCollectPhone(false);
    if (!result.success) {
      setCollectPhoneError(result.error ?? 'Could not save phone.');
      return;
    }
    const savedPhone = result.collectInquiryPhone ?? currentSettings.collectInquiryPhone;
    setCollectPhoneDraft(savedPhone);
    setPropSettings((prev) => ({
      ...prev,
      [selectedProp.id]: {
        ...(prev[selectedProp.id] ?? defaultPropSettings(selectedProp.id)),
        collectInquiryPhone: savedPhone,
      },
    }));
    setToast('Saved caretaker call number.');
  }, [collectPhoneDraft, currentSettings.collectInquiryPhone, selectedProp]);

  const handleHandoverRoomChange = useCallback((id: string, label: string) => {
    setHandoverRoomsDraft((prev) =>
      prev.map((room) => (room.id === id ? { ...room, label } : room)),
    );
    setHandoverRoomsError(null);
  }, []);

  const handleAddHandoverRoom = useCallback(() => {
    setHandoverRoomsDraft((prev) => [...prev, { id: `room-${Date.now()}`, label: '' }]);
    setHandoverRoomsOpen(true);
  }, []);

  const handleAddHandoverRoomTemplates = useCallback(() => {
    setHandoverRoomsDraft(SHALOM_DEFAULT_HANDOVER_ROOM_TEMPLATES.map((room) => ({ ...room })));
    setHandoverRoomsOpen(true);
    setHandoverRoomsError(null);
  }, []);

  const handleRemoveHandoverRoom = useCallback((id: string) => {
    setHandoverRoomsDraft((prev) => prev.filter((room) => room.id !== id));
    setHandoverRoomsError(null);
  }, []);

  const handleSaveHandoverRooms = useCallback(async () => {
    if (!selectedProp) return;
    setSavingHandoverRooms(true);
    setHandoverRoomsError(null);
    const result = await updateShalomStayOpsSettingsAction(selectedProp.id, {
      handoverRooms: handoverRoomsDraft,
    });
    setSavingHandoverRooms(false);
    if (!result.success) {
      setHandoverRoomsError(result.error ?? 'Could not save rooms.');
      return;
    }
    const saved = result.handoverRooms ?? handoverRoomsDraft;
    setHandoverRoomsDraft(saved);
    setPropSettings((prev) => ({
      ...prev,
      [selectedProp.id]: {
        ...(prev[selectedProp.id] ?? defaultPropSettings(selectedProp.id)),
        handoverRooms: saved,
      },
    }));
    setToast('Saved pre-handover rooms.');
  }, [handoverRoomsDraft, selectedProp]);

  const handleAssignCaretaker = useCallback(
    async (caretakerEpf: string | null) => {
      if (!selectedProp) return;
      setCaretakerAssignError(null);
      setSavingCaretaker(true);
      const result = await assignShalomCaretakerAction(selectedProp.id, caretakerEpf);
      setSavingCaretaker(false);
      if (!result.success) {
        const message = result.error ?? 'Failed to assign caretaker';
        setCaretakerAssignError(message);
        setToast(message);
        return;
      }

      const refresh = await fetchShalomProperties();
      if (refresh.properties.length > 0) {
        applyPropertyRecords(refresh.properties, selectedProp.id);
      } else {
        setProperties((prev) =>
          prev.map((p) =>
            p.id === selectedProp.id
              ? { ...p, caretakerEpf, caretakerName: caretakerEpf ? p.caretakerName : null }
              : p,
          ),
        );
        setSelectedProp((prev) =>
          prev && prev.id === selectedProp.id
            ? { ...prev, caretakerEpf, caretakerName: caretakerEpf ? prev.caretakerName : null }
            : prev,
        );
      }

      setToast(
        result.provisionedOtp && result.provisionedEpf
          ? `Assigned. One-time login code for EPF ${result.provisionedEpf}: ${result.provisionedOtp} (valid 60s)`
          : caretakerEpf
            ? 'Caretaker assigned.'
            : 'Caretaker unassigned.',
      );
    },
    [applyPropertyRecords, selectedProp],
  );

  const handleSaveBookingAlertEmail = useCallback(
    async (bookingAlertEmail: string | null) => {
      if (!selectedProp) return;
      setAlertEmailError(null);
      setSavingAlertEmail(true);
      const result = await updateShalomPropertyBookingAlertEmailAction(
        selectedProp.id,
        bookingAlertEmail,
      );
      setSavingAlertEmail(false);
      if (!result.success) {
        const message = result.error ?? 'Failed to save booking alert email';
        setAlertEmailError(message);
        setToast(message);
        return;
      }

      const refresh = await fetchShalomProperties();
      if (refresh.properties.length > 0) {
        applyPropertyRecords(refresh.properties, selectedProp.id);
      } else {
        setProperties((prev) =>
          prev.map((p) =>
            p.id === selectedProp.id ? { ...p, bookingAlertEmail } : p,
          ),
        );
        setSelectedProp((prev) =>
          prev && prev.id === selectedProp.id ? { ...prev, bookingAlertEmail } : prev,
        );
      }

      setToast(bookingAlertEmail ? 'Booking alert email saved.' : 'Booking alert email cleared.');
    },
    [applyPropertyRecords, selectedProp],
  );

  const handleSavePropSettings = useCallback(
    async (payload: {
      settings: PropSettings;
      airbnbIcalUrl: string;
      bookingIcalUrl: string;
    }) => {
      if (!selectedProp) return;

      const result = await upsertShalomProperty({
        id: selectedProp.id,
        name: selectedProp.name,
        location: selectedProp.location,
        bedrooms: selectedProp.bedrooms,
        overhead: selectedProp.overhead,
        occupancyTarget: selectedProp.occupancyTarget,
        otaChannels: selectedProp.otaChannels,
        airbnbIcalUrl: payload.airbnbIcalUrl,
        bookingIcalUrl: payload.bookingIcalUrl,
        settings: payload.settings as unknown as Record<string, unknown>,
      });
      if (!result.success) {
        setLoadError(result.error ?? 'Failed to save property settings');
        throw new Error(result.error ?? 'Failed to save property settings');
      }

      setPropSettings((prev) => ({ ...prev, [selectedProp.id]: payload.settings }));
      setProperties((prev) =>
        prev.map((p) =>
          p.id === selectedProp.id
            ? {
                ...p,
                airbnbIcalUrl: payload.airbnbIcalUrl,
                bookingIcalUrl: payload.bookingIcalUrl,
              }
            : p,
        ),
      );

      const sync = await syncShalomPropertyFromOtas(selectedProp.id);
      if (sync.properties?.length) {
        applyPropertyRecords(sync.properties, selectedProp.id);
      }
      syncedOtaPropsRef.current.add(selectedProp.id);
      if (sync.errors.length > 0) {
        setToast(`Saved settings — OTA sync: ${sync.errors.join(' · ')}`);
      } else {
        setToast(`Saved and imported ${sync.imported} OTA reservation(s).`);
      }
    },
    [applyPropertyRecords, selectedProp],
  );

  const handleRemoveProp = useCallback(async () => {
    if (!selectedProp) return;

    const removedId = selectedProp.id;
    const removedName = selectedProp.name;
    const result = await deleteShalomProperty(removedId);
    if (!result.success) {
      setLoadError(result.error ?? 'Failed to remove property');
      setToast(result.error ?? 'Failed to remove property');
      throw new Error(result.error ?? 'Failed to remove property');
    }

    const remaining = properties.filter((p) => p.id !== removedId);
    setProperties(remaining);
    setSelectedProp(remaining[0] ?? null);
    setPropSettings((prev) => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    setLoadError(null);
    setToast(
      remaining.length > 0
        ? `Removed "${removedName}".`
        : `Removed "${removedName}". Add a property to continue.`,
    );
  }, [properties, selectedProp]);

  const handleConnect = useCallback(async (input: {
    id: string;
    name: string;
    location: string;
    bedrooms: number;
    overhead: number;
    occupancyTarget: number;
    otaChannels: ('AIRBNB' | 'BOOKING')[];
    airbnbIcalUrl: string;
    bookingIcalUrl: string;
  }) => {
    const result = await upsertShalomProperty({
      id: input.id,
      name: input.name,
      location: input.location,
      bedrooms: input.bedrooms,
      overhead: input.overhead,
      occupancyTarget: input.occupancyTarget,
      otaChannels: input.otaChannels,
      airbnbIcalUrl: input.airbnbIcalUrl,
      bookingIcalUrl: input.bookingIcalUrl,
    });
    if (!result.success) {
      setLoadError(result.error ?? 'Failed to save property');
      throw new Error(result.error ?? 'Failed to save property');
    }

    const newProp: Property = {
      id: result.id ?? input.id,
      name: input.name,
      location: input.location,
      bedrooms: input.bedrooms,
      overhead: input.overhead,
      occupancyTarget: input.occupancyTarget,
      otaChannels: input.otaChannels,
      airbnbIcalUrl: input.airbnbIcalUrl,
      bookingIcalUrl: input.bookingIcalUrl,
      caretakerEpf: null,
      caretakerName: null,
      bookingAlertEmail: null,
      publicPublished: false,
      publicSlug: '',
      bookings: [],
    };

    if (input.airbnbIcalUrl || input.bookingIcalUrl) {
      const sync = await syncShalomPropertyFromOtas(newProp.id);
      if (sync.properties?.length) {
        const refreshed = sync.properties.find((p) => p.id === newProp.id);
        if (refreshed) {
          newProp.bookings = refreshed.bookings.map((b) => ({
            id: b.id,
            guestName: b.guestName,
            channel: b.channel,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            nights: b.nights,
            ratePerNight: b.ratePerNight,
            totalRevenue: b.totalRevenue,
            paid: b.paid,
            notes: b.notes,
            enriched: b.enriched,
            enrichedContact: b.enrichedContact,
          }));
        }
        applyPropertyRecords(sync.properties, newProp.id);
      }
      if (sync.errors.length > 0) {
        setToast(`Property saved — OTA sync: ${sync.errors.join(' · ')}`);
        return;
      }
      setToast(`Property saved — imported ${sync.imported} Airbnb/Booking reservation(s).`);
      return;
    }

    setProperties((prev) => [...prev, newProp]);
    setSelectedProp(newProp);
    setLoadError(null);
    setPropSettings((prev) => ({
      ...prev,
      [newProp.id]: { cleanBufferEnabled: true, cleanBufferDays: 1, defaultRate: 0, airbnbCommissionPct: 3, bookingCommissionPct: 15, seasonalRates: [] },
    }));
    setToast(`Property "${newProp.name}" saved. Add an Airbnb iCal URL to import reservations.`);
  }, [applyPropertyRecords]);

  const handleSaveCaretakerRate = useCallback(
    async (payload: {
      defaultRate: number;
      overhead: number;
      occupancyTarget: number;
      airbnbCommissionPct: number;
      bookingCommissionPct: number;
    }) => {
      if (!selectedProp) return;

      const nextSettings: PropSettings = {
        ...(propSettings[selectedProp.id] ?? defaultPropSettings(selectedProp.id)),
        defaultRate: payload.defaultRate,
        airbnbCommissionPct: payload.airbnbCommissionPct,
        bookingCommissionPct: payload.bookingCommissionPct,
      };

      setSavingPricing(true);
      try {
        const result = await upsertShalomProperty({
          id: selectedProp.id,
          name: selectedProp.name,
          location: selectedProp.location,
          bedrooms: selectedProp.bedrooms,
          overhead: payload.overhead,
          occupancyTarget: payload.occupancyTarget,
          otaChannels: selectedProp.otaChannels,
          airbnbIcalUrl: selectedProp.airbnbIcalUrl,
          bookingIcalUrl: selectedProp.bookingIcalUrl,
          settings: nextSettings as unknown as Record<string, unknown>,
        });
        if (!result.success) {
          setToast(result.error ?? 'Failed to save nightly rate');
          return;
        }

        setPropSettings((prev) => ({ ...prev, [selectedProp.id]: nextSettings }));
        setProperties((prev) =>
          prev.map((p) =>
            p.id === selectedProp.id
              ? { ...p, overhead: payload.overhead, occupancyTarget: payload.occupancyTarget }
              : p,
          ),
        );
        setSelectedProp((prev) =>
          prev && prev.id === selectedProp.id
            ? { ...prev, overhead: payload.overhead, occupancyTarget: payload.occupancyTarget }
            : prev,
        );
        setToast(`Saved guest rate ${lkr(payload.defaultRate)}/night for ${selectedProp.name}.`);
      } finally {
        setSavingPricing(false);
      }
    },
    [propSettings, selectedProp],
  );

  const handleImportFromOtas = useCallback(async () => {
    if (!selectedProp) return;
    setImportingOta(true);
    try {
      const sync = await syncShalomPropertyFromOtas(selectedProp.id);
      if (sync.properties?.length) {
        applyPropertyRecords(sync.properties, selectedProp.id);
      }
      if (sync.errors.length > 0) {
        setLoadError(sync.errors.join(' · '));
        setToast(`OTA sync failed: ${sync.errors[0]}`);
        return;
      }
      setLoadError(null);
      const refreshed = sync.properties?.find((p) => p.id === selectedProp.id);
      const refreshedBookings = refreshed?.bookings ?? [];
      const bookingFeed = sync.feeds?.find((f) => f.channel === 'BOOKING');
      const airbnbFeed = sync.feeds?.find((f) => f.channel === 'AIRBNB');
      const occupied = refreshedBookings.filter((b) => b.otaImported && !isAvailabilityBlock(b)).length;
      const blocked = refreshedBookings.filter((b) => b.otaImported && isAvailabilityBlock(b)).length;

      if (airbnbFeed && airbnbFeed.parsedCount === 0 && !bookingFeed?.parsedCount) {
        setToast('Sync ran, but OTA exports returned 0 events. Re-copy the export URL(s) from Property Settings.');
        return;
      }

      const parts: string[] = [];
      if (bookingFeed?.parsedCount) parts.push(`Booking.com: ${bookingFeed.parsedCount} event(s)`);
      if (airbnbFeed?.parsedCount) parts.push(`Airbnb: ${airbnbFeed.parsedCount} event(s)`);
      setToast(
        parts.length
          ? `${parts.join(' · ')} · saved ${occupied} occupied, ${blocked} blocked.`
          : sync.imported > 0
            ? `Synced ${sync.imported} OTA event(s).`
            : 'OTA calendars synced — no changes in feed.',
      );
    } finally {
      setImportingOta(false);
    }
  }, [applyPropertyRecords, selectedProp]);

  const handleEnrich = useCallback(
    async (
      bookingId: string,
      data: {
        name: string;
        contact: string;
        payout: number;
        caretakerCollectLkr?: number | null;
      },
    ) => {
      if (!selectedProp) return;
      const booking = selectedProp.bookings.find((b) => b.id === bookingId);
      if (!booking) return;

      const ratePerNight =
        booking.nights > 0 ? Math.round(data.payout / booking.nights) : 0;
      const collectLkr =
        data.caretakerCollectLkr !== undefined
          ? data.caretakerCollectLkr
          : booking.caretakerCollectLkr ?? null;

      const updater = (b: Booking): Booking => {
        if (b.id !== bookingId) return b;
        return {
          ...b,
          guestName: data.name,
          totalRevenue: data.payout,
          ratePerNight,
          paid: false,
          enriched: true,
          enrichedContact: data.contact || undefined,
          caretakerCollectLkr: collectLkr,
        };
      };

      setProperties((prev) =>
        prev.map((p) =>
          p.id === selectedProp.id ? { ...p, bookings: p.bookings.map(updater) } : p,
        ),
      );
      setSelectedProp((prev) =>
        prev ? { ...prev, bookings: prev.bookings.map(updater) } : prev,
      );
      setSelectedBooking((prev) => (prev ? updater(prev) : null));

      setSavingEnrichId(bookingId);
      const channel =
        booking.channel === 'BLOCKED' ? 'BLOCKED' : (booking.channel as 'AIRBNB' | 'BOOKING');
      const result = await upsertShalomBooking({
        id: bookingId,
        propertyId: selectedProp.id,
        guestName: data.name,
        channel,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        ratePerNight,
        totalRevenue: data.payout,
        paid: false,
        notes: booking.notes,
        enriched: true,
        enrichedContact: data.contact || undefined,
        caretakerCollectLkr: collectLkr,
      });
      setSavingEnrichId(null);

      if (!result.success) {
        setToast(result.error ?? 'Failed to save enrichment');
        return;
      }
      setToast('Booking enriched and saved.');
    },
    [selectedProp],
  );

  const handleDeleteBooking = useCallback(async () => {
    if (!selectedBooking || !selectedProp) return;
    if (!isManualDeletableBooking(selectedBooking)) return;

    const bookingId = selectedBooking.id;
    setDeletingBookingId(bookingId);
    const result = await deleteShalomBooking(bookingId);
    setDeletingBookingId(null);

    if (!result.success) {
      setToast(result.error ?? 'Could not delete booking.');
      return;
    }

    const removeBooking = (bookings: Booking[]) => bookings.filter((b) => b.id !== bookingId);
    setProperties((prev) =>
      prev.map((p) =>
        p.id === selectedProp.id ? { ...p, bookings: removeBooking(p.bookings) } : p,
      ),
    );
    setSelectedProp((prev) =>
      prev && prev.id === selectedProp.id
        ? { ...prev, bookings: removeBooking(prev.bookings) }
        : prev,
    );
    setSelectedBooking(null);

    let message = isAvailabilityBlock(selectedBooking)
      ? 'Blocked period removed.'
      : 'Booking deleted.';
    if (result.pushedCancelToAirbnb) {
      message += ' OTA export calendar updated with cancellation.';
    }
    setToast(message);
  }, [selectedBooking, selectedProp]);

  const handleUpdateCaretakerCollect = useCallback(
    async (booking: Booking, rawValue: string) => {
      if (!selectedProp) return;
      const parsed = rawValue.trim() === '' ? null : Math.max(0, parseInt(rawValue, 10) || 0);
      const nextValue = parsed === 0 ? null : parsed;

      const updater = (b: Booking): Booking =>
        b.id === booking.id ? { ...b, caretakerCollectLkr: nextValue } : b;

      setProperties((prev) =>
        prev.map((p) =>
          p.id === selectedProp.id ? { ...p, bookings: p.bookings.map(updater) } : p,
        ),
      );
      setSelectedProp((prev) =>
        prev ? { ...prev, bookings: prev.bookings.map(updater) } : prev,
      );
      setSelectedBooking((prev) =>
        prev && prev.id === booking.id ? updater(prev) : prev,
      );

      setSavingCollectId(booking.id);
      const channel =
        booking.channel === 'BLOCKED' ? 'BLOCKED' : (booking.channel as 'AIRBNB' | 'BOOKING');
      const result = await upsertShalomBooking({
        id: booking.id,
        propertyId: selectedProp.id,
        guestName: booking.guestName,
        channel,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        ratePerNight: booking.ratePerNight,
        totalRevenue: booking.totalRevenue,
        paid: booking.paid,
        notes: booking.notes,
        enriched: booking.enriched,
        enrichedContact: booking.enrichedContact,
        caretakerCollectLkr: nextValue,
      });
      setSavingCollectId(null);
      if (!result.success) {
        setToast(result.error ?? 'Failed to save collection amount');
      }
    },
    [selectedProp],
  );

  const { rangeStart: rollingStart, rangeEndExclusive: rollingEnd } = rolling30Range();

  const rollingBookings = useMemo(
    () =>
      (selectedProp?.bookings ?? []).filter((b) =>
        bookingOverlapsRange(b, rollingStart, rollingEnd),
      ),
    [selectedProp?.bookings, rollingStart, rollingEnd],
  );

  const registerBounds = monthRange(registerYear, registerMonth);
  const registerBookings = useMemo(
    () =>
      (selectedProp?.bookings ?? []).filter((b) =>
        bookingOverlapsRange(b, registerBounds.monthStart, registerBounds.monthEndExclusive),
      ),
    [selectedProp?.bookings, registerBounds.monthStart, registerBounds.monthEndExclusive],
  );

  const collectionTotal = useMemo(
    () =>
      registerBookings
        .filter(
          (b) =>
            !isAvailabilityBlock(b) &&
            b.caretakerCollectLkr != null &&
            b.caretakerCollectLkr > 0,
        )
        .reduce((s, b) => s + (b.caretakerCollectLkr ?? 0), 0),
    [registerBookings],
  );

  const realNetProfit =
    collectionTotal > 0 && selectedProp ? collectionTotal - selectedProp.overhead : null;

  const paidRevenue        = rollingBookings.filter((b) => b.paid && !isAvailabilityBlock(b)).reduce((s, b) => s + b.totalRevenue, 0);
  const pendingRevenue     = rollingBookings.filter((b) => !b.paid && !isAvailabilityBlock(b)).reduce((s, b) => s + b.totalRevenue, 0);
  const bookedNights       = rollingBookings
    .filter((b) => !isAvailabilityBlock(b))
    .reduce((s, b) => s + nightsInMonth(b.checkIn, b.checkOut, rollingStart, rollingEnd), 0);
  const blockedNights      = rollingBookings
    .filter((b) => isAvailabilityBlock(b))
    .reduce((s, b) => s + nightsInMonth(b.checkIn, b.checkOut, rollingStart, rollingEnd), 0);
  const occupancyPct       = Math.round((bookedNights / ROLLING_WINDOW_DAYS) * 100);

  if (!selectedProp) {
    return (
      <ExecutivePageShell>
        <ExecutivePageHeader
          title="Shalom Residences"
          subtitle={
            <ExecutivePageLiveSubtitle>
              Multi-Property OTA Manager · Channel Calendar · Break-Even Pricing
            </ExecutivePageLiveSubtitle>
          }
        />
        <ExecutivePageBody>
          {loadError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {loadError}
            </p>
          ) : null}
          <p className="text-sm font-semibold text-slate-600">
            No rental properties in Supabase yet. Use Add Property to register your first Shalom residence.
          </p>
          <button
            type="button"
            onClick={() => setAddPropOpen(true)}
            className="rounded-xl bg-[color:var(--cvs-accent)] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-[color:var(--cvs-glow)] hover:bg-[color:var(--cvs-accent-hover)] transition-all"
          >
            Add Property
          </button>
          <AddPropertyModal
            open={addPropOpen}
            onClose={() => setAddPropOpen(false)}
            onConnect={handleConnect}
          />
        </ExecutivePageBody>
      </ExecutivePageShell>
    );
  }

  return (
    <>
      {toast && <OtaToast msg={toast} onDone={() => setToast(null)} />}
      <BookingModal
        booking={selectedBooking}
        handoverRoomCount={resolveHandoverRooms(currentSettings.handoverRooms).length}
        onClose={() => setSelectedBooking(null)}
        onEnrich={handleEnrich}
        onSaveCollect={(raw) => {
          if (selectedBooking) void handleUpdateCaretakerCollect(selectedBooking, raw);
        }}
        onDelete={() => void handleDeleteBooking()}
        savingCollect={
          selectedBooking != null && savingCollectId === selectedBooking.id
        }
        savingEnrich={
          selectedBooking != null && savingEnrichId === selectedBooking.id
        }
        deleting={
          selectedBooking != null && deletingBookingId === selectedBooking.id
        }
      />
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
      {selectedProp ? (
        <ShalomPublicListingEditorModal
          open={guestWebsiteOpen}
          propertyId={selectedProp.id}
          propertyName={selectedProp.name}
          onClose={() => setGuestWebsiteOpen(false)}
          onSaved={({ published, slug }) => {
            setProperties((prev) =>
              prev.map((property) =>
                property.id === selectedProp.id
                  ? { ...property, publicPublished: published, publicSlug: slug }
                  : property,
              ),
            );
            setSelectedProp((prev) =>
              prev && prev.id === selectedProp.id
                ? { ...prev, publicPublished: published, publicSlug: slug }
                : prev,
            );
            setToast(
              published
                ? `Published "${selectedProp.name}" on the guest website.`
                : `Saved guest website draft for "${selectedProp.name}".`,
            );
          }}
        />
      ) : null}

      <ExecutivePageShell>
        <ExecutivePageHeader
          title="Shalom Residences"
          subtitle={
            <ExecutivePageLiveSubtitle>
              Multi-Property OTA Manager · Channel Calendar · Break-Even Pricing
            </ExecutivePageLiveSubtitle>
          }
          actions={
            <PropertySelector
              properties={properties}
              selected={selectedProp}
              onSelect={setSelectedProp}
              onAdd={() => setAddPropOpen(true)}
              onRemove={handleRemoveProp}
              onOpenSettings={() => setPropSettingsOpen(true)}
              onOpenGuestWebsite={() => setGuestWebsiteOpen(true)}
            />
          }
        />

        <ExecutivePageBody spacing="relaxed">
          <CaretakerAssignPanel
            property={selectedProp}
            saving={savingCaretaker}
            savingAlertEmail={savingAlertEmail}
            assignError={caretakerAssignError}
            alertEmailError={alertEmailError}
            onAssign={handleAssignCaretaker}
            onSaveAlertEmail={handleSaveBookingAlertEmail}
          />

          {loadError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {loadError}
            </p>
          ) : null}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ExecutiveGlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Booked Nights</p>
              <p className="mt-2 text-3xl font-black text-slate-900">{bookedNights}</p>
              <p className="text-[10px] text-slate-500">
                of {ROLLING_WINDOW_DAYS} days · last 30 days rolling
                {blockedNights > 0 ? ` · ${blockedNights} blocked` : ''}
              </p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Occupancy Rate</p>
              <p className={`mt-2 text-3xl font-black tabular-nums ${occupancyPct >= selectedProp.occupancyTarget ? 'text-emerald-900' : 'text-amber-900'}`}>{occupancyPct}%</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div className={`h-full rounded-full transition-all ${occupancyPct >= selectedProp.occupancyTarget ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(occupancyPct, 100)}%` }} />
              </div>
              <p className="mt-1 text-[9px] text-slate-400">Target: {selectedProp.occupancyTarget}% · last 30 days</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-emerald-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Paid Revenue</p>
              <div className="mt-2 flex items-baseline gap-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <p className="text-3xl font-black tabular-nums text-emerald-900">{lkr(paidRevenue)}</p>
              </div>
              <p className="mt-1 text-[9px] text-slate-400">Last 30 days rolling</p>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="bg-gradient-to-br from-white/70 to-amber-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pending Collection</p>
              <div className="mt-2 flex items-baseline gap-1">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                <p className="text-3xl font-black tabular-nums text-amber-900">{lkr(pendingRevenue)}</p>
              </div>
              <p className="mt-1 text-[9px] text-slate-400">Last 30 days rolling</p>
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
                {(['AIRBNB', 'BOOKING', 'BLOCKED'] as Channel[]).map((ch) => {
                  const cm = CHANNEL_META[ch];
                  return (
                    <span key={ch} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${cm.bg} ${cm.text} ${cm.border}`}>
                      <cm.icon className="h-2.5 w-2.5" />{cm.label}
                    </span>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleImportFromOtas()}
                disabled={importingOta}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-1.5 text-[10px] font-bold text-rose-800 hover:bg-rose-100/80 transition-all disabled:opacity-60"
              >
                <RefreshCw className={`h-3 w-3 ${importingOta ? 'animate-spin' : ''}`} />
                {importingOta ? 'Importing…' : 'Import from OTAs'}
              </button>
            </div>

            <CollectInquiryPhonePanel
              phone={collectPhoneDraft}
              saving={savingCollectPhone}
              error={collectPhoneError}
              savedPhone={currentSettings.collectInquiryPhone}
              onChange={setCollectPhoneDraft}
              onSave={() => void handleSaveCollectInquiryPhone()}
            />

            <HandoverRoomsPanel
              rooms={handoverRoomsDraft}
              savedRooms={currentSettings.handoverRooms}
              open={handoverRoomsOpen}
              saving={savingHandoverRooms}
              error={handoverRoomsError}
              onToggle={() => setHandoverRoomsOpen((open) => !open)}
              onChange={handleHandoverRoomChange}
              onAdd={handleAddHandoverRoom}
              onAddTemplates={handleAddHandoverRoomTemplates}
              onRemove={handleRemoveHandoverRoom}
              onSave={() => void handleSaveHandoverRooms()}
            />

            <div className="p-5">
              <CalendarGrid
                year={viewYear}
                month={viewMonth}
                bookings={selectedProp.bookings}
                caretakerLoginDates={caretakerLoginDates}
                onBookingClick={setSelectedBooking}
              />
            </div>

            <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5 text-[10px] text-slate-500">
              Read-only OTA sync. Empty days = available on the platform (not in iCal). Click a coloured day for details.
              Green ring = today. Green dot on reservation days = caretaker logged in; red = no login.
            </div>
          </ExecutiveGlassCard>

          {/* ── Break-Even Calculator (property-aware) ── */}
          <BreakEvenCalculator
            property={selectedProp}
            guestNightlyRate={currentSettings.defaultRate}
            airbnbCommissionPct={currentSettings.airbnbCommissionPct}
            bookingCommissionPct={currentSettings.bookingCommissionPct}
            realNetProfit={realNetProfit}
            netProfitMonthLabel={`${MONTH_NAMES[registerMonth - 1]} ${registerYear}`}
            onSave={handleSaveCaretakerRate}
            saving={savingPricing}
          />

          {/* ── Booking Register ── */}
          <ExecutiveGlassCard className="overflow-hidden">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-800 uppercase">Booking Register — {selectedProp.name}</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-2 py-1">
                  <button type="button" onClick={prevRegisterMonth} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 transition-all">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[100px] text-center text-xs font-black text-slate-900">
                    {MONTH_NAMES[registerMonth - 1]} {registerYear}
                  </span>
                  <button type="button" onClick={nextRegisterMonth} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 transition-all">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">
                  {registerBookings.length} entries
                  {collectionTotal > 0 ? ` · collections ${lkr(collectionTotal)}` : ''}
                </span>
              </div>
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
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Caretaker Collect</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {registerBookings.map((b) => {
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
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 text-right font-black tabular-nums">
                          {isAvailabilityBlock(b) || b.totalRevenue <= 0 ? '—' : lkr(b.totalRevenue)}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800 text-right">
                          {isAvailabilityBlock(b) ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              placeholder="Optional"
                              defaultValue={b.caretakerCollectLkr ?? ''}
                              key={`${b.id}-${b.caretakerCollectLkr ?? 'empty'}`}
                              disabled={savingCollectId === b.id}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const current = b.caretakerCollectLkr ?? null;
                                const next = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                                if (next === current || (next === 0 && current == null)) return;
                                void handleUpdateCaretakerCollect(b, raw);
                              }}
                              className="w-28 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-right text-sm font-bold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60"
                              title="Amount caretaker must collect; leave blank for personnel use only"
                            />
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                          {isAvailabilityBlock(b) ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/90 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              <Lock className="h-3 w-3" />
                              Blocked
                            </span>
                          ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.paid ? 'bg-emerald-100/90 text-emerald-900 border-emerald-200' : 'bg-amber-100/90 text-amber-900 border-amber-200'}`}>
                            {b.paid ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {b.paid ? 'Paid' : 'Pending'}
                          </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {registerBookings.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">No bookings for {MONTH_NAMES[registerMonth - 1]} {registerYear}.</p>
            ) : null}
          </ExecutiveGlassCard>

        </ExecutivePageBody>
      </ExecutivePageShell>
    </>
  );
}
