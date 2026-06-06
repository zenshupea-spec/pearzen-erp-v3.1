'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  getGuardVerificationUnclearedDates,
  getPendingVerificationQueue,
  getShiftVerificationMarkedDates,
  getSmVisitMarkedDates,
  getSmVisitUnclearedDates,
  getSmVisitVerificationQueue,
  type ShiftVerificationRecord,
  type SmVisitVerificationRecord,
} from './actions';
import VerificationQueue from './VerificationQueue';
import SmVerificationQueue from './SmVerificationQueue';
import VerificationDatePicker from './VerificationDatePicker';
import GuardHoldPanel from './GuardHoldPanel';
import GuardArchivePanel from './GuardArchivePanel';
import SmHoldPanel from './SmHoldPanel';
import SmArchivePanel from './SmArchivePanel';
import {
  isOnHold,
  isPhotoVerificationQueue,
  VERIFICATION_PHOTO_RETENTION_DAYS,
} from './shift-verification-utils';

type Workspace = 'review' | 'on_hold' | 'approved' | 'rejected';
type VerificationMode = 'guards' | 'sector_managers';

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const WORKSPACE_NAV: {
  id: Workspace;
  label: string;
  short: string;
  icon: typeof Camera;
}[] = [
  { id: 'review', label: 'Active verification', short: 'Review', icon: Camera },
  { id: 'on_hold', label: 'On hold', short: 'Hold', icon: PauseCircle },
  { id: 'approved', label: 'Approved archive', short: 'Approved', icon: CheckCircle2 },
  { id: 'rejected', label: 'Rejected archive', short: 'Rejected', icon: XCircle },
];

