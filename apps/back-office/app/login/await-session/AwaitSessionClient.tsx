'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { resolveHeadOfficePostChallengeLandingAction } from '../../actions/portal-session-actions';

/** Legacy route — concurrent login confirmation removed; continue sign-in. */
export default function AwaitSessionClient() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const landing = await resolveHeadOfficePostChallengeLandingAction();
      if (cancelled) return;
      router.replace(landing);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-6">
      <div className="max-w-md text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-400" />
        <p className="mt-4 text-sm text-slate-400">Continuing sign-in…</p>
      </div>
    </div>
  );
}
