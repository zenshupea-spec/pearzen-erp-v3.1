'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Activity,
  Building2,
  Shirt,
  Trophy,
  UserCheck,
} from 'lucide-react';
import {
  commandCenterHref,
  tabFromSearchParam,
  type CommandCenterTabKey,
} from '../lib/command-center-tabs';

const ALL_COMMAND_CENTER_TABS: {
  key: CommandCenterTabKey;
  label: string;
  icon: typeof Activity;
}[] = [
  { key: 'tactical', label: 'Tactical dashboard', icon: Activity },
  { key: 'site-allocation', label: 'Site allocation', icon: Building2 },
  { key: 'guard-cards', label: 'Guard cards', icon: Trophy },
];

const OPERATIONS_ROUTES = [
  {
    href: '/om/uniform',
    label: 'Uniform issue',
    icon: Shirt,
    match: (p: string) => p.startsWith('/om/uniform'),
  },
  {
    href: '/om/sites/assignments',
    label: 'SM assignments',
    icon: UserCheck,
    match: (p: string) => p.startsWith('/om/sites/assignments'),
  },
  {
    href: '/om/sm-visit-caps',
    label: 'SM visit caps',
    icon: Building2,
    match: (p: string) =>
      p.startsWith('/om/sm-visit-caps') || p.startsWith('/fm/sm-handler'),
  },
] as const;

const linkClass = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:px-3 sm:text-[10px] ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
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
      <span className="w-full px-2 pb-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      {children}
    </div>
  );
}

type OmSubnavProps = {
  /** Command center base path — default `/om`; use `/executive/operations` in MD vault. */
  commandCenterBase?: string;
  /** Subset of command center tabs; defaults to all three. */
  commandCenterTabs?: CommandCenterTabKey[];
  /** Show uniform / SM tools links (OM portal only). */
  showOperationsRoutes?: boolean;
};

function OmSubnavInner({
  commandCenterBase = '/om',
  commandCenterTabs,
  showOperationsRoutes = true,
}: OmSubnavProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const onCommandCenter = pathname === commandCenterBase;
  const activeCommandTab = onCommandCenter
    ? tabFromSearchParam(searchParams.get('tab'))
    : null;
  const guardCardsActive =
    activeCommandTab === 'guard-cards' ||
    pathname.startsWith('/om/guard-cards');
  const tabs = commandCenterTabs
    ? ALL_COMMAND_CENTER_TABS.filter((t) => commandCenterTabs.includes(t.key))
    : ALL_COMMAND_CENTER_TABS;

  return (
    <nav
      className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl sm:mb-8 sm:p-3"
      aria-label="OM portal sections"
    >
      <NavSection label="Operations">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = key === 'guard-cards' ? guardCardsActive : activeCommandTab === key;
          return (
            <Link
              key={key}
              href={commandCenterHref(key, commandCenterBase)}
              className={linkClass(active)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
        {showOperationsRoutes && OPERATIONS_ROUTES.map((link) => {
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
    </nav>
  );
}

export default function OmSubnav(props: OmSubnavProps = {}) {
  return (
    <Suspense
      fallback={
        <nav
          className="mb-8 h-[4.5rem] animate-pulse rounded-2xl border border-slate-200/80 bg-white/80"
          aria-label="OM portal sections"
        />
      }
    >
      <OmSubnavInner {...props} />
    </Suspense>
  );
}
