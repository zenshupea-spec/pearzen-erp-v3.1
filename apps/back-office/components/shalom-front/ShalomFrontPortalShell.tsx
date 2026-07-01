'use client';

import { LogOut } from 'lucide-react';

import { signOutShalomFrontAction } from '../../app/shalom-front/actions';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';

export function ShalomFrontPortalShell({
  staffName,
  children,
}: {
  staffName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-white/60 bg-white/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${CVS_BRAND_CLASSES.portalEyebrow}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${CVS_BRAND_CLASSES.portalDot} shadow-[0_0_8px_var(--cvs-glow)]`}
              />
              Shalom Front
            </p>
            <h1 className="mt-0.5 truncate text-lg font-black uppercase tracking-tight text-slate-900">
              {staffName}
            </h1>
          </div>
          <form action={signOutShalomFrontAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-700 transition-colors hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {children}
      </div>
    </div>
  );
}
