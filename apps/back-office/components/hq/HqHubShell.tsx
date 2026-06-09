'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Briefcase,
  Building2,
  ChevronRight,
  UserCircle2,
} from 'lucide-react';

import BrandWatermarkBackground from '../portal/BrandWatermarkBackground';
import { LOGO_STORAGE_KEY } from '../../../../packages/supabase/branding-constants';
import { fetchCompanyLogo } from '../../app/executive/settings/logo-actions';

const HQ_BEAM_STYLE =
  'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(34,197,94,0.16), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(16,185,129,0.1), transparent 55%), radial-gradient(ellipse 45% 35% at 0% 85%, rgba(52,211,153,0.08), transparent 50%)';

const NAV = [
  {
    href: '/dashboard',
    label: 'HQ Dashboard',
    sub: 'Central Command Overview',
    Icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/hr/mnr',
    label: 'Master HR Roll',
    sub: 'Personnel & headcount',
    Icon: Users,
  },
  {
    href: '/fm',
    label: 'Finance & Payroll',
    sub: 'Ledger & compensation',
    Icon: DollarSign,
  },
  {
    href: '/hr/vacancies',
    label: 'Site Recruitment',
    sub: 'Open vacancies & pipeline',
    Icon: Briefcase,
  },
] as const;

export default function HqHubShell({
  children,
  profileName,
  profileRank,
}: {
  children: ReactNode;
  profileName: string;
  profileRank: string;
}) {
  const pathname = usePathname();
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

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

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

      <div className="relative z-10 hidden md:flex">
        <aside className="flex h-screen w-64 flex-shrink-0 flex-col overflow-hidden">
          <div className="flex h-full flex-col border-r border-slate-200 bg-white/95 shadow-[4px_0_24px_-6px_rgba(15,23,42,0.07)] backdrop-blur-sm">
            <div className="border-b border-slate-100 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-blue-200 bg-blue-50 shadow-sm">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <Building2 className="h-[18px] w-[18px] text-blue-700" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                    HQ Portal
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
                    Central Command
                  </p>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-0.5">
                {NAV.map((item) => {
                  const { href, label, sub, Icon } = item;
                  const exact = 'exact' in item ? item.exact : false;
                  const active = isActive(href, exact);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                          active
                            ? 'bg-blue-50 shadow-sm ring-1 ring-blue-100'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
                            active
                              ? 'border-blue-200 bg-blue-100 shadow-sm'
                              : 'border-slate-200 bg-slate-100 group-hover:border-blue-100 group-hover:bg-blue-50'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 transition-colors ${
                              active
                                ? 'text-blue-700'
                                : 'text-slate-500 group-hover:text-blue-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-semibold leading-tight transition-colors ${
                              active
                                ? 'text-blue-900'
                                : 'text-slate-700 group-hover:text-slate-900'
                            }`}
                          >
                            {label}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">{sub}</p>
                        </div>
                        {active && (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 shadow-sm">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                  <UserCircle2 className="h-5 w-5 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800">{profileName}</p>
                  <p className="text-[10px] text-slate-400">
                    {profileRank} · HQ Portal
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                HQ Central Command
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
