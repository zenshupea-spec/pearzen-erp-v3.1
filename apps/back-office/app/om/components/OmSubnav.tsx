'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Activity,
  Building2,
  ClipboardList,
  Shirt,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  commandCenterHref,
  tabFromSearchParam,
  type CommandCenterTabKey,
} from '../lib/command-center-tabs';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import { CVS_INTERNAL_WORKFORCE_ONLY } from '../../../lib/cvs-workforce-phase';

const COMMAND_CENTER_TABS: {
  key: CommandCenterTabKey;
  label: string;
  icon: typeof Activity;
}[] = [
  { key: 'tactical', label: 'Tactical dashboard', icon: Activity },
  { key: 'guard-cards', label: 'Guard cards', icon: Trophy },
];

const STAFFING_ROUTES = [
  {
    href: '/om/sites/assignments',
    label: 'Sites → SM',
    icon: Building2,
    match: (pathname: string) => pathname.startsWith('/om/sites/assignments'),
  },
  {
    href: '/om/sites/guards',
    label: 'Guards → sites',
    icon: Users,
    match: (pathname: string, tab: CommandCenterTabKey | null) =>
      pathname.startsWith('/om/sites/guards') ||
      (pathname === '/om' && tab === 'site-allocation'),
  },
  {
    href: '/om/guards/sm-assignments',
    label: 'Guards → SM',
    icon: UserCheck,
    match: (pathname: string) => pathname.startsWith('/om/guards/sm-assignments'),
  },
  {
    href: '/om/applicants',
    label: 'Applicants',
    icon: ClipboardList,
    match: (pathname: string) => pathname.startsWith('/om/applicants'),
  },
] as const;

const OPERATIONS_ROUTES = [
  {
    href: '/om/uniform',
    label: 'Uniform issue',
    icon: Shirt,
    match: (pathname: string) => pathname.startsWith('/om/uniform'),
  },
  {
    href: '/om/sm-visit-caps',
    label: 'SM visit caps',
    icon: Building2,
    match: (pathname: string) =>
      pathname.startsWith('/om/sm-visit-caps') || pathname.startsWith('/fm/sm-handler'),
  },
] as const;

const linkClass = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[9px] font-black uppercase tracking-widest transition-all sm:px-3 sm:text-[10px] ${
    active
      ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
      : 'text-slate-600 hover:bg-[var(--cvs-accent-soft)]/80 hover:text-[color:var(--cvs-accent)]'
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
  /** Subset of command center tabs; defaults to tactical + guard cards. */
  commandCenterTabs?: CommandCenterTabKey[];
  /** Show staffing + uniform / SM tools links (OM portal only). */
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
  const hideGuardOps = CVS_INTERNAL_WORKFORCE_ONLY;
  const tabs = (commandCenterTabs
    ? COMMAND_CENTER_TABS.filter((t) => commandCenterTabs.includes(t.key))
    : COMMAND_CENTER_TABS
  )
    .filter((t) => !hideGuardOps || t.key === 'tactical')
    .map((t) =>
      hideGuardOps && t.key === 'tactical'
        ? { ...t, label: 'Internal workforce' }
        : t,
    );

  return (
    <nav
      className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl sm:mb-8 sm:p-3"
      aria-label="OM portal sections"
    >
      <div className="flex flex-col gap-3">
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
          {showOperationsRoutes &&
            !hideGuardOps &&
            OPERATIONS_ROUTES.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass(link.match(pathname))}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
        </NavSection>

        {showOperationsRoutes && !hideGuardOps ? (
          <NavSection label="Staffing">
            {STAFFING_ROUTES.map((link) => {
              const Icon = link.icon;
              const active = link.match(pathname, activeCommandTab);
              return (
                <Link key={link.href} href={link.href} className={linkClass(active)}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </NavSection>
        ) : null}
      </div>
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
