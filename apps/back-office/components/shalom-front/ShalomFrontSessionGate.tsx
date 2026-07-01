'use client';

import { useEffect, useState } from 'react';

import { ShalomFrontPortalShell } from './ShalomFrontPortalShell';
import { getShalomFrontSession, type ShalomFrontSession } from '../../app/shalom-front/actions';
import PwaPortalLoading from '../../../../packages/pwa-shell/PwaPortalLoading';

export function ShalomFrontSessionGate({
  children,
}: {
  children: (session: ShalomFrontSession) => React.ReactNode;
}) {
  const [session, setSession] = useState<ShalomFrontSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const sess = await getShalomFrontSession();
        if (cancelled) return;
        setSession(sess);
      } catch {
        if (!cancelled) {
          setLoadError('Could not load Shalom portal. Check your connection and refresh.');
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
    return <PwaPortalLoading portal="shalom-front" message="Loading Shalom portal…" fullscreen />;
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

  return (
    <ShalomFrontPortalShell staffName={session.employee.full_name ?? 'Caretaker'}>
      {children(session)}
    </ShalomFrontPortalShell>
  );
}
