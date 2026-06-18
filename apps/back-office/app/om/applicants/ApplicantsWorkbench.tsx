'use client';

import { useMemo, useState } from 'react';
import {
  ClipboardList,
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
  Scale,
  Ruler,
} from 'lucide-react';

import {
  OfficeCopyWatermarkOverlay,
} from '../../../lib/identity-document-watermark-client';
import {
  getGuardJobApplicants,
  updateGuardJobApplicantStatus,
  type GuardJobApplicantRecord,
  type GuardJobApplicantStatus,
} from './actions';

const STATUS_OPTIONS: { value: GuardJobApplicantStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_STYLES: Record<GuardJobApplicantStatus, string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  reviewed: 'bg-sky-50 text-sky-800 border-sky-200',
  contacted: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  hired: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return value;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DocThumb({
  label,
  url,
  watermark = false,
}: {
  label: string;
  url: string;
  watermark?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-28 w-full object-cover transition group-hover:opacity-90" />
      {watermark ? <OfficeCopyWatermarkOverlay /> : null}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        <span>{label}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </div>
    </a>
  );
}

function ApplicantCard({
  applicant,
  onUpdated,
}: {
  applicant: GuardJobApplicantRecord;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState(applicant.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = async (next: GuardJobApplicantStatus) => {
    setStatus(next);
    setError(null);
    setBusy(true);
    const result = await updateGuardJobApplicantStatus({
      applicationId: applicant.id,
      status: next,
    });
    setBusy(false);
    if (!result.success) {
      setStatus(applicant.status);
      setError(result.error ?? 'Could not update status.');
      return;
    }
    onUpdated();
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
            {applicant.siteLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(applicant.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Phone className="h-4 w-4 text-slate-400" />
          <div>
            <p className="font-semibold">{formatPhone(applicant.phonePrimary)}</p>
            {applicant.phoneSecondary ? (
              <p className="text-xs text-slate-500">{formatPhone(applicant.phoneSecondary)}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-slate-400" />
            {applicant.weightKg} kg
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Ruler className="h-4 w-4 text-slate-400" />
            {applicant.heightFt} ft
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DocThumb label="ID front" url={applicant.idDocFrontUrl} watermark />
        {applicant.idDocBackUrl ? (
          <DocThumb label="ID back" url={applicant.idDocBackUrl} watermark />
        ) : null}
        <DocThumb label="Servicemen cert" url={applicant.servicemenCertUrl} />
        <DocThumb label="Selfie" url={applicant.selfieUrl} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={busy || status === option.value}
            onClick={() => void handleStatusChange(option.value)}
            className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
              status === option.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}

export default function ApplicantsWorkbench({
  initialApplicants,
}: {
  initialApplicants: GuardJobApplicantRecord[];
}) {
  const [applicants, setApplicants] = useState(initialApplicants);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newCount = useMemo(
    () => applicants.filter((row) => row.status === 'new').length,
    [applicants],
  );

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    const result = await getGuardJobApplicants();
    setRefreshing(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setApplicants(result.applicants);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            New applications
          </p>
          <p className="mt-1 text-3xl font-black text-indigo-900">{newCount}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      {applicants.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-lg font-black uppercase tracking-wide text-slate-700">
            No applicants yet
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Careers applications from the public security website will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {applicants.map((applicant) => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              onUpdated={() => void refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
