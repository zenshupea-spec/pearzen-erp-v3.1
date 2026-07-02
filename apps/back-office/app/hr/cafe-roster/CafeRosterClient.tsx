'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';

import CafeCheckinVerificationPanel from './CafeCheckinVerificationPanel';
import {
  getCafeRosterDeskData,
  reviewCafeLeaveRequest,
  saveCafeRosterShifts,
  type CafeRosterDeskData,
} from './actions';
import { formatCafeShiftWindowLabel } from '../../../lib/cafe-shift-hours';
import {
  cafeShiftShortLabel,
  rosterCellKey,
  type CafeShiftType,
} from './utils';

function formatDayHeader(date: string): { weekday: string; label: string; isToday: boolean } {
  const parsed = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return {
    weekday: parsed.toLocaleDateString('en-LK', { weekday: 'short' }),
    label: parsed.toLocaleDateString('en-LK', { day: 'numeric', month: 'short' }),
    isToday: parsed.getTime() === today.getTime(),
  };
}

function collectDraftChanges(
  savedByKey: Record<string, CafeShiftType>,
  draftByKey: Record<string, CafeShiftType>,
  staff: CafeRosterDeskData['staff'],
  days: string[],
) {
  const changes: Array<{
    employeeId: string;
    date: string;
    shiftType: CafeShiftType | null;
  }> = [];

  for (const member of staff) {
    for (const date of days) {
      const key = rosterCellKey(member.id, date);
      const savedShift = savedByKey[key] ?? null;
      const draftShift = draftByKey[key] ?? null;
      if (savedShift !== draftShift) {
        changes.push({
          employeeId: member.id,
          date,
          shiftType: draftShift,
        });
      }
    }
  }

  return changes;
}

