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
  ArrowLeft,
  CheckCircle2,
  Users,
  Building2,
  ChevronDown,
  Plus,
  X,
  Shield,
  AlertCircle,
  Sun,
  Moon,
} from 'lucide-react';
import {
  submitGuardAttendanceAction,
  getAttendanceForDate,
  type ExistingAttendanceEntry,
} from './actions';

/* ─────────────────────────── types ─────────────────────────── */

type Site = { value: string; label: string; required: number };
type Guard = { epf: string; label: string; defaultSite: string | null };

interface Slot {
  uid: string;
  siteName: string;
  guardEpf: string | null;
}

/* ─────────────────────────── helpers ───────────────────────── */

let _uidCounter = 0;
function makeUid() {
  return `slot_${++_uidCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildSlots(
  sites: Site[],
  guards: Guard[],
  existing: ExistingAttendanceEntry[],
): Slot[] {
  const slots: Slot[] = [];

  for (const site of sites) {
    const required = Math.max(site.required, 1);
    const siteExisting = existing.filter(e => e.site_name === site.value);

    if (siteExisting.length > 0) {
      // Pre-fill from existing records
      siteExisting.forEach(e => {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: e.guard_epf });
      });
      // Pad up to required if existing is fewer
      const pad = required - siteExisting.length;
      for (let i = 0; i < pad; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: null });
      }
    } else {
      // Pre-fill from default guards (those whose home site = this site)
      const defaults = guards.filter(g => g.defaultSite === site.value);
      const fillCount = Math.min(defaults.length, required);
      for (let i = 0; i < fillCount; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: defaults[i].epf });
      }
      // Pad remaining slots up to required
      const pad = required - fillCount;
      for (let i = 0; i < pad; i++) {
        slots.push({ uid: makeUid(), siteName: site.value, guardEpf: null });
      }
    }
  }

  return slots;
}

/* ─────────────────────── GuardDropdown ─────────────────────── */

function GuardDropdown({
  siteName,
  value,
  guards,
  assignedElsewhere,
  onChange,
}: {
  siteName: string;
  value: string | null;
  guards: Guard[];
  assignedElsewhere: Set<string>;
  onChange: (epf: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? guards.find(g => g.epf === value) ?? null : null;

  const available = guards.filter(g => !assignedElsewhere.has(g.epf));
  const taken = guards.filter(g => assignedElsewhere.has(g.epf));

  // Close on outside click / scroll
  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
      {/* Trigger */}
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
          <Shield
            className={`w-4 h-4 shrink-0 transition-colors ${
              selected ? 'text-emerald-600' : 'text-red-600/50'
            }`}
          />
          <span
            className={`text-sm font-mono truncate ${
              selected ? 'text-slate-900 font-medium' : 'text-red-600/70 font-bold'
            }`}
          >
            {selected ? selected.label : '— Vacant —'}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto overscroll-contain">

            {/* Vacant option */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-slate-200 transition-colors ${
                !value
                  ? 'bg-slate-100 text-slate-700 font-semibold'
                  : 'text-slate-500 hover:bg-slate-100/70'
              }`}
            >
              <span className="font-mono">— Vacant —</span>
            </button>

            {/* Available guards */}
            {available.map(g => {
              const isSelected = g.epf === value;
              const isDefault = g.defaultSite === siteName;
              return (
                <button
                  key={g.epf}
                  type="button"
                  onClick={() => { onChange(g.epf); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                      : 'text-slate-800 hover:bg-slate-100/70'
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

            {/* Already-assigned guards — dimmed, non-clickable */}
            {taken.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-200 bg-slate-100">
                  <AlertCircle className="w-3 h-3 text-slate-400" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Already Assigned Elsewhere
                  </span>
                </div>
                {taken.map(g => (
                  <div
                    key={g.epf}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-slate-400/70 font-mono cursor-not-allowed select-none"
                    aria-disabled="true"
                  >
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

/* ──────────────────── main client component ─────────────────── */

export default function GuardAttendanceClient({
  sites,
  guards,
  existing,
  defaultDate,
}: {
  sites: Site[];
  guards: Guard[];
  existing: ExistingAttendanceEntry[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [shiftType, setShiftType] = useState<'DAY' | 'NIGHT'>('DAY');
  const [loadingDate, setLoadingDate] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(() => buildSlots(sites, guards, existing));

  /* ── Date options: today + 3 days ───────────────────────────── */
  const days = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const label =
        i === 0
          ? `Today · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
          : i === 1
          ? `Tomorrow · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
          : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      return { iso, label };
    });
  }, []);

  /* ── Reload when date or shift type changes ─────────────────── */
  const prevKeyRef = useRef(`${defaultDate}_DAY`);
  useEffect(() => {
    const key = `${selectedDate}_${shiftType}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    setLoadingDate(true);
    getAttendanceForDate(selectedDate, shiftType)
      .then(data => {
        setSlots(buildSlots(sites, guards, data));
      })
      .catch(() => {
        setSlots(buildSlots(sites, guards, []));
      })
      .finally(() => setLoadingDate(false));
  }, [selectedDate, shiftType, sites, guards]);

  /* ── Track all assigned EPFs across slots ───────────────────── */
  const assignedEpfs = useMemo(() => {
    const s = new Set<string>();
    slots.forEach(slot => { if (slot.guardEpf) s.add(slot.guardEpf); });
    return s;
  }, [slots]);

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

  /* ── Submit ─────────────────────────────────────────────────── */
  const handleSubmit = () => {
    setErrorMsg('');
    const entries = slots
      .filter(s => s.guardEpf !== null)
      .map(s => ({ siteName: s.siteName, guardEpf: s.guardEpf! }));

    startTransition(async () => {
      const result = await submitGuardAttendanceAction(entries, selectedDate, shiftType);
      if (result?.error) {
        setErrorMsg(result.error);
      } else {
        setDone(true);
      }
    });
  };

  /* ── Group slots by site ────────────────────────────────────── */
  const slotsBySite = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const site of sites) {
      map.set(site.value, slots.filter(s => s.siteName === site.value));
    }
    return map;
  }, [slots, sites]);

  /* ── Success screen ─────────────────────────────────────────── */
  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Attendance Submitted
          </h2>
          <p className="text-sm text-slate-500">
            {shiftType === 'DAY' ? 'Day shift' : 'Night shift'} assignments saved for {selectedDate}.
          </p>
          <p className="text-sm text-slate-400 font-mono">Pending confirmation by operations.</p>
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

  /* ── Main render ────────────────────────────────────────────── */
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
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Guard Attendance
          </h1>
          <p className="text-sm text-slate-500 font-mono">Assign guards to each site</p>
        </div>
        <div className="ml-auto p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <Users className="w-5 h-5 text-emerald-600" />
        </div>
      </header>

      {/* Date + Shift selector */}
      <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-4 space-y-4">
        {/* Date */}
        <div className="space-y-3">
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Shift Date</p>
          <div className="grid grid-cols-2 gap-2">
            {days.map(({ iso, label }) => (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all active:scale-95 ${
                  selectedDate === iso
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Shift type */}
        <div className="space-y-2.5">
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Shift Type</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShiftType('DAY')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-black uppercase tracking-wide transition-all active:scale-95 ${
                shiftType === 'DAY'
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-600'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Sun className="w-4 h-4" />
              Day
            </button>
            <button
              type="button"
              onClick={() => setShiftType('NIGHT')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-black uppercase tracking-wide transition-all active:scale-95 ${
                shiftType === 'NIGHT'
                  ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Moon className="w-4 h-4" />
              Night
            </button>
          </div>
        </div>
      </div>

      {/* Loading state while fetching attendance for selected date */}
      {loadingDate && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500 font-mono">
          <div className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-emerald-400 animate-spin" />
          Loading assignments…
        </div>
      )}

      {/* Site cards */}
      {!loadingDate && (
        <div className="space-y-4">
          {sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Building2 className="w-10 h-10 text-slate-400" />
              <p className="text-sm font-bold text-slate-500">No sites assigned</p>
              <p className="text-sm text-slate-400 max-w-[220px]">
                Contact your administrator to be assigned sites.
              </p>
            </div>
          ) : (
            sites.map(site => {
              const siteSlots = slotsBySite.get(site.value) ?? [];
              const assignedCount = siteSlots.filter(s => s.guardEpf).length;
              const required = site.required;
              const shortfall = required - assignedCount;
              const isShort = shortfall > 0;
              const isFull = assignedCount >= required;

              return (
                <div
                  key={site.value}
                  className={`bg-white/90 border rounded-2xl overflow-visible transition-colors ${
                    isShort
                      ? 'border-red-500/50 bg-red-950/10'
                      : 'border-slate-200/60'
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
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">
                        {site.label}
                      </p>
                      <p className={`text-xs font-mono font-bold ${
                        isShort ? 'text-red-600/80' : 'text-slate-500'
                      }`}>
                        {assignedCount} / {required} guard{required !== 1 ? 's' : ''} assigned
                      </p>
                    </div>
                    {/* Status badge */}
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
                        <span className={`text-xs font-black w-4 text-center shrink-0 ${
                          isVacant ? 'text-red-500/70' : 'text-slate-400'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <GuardDropdown
                            siteName={site.value}
                            value={slot.guardEpf}
                            guards={guards}
                            assignedElsewhere={
                              new Set(
                                [...assignedEpfs].filter(epf => epf !== slot.guardEpf),
                              )
                            }
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
      )}

      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      {sites.length > 0 && !loadingDate && (() => {
        const totalShort = sites.reduce((acc, site) => {
          const siteSlots = slotsBySite.get(site.value) ?? [];
          const assigned = siteSlots.filter(s => s.guardEpf).length;
          return acc + Math.max(0, site.required - assigned);
        }, 0);

        return (
          <>
            {totalShort > 0 && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-red-600 uppercase tracking-wide">
                    {totalShort} total position{totalShort !== 1 ? 's' : ''} unfilled
                  </p>
                  <p className="text-sm text-red-600/70 mt-0.5">
                    Submitting will record the shortage — operations will be alerted.
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className={`w-full font-black py-4 rounded-xl uppercase tracking-widest text-base transition-all active:scale-95 disabled:opacity-40 ${
                totalShort > 0
                  ? 'bg-red-500 hover:bg-red-400 text-white shadow-[0_8px_20px_rgba(239,68,68,0.2)]'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-stone-900 shadow-[0_8px_20px_rgba(16,185,129,0.2)]'
              }`}
            >
              {isPending
                ? 'Submitting…'
                : totalShort > 0
                ? `Submit with ${totalShort} Short`
                : 'Submit Guard Attendance'}
            </button>
          </>
        );
      })()}
    </div>
  );
}
