'use client';

import { useState, useMemo, useTransition, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  MapPin,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Radio,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
} from 'lucide-react';
import {
  getVisitsForDateAction,
  getIncidentsAction,
  acknowledgeIncidentAction,
  type SmFieldIncident,
  type SmVisitLog,
} from './actions';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const SEV_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const SEV_CELL: Record<string, string> = {
  HIGH: 'bg-rose-500 text-white',
  MEDIUM: 'bg-amber-500 text-stone-900',
  LOW: 'bg-sky-500 text-white',
};
const SEV_DOT: Record<string, string> = {
  HIGH: 'bg-rose-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-sky-500',
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  SECURITY_BREACH: 'Security breach',
  GUARD_MISCONDUCT: 'Guard misconduct',
  EQUIPMENT_FAILURE: 'Equipment failure',
  MEDICAL_EMERGENCY: 'Medical emergency',
  THEFT: 'Theft',
  TRESPASSING: 'Trespassing',
  PROPERTY_DAMAGE: 'Property damage',
  CLIENT_COMPLAINT: 'Client complaint',
  NATURAL_DISASTER: 'Natural disaster',
  OTHER: 'Other',
};

type RoleKey = 'OM' | 'SM' | 'MD';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

/* ─── Modal shell ─── */

function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white/98 backdrop-blur-sm">
      <div className="flex items-start gap-3 border-b border-slate-200 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black uppercase tracking-tight text-slate-900">{title}</p>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 transition hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}

/* ─── Calendar (OM-style date changer) ─── */

