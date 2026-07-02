import type { LucideIcon } from 'lucide-react';
import TmSubnav from './TmSubnav';
import TmCommandTopBar from './TmCommandTopBar';
import TmCommandPortalBar from './TmCommandPortalBar';

export type TmIconTone = 'violet' | 'sky' | 'emerald';

const ICON_TONE: Record<
  TmIconTone,
  { border: string; bg: string; fg: string }
> = {
  violet: {
    border: 'border-violet-200',
    bg: 'bg-violet-50',
    fg: 'text-violet-700',
  },
  sky: {
    border: 'border-sky-200',
    bg: 'bg-sky-50',
    fg: 'text-sky-700',
  },
  emerald: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    fg: 'text-emerald-700',
  },
};

const MAX_WIDTH = {
  '5xl': 'max-w-5xl',
  '7xl': 'max-w-7xl',
} as const;

export default function TmCommandShellLayout({
  title,
  subtitle,
  icon: Icon,
  iconTone = 'violet',
  maxWidth = '7xl',
  showSubnav = true,
  showHqHubLink = false,
  backHref,
  backLabel,
  topBarExtra,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconTone?: TmIconTone;
  maxWidth?: keyof typeof MAX_WIDTH;
  showSubnav?: boolean;
  showHqHubLink?: boolean;
  backHref?: string;
  backLabel?: string;
  topBarExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tone = ICON_TONE[iconTone];
  const resolvedTopBarExtra = topBarExtra ?? <TmCommandPortalBar />;

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div
        className={`relative z-10 mx-auto w-full min-w-0 px-3 py-6 sm:px-4 sm:py-8 md:px-6 ${MAX_WIDTH[maxWidth]}`}
      >
        <TmCommandTopBar
          showHqHubLink={showHqHubLink}
          backHref={backHref}
          backLabel={backLabel}
          topBarExtra={resolvedTopBarExtra}
        />

        <header className="mb-5 border-b border-slate-200 pb-5 sm:mb-6 sm:pb-6">
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border sm:h-12 sm:w-12 ${tone.border} ${tone.bg}`}
            >
              <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${tone.fg}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">{subtitle}</p>
            </div>
          </div>
        </header>

        {showSubnav ? <TmSubnav /> : null}
        {children}
      </div>
    </main>
  );
}
