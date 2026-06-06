'use client'

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Users, Building2,
  ChevronDown, Plus, X, Shield, AlertCircle,
  Sun, Moon, CalendarCheck, Clock, AlertTriangle,
  Phone,
} from 'lucide-react';
import { confirmShiftAction } from './actions';
import type { ShiftToConfirm } from './actions';

/* ─────────────────────────── types ─────────────────────────── */

type Site  = { value: string; label: string; required: number };
type Guard = { epf: string; label: string; defaultSite: string | null; phone?: string | null };
type ExistingEntry = { site_name: string; guard_epf: string; status: string };

interface Slot {
  uid:       string;
  siteName:  string;
  guardEpf:  string | null;
}

/* ─────────────────────────── helpers ───────────────────────── */

let _uid = 0;
function makeUid() {
  return `slot_${++_uid}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildSlots(sites: Site[], guards: Guard[], existing: ExistingEntry[]): Slot[] {
  const slots: Slot[] = [];
  for (const site of sites) {
    const required    = Math.max(site.required, 1);
    const siteExisting = existing.filter(e => e.site_name === site.value);

    if (siteExisting.length > 0) {
      siteExisting.forEach(e => {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: e.guard_epf });
      });
      const pad = required - siteExisting.length;
      for (let i = 0; i < pad; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: null });
      }
    } else {
      const defaults  = guards.filter(g => g.defaultSite === site.value);
      const fillCount = Math.min(defaults.length, required);
      for (let i = 0; i < fillCount; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: defaults[i].epf });
      }
      const pad = required - fillCount;
      for (let i = 0; i < pad; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: null });
      }
    }
  }
  return slots;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const prefix =
    d.getTime() === today.getTime() ? 'Today'
    : d.getTime() === tomorrow.getTime() ? 'Tomorrow'
    : d.toLocaleDateString('en-GB', { weekday: 'long' });
  return `${prefix} · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/* ──────────────────────── GuardDropdown ────────────────────── */

function GuardDropdown({
  siteName, value, guards, assignedElsewhere, onChange,
}: {
  siteName: string;
  value: string | null;
  guards: Guard[];
  assignedElsewhere: Set<string>;
  onChange: (epf: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const selected        = value ? guards.find(g => g.epf === value) ?? null : null;
  const available       = guards.filter(g => !assignedElsewhere.has(g.epf));
  const taken           = guards.filter(g =>  assignedElsewhere.has(g.epf));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all ${
          open
            ? 'bg-slate-100 border-emerald-500/60 ring-2 ring-emerald-500/15'
            : selected
            ? 'bg-white/80 border-slate-200 hover:border-slate-300 active:scale-[0.99]'
            : 'bg-red-950/20 border-red-500/40 border-dashed hover:border-red-500/60 active:scale-[0.99]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Shield className={`w-4 h-4 shrink-0 transition-colors ${selected ? 'text-emerald-600' : 'text-red-600/50'}`} />
          <span className={`text-sm font-mono truncate ${selected ? 'text-slate-900 font-medium' : 'text-red-600/70 font-bold'}`}>
            {selected ? selected.label : '— Vacant —'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto overscroll-contain">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-slate-200 transition-colors ${
                !value ? 'bg-slate-100 text-slate-700 font-semibold' : 'text-slate-500 hover:bg-slate-100/70'
              }`}
            >
              <span className="font-mono">— Vacant —</span>
            </button>

            {available.map(g => {
              const isSelected = g.epf === value;
              const isDefault  = g.defaultSite === siteName;
              return (
                <button
                  key={g.epf}
                  type="button"
                  onClick={() => { onChange(g.epf); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                    isSelected ? 'bg-emerald-500/15 text-emerald-300 font-semibold' : 'text-slate-800 hover:bg-slate-100/70'
                  }`}
                >
                  <span className="font-mono truncate">{g.label}</span>
                  {isDefault && (
                    <span className="text-sm font-black uppercase tracking-wider text-amber-600/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                      DEFAULT
                    </span>
                  )}
                </button>
              );
            })}

            {taken.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-200 bg-slate-100">
                  <AlertCircle className="w-3 h-3 text-slate-400" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Already Assigned Elsewhere
                  </span>
                </div>
                {taken.map(g => (
                  <div key={g.epf} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-400/70 font-mono cursor-not-allowed select-none">
                    {g.label}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────── main component ───────────────────────── */

export default function AttendanceConfirmClient({
  shift,
  sites,
  guards,
  existing,
  totalSectorGuards,
}: {
  shift: ShiftToConfirm | null;
  sites: Site[];
  guards: Guard[];
  existing: ExistingEntry[];
  totalSectorGuards: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone]     = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [slots, setSlots]   = useState<Slot[]>(() => buildSlots(sites, guards, existing));
  const [showShortModal,  setShowShortModal]  = useState(false);
  const [showAbsentModal, setShowAbsentModal] = useState(false);

  useEffect(() => {
    const isOpen = showShortModal || showAbsentModal;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showShortModal, showAbsentModal]);

  /* ── Slot mutations ─────────────────────────────────────────── */
  const updateSlot = useCallback((uid: string, guardEpf: string | null) => {
    setSlots(prev => prev.map(s => s.uid === uid ? { ...s, guardEpf } : s));
  }, []);

  const removeSlot = useCallback((uid: string) => {
    setSlots(prev => prev.filter(s => s.uid !== uid));
  }, []);

  const addSlot = useCallback((siteName: string) => {
    setSlots(prev => [...prev, { uid: makeUid(), siteName, guardEpf: null }]);
  }, []);

  /* ── Derived stats ─────────────────────────────────────────── */
  const assignedEpfs = useMemo(() => {
    const s = new Set<string>();
    slots.forEach(sl => { if (sl.guardEpf) s.add(sl.guardEpf); });
    return s;
  }, [slots]);

  const slotsBySite = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const site of sites) {
      map.set(site.value, slots.filter(s => s.siteName === site.value));
    }
    return map;
  }, [slots, sites]);

  const totalAssigned = assignedEpfs.size;
  const totalShort    = sites.reduce((acc, site) => {
    const siteSlots  = slotsBySite.get(site.value) ?? [];
    const assigned   = siteSlots.filter(s => s.guardEpf).length;
    return acc + Math.max(0, site.required - assigned);
  }, 0);
  const totalAbsent   = Math.max(0, totalSectorGuards - totalAssigned);

  /* ── Submit ────────────────────────────────────────────────── */
  const handleConfirm = () => {
    if (!shift) return;
    setErrorMsg('');
    const entries = slots
      .filter(s => s.guardEpf !== null)
      .map(s => ({ siteName: s.siteName, guardEpf: s.guardEpf! }));

    startTransition(async () => {
      const result = await confirmShiftAction(entries, shift.shift_date, shift.shift_type);
      if (result?.error) setErrorMsg(result.error);
      else setDone(true);
    });
  };

  /* ── Timing flags ───────────────────────────────────────────── */
  const tooEarly = shift && !shift.can_confirm_now;

  /* ── Success ─────────────────────────────────────────────── */
  if (done && shift) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Shift Confirmed</h2>
          <p className="text-sm text-slate-500">
            {shift.shift_type === 'DAY' ? 'Day shift' : 'Night shift'} assignments locked in for {dayLabel(shift.shift_date)}.
          </p>
          <p className="text-sm text-slate-400 font-mono">Guard assignments confirmed.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs bg-emerald-500 hover:bg-emerald-400 text-stone-900 font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  /* ── Empty — no upcoming submitted shift ─────────────────── */
  if (!shift) {
    return (
      <div className="flex-1 flex flex-col p-5 space-y-5">
        <header className="flex items-center gap-3 pt-2">
          <button onClick={() => router.back()} className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Confirm Shift</h1>
            <p className="text-sm text-slate-500 font-mono">Lock in guard assignments</p>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-400" />
          <div>
            <p className="text-sm font-bold text-slate-500">No Upcoming Shift</p>
            <p className="text-sm text-slate-400 max-w-[220px] mt-1">
              Submit guard attendance first. You can confirm your shift starting 2 hours before it begins.
            </p>
          </div>
          <button
            onClick={() => router.push('/attendance/guards')}
            className="bg-slate-100 border border-slate-200 text-slate-700 font-black text-sm px-6 py-3 rounded-xl uppercase tracking-wider transition-all active:scale-95"
          >
            Go to Guard Attendance
          </button>
        </div>
      </div>
    );
  }

  /* ── Main ────────────────────────────────────────────────── */
  return (
    <div className="flex-1 flex flex-col p-5 space-y-5 pb-10">

      {/* Header */}
      <header className="flex items-center gap-3 pt-2">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Confirm Shift</h1>
          <p className="text-sm text-slate-500 font-mono">Lock in guard assignments</p>
        </div>
        <div className="ml-auto p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <Users className="w-5 h-5 text-emerald-600" />
        </div>
      </header>

      {/* Shift info — replaces the date/type picker */}
      <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Next Shift</p>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-black uppercase tracking-wide ${
            shift.shift_type === 'DAY'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-600'
              : 'bg-indigo-500/15 border-indigo-500/50 text-indigo-400'
          }`}>
            {shift.shift_type === 'DAY' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {shift.shift_type === 'DAY' ? 'Day' : 'Night'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{dayLabel(shift.shift_date)}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-center">
            <p className="text-lg font-black text-slate-900">{totalAssigned}</p>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mt-0.5">Assigned</p>
          </div>
          <button
            type="button"
            onClick={() => totalShort > 0 && setShowShortModal(true)}
            className={`border rounded-xl px-3 py-2.5 text-center transition-all ${
              totalShort > 0
                ? 'bg-red-950/20 border-red-500/40 active:scale-95 cursor-pointer'
                : 'bg-slate-50 border-slate-200 cursor-default'
            }`}
          >
            <p className={`text-lg font-black ${totalShort > 0 ? 'text-red-600' : 'text-slate-900'}`}>{totalShort}</p>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mt-0.5">Short</p>
          </button>
          <button
            type="button"
            onClick={() => totalAbsent > 0 && setShowAbsentModal(true)}
            className={`border rounded-xl px-3 py-2.5 text-center transition-all ${
              totalAbsent > 0
                ? 'bg-amber-950/20 border-amber-500/30 active:scale-95 cursor-pointer'
                : 'bg-slate-50 border-slate-200 cursor-default'
            }`}
          >
            <p className={`text-lg font-black ${totalAbsent > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totalAbsent}</p>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mt-0.5">Absent</p>
          </button>
        </div>
      </div>

      {/* Too early — window not open yet */}
      {tooEarly && (
        <div className="flex items-start gap-2.5 bg-sky-500/10 border border-sky-500/30 px-4 py-3 rounded-xl">
          <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-sky-600 uppercase tracking-wide">Window not open yet</p>
            <p className="text-sm text-sky-600/70 mt-0.5">
              Confirmation opens 2 hours before your shift starts.
              {shift.minutes_until_window != null && (
                <> Opens in <span className="font-black text-sky-300">{formatMinutes(shift.minutes_until_window)}</span>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Late warning */}
      {shift.is_late && shift.can_confirm_now && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-amber-600 uppercase tracking-wide">Shift already started</p>
            <p className="text-sm text-amber-600/70 mt-0.5">
              Your shift started{shift.minutes_late != null && (
                <> <span className="font-black text-amber-300">{formatMinutes(shift.minutes_late)}</span> ago</>
              )}. Make any last changes and confirm now.
            </p>
          </div>
        </div>
      )}

      {/* Site cards */}
      <div className="space-y-4">
        {sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="w-10 h-10 text-slate-400" />
            <p className="text-sm font-bold text-slate-500">No sites assigned</p>
            <p className="text-sm text-slate-400 max-w-[220px]">Contact your administrator to be assigned sites.</p>
          </div>
        ) : (
          sites.map(site => {
            const siteSlots    = slotsBySite.get(site.value) ?? [];
            const assignedCount = siteSlots.filter(s => s.guardEpf).length;
            const required      = site.required;
            const shortfall     = required - assignedCount;
            const isShort       = shortfall > 0;
            const isFull        = assignedCount >= required;

            return (
              <div
                key={site.value}
                className={`bg-white/90 border rounded-2xl overflow-visible transition-colors ${
                  isShort ? 'border-red-500/50 bg-red-950/10' : 'border-slate-200/60'
                }`}
              >
                {/* Site header */}
                <div className={`flex items-center gap-3 px-4 pt-4 pb-3 border-b ${
                  isShort ? 'border-red-500/30' : 'border-slate-200/60'
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isShort ? 'bg-red-500/10' : 'bg-slate-200/80'
                  }`}>
                    <Building2 className={`w-4 h-4 ${isShort ? 'text-red-600' : 'text-slate-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{site.label}</p>
                    <p className={`text-xs font-mono font-bold ${isShort ? 'text-red-600/80' : 'text-slate-500'}`}>
                      {assignedCount} / {required} guard{required !== 1 ? 's' : ''} assigned
                    </p>
                  </div>
                  {isFull && (
                    <span className="shrink-0 text-sm font-black uppercase tracking-wider text-emerald-600/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                      ✓ Filled
                    </span>
                  )}
                  {isShort && assignedCount > 0 && (
                    <span className="shrink-0 text-sm font-black uppercase tracking-wider text-red-600 bg-red-500/15 border border-red-500/40 px-2 py-1 rounded-full">
                      {shortfall} SHORT
                    </span>
                  )}
                  {isShort && assignedCount === 0 && (
                    <span className="shrink-0 text-sm font-black uppercase tracking-wider text-red-600 bg-red-500/15 border border-red-500/40 px-2 py-1 rounded-full">
                      VACANT
                    </span>
                  )}
                </div>

                {/* Guard slots */}
                <div className="p-4 space-y-2.5">
                  {siteSlots.map((slot, i) => {
                    const isVacant = !slot.guardEpf;
                    return (
                      <div key={slot.uid} className="flex items-center gap-2">
                        <span className={`text-xs font-black w-4 text-center shrink-0 ${isVacant ? 'text-red-500/70' : 'text-slate-400'}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <GuardDropdown
                            siteName={site.value}
                            value={slot.guardEpf}
                            guards={guards}
                            assignedElsewhere={new Set([...assignedEpfs].filter(epf => epf !== slot.guardEpf))}
                            onChange={epf => updateSlot(slot.uid, epf)}
                          />
                        </div>
                        {siteSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSlot(slot.uid)}
                            className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-500/30 transition-colors shrink-0"
                            aria-label="Remove slot"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Short-staffed banner */}
                  {isShort && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <p className="text-xs font-black text-red-600 uppercase tracking-wide">
                        {shortfall} position{shortfall !== 1 ? 's' : ''} unfilled — site is short-staffed
                      </p>
                    </div>
                  )}

                  {/* Add guard slot */}
                  <button
                    type="button"
                    onClick={() => addSlot(site.value)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 text-sm font-bold uppercase tracking-wider transition-colors active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Guard
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Global short warning */}
      {totalShort > 0 && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-red-600 uppercase tracking-wide">
              {totalShort} total position{totalShort !== 1 ? 's' : ''} unfilled
            </p>
            <p className="text-sm text-red-600/70 mt-0.5">
              Confirming will record the shortage — operations will be alerted.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Confirm button */}
      {sites.length > 0 && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || !!tooEarly}
          className={`w-full font-black py-4 rounded-xl uppercase tracking-widest text-base transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
            tooEarly
              ? 'bg-slate-200 text-slate-600'
              : totalShort > 0
              ? 'bg-red-500 hover:bg-red-400 text-white shadow-[0_8px_20px_rgba(239,68,68,0.2)]'
              : shift.is_late
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-900 shadow-[0_8px_20px_rgba(245,158,11,0.2)]'
              : 'bg-emerald-500 hover:bg-emerald-400 text-stone-900 shadow-[0_8px_20px_rgba(16,185,129,0.2)]'
          }`}
        >
          {tooEarly
            ? `Opens in ${formatMinutes(shift.minutes_until_window ?? 0)}`
            : isPending
            ? 'Confirming…'
            : totalShort > 0
            ? `Confirm with ${totalShort} Short`
            : shift.is_late
            ? 'Confirm Shift (Late)'
            : 'Confirm Shift'}
        </button>
      )}

      {/* ── Short Sites Modal ─────────────────────────────────────── */}
      {showShortModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Short-Staffed Sites</p>
                  <p className="text-sm text-slate-500 font-mono">{totalShort} position{totalShort !== 1 ? 's' : ''} unfilled</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortModal(false)}
                className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2.5 max-h-[60dvh] overflow-y-auto">
              {sites
                .map(site => {
                  const siteSlots   = slotsBySite.get(site.value) ?? [];
                  const assigned    = siteSlots.filter(s => s.guardEpf).length;
                  const shortfall   = site.required - assigned;
                  return shortfall > 0 ? { ...site, assigned, shortfall } : null;
                })
                .filter(Boolean)
                .map(site => (
                  <div
                    key={site!.value}
                    className="flex items-center justify-between gap-3 bg-red-950/20 border border-red-500/30 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="w-4 h-4 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{site!.label}</p>
                        <p className="text-sm font-mono text-slate-500 mt-0.5">
                          {site!.assigned} / {site!.required} guard{site!.required !== 1 ? 's' : ''} assigned
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-black uppercase tracking-wider text-red-600 bg-red-500/15 border border-red-500/40 px-2 py-1 rounded-full">
                      {site!.shortfall} SHORT
                    </span>
                  </div>
                ))}
            </div>
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setShowShortModal(false)}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-black uppercase tracking-wider hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Absent Guards Modal ───────────────────────────────────── */}
      {showAbsentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Absent Guards</p>
                  <p className="text-sm text-slate-500 font-mono">{totalAbsent} guard{totalAbsent !== 1 ? 's' : ''} not assigned</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAbsentModal(false)}
                className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2.5 max-h-[60dvh] overflow-y-auto">
              {guards
                .filter(g => !assignedEpfs.has(g.epf))
                .map(g => (
                  <div
                    key={g.epf}
                    className="flex items-center justify-between gap-3 bg-amber-950/20 border border-amber-500/30 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate font-mono">{g.label}</p>
                        {g.phone ? (
                          <p className="text-sm font-mono text-slate-500 mt-0.5">{g.phone}</p>
                        ) : (
                          <p className="text-xs font-mono text-slate-400 mt-0.5">No contact on file</p>
                        )}
                      </div>
                    </div>
                    {g.phone ? (
                      <a
                        href={`tel:${g.phone}`}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 text-sm font-black uppercase tracking-wide hover:bg-emerald-500/25 transition-colors active:scale-95"
                      >
                        <Phone className="w-3 h-3" />
                        Call
                      </a>
                    ) : (
                      <span className="shrink-0 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-sm font-black uppercase tracking-wide">
                        No #
                      </span>
                    )}
                  </div>
                ))}
            </div>
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setShowAbsentModal(false)}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-black uppercase tracking-wider hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
