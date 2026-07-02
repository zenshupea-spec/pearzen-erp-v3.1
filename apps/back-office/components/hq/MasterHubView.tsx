import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Coffee,
  Crosshair,
  FileText,
  Globe,
  Home,
  Layers,
  Scissors,
  ShieldAlert,
  Users,
} from 'lucide-react';

import {
  CAFE_FRONT_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  SHALOM_FRONT_PORTAL_ROUTE,
  SM_PORTAL_ROUTE,
  type MasterHubModule,
  type MasterHubPillar,
} from '../../lib/master-hub-pillars';
import {
  cafeFrontPortalLoginUrl,
  guardPortalUrl,
  shalomFrontPortalLoginUrl,
  smPortalLoginUrl,
} from '../../app/login/portal-urls';
import { canSeeMasterHubModule, type MasterHubAccessContext } from '../../lib/master-hub-access';
import { canAccessFrontOfficeAsExecutive } from '../../lib/front-office-executive-access';
import type { MasterHubBadges } from '../../lib/master-hub-actions';
import { filterHubPillarsByModules } from '../../lib/tenant-product-bundle';
import { CAFE_HUB_ENTRY_PATH, EXECUTIVE_DESK_PATH, OM_HUB_ENTRY_PATH } from '../../lib/hq-hub';
import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import HqPortalSessionBar from './HqPortalSessionBar';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';

const MODULE_ICONS: Record<string, LucideIcon> = {
  '/executive/operations': Crosshair,
  '/om': Crosshair,
  '/tm': Layers,
  [SM_PORTAL_ROUTE]: Briefcase,
  [GUARD_FIELD_PORTAL_ROUTE]: ShieldAlert,
  [CAFE_FRONT_PORTAL_ROUTE]: Coffee,
  [SHALOM_FRONT_PORTAL_ROUTE]: Home,
  '/fm': Calculator,
  '/hq/deductions': Scissors,
  '/invoice-desk': FileText,
  '/hr': Users,
  '/hr/vacancies': FileText,
  '/hr/onboarding': FileText,
  '/executive/cafe': Coffee,
  '/security-website': Globe,
  '/shalom-public': Building2,
  '/hq/audit': BookOpen,
  '/hq/guard-proxy': ShieldAlert,
  '/hr/mnr': Users,
};

function iconForRoute(route: string): LucideIcon {
  return MODULE_ICONS[route] ?? FileText;
}

function filterPillars(
  role: string,
  badges: MasterHubBadges,
  pillars: MasterHubPillar[],
  enabledModules: string[] | null,
  accessContext?: MasterHubAccessContext,
): MasterHubPillar[] {
  const moduleFiltered = filterHubPillarsByModules(pillars, enabledModules);
  return moduleFiltered
    .map((pillar) => ({
      ...pillar,
      modules: pillar.modules
        .filter((mod) => canSeeMasterHubModule(mod.route, role, accessContext))
        .map((mod) => ({
          ...mod,
          badge: badges[mod.route] ?? mod.badge,
        })),
    }))
    .filter((pillar) => pillar.modules.length > 0);
}

function moduleHref(mod: MasterHubModule, role: string): string {
  if (mod.route === GUARD_FIELD_PORTAL_ROUTE) return guardPortalUrl();
  if (mod.route === SM_PORTAL_ROUTE) return smPortalLoginUrl();
  if (mod.route === CAFE_FRONT_PORTAL_ROUTE) {
    return canAccessFrontOfficeAsExecutive({ role })
      ? '/cafe-front'
      : cafeFrontPortalLoginUrl();
  }
  if (mod.route === SHALOM_FRONT_PORTAL_ROUTE) {
    return canAccessFrontOfficeAsExecutive({ role })
      ? '/shalom-front'
      : shalomFrontPortalLoginUrl();
  }
  if (mod.route === '/executive/cafe') return CAFE_HUB_ENTRY_PATH;
  if (mod.route === '/om') return OM_HUB_ENTRY_PATH;
  return mod.route;
}

