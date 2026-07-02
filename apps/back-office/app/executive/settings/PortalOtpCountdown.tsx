'use client';

import { useEffect, useState } from 'react';

import { HO_PORTAL_OTP_LIFETIME_MS } from '../../../lib/head-office-portal-password';

function formatCountdownLabel(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function PortalOtpCountdown({
  expiresAt,
  lifetimeMs = HO_PORTAL_OTP_LIFETIME_MS,
  onExpired,
}: {
  expiresAt: number;
  lifetimeMs?: number;
  onExpired?: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, expiresAt - Date.now()),
  );

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, expiresAt - Date.now());
      setRemainingMs(next);
      if (next === 0) onExpired?.();
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [expiresAt, onExpired]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const pct = Math.max(
    0,
    Math.min(100, (remainingMs / lifetimeMs) * 100),
  );
  const expired = remainingMs <= 0;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className={expired ? 'text-rose-700' : 'text-violet-800'}>
          {expired ? 'OTP expired' : 'Expires in'}
        </span>
        <span
          className={`font-mono text-sm ${expired ? 'text-rose-700' : 'text-violet-900'}`}
        >
          {expired ? '0:00' : formatCountdownLabel(totalSeconds)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-violet-200/80">
        <div
          className={`h-full transition-all duration-300 ${expired ? 'bg-rose-500' : 'bg-violet-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
