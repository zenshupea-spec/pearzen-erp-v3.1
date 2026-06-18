'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  X,
} from 'lucide-react';

import CafeCheckinVerificationPanel from './CafeCheckinVerificationPanel';
import {
  getCafeRosterDeskData,
  reviewCafeLeaveRequest,
  setCafeRosterShift,
  type CafeRosterDeskData,
} from './actions';
import { formatCafeShiftWindowLabel } from '../../../lib/cafe-shift-hours';
import {
  cafeShiftLabel,
  cafeShiftShortLabel,
  nextCafeShiftType,
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

export default function CafeRosterClient({ initialData }: { initialData: CafeRosterDeskData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [actionError, setActionError] = useState<string | null>(null);

  const scheduledByKey = data.scheduledByKey;
  const selectedSite = data.sites.find((site) => site.id === data.selectedSiteId) ?? null;

  const reload = (siteProfileId: string | null) => {
    startTransition(async () => {
      const next = await getCafeRosterDeskData({ siteProfileId });
      setData(next);
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
    setActionError(null);
    navigate(siteId);
  };

  const handleReviewLeave = (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!data.selectedSiteId) return;
    setActionError(null);
    startTransition(async () => {
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
    });
  };

  const handleCycleShift = (employeeId: string, date: string, currentShift: CafeShiftType | null) => {
    if (!data.selectedSiteId) return;
    setActionError(null);
    const nextShift = nextCafeShiftType(currentShift);
    startTransition(async () => {
      const result = await setCafeRosterShift({
        siteProfileId: data.selectedSiteId!,
        employeeId,
        date,
        shiftType: nextShift,
      });
      if (!result.ok) {
        setActionError(result.error ?? 'Failed to update roster.');
        return;
      }
      reload(data.selectedSiteId);
    });
  };

  return (
    <div className="space-y-6">
      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800">
          {actionError}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="cafe-branch-select" className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Café branch
        </label>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-orange-500" />
          <select
            id="cafe-branch-select"
            value={data.selectedSiteId ?? ''}
            onChange={(event) => handleSiteChange(event.target.value)}
            disabled={!data.sites.length || isPending}
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
            Staff roster follows site assignments set by MD / FM in Sites.
          </p>
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
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-white/70"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {leave.employeeName}{' '}
                    <span className="font-mono text-xs text-slate-500">· {leave.leaveDate}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{leave.reason || 'No reason given'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleReviewLeave(leave.id, 'APPROVED')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
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
            Assign café employees to {selectedSite?.label ?? 'this branch'} in Sites before
            scheduling shifts.
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
                      className={`min-w-[4.5rem] px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider ${
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
                    const shiftType = scheduledByKey[key] ?? null;
                    const header = formatDayHeader(date);

                    let cellClass =
                      'border border-transparent bg-slate-50/60 text-slate-400 hover:bg-slate-100';
                    let label = 'Off';
                    let disabled = isPending;

                    if (leave?.status === 'PENDING') {
                      cellClass = 'border-amber-200 bg-amber-50 text-amber-800';
                      label = 'Pending';
                      disabled = true;
                    } else if (leave?.status === 'APPROVED') {
                      cellClass = 'border-rose-200 bg-rose-50 text-rose-800';
                      label = 'Leave';
                      disabled = true;
                    } else if (shiftType === 'MORNING') {
                      cellClass =
                        'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100';
                      label = cafeShiftShortLabel(shiftType);
                    } else if (shiftType === 'EVENING') {
                      cellClass =
                        'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100';
                      label = cafeShiftShortLabel(shiftType);
                    }

                    const shiftTimeHint =
                      shiftType === 'MORNING'
                        ? formatCafeShiftWindowLabel('MORNING', data.shiftWindows)
                        : shiftType === 'EVENING'
                          ? formatCafeShiftWindowLabel('EVENING', data.shiftWindows)
                          : null;

                    return (
                      <td key={key} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          title={
                            leave?.status === 'PENDING'
                              ? leave.reason
                              : shiftType
                                ? `${shiftTimeHint ?? cafeShiftLabel(shiftType)} — click to change (${cafeShiftLabel(shiftType)} → ${nextCafeShiftType(shiftType) ? cafeShiftLabel(nextCafeShiftType(shiftType)!) : 'Off'})`
                                : 'Click to schedule morning shift'
                          }
                          onClick={() => handleCycleShift(member.id, date, shiftType)}
                          className={`mx-auto flex h-12 w-full min-w-[3.5rem] flex-col items-center justify-center rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${cellClass} ${
                            header.isToday ? 'ring-1 ring-orange-200' : ''
                          }`}
                        >
                          {label}
                        </button>
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
          Updating roster…
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
          Tap a cell to cycle: Off → Morning → Evening → Off · Check-in {data.cafeOpenStart}–{data.cafeOpenEnd} · portal +1h after close (MD settings)
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
