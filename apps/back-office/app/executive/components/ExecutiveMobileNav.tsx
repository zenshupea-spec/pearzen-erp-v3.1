'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  ChevronDown,
  Gem,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { LOGO_STORAGE_KEY } from '../../../../../packages/supabase/branding-constants';
import { signOutHeadOfficePortalAction } from '../../actions/portal-session-actions';
import { HQ_HUB_PATH } from '../../../lib/hq-hub';
import {
  ExecutiveVaultLockButton,
} from '../../../components/executive/ExecutiveVaultSession';
import {
  tryExecutiveNavGuard,
  useExecutiveNavGuardRef,
} from '../executive-nav-guard';
import type { ExecutiveSessionProfile } from '../actions';
import {
  EXECUTIVE_MOBILE_DESK_NAV,
  EXECUTIVE_MOBILE_STRIP_NAV,
  executiveNavIsActive,
} from '../lib/executive-nav';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';

function ProfileAvatar({
  profile,
}: {
  profile: ExecutiveSessionProfile;
}) {
  if (profile.photoUrl) {
    return (
      <img
        src={profile.photoUrl}
        alt=""
        className="h-8 w-8 flex-shrink-0 rounded-full border border-white object-cover shadow-md"
      />
    );
  }

  return (
    <div
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${profile.accentClass} shadow-md`}
    >
      <span className="text-[10px] font-black text-white">{profile.initials}</span>
    </div>
  );
}

export default function ExecutiveMobileNav({
  sessionProfile,
  logoUrl,
}: {
  sessionProfile: ExecutiveSessionProfile | null;
  logoUrl: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navGuardRef = useExecutiveNavGuardRef();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutHeadOfficePortalAction();
    router.replace('/login/md');
    router.refresh();
  };

  return (
    <header className="flex-shrink-0 border-b border-slate-200/80 bg-white/90 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl md:hidden">
      {/* Brand row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company logo"
                width={36}
                height={36}
                className="h-full w-full max-h-9 max-w-9 object-contain"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] shadow-sm">
                <Gem className="h-[18px] w-[18px] text-[color:var(--cvs-accent)]" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-tight text-slate-900">
              MD Portal
            </p>
            <p className={`truncate text-[10px] font-bold uppercase tracking-widest ${CVS_BRAND_CLASSES.portalEyebrow}`}>
              Mobile Command
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {sessionProfile &&
          (sessionProfile.rank === 'MD' || sessionProfile.rank === 'OD') ? (
            <ExecutiveVaultLockButton collapsed />
          ) : null}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
            aria-expanded={moreOpen}
            aria-label={moreOpen ? 'Close menu' : 'Open desk menu'}
          >
            {moreOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Horizontal pill nav — mobile-only modules */}
      <nav
        className="border-t border-slate-100/80 bg-gradient-to-b from-slate-50/80 to-white/60"
        aria-label="Mobile executive modules"
      >
        <div className="flex gap-2 overflow-x-auto px-3 py-2.5 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {EXECUTIVE_MOBILE_STRIP_NAV.map((item) => {
            const { href, label, Icon } = item;
            const active = executiveNavIsActive(pathname, href, item.exact);
            return (
              <Link
                key={href}
                href={href}
                onNavigate={(event) => {
                  if (!tryExecutiveNavGuard(navGuardRef, href)) {
                    event.preventDefault();
                  }
                }}
                className={`flex flex-shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-all ${
                  active ? CVS_BRAND_CLASSES.mobileTabActive : CVS_BRAND_CLASSES.mobileTabIdle
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-xl ${
                    active ? 'bg-white/20' : 'bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-[color:var(--cvs-accent)]'}`}
                  />
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desk modules sheet */}
      {moreOpen ? (
        <div className="border-t border-slate-200/80 bg-white px-4 py-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Finance &amp; desk modules
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {EXECUTIVE_MOBILE_DESK_NAV.map((item) => {
              const { href, label, sub, Icon } = item;
              const active = executiveNavIsActive(pathname, href, item.exact);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    onNavigate={(event) => {
                      if (!tryExecutiveNavGuard(navGuardRef, href)) {
                        event.preventDefault();
                      }
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? `${CVS_BRAND_CLASSES.navActive} bg-[var(--cvs-accent-soft)]`
                        : 'border-slate-200 bg-slate-50/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                      <Icon
                        className={`h-4 w-4 ${
                          active ? CVS_BRAND_CLASSES.navActiveIconFg : 'text-slate-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{label}</p>
                      <p className="truncate text-[10px] text-slate-500">{sub}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <Link
              href={HQ_HUB_PATH}
              onClick={() => setMoreOpen(false)}
              onNavigate={(event) => {
                if (!tryExecutiveNavGuard(navGuardRef, HQ_HUB_PATH)) {
                  event.preventDefault();
                }
              }}
              className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-100">
                <Building2 className="h-4 w-4 text-blue-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-blue-800">HQ Hub</p>
                <p className="text-[10px] text-blue-500">Central Command</p>
              </div>
            </Link>

            {sessionProfile ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <ProfileAvatar profile={sessionProfile} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {sessionProfile.fullName}
                  </p>
                  <p className="text-[10px] text-slate-500">{sessionProfile.rankLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Active section hint */}
      <div className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-1.5">
        <ChevronDown className="h-3 w-3 rotate-[-90deg] text-slate-300" />
        <p className="text-[10px] font-semibold text-slate-400">Swipe for more modules</p>
        <ChevronDown className="h-3 w-3 rotate-[-90deg] text-slate-300" />
      </div>
    </header>
  );
}
