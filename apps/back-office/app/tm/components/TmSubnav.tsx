'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Ban, MapPin, Navigation, ShieldCheck, Shirt, Trophy, UserCircle2, Users } from 'lucide-react';
import {
  tmCommandCenterHref,
  tmTabFromSearchParam,
  type TmCommandCenterTabKey,
} from '../lib/command-center-tabs';

const COMMAND_CENTER_TABS: {
  key: TmCommandCenterTabKey;
  label: string;
  icon: typeof ShieldCheck;
}[] = [
  { key: 'shift-verification', label: 'Shift verification', icon: ShieldCheck },
  { key: 'territory', label: 'Territory oversight', icon: Users },
  { key: 'guard-cards', label: 'Guard cards', icon: Trophy },
];

const FIELD_TOOL_LINKS = [
  {
    href: '/om/sites/location',
    label: 'Site GPS',
    icon: MapPin,
    match: (p: string) => p.startsWith('/om/sites/location'),
  },
  {
    href: '/tm/uniform',
    label: 'Uniform issue',
    icon: Shirt,
    match: (p: string) => p.startsWith('/tm/uniform'),
  },
  {
    href: '/tm/mnr-photos',
    label: 'MNR photos',
    icon: UserCircle2,
    match: (p: string) => p.startsWith('/tm/mnr-photos'),
  },
  {
    href: '/tm/site-gps',
    label: 'GPS queue',
    icon: Navigation,
    match: (p: string) => p.startsWith('/tm/site-gps'),
  },
  {
    href: '/om/guard-cards/blacklisted',
    label: 'Blacklisted',
    icon: Ban,
    match: (p: string) => p.startsWith('/om/guard-cards/blacklisted'),
  },
] as const;

const linkClass = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:px-3 sm:text-[10px] ${
    active
      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
      <span className="w-full px-2 pb-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 sm:w-auto sm:pb-0 sm:pr-1">
        {label}
      </span>
      {children}
    </div>
  );
}

function TmSubnavInner() {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const onCommandCenter = pathname === '/tm';
  const activeTab = onCommandCenter ? tmTabFromSearchParam(searchParams.get('tab')) : null;
  const guardCardsActive =
    activeTab === 'guard-cards' || pathname.startsWith('/om/guard-cards');

  return (
    <nav
      className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl sm:mb-8 sm:p-3"
      aria-label="TM portal sections"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <NavSection label="Command center">
          {COMMAND_CENTER_TABS.map(({ key, label, icon: Icon }) => {
            const active = key === 'guard-cards' ? guardCardsActive : activeTab === key;
            return (
              <Link key={key} href={tmCommandCenterHref(key)} className={linkClass(active)}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </NavSection>

        <div
          className="hidden h-8 w-px shrink-0 bg-slate-200/90 sm:block"
          aria-hidden
        />

        <NavSection label="Field tools">
          {FIELD_TOOL_LINKS.map((link) => {
            const Icon = link.icon;
            const active = link.match(pathname);
            return (
              <Link key={link.href} href={link.href} className={linkClass(active)}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </NavSection>
      </div>
    </nav>
  );
}

export default function TmSubnav() {
  return (
    <Suspense
      fallback={
        <nav
          className="mb-8 h-[4.5rem] animate-pulse rounded-2xl border border-slate-200/80 bg-white/80"
          aria-label="TM portal sections"
        />
      }
    >
      <TmSubnavInner />
    </Suspense>
  );
}
