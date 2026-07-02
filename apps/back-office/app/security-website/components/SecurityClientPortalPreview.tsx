'use client';

import Image from 'next/image';
import { MapPin, Phone, ShieldCheck } from 'lucide-react';

import SecurityPortalDemoShell from './SecurityPortalDemoShell';
import { useSecurityWebsite } from './SecurityWebsiteContext';

const ACTIVITY = [
  {
    tone: 'green' as const,
    title: 'Main Gate — GPS verified check-in',
    detail: 'Guard EPF-442 · 10:42 AM · within geofence',
  },
  {
    tone: 'blue' as const,
    title: 'SM supervisor visit logged',
    detail: 'Site audit · GPS verified · 09:15 AM',
  },
  {
    tone: 'amber' as const,
    title: 'Perimeter patrol completed',
    detail: 'Sector 4 checkpoint · route compliant',
  },
];

const TONE_DOT: Record<(typeof ACTIVITY)[number]['tone'], string> = {
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  amber: 'bg-amber-500',
};

type Props = {
  showDemoLabel?: boolean;
  size?: 'compact' | 'fill';
};

function ClientPortalContent({ logoUrl }: { logoUrl: string | null }) {
  return (
    <>
      <div className="border-b border-slate-800 bg-slate-950 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Client portal
            </p>
            <p className="mt-0.5 text-base font-bold text-white">Site Command</p>
          </div>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ${
              logoUrl ? 'border border-slate-600 bg-white' : 'bg-red-700 text-xs font-bold text-white'
            }`}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-contain p-0.5"
                unoptimized={logoUrl.startsWith('data:') || logoUrl.includes('supabase')}
              />
            ) : (
              'CV'
            )}
          </span>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live — GPS attendance on your sites
        </p>
      </div>

      <div className="space-y-2.5 p-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex w-full cursor-default items-center justify-center gap-1.5 rounded-xl border border-red-400/40 bg-red-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white opacity-95"
        >
          <Phone className="h-3 w-3" />
          Emergency — duty manager
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
              On site now
            </p>
            <p className="mt-0.5 text-xl font-black text-white">5/5</p>
            <p className="text-[9px] text-emerald-400">GPS verified</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
              Coverage
            </p>
            <p className="mt-0.5 text-xl font-black text-emerald-400">100%</p>
            <p className="text-[9px] text-slate-500">This shift</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
              Incidents
            </p>
            <p className="mt-0.5 text-xl font-black text-white">0</p>
            <p className="text-[9px] text-slate-500">Today</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
              Last patrol
            </p>
            <p className="mt-0.5 text-base font-black text-white">12m</p>
            <p className="text-[9px] text-slate-500">ago</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Live activity
            </p>
            <ShieldCheck className="h-3 w-3 text-yellow-400" />
          </div>
          <div className="space-y-2">
            {ACTIVITY.slice(0, 2).map((item) => (
              <div
                key={item.title}
                className="flex gap-2 border-b border-slate-800/80 pb-2 last:border-0 last:pb-0"
              >
                <div className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold leading-snug text-white">{item.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-500">
                    <MapPin className="h-2 w-2 shrink-0" />
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SecurityClientPortalPreview({
  showDemoLabel = true,
  size = 'compact',
}: Props) {
  const { content } = useSecurityWebsite();

  return (
    <SecurityPortalDemoShell showLabel={showDemoLabel} size={size}>
      <ClientPortalContent logoUrl={content.logoUrl} />
    </SecurityPortalDemoShell>
  );
}
