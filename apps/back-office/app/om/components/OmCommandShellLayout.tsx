import type { LucideIcon } from 'lucide-react';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import OmSubnav from './OmSubnav';
import OmDemoBanner from './OmDemoBanner';
import OmCommandTopBar from './OmCommandTopBar';
import OmCommandPortalBar from './OmCommandPortalBar';

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

export default function OmCommandShellLayout({
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
  hqBackLink,
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
  hqBackLink?: React.ReactNode | false;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  const resolvedTopBarExtra = topBarExtra ?? <OmCommandPortalBar />;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.48]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.42) 1.1px, transparent 1.1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-8%] z-0 h-[min(480px,80vw)] w-[min(480px,80vw)] rounded-full blur-[100px]"
        style={{ backgroundColor: 'var(--cvs-glow)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[30%] left-[-15%] z-0 h-[400px] w-[400px] rounded-full blur-[92px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-8%] right-[20%] z-0 h-[360px] w-[360px] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow-lime)' }}
      />

      <div
        className={`relative z-10 mx-auto w-full min-w-0 max-w-full px-3 py-6 sm:px-4 sm:py-8 md:py-10 lg:px-6 lg:py-12 ${MAX_WIDTH[maxWidth]}`}
      >
        <OmCommandTopBar hqBackLink={hqBackLink} topBarExtra={resolvedTopBarExtra} />

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-5 sm:mb-8 sm:pb-6">
          <div className="min-w-0 flex-1">
            <p
              className={`mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${CVS_BRAND_CLASSES.portalEyebrow}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${CVS_BRAND_CLASSES.portalDot} shadow-[0_0_8px_var(--cvs-glow)]`} />
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
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80 px-3 py-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--cvs-accent)] shadow-[0_0_8px_var(--cvs-glow)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cvs-accent)]">
                  Live
                </span>
              </div>
            )}
            {headerExtra}
          </div>
        </header>

        {showSubnav && <OmSubnav showOperationsRoutes={false} />}
        {demoBanner && <OmDemoBanner />}

        {children}
      </div>
    </main>
  );
}
