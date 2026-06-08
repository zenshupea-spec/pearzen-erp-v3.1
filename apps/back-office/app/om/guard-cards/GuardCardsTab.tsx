'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getBlacklistedGuards,
  getGuardCardLeaderboard,
  type GuardCardDisplay,
} from './actions';
import { COMMAND_CENTER_REFRESH_MS } from '../lib/command-center-tabs';
import GuardCardGrid from './GuardCardGrid';

export default function GuardCardsTab() {
  const [cards, setCards] = useState<GuardCardDisplay[]>([]);
  const [blacklistedCount, setBlacklistedCount] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [leaderboard, blacklisted] = await Promise.all([
        getGuardCardLeaderboard(),
        getBlacklistedGuards(),
      ]);
      setCards(leaderboard.cards);
      setBlacklistedCount(blacklisted.entries.length);
      setIsDemo(Boolean(leaderboard.isDemo || blacklisted.isDemo));
      if (leaderboard.error) setError(leaderboard.error);
    } catch {
      setError('Failed to load guard performance cards.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const intervalId = window.setInterval(() => {
      void load(true);
    }, COMMAND_CENTER_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 shadow-sm">
        <RefreshCw className="h-9 w-9 animate-spin text-amber-500" />
        <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">
          Loading guard cards…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
            Guard performance cards
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Rolling 12-month composite · blacklist underperformers with a documented reason
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm hover:border-amber-200 hover:text-amber-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <GuardCardGrid
        initialCards={cards}
        blacklistedCount={blacklistedCount}
        isDemo={isDemo}
      />
    </div>
  );
}
