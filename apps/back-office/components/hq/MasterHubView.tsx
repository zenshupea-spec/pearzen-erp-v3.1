import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calculator,
  Coffee,
  Crosshair,
  FileText,
  Layers,
  Scissors,
  ShieldAlert,
  Users,
} from 'lucide-react';

import {
  CAFE_FRONT_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  MASTER_HUB_PILLARS,
  type MasterHubModule,
  type MasterHubPillar,
} from '../../lib/master-hub-pillars';
import { cafeFrontPortalLoginUrl, guardPortalLoginUrl } from '../../app/login/portal-urls';
import { canSeeMasterHubModule } from '../../lib/master-hub-access';
import type { MasterHubBadges } from '../../lib/master-hub-actions';
import { CAFE_HUB_ENTRY_PATH, EXECUTIVE_DESK_PATH } from '../../lib/hq-hub';
import { isExecutiveRank } from '../../lib/portal-role-utils';

const MODULE_ICONS: Record<string, LucideIcon> = {
  '/executive/operations': Crosshair,
  '/om': Crosshair,
  '/tm': Layers,
  '/hq/sm-proxy': Briefcase,
  [GUARD_FIELD_PORTAL_ROUTE]: ShieldAlert,
  [CAFE_FRONT_PORTAL_ROUTE]: Coffee,
  '/hq/guard-proxy': ShieldAlert,
  '/fm': Calculator,
  '/hq/deductions': Scissors,
  '/invoice-desk': FileText,
  '/hr': Users,
  '/hr/vacancies': FileText,
  '/hr/onboarding': FileText,
  '/executive/cafe': Coffee,
  '/hq/audit': BookOpen,
};

function iconForRoute(route: string): LucideIcon {
  return MODULE_ICONS[route] ?? FileText;
}

function filterPillars(role: string, badges: MasterHubBadges): MasterHubPillar[] {
  return MASTER_HUB_PILLARS.map((pillar) => ({
    ...pillar,
    modules: pillar.modules
      .filter((mod) => canSeeMasterHubModule(mod.route, role))
      .map((mod) => ({
        ...mod,
        badge: badges[mod.route] ?? mod.badge,
      })),
  })).filter((pillar) => pillar.modules.length > 0);
}

function moduleHref(mod: MasterHubModule): string {
  if (mod.route === GUARD_FIELD_PORTAL_ROUTE) return guardPortalLoginUrl();
  if (mod.route === CAFE_FRONT_PORTAL_ROUTE) return cafeFrontPortalLoginUrl();
  if (mod.route === '/executive/cafe') return CAFE_HUB_ENTRY_PATH;
  return mod.route;
}

function ModuleCard({ module: mod }: { module: MasterHubModule }) {
  const Icon = iconForRoute(mod.route);
  const href = moduleHref(mod);

  const card = (
      <div className="relative flex h-full cursor-pointer flex-col gap-4 rounded-2xl border border-white/50 bg-white/70 p-6 shadow-xl backdrop-blur-xl transition-all hover:scale-[1.02] hover:bg-white/85">
        {mod.badge ? (
          <span className="absolute right-4 top-4 z-10 inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow">
            {mod.badge}
          </span>
        ) : null}

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
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
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 transition-colors group-hover:text-blue-900">
            Open module
            <span className="translate-x-0 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </div>
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
};

export default function MasterHubView({
  role,
  profileName,
  badges = {},
}: Props) {
  const pillars = filterPillars(role, badges);
  const showExecutiveDeskLink = isExecutiveRank(role);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100">
      <style>{`
        @keyframes aurora {
          0%   { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(10%, 10%) scale(1.1); }
          66%  { transform: translate(-5%, 5%) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes aurora-alt {
          0%   { transform: translate(0, 0) scale(1.05); }
          33%  { transform: translate(-8%, -6%) scale(0.95); }
          66%  { transform: translate(6%, -10%) scale(1.1); }
          100% { transform: translate(0, 0) scale(1.05); }
        }
        @keyframes aurora-slow {
          0%   { transform: translate(0, 0) scale(0.95); }
          33%  { transform: translate(5%, -8%) scale(1.1); }
          66%  { transform: translate(-10%, 4%) scale(1.0); }
          100% { transform: translate(0, 0) scale(0.95); }
        }
        @keyframes aurora-drift {
          0%   { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(-6%, 12%) scale(1.05); }
          66%  { transform: translate(8%, -5%) scale(0.92); }
          100% { transform: translate(0, 0) scale(1); }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -left-48 -top-48 h-[700px] w-[700px] rounded-full bg-blue-400 opacity-30 blur-[120px]"
          style={{ animation: 'aurora 20s ease-in-out infinite' }}
        />
        <div
          className="absolute -right-56 top-1/4 h-[650px] w-[650px] rounded-full bg-purple-400 opacity-30 blur-[120px]"
          style={{ animation: 'aurora-alt 24s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-0 left-1/4 h-[600px] w-[600px] rounded-full bg-teal-400 opacity-30 blur-[120px]"
          style={{ animation: 'aurora-slow 22s ease-in-out infinite' }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[550px] w-[550px] rounded-full bg-rose-300 opacity-30 blur-[120px]"
          style={{ animation: 'aurora-drift 26s ease-in-out infinite' }}
        />
      </div>

      <main className="relative z-10 flex flex-col items-center px-6 py-14 md:px-12">
        {showExecutiveDeskLink ? (
          <div className="absolute left-6 top-6 z-50">
            <Link
              href={EXECUTIVE_DESK_PATH}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur-md transition-all hover:bg-slate-50"
            >
              <ArrowLeft className="h-3 w-3" />
              Return to Executive Desk
            </Link>
          </div>
        ) : null}

        <div className="mb-14 w-full max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-blue-700">
            Pearzen Security Services
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            PEARZEN HQ — MASTER HUB
          </h1>
          <p className="mt-3 text-sm font-bold text-slate-600">
            Welcome, {profileName}
            {role ? (
              <span className="font-medium text-slate-500"> · {role}</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Select a module below. All actions are logged.
          </p>
          <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        </div>

        {pillars.length === 0 ? (
          <div className="w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-sm">
            No portal modules are assigned to your rank. Contact HR to update your MNR
            record.
          </div>
        ) : (
          <div className="w-full max-w-6xl space-y-12">
            {pillars.map((pillar) => (
              <section key={pillar.title}>
                <h2 className="mb-4 border-b border-slate-200/80 pb-2 text-xl font-bold tracking-tight text-slate-800">
                  {pillar.title}
                </h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {pillar.modules.map((mod) => (
                    <ModuleCard key={mod.route} module={mod} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-20 text-xs font-bold uppercase tracking-widest text-slate-500">
          PEARZEN TECH — INTERNAL SYSTEMS
        </p>
      </main>
    </div>
  );
}
