'use client';

import { useEffect, useState } from 'react';

import { CafeFrontPortalShell } from '../../app/cafe-front/CafeFrontPortalShell';
import {
  getCafeFrontSession,
  getCafePrepAvgStats,
  type CafeFrontSession,
} from '../../app/cafe-front/actions';

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
  const [avgPrepLabel, setAvgPrepLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([getCafeFrontSession(), getCafePrepAvgStats()]).then(
      ([sess, stats]) => {
        setSession(sess);
        if (stats.length) {
          const overall = Math.round(
            stats.reduce((sum, row) => sum + row.avgPrepSeconds, 0) / stats.length,
          );
          setAvgPrepLabel(formatAvgPrep(overall));
        }
        setLoading(false);
      },
    );
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        Loading café front office…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-center text-sm text-slate-500">
        Session expired — please sign in again.
      </div>
    );
  }

  return (
    <CafeFrontPortalShell
      staffName={session.employee.full_name ?? 'Café Staff'}
      shiftGate={session.shiftGate}
      avgPrepLabel={avgPrepLabel}
    >
      {subtitle ? (
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{subtitle}</p>
      ) : null}
      {children(session)}
    </CafeFrontPortalShell>
  );
}
