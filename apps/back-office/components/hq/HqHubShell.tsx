'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import BrandWatermarkBackground from '../portal/BrandWatermarkBackground';
import HqPortalSessionBar from './HqPortalSessionBar';
import { LOGO_STORAGE_KEY } from '../../../../packages/supabase/branding-constants';
import { fetchCompanyLogo } from '../../app/executive/settings/logo-actions';

const HQ_BEAM_STYLE =
  'radial-gradient(ellipse 90% 55% at 50% 0%, var(--cvs-glow), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, var(--cvs-glow-teal), transparent 55%), radial-gradient(ellipse 45% 35% at 0% 85%, var(--cvs-glow-lime), transparent 50%)';

/** HQ module shell — no sidebar (MD/OD sidebar lives on the executive portal only). */
export default function HqHubShell({ children }: { children: ReactNode }) {
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
    <div className="relative flex min-h-screen bg-[#eef2f6] text-slate-900 antialiased">
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)]"
              >
                <Building2 className="h-3.5 w-3.5 text-[color:var(--cvs-accent)]" />
                HQ Hub
              </Link>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cvs-accent)] shadow-[0_0_6px_var(--cvs-glow)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Live
                </span>
              </div>
              <HqPortalSessionBar />
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
