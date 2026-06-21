'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Monitor } from 'lucide-react';

import {
  awaitForgeSessionChallengeAction,
  resolveForgePostChallengeLandingAction,
} from '../../../actions/forge-session-actions';

export default function ForgeAwaitSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingId = searchParams.get('pending') ?? '';
  const [message, setMessage] = useState('Waiting for your other device to respond…');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!pendingId) return;

    const poll = window.setInterval(() => {
      startTransition(async () => {
        const result = await awaitForgeSessionChallengeAction(pendingId);
        if (result.status === 'rejected') {
          setMessage(
            'Sign-in rejected on your other device. Your password was reset — use Forgot password for a new temporary password.',
          );
          window.setTimeout(
            () => router.replace('/login/forge?error=session_rejected'),
            2000,
          );
          return;
        }
        if (
          result.status === 'auto_approved' ||
          result.status === 'approved' ||
          result.status === 'expired'
        ) {
          const landing = await resolveForgePostChallengeLandingAction();
          router.replace(landing);
          router.refresh();
        }
      });
    }, 2000);

    return () => window.clearInterval(poll);
  }, [pendingId, router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10">
          <Monitor className="h-7 w-7 animate-pulse text-indigo-300" />
        </div>
        <h1 className="text-lg font-bold text-white">Confirm on your other device</h1>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        <p className="mt-4 text-xs text-slate-500">
          If no response in 90 seconds, this device will continue and the other session will end.
        </p>
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-indigo-400" />
      </div>
    </div>
  );
}