function ModuleCard({ module: mod, role }: { module: MasterHubModule; role: string }) {
  const Icon = iconForRoute(mod.route);
  const href = moduleHref(mod, role);

  const card = (
      <ExecutiveGlassCard className="relative flex h-full cursor-pointer flex-col gap-4 p-6 transition-all hover:scale-[1.02] hover:bg-white/70">
        {mod.badge ? (
          <span className="absolute right-4 top-4 z-10 inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow">
            {mod.badge}
          </span>
        ) : null}

        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${CVS_BRAND_CLASSES.rankBadge}`}>
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold leading-snug tracking-tight text-slate-900">
                {mod.label}
              </h3>
              {mod.isProxy ? (
                <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-700">
                  View Only
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">
              {mod.description}
            </p>
            {mod.subtext ? (
              <p className="mt-1.5 text-[11px] italic text-slate-400">{mod.subtext}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--cvs-accent)] transition-colors group-hover:text-[color:var(--cvs-accent-hover)]">
            Open module
            <span className="translate-x-0 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </ExecutiveGlassCard>
  );

  if (mod.external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block h-full"
      >
        {card}
      </a>
    );
  }

  return (
    <Link href={href} className="group block h-full">
      {card}
    </Link>
  );
}

type Props = {
  role: string;
  profileName: string;
  badges?: MasterHubBadges;
  pillars: MasterHubPillar[];
  hubTitle?: string;
  hubSubtitle?: string;
  brandLabel?: string;
  enabledModules?: string[] | null;
  showExecutiveDeskLink?: boolean;
  rbacGated?: boolean;
  portalRbac?: MasterHubAccessContext['portalRbac'];
};

export default function MasterHubView({
  role,
  profileName,
  badges = {},
  pillars,
  hubTitle = 'PEARZEN HQ — MASTER HUB',
  hubSubtitle = 'Pearzen Technologies',
  brandLabel = 'PEARZEN TECH — INTERNAL SYSTEMS',
  enabledModules = null,
  showExecutiveDeskLink,
  rbacGated = false,
  portalRbac = null,
}: Props) {
  const filteredPillars = filterPillars(role, badges, pillars, enabledModules, {
    rbacGated,
    portalRbac,
  });
  const executiveDeskLink =
    showExecutiveDeskLink ?? (role === 'MD' || role === 'OD');

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.48]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.42) 1.1px, transparent 1.1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-8%] h-[min(520px,85vw)] w-[min(520px,85vw)] rounded-full blur-[100px]"
        style={{ backgroundColor: 'var(--cvs-glow)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[26%] left-[-20%] h-[440px] w-[440px] rounded-full blur-[92px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12%] right-[18%] h-[400px] w-[400px] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow-lime)' }}
      />

      <main className="relative z-10 flex flex-col items-center px-6 py-14 md:px-12">
        {executiveDeskLink ? (
          <div className="absolute left-4 top-4 z-50 sm:left-6 sm:top-6">
            <Link
              href={EXECUTIVE_DESK_PATH}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur-md transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Return to Executive Desk
            </Link>
          </div>
        ) : null}

        <div className="absolute right-4 top-4 z-50 sm:right-6 sm:top-6">
          <HqPortalSessionBar />
        </div>

        <div className="mb-14 w-full max-w-2xl text-center">
          <p className={`mb-3 text-xs font-bold uppercase tracking-[0.3em] ${CVS_BRAND_CLASSES.portalEyebrow}`}>
            {hubSubtitle}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {hubTitle}
          </h1>
          <p className="mt-3 text-sm font-medium text-slate-500">
            Welcome back{profileName ? `, ${profileName.split(/\s+/)[0]}` : ''}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${CVS_BRAND_CLASSES.portalDot} shadow-[0_0_8px_var(--cvs-glow)]`} />
            Select a module below. All actions are logged.
          </p>
          <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-[color:var(--cvs-accent-muted)] to-transparent" />
        </div>

        {filteredPillars.length === 0 ? (
          <div className="w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-sm">
            No portal modules are assigned to your rank. Contact HR to update your MNR
            record.
          </div>
        ) : (
          <div className="w-full max-w-6xl space-y-12">
            {filteredPillars.map((pillar) => (
              <section key={pillar.title}>
                <h2 className="mb-4 border-b border-[color:var(--cvs-accent-muted)]/50 pb-2 text-xl font-bold tracking-tight text-slate-800">
                  {pillar.title}
                </h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {pillar.modules.map((mod) => (
                    <ModuleCard key={mod.route} module={mod} role={role} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-20 text-xs font-bold uppercase tracking-widest text-slate-500">
          {brandLabel}
        </p>
      </main>
    </div>
  );
}