function DateCalendar({
  selectedDate,
  onSelectDate,
  onClose,
  dayMarkers,
  markerMode,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onClose: () => void;
  dayMarkers: Record<string, string>;
  markerMode: 'severity' | 'visit';
}) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, []);

  const [viewYear, setViewYear] = useState(selectedDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getUTCMonth());

  const todayStr = today.toISOString().slice(0, 10);
  const selectedStr = selectedDate.toISOString().slice(0, 10);
  const firstDow = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const canGoNext =
    viewYear < today.getUTCFullYear() ||
    (viewYear === today.getUTCFullYear() && viewMonth < today.getUTCMonth());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-full z-[70] mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black text-slate-800">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7">
          {DAYS.map((d) => (
            <span key={d} className="text-center text-sm font-black uppercase tracking-wider text-slate-400">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <span key={`e-${i}`} />;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const marker = dayMarkers[dateStr];
            const isSelect = dateStr === selectedStr;
            const isToday = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            return (
              <button
                key={dateStr}
                type="button"
                disabled={isFuture}
                onClick={() => {
                  onSelectDate(new Date(`${dateStr}T00:00:00Z`));
                  onClose();
                }}
                className={[
                  'flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition-all',
                  isFuture ? 'cursor-default opacity-25' : '',
                  isSelect ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-white' : '',
                  marker && markerMode === 'severity' && SEV_CELL[marker]
                    ? SEV_CELL[marker]
                    : marker && markerMode === 'visit'
                    ? 'bg-amber-500/80 text-stone-900 font-black'
                    : isToday
                    ? 'bg-slate-100 font-black text-slate-900'
                    : !isFuture
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-400',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {day}
              </button>
            );
          })}
        </div>
        {markerMode === 'severity' && (
          <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-2.5">
            {([['bg-rose-500', 'High'], ['bg-amber-500', 'Med'], ['bg-sky-500', 'Low']] as const).map(([c, l]) => (
              <div key={l} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${c}`} />
                <span className="text-sm font-bold uppercase text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Visits today modal ─── */

function VisitsTodayModal({ onClose }: { onClose: () => void }) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, []);

  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visits, setVisits] = useState<SmVisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const dateIso = selectedDate.toISOString().slice(0, 10);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVisitsForDateAction(dateIso);
      setVisits(data);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [dateIso]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const visitDayMap = useMemo(() => {
    const m: Record<string, string> = {};
    if (visits.length > 0) m[dateIso] = 'visit';
    return m;
  }, [visits, dateIso]);

  return (
    <ModalShell
      title="Visits Today"
      subtitle="Site visits logged for the selected date"
      icon={<MapPin className="h-5 w-5 text-amber-600" />}
      onClose={onClose}
      headerExtra={
        <div className="relative">
          <button
            type="button"
            onClick={() => setCalendarOpen((o) => !o)}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm font-bold text-slate-700"
          >
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-mono max-w-[7rem] truncate">{fmtDate(selectedDate)}</span>
            <ChevronDown className={`h-3 w-3 transition ${calendarOpen ? 'rotate-180' : ''}`} />
          </button>
          {calendarOpen && (
            <DateCalendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onClose={() => setCalendarOpen(false)}
              dayMarkers={visitDayMap}
              markerMode="visit"
            />
          )}
        </div>
      }
    >
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading visits…</p>
      ) : visits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16">
          <CalendarDays className="h-8 w-8 text-slate-400" />
          <p className="text-sm font-bold text-slate-600">No visits on this date</p>
          <p className="text-sm text-slate-400">Use the calendar to browse other days</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visits.map((v) => (
            <li
              key={v.id}
              className="rounded-2xl border border-amber-500/20 bg-white/90 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-black text-slate-900">{v.site_name ?? 'Unknown site'}</p>
                <span className="font-mono text-sm text-slate-500">{fmtTime(v.created_at)}</span>
              </div>
              {v.notes && <p className="mt-1 text-sm text-slate-500">{v.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

/* ─── Incident command queue modal ─── */

function IncidentCommandQueueModal({
  initialIncidents,
  isDemo,
  onClose,
  onAcknowledged,
}: {
  initialIncidents: SmFieldIncident[];
  isDemo: boolean;
  onClose: () => void;
  onAcknowledged: () => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, []);

  const CURRENT_ROLE: RoleKey = 'SM';

  const [incidents, setIncidents] = useState(initialIncidents);

  useEffect(() => {
    setIncidents(initialIncidents);
  }, [initialIncidents]);

  const defaultDate =
    incidents.length > 0
      ? new Date(incidents[0].timestamp.slice(0, 10) + 'T00:00:00Z')
      : today;

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(incidents[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();

  const dayStart = new Date(selectedDate.toISOString().slice(0, 10) + 'T00:00:00Z');
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const visibleIncidents = incidents.filter((inc) => {
    const t = new Date(inc.timestamp).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });

  const selected =
    visibleIncidents.find((i) => i.id === selectedId) ?? visibleIncidents[0] ?? null;

  const rolling7Start = new Date(today);
  rolling7Start.setUTCDate(rolling7Start.getUTCDate() - 6);
  const rolling7End = new Date(today);
  rolling7End.setUTCDate(rolling7End.getUTCDate() + 1);
  const pendingCount = incidents.filter((i) => {
    const t = new Date(i.timestamp).getTime();
    return t >= rolling7Start.getTime() && t < rolling7End.getTime() && !i.ack[CURRENT_ROLE];
  }).length;

  const dayMap = useMemo(() => {
    const map: Record<string, string> = {};
    incidents.forEach((inc) => {
      const d = inc.timestamp.slice(0, 10);
      if (!map[d] || SEV_ORDER[inc.severity] > SEV_ORDER[map[d]]) map[d] = inc.severity;
    });
    return map;
  }, [incidents]);

  const handleAcknowledge = (id: string) => {
    startTransition(async () => {
      if (!isDemo) {
        const result = await acknowledgeIncidentAction(id);
        if (result.error) return;
      }
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id ? { ...inc, ack: { ...inc.ack, SM: true } } : inc,
        ),
      );
      onAcknowledged();
    });
  };

  return (
    <ModalShell
      title="Incident Command Queue"
      subtitle="Tri-role acknowledgement · field incidents"
      icon={<Radio className="h-5 w-5 text-rose-600" />}
      onClose={onClose}
      headerExtra={
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm font-bold text-slate-700"
            >
              <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-mono max-w-[6rem] truncate">{fmtDate(selectedDate)}</span>
              <ChevronDown className={`h-3 w-3 transition ${calendarOpen ? 'rotate-180' : ''}`} />
            </button>
            {calendarOpen && (
              <DateCalendar
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setSelectedId('');
                }}
                onClose={() => setCalendarOpen(false)}
                dayMarkers={dayMap}
                markerMode="severity"
              />
            )}
          </div>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-black text-white">
              {pendingCount}
            </span>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">
          {fmtDate(selectedDate)}
        </p>
        {pendingCount > 0 ? (
          <span className="text-xs font-bold text-rose-600">{pendingCount} pending (7d)</span>
        ) : (
          <span className="text-xs font-bold text-emerald-500">All clear (7d)</span>
        )}
      </div>

      {visibleIncidents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16">
          <CalendarDays className="h-8 w-8 text-slate-400" />
          <p className="text-sm font-bold text-slate-600">No incidents on this date</p>
          <p className="text-sm text-slate-400">Use the calendar to browse history</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {visibleIncidents.map((incident) => {
              const isSelected = incident.id === (selected?.id ?? '');
              const allRead = incident.ack.OM && incident.ack.SM && incident.ack.MD;
              const isUnread = !incident.ack[CURRENT_ROLE];
              return (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedId(incident.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : allRead
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[incident.severity]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="font-mono text-sm text-slate-500">{shortId(incident.id)}</p>
                        <span className="font-mono text-sm text-slate-500">{fmtTime(incident.timestamp)}</span>
                      </div>
                      <p className="truncate text-sm font-black text-slate-900">{incident.site}</p>
                      <p className="text-sm text-slate-500">{incident.guardName}</p>
                      <div className="mt-2 flex gap-1">
                        {(['OM', 'SM', 'MD'] as RoleKey[]).map((role) => (
                          <span
                            key={role}
                            className={`rounded px-1.5 py-0.5 text-xs font-black ${
                              incident.ack[role]
                                ? 'bg-emerald-500/20 text-emerald-600'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                    {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-mono text-sm text-slate-500">{shortId(selected.id)}</p>
                  <p className="text-base font-black text-slate-900">{selected.site}</p>
                  <p className="text-sm text-slate-500">
                    {fmtDate(new Date(selected.timestamp.slice(0, 10) + 'T00:00:00Z'))} · {fmtTime(selected.timestamp)}
                  </p>
                  <span className="mt-2 inline-block rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-700">
                    {INCIDENT_TYPE_LABELS[selected.incidentType] ?? selected.incidentType}
                  </span>
                  <span className="ml-2 inline-block rounded-full border border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {selected.severity}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Involved guard</p>
                <p className="text-sm font-black text-slate-900">{selected.guardName}</p>
                <p className="font-mono text-sm text-slate-500">{selected.guardEmpNo}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Tri-role acknowledgement</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['OM', 'SM', 'MD'] as RoleKey[]).map((role) => {
                    const isRead = selected.ack[role];
                    return (
                      <div
                        key={role}
                        className={`rounded-lg border p-2 text-center ${
                          isRead ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-200'
                        }`}
                      >
                        {isRead ? (
                          <Eye className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <Clock className="mx-auto h-4 w-4 text-slate-500" />
                        )}
                        <p className="mt-1 text-xs font-black text-slate-700">{role}</p>
                        <p className={`text-xs font-bold ${isRead ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {isRead ? 'Read' : 'Pending'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!selected.ack[CURRENT_ROLE] && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAcknowledge(selected.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-sm font-black uppercase tracking-wide text-stone-900 transition active:scale-[0.98] disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Acknowledge as SM
                </button>
              )}

              {selected.ack.OM && selected.ack.SM && selected.ack.MD && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-600">All roles confirmed</p>
                </div>
              )}

              {!selected.ack[CURRENT_ROLE] ? null : !selected.ack.OM || !selected.ack.MD ? (
                <p className="text-center text-sm font-bold text-slate-500">
                  Awaiting remaining role acknowledgements
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/* ─── Dashboard stat tiles ─── */

export default function DashboardStatsClient({
  todayVisits,
  openIncidents,
  sitesToVisit,
  isDemo,
}: {
  todayVisits: number;
  openIncidents: number;
  sitesToVisit: number;
  isDemo: boolean;
}) {
  const [modal, setModal] = useState<'visits' | 'incidents' | null>(null);
  const [incidentCount, setIncidentCount] = useState(openIncidents);
  const [incidents, setIncidents] = useState<SmFieldIncident[]>([]);
  const [incidentsLoaded, setIncidentsLoaded] = useState(false);

  const openIncidentsModal = async () => {
    if (!incidentsLoaded) {
      const data = await getIncidentsAction();
      setIncidents(data);
      setIncidentsLoaded(true);
      setIncidentCount(data.filter((i) => !i.ack.SM).length);
    }
    setModal('incidents');
  };

  const refreshPendingCount = async () => {
    const data = await getIncidentsAction();
    setIncidents(data);
    setIncidentCount(data.filter((i) => !i.ack.SM).length);
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setModal('visits')}
          className="bg-white/90 border border-slate-200 shadow-sm border-amber-500/20 rounded-2xl p-3 text-center transition-all active:scale-95 hover:border-amber-500/40"
        >
          <p className="text-3xl font-black tabular-nums text-amber-600">{todayVisits}</p>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">Visits Today</p>
        </button>
        <button
          type="button"
          onClick={openIncidentsModal}
          className={`bg-white/90 border border-slate-200 shadow-sm rounded-2xl p-3 text-center transition-all active:scale-95 hover:border-red-500/30 ${
            incidentCount > 0 ? 'border-red-500/20' : 'border-slate-200/40'
          }`}
        >
          <p className={`text-3xl font-black tabular-nums ${incidentCount > 0 ? 'text-red-600' : 'text-slate-600'}`}>
            {incidentCount}
          </p>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">Open Incidents</p>
        </button>
        <Link
          href="/sites-to-visit"
          className={`bg-white/90 border border-slate-200 shadow-sm rounded-2xl p-3 text-center transition-all active:scale-95 ${sitesToVisit > 0 ? 'border-sky-500/30 hover:border-sky-500/50' : ''}`}
        >
          <p className={`text-3xl font-black tabular-nums ${sitesToVisit > 0 ? 'text-sky-600' : 'text-slate-600'}`}>{sitesToVisit}</p>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">Sites to Visit</p>
        </Link>
      </div>

      {modal === 'visits' && <VisitsTodayModal onClose={() => setModal(null)} />}
      {modal === 'incidents' && (
        <IncidentCommandQueueModal
          initialIncidents={incidents}
          isDemo={isDemo}
          onClose={() => setModal(null)}
          onAcknowledged={refreshPendingCount}
        />
      )}
    </>
  );
}
