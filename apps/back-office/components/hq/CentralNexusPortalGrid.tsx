import Link from 'next/link';
import { ArrowRight, Eye } from 'lucide-react';

import { HQ_PORTAL_NAV } from '../../lib/hq-portal-nav';

const CARD_ACCENT: Record<string, { ring: string; icon: string; hover: string }> = {
  violet: {
    ring: 'hover:border-violet-300 hover:shadow-violet-100',
    icon: 'bg-violet-50 text-violet-700 border-violet-100',
    hover: 'group-hover:text-violet-700',
  },
  rose: {
    ring: 'hover:border-rose-300 hover:shadow-rose-100',
    icon: 'bg-rose-50 text-rose-700 border-rose-100',
    hover: 'group-hover:text-rose-700',
  },
  indigo: {
    ring: 'hover:border-indigo-300 hover:shadow-indigo-100',
    icon: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    hover: 'group-hover:text-indigo-700',
  },
  emerald: {
    ring: 'hover:border-emerald-300 hover:shadow-emerald-100',
    icon: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    hover: 'group-hover:text-emerald-700',
  },
  amber: {
    ring: 'hover:border-amber-300 hover:shadow-amber-100',
    icon: 'bg-amber-50 text-amber-700 border-amber-100',
    hover: 'group-hover:text-amber-700',
  },
  sky: {
    ring: 'hover:border-sky-300 hover:shadow-sky-100',
    icon: 'bg-sky-50 text-sky-700 border-sky-100',
    hover: 'group-hover:text-sky-700',
  },
  blue: {
    ring: 'hover:border-blue-300 hover:shadow-blue-100',
    icon: 'bg-blue-50 text-blue-700 border-blue-100',
    hover: 'group-hover:text-blue-700',
  },
  slate: {
    ring: 'hover:border-slate-300 hover:shadow-slate-100',
    icon: 'bg-slate-50 text-slate-700 border-slate-100',
    hover: 'group-hover:text-slate-700',
  },
};

function canSeePortal(
  href: string,
  role: string,
): boolean {
  const isGodMode = role === 'MD' || role === 'OD';
  if (isGodMode) return true;

  if (href === '/executive' || href.startsWith('/executive/')) return false;
  if (href === '/tm') return role === 'TM';
  if (href === '/om') return role === 'OM' || role === 'HR' || role === 'FM';
  if (href === '/hr/mnr') return role === 'HR' || role === 'FM' || role === 'OM';
  if (href === '/fm') return role === 'FM' || role === 'HR';
  if (href.startsWith('/hq/')) return role === 'HR' || role === 'FM';
  if (href === '/invoice-desk') return isGodMode;
  return false;
}

function readOnlyLabel(href: string, role: string): string | null {
  if (role === 'MD' || role === 'OD') return null;
  if (href === '/hr/mnr' && (role === 'FM' || role === 'OM')) return 'Read only';
  if (href === '/om' && (role === 'FM' || role === 'HR')) return 'Read only';
  return null;
}

export default function CentralNexusPortalGrid({ role }: { role: string }) {
  const visible = HQ_PORTAL_NAV.filter((entry) => canSeePortal(entry.href, role));

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-center text-sm font-semibold text-amber-900">
        No portal modules are assigned to your rank. Contact HR to update your MNR record.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((entry) => {
        const Icon = entry.Icon;
        const accent = CARD_ACCENT[entry.accent] ?? CARD_ACCENT.slate;
        const readOnly = readOnlyLabel(entry.href, role);

        return (
          <Link key={entry.href} href={entry.href} className="block h-full">
            <div
              className={`group flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md ${accent.ring}`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accent.icon}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                {readOnly ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <Eye className="h-3 w-3" />
                    {readOnly}
                  </span>
                ) : null}
              </div>
              <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                {entry.label}
              </h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                {entry.sub}
              </p>
              {entry.roles ? (
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {entry.roles}
                </p>
              ) : null}
              <span
                className={`mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors ${accent.hover}`}
              >
                Enter portal
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