function ModeToggle({
  mode,
  onChange,
}: {
  mode: VerificationMode;
  onChange: (mode: VerificationMode) => void;
}) {
  return (
    <div className="inline-flex w-full max-w-full flex-wrap rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner sm:w-auto sm:flex-nowrap">
      <button
        type="button"
        onClick={() => onChange('guards')}
        className={`flex-1 rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:flex-none sm:px-4 sm:text-[10px] ${
          mode === 'guards'
            ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        Guards
      </button>
      <button
        type="button"
        onClick={() => onChange('sector_managers')}
        className={`flex-1 rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:flex-none sm:px-4 sm:text-[10px] ${
          mode === 'sector_managers'
            ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        Sector managers
      </button>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'indigo' | 'amber';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-800',
    indigo: 'bg-indigo-50 text-indigo-900',
    amber: 'bg-amber-50 text-amber-900',
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 ${tones[tone]} flex-1 min-w-[calc(50%-0.25rem)] sm:min-w-0`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

export default function ShiftVerificationTab() {
  const [mode, setMode] = useState<VerificationMode>('guards');
  const [workspace, setWorkspace] = useState<Workspace>('review');
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(`${todayDateStr()}T00:00:00Z`),
  );
  const [shifts, setShifts] = useState<ShiftVerificationRecord[]>([]);
  const [visits, setVisits] = useState<SmVisitVerificationRecord[]>([]);
  const [approvedMarked, setApprovedMarked] = useState<Set<string>>(new Set());
  const [rejectedMarked, setRejectedMarked] = useState<Set<string>>(new Set());
  const [smApprovedMarked, setSmApprovedMarked] = useState<Set<string>>(new Set());
  const [guardUnclearedDates, setGuardUnclearedDates] = useState<Set<string>>(new Set());
  const [smUnclearedDates, setSmUnclearedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailShift, setDetailShift] = useState<ShiftVerificationRecord | null>(null);
  const [revertingKey, setRevertingKey] = useState<string | null>(null);

  const dateStr = selectedDate.toISOString().slice(0, 10);
  const isGuards = mode === 'guards';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [guardData, smData] = await Promise.all([
        getPendingVerificationQueue(dateStr),
        getSmVisitVerificationQueue(dateStr),
      ]);
      setShifts(guardData);
      setVisits(smData);
    } catch {
      setError('Failed to load verification data.');
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  const loadUnclearedMarks = useCallback(async () => {
    if (isGuards) {
      const dates = await getGuardVerificationUnclearedDates(VERIFICATION_PHOTO_RETENTION_DAYS);
      setGuardUnclearedDates(new Set(dates));
    } else {
      const dates = await getSmVisitUnclearedDates(VERIFICATION_PHOTO_RETENTION_DAYS);
      setSmUnclearedDates(new Set(dates));
    }
  }, [isGuards]);

  const refreshVerification = useCallback(async () => {
    await Promise.all([load(), loadUnclearedMarks()]);
  }, [load, loadUnclearedMarks]);

  const loadArchiveMarks = useCallback(async () => {
    if (isGuards) {
      const [approved, rejected] = await Promise.all([
        getShiftVerificationMarkedDates(['APPROVED']),
        getShiftVerificationMarkedDates(['REJECTED']),
      ]);
      setApprovedMarked(new Set(approved));
      setRejectedMarked(new Set(rejected));
    } else {
      const approved = await getSmVisitMarkedDates(['APPROVED']);
      setSmApprovedMarked(new Set(approved));
    }
  }, [isGuards]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadUnclearedMarks();
  }, [loadUnclearedMarks, mode]);

  const approvedVisits = useMemo(
    () => visits.filter((v) => v.verificationStatus === 'APPROVED'),
    [visits],
  );

  useEffect(() => {
    if (workspace === 'approved' || workspace === 'rejected') {
      loadArchiveMarks();
    }
  }, [mode, workspace, loadArchiveMarks]);

  useEffect(() => {
    setWorkspace('review');
  }, [mode]);

  useEffect(() => {
    setDetailShift(null);
  }, [mode, dateStr, workspace]);

  const photoQueueShifts = useMemo(() => shifts.filter(isPhotoVerificationQueue), [shifts]);
  const onHoldShifts = useMemo(() => shifts.filter(isOnHold), [shifts]);
  const approvedShifts = useMemo(
    () => shifts.filter((s) => s.aggregateStatus === 'APPROVED'),
    [shifts],
  );
  const rejectedShifts = useMemo(
    () => shifts.filter((s) => s.aggregateStatus === 'REJECTED'),
    [shifts],
  );

  const pendingVisits = useMemo(
    () => visits.filter((v) => v.verificationStatus === 'PENDING' && v.photoUrl),
    [visits],
  );
  const smOnHold = useMemo(
    () => visits.filter((v) => !v.photoUrl || v.verificationStatus === 'FLAGGED'),
    [visits],
  );

  const archiveMarked = isGuards
    ? workspace === 'approved'
      ? approvedMarked
      : rejectedMarked
    : smApprovedMarked;

  const navCounts = isGuards
    ? {
        review: photoQueueShifts.length,
        on_hold: onHoldShifts.length,
        approved: approvedShifts.length,
        rejected: rejectedShifts.length,
      }
    : {
        review: pendingVisits.length,
        on_hold: smOnHold.length,
        approved: approvedVisits.length,
        rejected: 0,
      };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 md:px-8">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900 md:text-xl">
                  {isGuards ? 'Guard shift verification' : 'SM visit verification'}
                </h2>
                <p className="text-xs text-slate-500">
                  {isGuards
                    ? '3-point visual review · payroll release control'
                    : 'Sector manager site visit selfies'}
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              {isGuards ? (
                <>
                  Only shifts in <strong className="text-slate-900">Active verification</strong>{' '}
                  appear in the grid. On-hold items stay off payroll. Rejected shifts are blocked
                  until you revert them. Field photos auto-purge after{' '}
                  <strong className="text-slate-900">
                    {VERIFICATION_PHOTO_RETENTION_DAYS} days
                  </strong>
                  .
                </>
              ) : (
                'Compare visit selfies against HR master photos. Approve to clear from the queue.'
              )}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <ModeToggle mode={mode} onChange={setMode} />
            <button
              type="button"
              onClick={() => {
                refreshVerification();
                if (workspace === 'approved' || workspace === 'rejected') {
                  loadArchiveMarks();
                }
              }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm sm:flex sm:flex-wrap">
        {WORKSPACE_NAV.map(({ id, label, short, icon: Icon }) => {
          const active = workspace === id;
          const count = navCounts[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setWorkspace(id)}
              className={`flex min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-left transition-all sm:flex-1 sm:min-w-[120px] sm:px-4 ${
                active
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-100' : 'text-slate-400'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-widest">
                  {short}
                </span>
                <span className={`block truncate text-xs ${active ? 'text-indigo-100' : 'text-slate-500'}`}>
                  {label}
                </span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Toolbar: date + metrics */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {workspace === 'review' && (
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <VerificationDatePicker
              label={isGuards ? 'Shift date' : 'Visit date'}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              unclearedDates={isGuards ? guardUnclearedDates : smUnclearedDates}
              lookbackDays={VERIFICATION_PHOTO_RETENTION_DAYS}
            />
            <p className="mt-1.5 text-[9px] font-semibold text-rose-600/90">
              Red dates still have items in the verification queue
            </p>
          </div>
        )}

        {workspace === 'review' && !loading && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <MetricPill
              label="In grid"
              value={isGuards ? photoQueueShifts.length : pendingVisits.length}
              tone="indigo"
            />
            <MetricPill
              label="On hold"
              value={isGuards ? onHoldShifts.length : smOnHold.length}
              tone="amber"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 shadow-sm">
          <RefreshCw className="h-9 w-9 animate-spin text-indigo-500" />
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">
            Loading…
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : isGuards ? (
        <>
          {workspace === 'review' && (
            <div
              id="verification-queue"
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">3-point visual verification</p>
                  <p className="text-xs text-slate-500">
                    MNR · check-in · check-out — {formatShiftDate(dateStr)}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-800">
                  {photoQueueShifts.length} ready
                </span>
              </div>
              <VerificationQueue
                shifts={photoQueueShifts}
                onRefresh={refreshVerification}
                selectedShift={detailShift}
                onSelectedShiftChange={setDetailShift}
              />
            </div>
          )}

          {workspace === 'on_hold' && (
            <GuardHoldPanel shifts={onHoldShifts} onRefresh={refreshVerification} />
          )}

          {(workspace === 'approved' || workspace === 'rejected') && (
            <GuardArchivePanel
              mode={workspace}
              shifts={workspace === 'approved' ? approvedShifts : rejectedShifts}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              markedDates={archiveMarked}
              onSelectShift={setDetailShift}
              onRefresh={refreshVerification}
              revertingKey={revertingKey}
              onRevertingKeyChange={setRevertingKey}
            />
          )}

          {detailShift && workspace !== 'review' && (
            <VerificationQueue
              shifts={[]}
              hideList
              onRefresh={refreshVerification}
              selectedShift={detailShift}
              onSelectedShiftChange={setDetailShift}
              readOnly={workspace === 'approved'}
              allowRevert={workspace === 'rejected'}
            />
          )}
        </>
      ) : (
        <>
          {workspace === 'review' && (
            <div
              id="verification-queue"
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">2-point visual verification</p>
                  <p className="text-xs text-slate-500">
                    MNR · visit selfie — {formatShiftDate(dateStr)}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-800">
                  {pendingVisits.length} ready
                </span>
              </div>
              <SmVerificationQueue visits={pendingVisits} onRefresh={refreshVerification} />
            </div>
          )}

          {workspace === 'on_hold' && <SmHoldPanel visits={smOnHold} onRefresh={refreshVerification} />}

          {(workspace === 'approved' || workspace === 'rejected') && (
            <SmArchivePanel
              mode={workspace}
              visits={approvedVisits}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              markedDates={archiveMarked}
            />
          )}
        </>
      )}
    </div>
  );
}
