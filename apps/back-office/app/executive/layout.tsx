'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LOGO_STORAGE_KEY } from '../../../../packages/supabase/branding-constants';
import { createSupabaseBrowserClient } from '../../../../packages/supabase/client';
import { HQ_HUB_PATH, isCafeHubView } from '../../lib/hq-hub';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from './actions';
import { fetchCompanyLogo } from './settings/logo-actions';
import {
  ExecutiveNavGuardProvider,
  tryExecutiveNavGuard,
  useExecutiveNavGuardRef,
} from './executive-nav-guard';
import {
  ExecutiveVaultLockButton,
  ExecutiveVaultSessionProvider,
} from '../../components/executive/ExecutiveVaultSession';
import ExecutiveMobileNav from './components/ExecutiveMobileNav';
import {
  EXECUTIVE_SIDEBAR_NAV,
  executiveNavIsActive,
  isExecutiveMobileFocusedPath,
} from './lib/executive-nav';
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  Gem,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react';
import PortalLoadingScreen from '../../../../packages/pwa-shell/PortalLoadingScreen';

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function ProfileAvatar({
  profile,
  size = 'md',
}: {
  profile: ExecutiveSessionProfile;
  size?: 'md' | 'sm';
}) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (profile.photoUrl) {
    return (
      <img
        src={profile.photoUrl}
        alt=""
        className={`${dim} flex-shrink-0 rounded-full border border-white object-cover shadow-md`}
      />
    );
  }

  return (
    <div
      className={`flex ${dim} flex-shrink-0 items-center justify-center rounded-full ${profile.accentClass} shadow-md`}
    >
      <span className={`${text} font-black text-white`}>{profile.initials}</span>
    </div>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  sessionProfile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  sessionProfile: ExecutiveSessionProfile | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navGuardRef = useExecutiveNavGuardRef();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/login/md');
    router.refresh();
  };

  useEffect(() => {
    const loadLocal = () => {
      const stored = localStorage.getItem(LOGO_STORAGE_KEY);
      setLogoUrl(stored ?? '');
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
    <aside className={`flex h-screen flex-shrink-0 flex-col overflow-hidden transition-all duration-300 ${collapsed ? 'w-[60px]' : 'w-64'}`}>
      <div className="flex h-full flex-col border-r border-slate-200 bg-white shadow-[4px_0_24px_-6px_rgba(15,23,42,0.07)]">

        {/* Portal identity + collapse toggle */}
        <div className={`border-b border-slate-100 ${collapsed ? 'px-2 py-4' : 'px-5 py-5'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            {!collapsed && (
              <>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
                  {logoUrl
                    ? <img src={logoUrl} alt="Company logo" width={36} height={36} className="h-full w-full max-h-9 max-w-9 object-contain" />
                    : <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 shadow-sm">
                        <Gem className="h-[18px] w-[18px] text-indigo-700" />
                      </div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black uppercase tracking-tight text-slate-900">MD Portal</p>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Classic Venture HQ
                  </p>
                </div>
              </>
            )}
            {collapsed && (
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden">
                {logoUrl
                  ? <img src={logoUrl} alt="Company logo" width={36} height={36} className="h-full w-full max-h-9 max-w-9 object-contain" />
                  : <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 shadow-sm">
                      <Gem className="h-[18px] w-[18px] text-indigo-700" />
                    </div>}
              </div>
            )}
          </div>
        </div>

        {/* Collapse toggle button */}
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-800 ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4 flex-shrink-0" />
            : <><PanelLeftClose className="h-4 w-4 flex-shrink-0" /><span>Collapse</span></>
          }
        </button>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {EXECUTIVE_SIDEBAR_NAV.map((item) => {
              const { href, label, sub, Icon } = item;
              const active = executiveNavIsActive(pathname, href, item.exact);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={collapsed ? label : undefined}
                    onNavigate={(event) => {
                      if (!tryExecutiveNavGuard(navGuardRef, href)) {
                        event.preventDefault();
                      }
                    }}
                    className={`group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-all ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      active
                        ? 'bg-indigo-50 shadow-sm ring-1 ring-indigo-100'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-all ${
                        active
                          ? 'border-indigo-200 bg-indigo-100 shadow-sm'
                          : 'border-slate-200 bg-slate-100 group-hover:border-indigo-100 group-hover:bg-indigo-50'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          active
                            ? 'text-indigo-700'
                            : 'text-slate-500 group-hover:text-indigo-600'
                        }`}
                      />
                    </div>
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-semibold leading-tight transition-colors ${
                              active
                                ? 'text-indigo-900'
                                : 'text-slate-700 group-hover:text-slate-900'
                            }`}
                          >
                            {label}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">{sub}</p>
                        </div>
                        {active && (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* HQ Hub shortcut */}
        <div className={`border-t border-slate-100 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
          <Link
            href={HQ_HUB_PATH}
            title="HQ Hub"
            onNavigate={(event) => {
              if (!tryExecutiveNavGuard(navGuardRef, HQ_HUB_PATH)) {
                event.preventDefault();
              }
            }}
            className={`group flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 transition-all hover:border-blue-200 hover:bg-blue-100 ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-100 shadow-sm">
              <Building2 className="h-3.5 w-3.5 text-blue-700" />
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-blue-800">HQ Hub</p>
                  <p className="text-[10px] text-blue-500">Central Command</p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-blue-400 group-hover:text-blue-600" />
              </>
            )}
          </Link>
        </div>

        {/* Signed-in profile */}
        {sessionProfile ? (
          <div className={`border-t border-slate-100 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div title={`${sessionProfile.fullName} · ${sessionProfile.rank}`}>
                  <ProfileAvatar profile={sessionProfile} />
                </div>
                <div className="flex items-center gap-1.5">
                  {(sessionProfile.rank === 'MD' || sessionProfile.rank === 'OD') && (
                    <ExecutiveVaultLockButton collapsed />
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    title="Sign out"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm">
                <ProfileAvatar profile={sessionProfile} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {sessionProfile.fullName}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50/80 px-1.5 py-px text-[9px] font-black text-indigo-700">
                      {sessionProfile.rank}
                    </span>
                    <span className="truncate text-[9px] text-slate-400">
                      {sessionProfile.rankLabel}
                    </span>
                  </div>
                </div>
                {(sessionProfile.rank === 'MD' || sessionProfile.rank === 'OD') && (
                  <ExecutiveVaultLockButton />
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  title="Sign out"
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function ExecutiveLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionProfile, setSessionProfile] = useState<ExecutiveSessionProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchExecutiveSessionProfile()
      .then((profile) => {
        if (!cancelled) setSessionProfile(profile);
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadLocal = () => {
      const stored = localStorage.getItem(LOGO_STORAGE_KEY);
      setLogoUrl(stored ?? '');
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

  const fromHub = searchParams.get('hub') === '1';
  const cafeHubView =
    pathname.startsWith('/executive/cafe') &&
    (fromHub || (sessionProfile !== null && isCafeHubView(sessionProfile.rank, false)));

  const vaultSessionEnabled =
    sessionProfile?.rank === 'MD' || sessionProfile?.rank === 'OD';
  const mobileFocused = isExecutiveMobileFocusedPath(pathname);

  if (cafeHubView) {
    return (
      <ExecutiveNavGuardProvider>
        <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900 antialiased">
          <main className="min-h-screen">{children}</main>
          {sessionLoading ? (
            <PortalLoadingScreen accent="indigo" overlay scrim />
          ) : null}
        </div>
      </ExecutiveNavGuardProvider>
    );
  }

  return (
    <ExecutiveNavGuardProvider>
      <ExecutiveVaultSessionProvider enabled={vaultSessionEnabled}>
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 text-slate-900 antialiased md:h-screen md:flex-row">

          <ExecutiveMobileNav sessionProfile={sessionProfile} logoUrl={logoUrl} />

          {/* Desktop sidebar */}
          <div className="hidden md:flex">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed((v) => !v)}
              sessionProfile={sessionProfile}
            />
          </div>

          {/* Main content */}
          <main
            className={`flex-1 overflow-y-auto overflow-x-hidden ${
              mobileFocused
                ? 'max-md:[&_header]:!px-4 max-md:[&_.overflow-x-auto]:-mx-1 max-md:[&_table]:text-xs max-md:[&_th]:px-3 max-md:[&_td]:px-3'
                : ''
            }`}
          >
            {children}
          </main>

          {sessionLoading ? (
            <PortalLoadingScreen accent="indigo" overlay scrim />
          ) : null}
        </div>
      </ExecutiveVaultSessionProvider>
    </ExecutiveNavGuardProvider>
  );
}
