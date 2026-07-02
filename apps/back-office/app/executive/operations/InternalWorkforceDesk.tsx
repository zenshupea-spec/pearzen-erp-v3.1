'use client';

import type { ElementType } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Coffee, BookOpen, UserPlus } from 'lucide-react';
import { withHubEntry } from '../../../lib/hq-hub';
import {
  getInternalWorkforceSummary,
  type InternalWorkforceSummary,
} from './workforce-summary-actions';
import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';

type WorkforceKpiProps = {
  icon: ElementType;
  label: string;
  value: string | number;
  sub: string;
  accent: 'indigo' | 'orange' | 'emerald';
  hint: string;
  onClick: () => void;
};

function WorkforceKpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  hint,
  onClick,
}: WorkforceKpiProps) {
  const colors = {
    indigo: {
      bar: 'bg-indigo-500',
      iconBg: 'border-indigo-200/70 bg-indigo-50/70',
      iconFg: 'text-indigo-700',
      val: 'text-indigo-900',
      hover: 'hover:border-indigo-300 hover:shadow-[0_16px_40px_-18px_rgba(99,102,241,0.22)]',
    },
    orange: {
      bar: 'bg-orange-500',
      iconBg: 'border-orange-200/70 bg-orange-50/70',
      iconFg: 'text-orange-700',
      val: 'text-orange-900',
      hover: 'hover:border-orange-300 hover:shadow-[0_16px_40px_-18px_rgba(249,115,22,0.22)]',
    },
    emerald: {
      bar: 'bg-emerald-500',
      iconBg: 'border-emerald-200/70 bg-emerald-50/70',
      iconFg: 'text-emerald-700',
      val: 'text-emerald-900',
      hover: 'hover:border-emerald-300 hover:shadow-[0_16px_40px_-18px_rgba(16,185,129,0.22)]',
    },
  };
  const c = colors[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-left shadow-sm backdrop-blur-xl transition-all cursor-pointer ${c.hover} active:scale-[0.985]`}
    >
      <span className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${c.bar}`} />
      <div className="flex items-start gap-4 pl-3">
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${c.iconBg}`}
        >
          <Icon className={`h-5 w-5 ${c.iconFg}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className={`mt-1.5 text-3xl font-black tabular-nums leading-none tracking-tight ${c.val}`}>
            {value}
          </p>
          <p className="mt-2 text-xs font-medium leading-snug text-slate-500">{sub}</p>
          <p className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">
            {hint}
          </p>
        </div>
      </div>
    </button>
  );
}

function rosterPreview(names: string[]): string {
  if (names.length === 0) return 'No active records yet';
  const preview = names.slice(0, 3).join(', ');
  if (names.length <= 3) return preview;
  return `${preview} +${names.length - 3} more`;
}

type InternalWorkforceDeskProps = {
  fromHub?: boolean;
};

export default function InternalWorkforceDesk({ fromHub = false }: InternalWorkforceDeskProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InternalWorkforceSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const payload = await getInternalWorkforceSummary();
      if (cancelled) return;
      setSummary(payload);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = (path: string) => {
    router.push(fromHub ? withHubEntry(path) : path);
  };

  if (loading) {
    return <ExecutivePageLoading message="Loading internal workforce…" />;
  }

  const headOfficeCount = summary?.headOfficeCount ?? 0;
  const cafeCount = summary?.cafeCount ?? 0;
  const total = headOfficeCount + cafeCount;
  const syncedLabel = summary?.lastSynced
    ? new Date(summary.lastSynced).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const hoNames = (summary?.headOfficeStaff ?? []).map((row) => row.fullName);
  const cafeNames = (summary?.cafeStaff ?? []).map((row) => row.fullName);

  return (
    <div className="space-y-8">
      {summary?.error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {summary.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Internal workforce
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            Head Office &amp; café roster — guard field ops paused
          </p>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Synced {syncedLabel}
        </p>
      </div>

      {total === 0 && !summary?.error ? (
        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-16 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No Head Office or café staff yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Add active employees in MNR with group <strong>Head Office</strong> or{' '}
            <strong>Café</strong>, then return here for live counts.
          </p>
          <Link
            href={fromHub ? withHubEntry('/hr/onboarding') : '/hr/onboarding'}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-indigo-700 transition hover:bg-indigo-100"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Open onboarding
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <WorkforceKpi
            icon={Building2}
            label="Head Office Staff"
            value={headOfficeCount}
            sub={rosterPreview(hoNames)}
            accent="indigo"
            hint="Manage in MNR"
            onClick={() => navigate('/hr/mnr?group=HEAD_OFFICE')}
          />
          <WorkforceKpi
            icon={Coffee}
            label="Café Staff"
            value={cafeCount}
            sub={rosterPreview(cafeNames)}
            accent="orange"
            hint="Manage in MNR"
            onClick={() => navigate('/hr/mnr?group=CAFE')}
          />
          <WorkforceKpi
            icon={BookOpen}
            label="Café Backoffice"
            value="Open"
            sub="Roster, float, inventory & daily ops"
            accent="emerald"
            hint="Open café auditor"
            onClick={() => navigate('/executive/cafe')}
          />
        </div>
      )}
    </div>
  );
}