export default function CafeRosterClient({ initialData }: { initialData: CafeRosterDeskData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [savedByKey, setSavedByKey] = useState(initialData.scheduledByKey);
  const [draftByKey, setDraftByKey] = useState(initialData.scheduledByKey);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const selectedSite = data.sites.find((site) => site.id === data.selectedSiteId) ?? null;

  const pendingChanges = useMemo(
    () => collectDraftChanges(savedByKey, draftByKey, data.staff, data.days),
    [savedByKey, draftByKey, data.staff, data.days],
  );
  const isDirty = pendingChanges.length > 0;

  const syncRosterState = (next: CafeRosterDeskData) => {
    setData(next);
    setSavedByKey(next.scheduledByKey);
    setDraftByKey(next.scheduledByKey);
  };

  const reload = (siteProfileId: string | null) => {
    startTransition(async () => {
      try {
        const next = await getCafeRosterDeskData({ siteProfileId });
        syncRosterState(next);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to refresh café roster.',
        );
      }
    });
  };

  const navigate = (siteProfileId: string | null) => {
    const params = new URLSearchParams();
    if (siteProfileId) params.set('site', siteProfileId);
    const query = params.toString();
    router.replace(query ? `/hr/cafe-roster?${query}` : '/hr/cafe-roster');
    reload(siteProfileId);
  };

  const handleSiteChange = (siteId: string) => {
    if (isDirty && !window.confirm('Discard unsaved roster changes and switch branch?')) {
      return;
    }
    setActionError(null);
    setSaveMessage(null);
    navigate(siteId);
  };

  const handleReviewLeave = (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!data.selectedSiteId) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await reviewCafeLeaveRequest({
          requestId,
          decision,
          siteProfileId: data.selectedSiteId!,
        });
        if (!result.ok) {
          setActionError(result.error ?? 'Failed to review leave.');
          return;
        }
        reload(data.selectedSiteId);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to review leave.');
      }
    });
  };

  const handleDraftShift = (
    employeeId: string,
    date: string,
    shiftType: CafeShiftType | null,
  ) => {
    if (!data.selectedSiteId || isSaving) return;
    setActionError(null);
    setSaveMessage(null);
    const cellKey = rosterCellKey(employeeId, date);
    setDraftByKey((prev) => {
      const next = { ...prev };
      if (shiftType) next[cellKey] = shiftType;
      else delete next[cellKey];
      return next;
    });
  };

  const handleDiscard = () => {
    setDraftByKey(savedByKey);
    setActionError(null);
    setSaveMessage(null);
  };

  const handleSave = () => {
    if (!data.selectedSiteId || !isDirty) return;
    setActionError(null);
    setSaveMessage(null);
    startSaveTransition(async () => {
      try {
        const result = await saveCafeRosterShifts({
          siteProfileId: data.selectedSiteId!,
          changes: pendingChanges,
        });
        if (!result.ok) {
          setActionError(result.error ?? 'Failed to save roster.');
          return;
        }
        setSavedByKey(draftByKey);
        setSaveMessage(
          `Saved ${pendingChanges.length} shift change${pendingChanges.length === 1 ? '' : 's'}.`,
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to save roster.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800">
          {actionError}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
          {saveMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="cafe-branch-select" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Café branch
          </label>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-orange-500" />
            <select
              id="cafe-branch-select"
              value={data.selectedSiteId ?? ''}
              onChange={(event) => handleSiteChange(event.target.value)}
              disabled={!data.sites.length || isPending || isSaving}
              className="min-w-[16rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
            >
              {data.sites.length === 0 ? (
                <option value="">No café branches configured</option>
              ) : (
                data.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))
              )}
            </select>
          </div>
          {selectedSite ? (
            <p className="text-xs font-semibold text-slate-500">
              Edit AM / PM / Off below, then Save. Staff assignments come from HR → MNR.
            </p>
          ) : null}
        </div>

        {data.selectedSiteId && data.staff.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 pt-5">
            {isDirty ? (
              <span className="hidden text-[10px] font-bold uppercase tracking-widest text-amber-700 sm:inline">
                {pendingChanges.length} unsaved
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!isDirty || isSaving || isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving || isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save roster
            </button>
          </div>
        ) : null}
      </div>

      <CafeCheckinVerificationPanel initialRows={data.pendingCheckinVerifications} />

      {data.pendingLeaves.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
          <div className="border-b border-amber-200/80 px-5 py-3">
            <h2 className="text-sm font-black uppercase tracking-tight text-amber-900">
              Pending leave requests
            </h2>
            <p className="mt-1 text-xs font-semibold text-amber-800">
              Submitted from Café Front — approve or reject before editing those days.
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {data.pendingLeaves.map((leave) => (
              <div
                key={leave.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-white/70 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {leave.employeeName}{' '}
                    <span className="font-mono text-xs text-slate-500">· {leave.leaveDate}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{leave.reason || 'No reason given'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending || isSaving}
                    onClick={() => handleReviewLeave(leave.id, 'APPROVED')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isPending || isSaving}
                    onClick={() => handleReviewLeave(leave.id, 'REJECTED')}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!data.selectedSiteId ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-black uppercase tracking-tight text-slate-700">
            No café branches yet
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold text-slate-500">
            Add café branches with GPS in MD Settings → Operations, then assign café staff to a branch in HR → MNR before building the roster here.
          </p>
        </div>
      ) : data.staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-black uppercase tracking-tight text-slate-700">
            No staff assigned
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold text-slate-500">
            Assign café employees to {selectedSite?.label ?? 'this branch'} in HR → MNR
            (Café Branch field) before scheduling shifts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                <th className="sticky left-0 z-10 min-w-[12rem] border-r border-slate-200 bg-slate-50/95 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Employee
                </th>
                {data.days.map((date) => {
                  const header = formatDayHeader(date);
                  return (
                    <th
                      key={date}
                      className={`min-w-[5.25rem] px-1.5 py-3 text-center text-[10px] font-black uppercase tracking-wider ${
                        header.isToday ? 'bg-orange-50 text-orange-800' : 'text-slate-500'
                      }`}
                    >
                      <div>{header.weekday}</div>
                      <div className={header.isToday ? 'text-orange-700' : 'text-slate-700'}>
                        {header.label}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((member) => (
                <tr key={member.id} className="border-b border-slate-100 last:border-0">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                    <div className="font-bold text-slate-900">{member.fullName}</div>
                    <div className="font-mono text-[10px] font-semibold uppercase text-slate-400">
                      {member.epf}
                    </div>
                  </td>
                  {data.days.map((date) => {
                    const key = rosterCellKey(member.id, date);
                    const leave = data.leaveByKey[key];
                    const shiftType = draftByKey[key] ?? null;
                    const savedShift = savedByKey[key] ?? null;
                    const isChanged = shiftType !== savedShift;
                    const header = formatDayHeader(date);
                    const leaveBlocked =
                      leave?.status === 'PENDING' || leave?.status === 'APPROVED';
                    const cellDisabled = isSaving || leaveBlocked;

                    const shiftButtonClass = (target: CafeShiftType | 'OFF') => {
                      const base =
                        'flex h-7 w-full shrink-0 items-center justify-center rounded px-0.5 text-[9px] font-black uppercase leading-none tracking-wide transition-colors disabled:cursor-not-allowed';
                      if (cellDisabled) {
                        if (leave?.status === 'PENDING') {
                          return `${base} bg-amber-50 text-amber-800 border border-amber-200`;
                        }
                        if (leave?.status === 'APPROVED') {
                          return `${base} bg-rose-50 text-rose-800 border border-rose-200`;
                        }
                        return `${base} opacity-50 bg-slate-50 text-slate-400`;
                      }
                      if (target === 'OFF') {
                        return shiftType
                          ? `${base} bg-slate-50/80 text-slate-400 border border-transparent hover:bg-slate-100 hover:text-slate-600`
                          : `${base} bg-slate-100 text-slate-700 border border-slate-300 ring-1 ring-slate-200`;
                      }
                      if (target === 'MORNING') {
                        return shiftType === 'MORNING'
                          ? `${base} bg-sky-100 text-sky-900 border border-sky-300 ring-1 ring-sky-200`
                          : `${base} bg-sky-50/70 text-sky-700 border border-sky-100 hover:bg-sky-100`;
                      }
                      return shiftType === 'EVENING'
                        ? `${base} bg-violet-100 text-violet-900 border border-violet-300 ring-1 ring-violet-200`
                        : `${base} bg-violet-50/70 text-violet-700 border border-violet-100 hover:bg-violet-100`;
                    };

                    if (leaveBlocked) {
                      return (
                        <td key={key} className="p-1 align-top">
                          <div
                            className={`mx-auto flex h-[5.375rem] w-full min-w-[5.25rem] flex-col items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              leave?.status === 'PENDING'
                                ? 'border border-amber-200 bg-amber-50 text-amber-800'
                                : 'border border-rose-200 bg-rose-50 text-rose-800'
                            } ${header.isToday ? 'ring-1 ring-orange-200' : ''}`}
                            title={leave?.reason || undefined}
                          >
                            {leave?.status === 'PENDING' ? 'Pending' : 'Leave'}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={key} className="p-1 align-top">
                        <div
                          className={`mx-auto flex w-full min-w-[5.25rem] flex-col gap-px rounded-lg p-px ${
                            header.isToday ? 'bg-orange-50/40 ring-1 ring-orange-200' : ''
                          } ${isChanged ? 'ring-1 ring-amber-300' : ''}`}
                        >
                          <button
                            type="button"
                            disabled={cellDisabled}
                            title={`Morning · ${formatCafeShiftWindowLabel('MORNING', data.shiftWindows)}`}
                            onClick={() => handleDraftShift(member.id, date, 'MORNING')}
                            className={shiftButtonClass('MORNING')}
                          >
                            {cafeShiftShortLabel('MORNING')}
                          </button>
                          <button
                            type="button"
                            disabled={cellDisabled}
                            title={`Evening · ${formatCafeShiftWindowLabel('EVENING', data.shiftWindows)}`}
                            onClick={() => handleDraftShift(member.id, date, 'EVENING')}
                            className={shiftButtonClass('EVENING')}
                          >
                            {cafeShiftShortLabel('EVENING')}
                          </button>
                          <button
                            type="button"
                            disabled={cellDisabled}
                            title="Off — not scheduled"
                            onClick={() => handleDraftShift(member.id, date, null)}
                            className={shiftButtonClass('OFF')}
                          >
                            Off
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isPending ? (
        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing roster…
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
          Morning (AM) · {formatCafeShiftWindowLabel('MORNING', data.shiftWindows)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
          Evening (PM) · {formatCafeShiftWindowLabel('EVENING', data.shiftWindows)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
          Off
        </span>
        <span className="text-[9px] font-semibold normal-case tracking-normal text-slate-400">
          Edit shifts locally, then Save roster · Check-in {data.cafeOpenStart}–{data.cafeOpenEnd} · portal +1h after close (MD settings)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
          Unsaved change
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
          Pending leave
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
          Approved leave
        </span>
      </div>
    </div>
  );
}
