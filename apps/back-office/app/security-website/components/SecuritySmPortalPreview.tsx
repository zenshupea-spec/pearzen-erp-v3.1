'use client';

import { AlertTriangle, CalendarCheck, Gavel, MapPin, Users } from 'lucide-react';

import SecurityPortalDemoShell from './SecurityPortalDemoShell';

function DemoButton({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className={`w-full cursor-default text-left opacity-95 ${className}`}
    >
      {children}
    </button>
  );
}

type Props = {
  size?: 'compact' | 'fill';
  showDemoLabel?: boolean;
};

export default function SecuritySmPortalPreview({
  size = 'compact',
  showDemoLabel = true,
}: Props) {
  return (
    <SecurityPortalDemoShell size={size} showLabel={showDemoLabel}>
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-amber-700/80">
          Good morning
        </p>
        <p className="mt-1 text-lg font-black uppercase tracking-tight text-slate-900">Kamal</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">SM-118</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
            Active
          </span>
        </div>
      </div>

      <div className="space-y-3 bg-slate-50 p-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Visits', value: '4' },
            { label: 'Sites left', value: '2' },
            { label: 'Incidents', value: '0' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-2 text-center"
            >
              <p className="text-lg font-black text-slate-900">{stat.value}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <DemoButton className="flex flex-col items-center gap-2 py-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-500/40 bg-amber-500/10 text-amber-600">
            <MapPin className="h-7 w-7" />
          </span>
          <span className="text-[11px] font-black uppercase text-slate-900">Log visit</span>
          <span className="text-[10px] text-slate-500">GPS-verified site audit</span>
        </DemoButton>

        <DemoButton className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Users className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[11px] font-black uppercase text-slate-900">
              Guard attendance
            </span>
            <span className="text-[10px] text-slate-500">Assign guards to shift</span>
          </span>
        </DemoButton>

        <div className="grid grid-cols-2 gap-2">
          <DemoButton className="rounded-2xl border border-slate-200 bg-white p-3">
            <CalendarCheck className="h-5 w-5 text-violet-600" />
            <p className="mt-2 text-[10px] font-black uppercase text-slate-900">Confirm shift</p>
          </DemoButton>
          <DemoButton className="rounded-2xl border border-slate-200 bg-white p-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="mt-2 text-[10px] font-black uppercase text-slate-900">Incidents</p>
          </DemoButton>
          <DemoButton className="col-span-2 rounded-2xl border border-slate-200 bg-white p-3">
            <Gavel className="inline h-4 w-4 text-slate-600" />
            <span className="ml-2 text-[10px] font-black uppercase text-slate-900">
              Penalty &amp; discipline
            </span>
          </DemoButton>
        </div>
      </div>
    </SecurityPortalDemoShell>
  );
}
