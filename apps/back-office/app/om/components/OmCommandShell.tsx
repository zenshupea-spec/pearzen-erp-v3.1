import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import OmSubnav from './OmSubnav';
import OmDemoBanner from './OmDemoBanner';

export type OmAccent = 'rose' | 'indigo' | 'amber' | 'sky' | 'emerald';

const ACCENT: Record<
  OmAccent,
  { iconBorder: string; iconBg: string; iconFg: string; portalLabel: string }
> = {
  rose: {
    iconBorder: 'border-rose-200',
    iconBg: 'bg-rose-50',
    iconFg: 'text-rose-500',
    portalLabel: 'text-rose-600',
  },
  indigo: {
    iconBorder: 'border-indigo-200',
    iconBg: 'bg-indigo-50',
    iconFg: 'text-indigo-600',
    portalLabel: 'text-indigo-600',
  },
  amber: {
    iconBorder: 'border-amber-200',
    iconBg: 'bg-amber-50',
    iconFg: 'text-amber-600',
    portalLabel: 'text-amber-600',
  },
  sky: {
    iconBorder: 'border-sky-200',
    iconBg: 'bg-sky-50',
    iconFg: 'text-sky-600',
    portalLabel: 'text-sky-600',
  },
  emerald: {
    iconBorder: 'border-emerald-200',
    iconBg: 'bg-emerald-50',
    iconFg: 'text-emerald-600',
    portalLabel: 'text-emerald-600',
  },
};

const MAX_WIDTH: Record<'6xl' | '7xl' | 'wide', string> = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  wide: 'max-w-[1800px]',
};

export default function OmCommandShell({
  title,
  subtitle,
  icon: Icon,
  accent = 'rose',
  live = false,
  maxWidth = 'wide',
  showSubnav = true,
  demoBanner = false,
  headerExtra,
  topBarExtra,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent?: OmAccent;
  live?: boolean;
  maxWidth?: '6xl' | '7xl' | 'wide';
  showSubnav?: boolean;
  demoBanner?: boolean;
  headerExtra?: React.ReactNode;
  topBarExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 right-[-8%] z-0 h-[min(480px,80vw)] w-[min(480px,80vw)] rounded-full bg-indigo-400/5 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-[30%] left-[-15%] z-0 h-[400px] w-[400px] rounded-full bg-rose-400/4 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[-8%] right-[20%] z-0 h-[360px] w-[360px] rounded-full bg-indigo-400/4 blur-[90px]"
      />

      <div
        className={`relative z-10 mx-auto w-full min-w-0 max-w-full px-3 py-6 sm:px-4 sm:py-8 md:py-10 lg:px-6 lg:py-12 ${MAX_WIDTH[maxWidth]}`}
      >
        <div className="mb-6 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:mb-8">
          <Link
            href="/dashboard"
            className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:px-3 sm:text-xs"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Return to HQ Hub</span>
          </Link>
          {topBarExtra}
        </div>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5 sm:mb-8 sm:pb-6">
          <div className="min-w-0 flex-1">
            <p
              className={`mb-2 text-[10px] font-black uppercase tracking-[0.2em] ${a.portalLabel}`}
            >
              OM Command Center
            </p>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${a.iconBorder} ${a.iconBg}`}
              >
                <Icon className={`h-5 w-5 ${a.iconFg}`} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl sm:text-[1.65rem]">
                  {title}
                </h1>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {live && (
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">
                  Live
                </span>
              </div>
            )}
            {headerExtra}
          </div>
        </header>

        {showSubnav && <OmSubnav />}
        {demoBanner && <OmDemoBanner />}

        {children}
      </div>
    </main>
  );
}
