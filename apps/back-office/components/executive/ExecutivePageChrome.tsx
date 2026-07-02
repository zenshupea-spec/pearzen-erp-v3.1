import type { ReactNode } from 'react';

import PortalLoadingScreen, {
  type PortalLoadingAccent,
} from '../../../../packages/pwa-shell/PortalLoadingScreen';

/** Standard horizontal padding for executive portal pages. */
export const EXECUTIVE_PAGE_X = 'px-6 lg:px-12 2xl:px-24';

/** Sticky frosted header shared across MD portal pages. */
export function ExecutivePageHeader({
  title,
  subtitle,
  leading,
  actions,
  toolbar,
}: {
  title: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
        <div className={`flex w-full flex-wrap items-center justify-between gap-3 py-4 ${EXECUTIVE_PAGE_X}`}>
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="min-w-0">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                typeof subtitle === 'string' ? (
                  <p className="mt-0.5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    {subtitle}
                  </p>
                ) : (
                  <div className="mt-0.5">{subtitle}</div>
                )
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      {toolbar}
    </>
  );
}

/** Secondary strip under the header (tabs, filters). */
export function ExecutivePageToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-slate-200/60 bg-white/30 backdrop-blur-sm">
      <div className={`flex w-full gap-1 overflow-x-auto py-3 scrollbar-none ${EXECUTIVE_PAGE_X}`}>
        {children}
      </div>
    </div>
  );
}

/** Page root — bottom padding for mobile nav + route enter animation. */
export function ExecutivePageShell({ children }: { children: ReactNode }) {
  return <div className="executive-page-shell min-h-0 pb-24 font-sans">{children}</div>;
}

/** Main content area below header/toolbar. */
export function ExecutivePageBody({
  children,
  className = '',
  spacing = 'default',
}: {
  children: ReactNode;
  className?: string;
  spacing?: 'default' | 'relaxed';
}) {
  const space = spacing === 'relaxed' ? 'space-y-8' : 'space-y-6';
  return (
    <div className={`w-full ${space} py-8 ${EXECUTIVE_PAGE_X} ${className}`.trim()}>{children}</div>
  );
}

export function ExecutivePageLoading({
  message = 'Loading…',
  overlay = false,
  accent = 'indigo',
  compact = false,
  className = '',
}: {
  message?: string;
  /** Full-pane veil over the viewport (header included when overlay). */
  overlay?: boolean;
  accent?: PortalLoadingAccent;
  /** Inline section loader — avoids viewport-height stretch inside cards. */
  compact?: boolean;
  className?: string;
}) {
  const inlineCompact = compact || Boolean(className);
  return (
    <PortalLoadingScreen
      label={message}
      accent={accent}
      overlay={overlay}
      fullscreen={false}
      compact={inlineCompact}
      scrim={overlay}
      className={
        className ||
        (overlay ? '' : inlineCompact ? 'min-h-[8rem] py-6' : 'min-h-[min(100dvh,20rem)]')
      }
    />
  );
}

/** Subtitle line with live pulse dot (finance / ops dashboards). */
export function ExecutivePageLiveSubtitle({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--cvs-accent-hover)]">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--cvs-accent-hover)] shadow-[0_0_10px_var(--cvs-glow)]" />
      {children}
    </p>
  );
}
