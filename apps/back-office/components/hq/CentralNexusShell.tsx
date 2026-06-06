'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Building2, Radio } from 'lucide-react';

import BrandWatermarkBackground from '../portal/BrandWatermarkBackground';
import { LOGO_STORAGE_KEY } from '../../../../packages/supabase/branding-constants';
import { fetchCompanyLogo } from '../../app/executive/settings/logo-actions';

const BEAM_STYLE =
  'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(34,197,94,0.18), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(16,185,129,0.12), transparent 55%), radial-gradient(ellipse 45% 35% at 0% 80%, rgba(52,211,153,0.1), transparent 50%)';

export default function CentralNexusShell({
  children,
  profileName,
  profileRank,
  logoUrl: initialLogoUrl,
}: {
  children: ReactNode;
  profileName: string;
  profileRank: string;
  logoUrl?: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? '');

  useEffect(() => {
    if (initialLogoUrl) {
      setLogoUrl(initialLogoUrl);
      localStorage.setItem(LOGO_STORAGE_KEY, initialLogoUrl);
      return;
    }
    const loadLocal = () => {
      setLogoUrl(localStorage.getItem(LOGO_STORAGE_KEY) ?? '');
    };
    fetchCompanyLogo().then(({ url }) => {
      if (url) {
        setLogoUrl(url);
        localStorage.setItem(LOGO_STORAGE_KEY, url);
      } else {
        loadLocal();
      }
    });
    window.addEventListener('storage', loadLocal);
    return () => window.removeEventListener('storage', loadLocal);
  }, [initialLogoUrl]);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl || null} mode="sparse" />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] animate-connection-beam"
        style={{ background: BEAM_STYLE }}
      />

      <div className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-6xl px-4 py-8 sm:px-8">
        <header className="mb-10 text-center">
          <div className="mb-5 flex justify-center">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/90 shadow-lg shadow-emerald-900/10 backdrop-blur-md">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <Building2 className="h-8 w-8 text-emerald-700" strokeWidth={1.75} />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm">
                <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            </div>
          </div>

          <p className="font-university-roman text-xl uppercase tracking-[0.14em] text-emerald-900 sm:text-2xl">
            Classic Venture Security
          </p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
            HQ Central Command
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Portal command nexus
          </p>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-500">
            Signed in as <span className="font-bold text-slate-800">{profileName}</span>
            {' · '}
            <span className="font-bold uppercase text-emerald-800">{profileRank}</span>
          </p>
        </header>

        {children}

        <p className="mt-10 text-center text-[10px] font-mono text-slate-400">
          Restricted access · Activity is audited
        </p>
      </div>
    </div>
  );
}
