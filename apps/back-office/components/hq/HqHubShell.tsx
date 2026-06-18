'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import BrandWatermarkBackground from '../portal/BrandWatermarkBackground';
import { LOGO_STORAGE_KEY } from '../../../../packages/supabase/branding-constants';
import { fetchCompanyLogo } from '../../app/executive/settings/logo-actions';

const HQ_BEAM_STYLE =
  'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(34,197,94,0.16), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(16,185,129,0.1), transparent 55%), radial-gradient(ellipse 45% 35% at 0% 85%, rgba(52,211,153,0.08), transparent 50%)';

/** HQ module shell — no sidebar (MD/OD sidebar lives on the executive portal only). */
export default function HqHubShell({
  children,
  profileName,
  profileRank,
}: {
  children: ReactNode;
  profileName: string;
  profileRank: string;
}) {
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
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
  }, []);

  return (
    <div className="relative flex min-h-screen bg-slate-50 text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl || null} mode="sparse" />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] animate-connection-beam"
        style={{ background: HQ_BEAM_STYLE }}
      />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.30]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.35) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <Building2 className="h-3.5 w-3.5 text-blue-600" />
                HQ Hub
              </Link>
              <span className="hidden text-[10px] font-semibold text-slate-400 sm:inline">
                {profileName} · {profileRank}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Live
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
