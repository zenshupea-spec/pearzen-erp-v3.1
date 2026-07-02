'use client';

import { useEffect, useState } from 'react';

import { CafeFrontPortalShell } from '../../app/cafe-front/CafeFrontPortalShell';
import {
  getCafeFrontBranding,
  getCafeFrontSession,
  getCafePrepAvgStats,
  type CafeFrontSession,
} from '../../app/cafe-front/actions';
import PwaPortalLoading from '../../../../packages/pwa-shell/PwaPortalLoading';

function formatAvgPrep(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

export function CafeFrontSessionGate({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: (session: CafeFrontSession) => React.ReactNode;
}) {
  const [session, setSession] = useState<CafeFrontSession | null>(null);
  const [cafeLogoUrl, setCafeLogoUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [avgPrepLabel, setAvgPrepLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [sess, stats, branding] = await Promise.all([
          getCafeFrontSession(),
          getCafePrepAvgStats(),
          getCafeFrontBranding(),
        ]);
        if (cancelled) return;
        setSession(sess);
        setCafeLogoUrl(branding.cafeLogoUrl);
        setCompanyLogoUrl(branding.companyLogoUrl);
        if (stats.length) {
          const overall = Math.round(
            stats.reduce((sum, row) => sum + row.avgPrepSeconds, 0) / stats.length,
          );
          setAvgPrepLabel(formatAvgPrep(overall));
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not load café portal. Check your connection and refresh.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <PwaPortalLoading portal="cafe-front" message="Loading café portal…" fullscreen />;
  }

  if (loadError) {
    return (
      <div className="flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-500">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[50dvh] flex-1 items-center justify-center px-4 text-center text-sm text-slate-500">
        Session expired — please sign in again.
      </div>
    );
  }

  const portalUnlocked = session.shiftGate.portalAccessible;

  return (
    <CafeFrontPortalShell
      staffName={session.employee.full_name ?? 'Café Staff'}
      shiftGate={session.shiftGate}
      avgPrepLabel={avgPrepLabel}
      cafeLogoUrl={cafeLogoUrl}
      companyLogoUrl={companyLogoUrl}
    >
      {portalUnlocked ? (
        <>
          {subtitle ? (
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{subtitle}</p>
          ) : null}
          {children(session)}
        </>
      ) : null}
    </CafeFrontPortalShell>
  );
}
