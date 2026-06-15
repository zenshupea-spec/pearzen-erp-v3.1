'use client';

import { useEffect, useState } from 'react';

import { LOGO_STORAGE_KEY } from '../supabase/branding-constants';

export type PortalLoadingAccent =
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'slate';

const ACCENT_ARC: Record<PortalLoadingAccent, string> = {
  indigo: 'border-t-indigo-400/70',
  emerald: 'border-t-emerald-400/70',
  rose: 'border-t-rose-400/70',
  amber: 'border-t-amber-400/70',
  violet: 'border-t-violet-400/70',
  sky: 'border-t-sky-400/70',
  slate: 'border-t-slate-400/60',
};

function readStoredLogo(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LOGO_STORAGE_KEY) || null;
}

export default function PortalLoadingScreen({
  label,
  accent = 'indigo',
  overlay = false,
  fullscreen = true,
  variant = 'light',
  logoUrl: logoUrlProp,
  className = '',
}: {
  label?: string;
  accent?: PortalLoadingAccent;
  /** Floats over the current UI — does not replace the page. */
  overlay?: boolean;
  fullscreen?: boolean;
  variant?: 'light' | 'dark';
  logoUrl?: string | null;
  className?: string;
}) {
  const arc = ACCENT_ARC[accent] ?? ACCENT_ARC.indigo;
  const isDark = variant === 'dark';
  const [logoUrl, setLogoUrl] = useState<string | null>(() => logoUrlProp ?? readStoredLogo());

  useEffect(() => {
    if (logoUrlProp) {
      setLogoUrl(logoUrlProp);
      return;
    }
    setLogoUrl(readStoredLogo());
  }, [logoUrlProp]);

  const shell = (
    <div className="flex flex-col items-center justify-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-9 w-auto max-w-[9rem] object-contain opacity-80"
        />
      ) : (
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl border text-[11px] font-bold uppercase tracking-wider ${
            isDark
              ? 'border-slate-700/80 bg-slate-800/50 text-slate-400'
              : 'border-slate-200/90 bg-white/80 text-slate-400'
          }`}
          aria-hidden
        >
          CV
        </div>
      )}
      <div
        className={[
          'h-5 w-5 animate-spin rounded-full border-[1.5px] border-transparent',
          isDark ? 'border-slate-700/90' : 'border-slate-200/80',
          arc,
        ].join(' ')}
        aria-hidden
      />
      {label ? (
        <p
          className={`max-w-[14rem] px-4 text-center text-[11px] font-medium ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {label}
        </p>
      ) : null}
    </div>
  );

  if (overlay) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label ?? 'Loading'}
        className={[
          'pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center',
          isDark ? 'bg-[#0a0a0e]/12 backdrop-blur-[2px]' : 'bg-white/18 backdrop-blur-[2px]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {shell}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className={[
        'flex flex-col items-center justify-center',
        fullscreen
          ? isDark
            ? 'fixed inset-0 z-[120] bg-[#0a0a0e]/12 backdrop-blur-[2px]'
            : 'fixed inset-0 z-[120] bg-white/18 backdrop-blur-[2px]'
          : 'min-h-[min(100dvh,28rem)] w-full flex-1 py-20',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {shell}
    </div>
  );
}
