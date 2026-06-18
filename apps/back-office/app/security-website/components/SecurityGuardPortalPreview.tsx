'use client';

import Image from 'next/image';
import { AlertTriangle, CalendarDays, MapPin, Shield } from 'lucide-react';

import SecurityPortalDemoShell from './SecurityPortalDemoShell';
import { useSecurityWebsite } from './SecurityWebsiteContext';

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

export default function SecurityGuardPortalPreview({
  size = 'compact',
  showDemoLabel = true,
}: Props) {
  const { content } = useSecurityWebsite();
  const logoUrl = content.logoUrl;

  return (
    <SecurityPortalDemoShell size={size} showLabel={showDemoLabel}>
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg ${
              logoUrl ? 'border border-slate-200 bg-white' : 'bg-slate-900 text-white'
            }`}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={28}
                height={28}
                className="h-full w-full object-contain p-0.5"
                unoptimized={
                  logoUrl.startsWith('data:') || logoUrl.includes('supabase')
                }
              />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
          </span>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
            Guard portal
          </p>
        </div>
        <p className="mt-2 text-base font-black uppercase tracking-tight text-slate-900">
          Nimal Perera
        </p>
        <p className="font-mono text-[10px] font-bold text-slate-500">EPF 442</p>
      </div>

      <div className="space-y-3 bg-slate-100 p-3">
        <div className="rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
            Today&apos;s earnings
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums">LKR 2,100</p>
          <p className="mt-1 text-[10px] text-slate-300">1 verified shift · on site now</p>
        </div>

        <DemoButton className="flex flex-col items-center gap-2 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 py-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg">
            <MapPin className="h-6 w-6" />
          </span>
          <span className="text-xs font-black uppercase tracking-wide text-emerald-900">
            GPS check-in
          </span>
          <span className="text-[10px] font-medium text-emerald-700">Within site geofence</span>
        </DemoButton>

        <DemoButton className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black uppercase text-slate-900">
              Report incident
            </span>
            <span className="text-[10px] text-slate-500">Voice note + severity</span>
          </span>
        </DemoButton>

        <DemoButton className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-800">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black uppercase text-slate-900">
              My roster
            </span>
            <span className="text-[10px] text-slate-500">Shifts &amp; site assignments</span>
          </span>
        </DemoButton>
      </div>
    </SecurityPortalDemoShell>
  );
}
