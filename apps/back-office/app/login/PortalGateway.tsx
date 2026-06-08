import Link from "next/link";
import {
  Briefcase,
  Building2,
  Coffee,
  Crosshair,
  Crown,
  Layers,
  Shield,
} from "lucide-react";

import BrandWatermarkBackground from "../../components/portal/BrandWatermarkBackground";
import { cafeFrontPortalLoginUrl, guardPortalLoginUrl, smPortalLoginUrl } from "./portal-urls";

type PortalEntry = {
  id: string;
  title: string;
  subtitle: string;
  roles: string;
  href: string;
  external?: boolean;
  icon: React.ElementType;
  accent: string;
};

const EXECUTIVE_PORTAL: PortalEntry = {
  id: "executive",
  title: "Executive Vault",
  subtitle: "MD operations radar — CV Operations, finance, payroll, and enterprise performance",
  roles: "MD · OD",
  href: "/login/head-office?next=/executive/finance",
  icon: Crown,
  accent: "violet",
};

const SUB_PORTALS: readonly PortalEntry[] = [
  {
    id: "hq",
    title: "HQ Portal",
    subtitle: "Head office command center — HR, FM, deductions, and cross-portal hub",
    roles: "MD · OD · HR · FM · HQ",
    href: "/login/head-office",
    icon: Building2,
    accent: "rose",
  },
  {
    id: "om",
    title: "OM Portal",
    subtitle: "Tactical deployment, site allocation, SM assignments, and roster engine",
    roles: "Operations Manager · Google workspace",
    href: "/login/om",
    icon: Crosshair,
    accent: "sky",
  },
  {
    id: "tm",
    title: "TM Portal",
    subtitle: "Shift verification, guard performance cards, and site GPS configuration",
    roles: "Territory Manager · Google workspace",
    href: "/login/tm",
    icon: Layers,
    accent: "indigo",
  },
  {
    id: "sm",
    title: "SM Portal",
    subtitle: "Roster, handovers, and site supervision",
    roles: "SM rank · EPF + PIN",
    href: smPortalLoginUrl(),
    external: true,
    icon: Briefcase,
    accent: "amber",
  },
  {
    id: "guard",
    title: "Check-in Portal",
    subtitle: "Field attendance and geofenced scans",
    roles: "Active guards · EPF credentials",
    href: guardPortalLoginUrl(),
    external: true,
    icon: Shield,
    accent: "emerald",
  },
  {
    id: "cafe-front",
    title: "Café Front Office",
    subtitle: "Counter staff — orders, compliance photos, expiry lots, and menu requests",
    roles: "Café staff · EPF + shift check-in",
    href: cafeFrontPortalLoginUrl(),
    icon: Coffee,
    accent: "orange",
  },
];

const ACCENT: Record<string, { ring: string; icon: string; hover: string }> = {
  violet: {
    ring: "hover:border-violet-300 hover:shadow-violet-100",
    icon: "bg-violet-50 text-violet-700 border-violet-100",
    hover: "group-hover:text-violet-700",
  },
  rose: {
    ring: "hover:border-rose-300 hover:shadow-rose-100",
    icon: "bg-rose-50 text-rose-700 border-rose-100",
    hover: "group-hover:text-rose-700",
  },
  sky: {
    ring: "hover:border-sky-300 hover:shadow-sky-100",
    icon: "bg-sky-50 text-sky-700 border-sky-100",
    hover: "group-hover:text-sky-700",
  },
  indigo: {
    ring: "hover:border-indigo-300 hover:shadow-indigo-100",
    icon: "bg-indigo-50 text-indigo-700 border-indigo-100",
    hover: "group-hover:text-indigo-700",
  },
  amber: {
    ring: "hover:border-amber-300 hover:shadow-amber-100",
    icon: "bg-amber-50 text-amber-700 border-amber-100",
    hover: "group-hover:text-amber-700",
  },
  emerald: {
    ring: "hover:border-emerald-300 hover:shadow-emerald-100",
    icon: "bg-emerald-50 text-emerald-700 border-emerald-100",
    hover: "group-hover:text-emerald-700",
  },
  orange: {
    ring: "hover:border-orange-300 hover:shadow-orange-100",
    icon: "bg-orange-50 text-orange-700 border-orange-100",
    hover: "group-hover:text-orange-700",
  },
};

type Props = {
  logoUrl: string | null;
};

function PortalCard({ entry, featured = false }: { entry: PortalEntry; featured?: boolean }) {
  const Icon = entry.icon;
  const accent = ACCENT[entry.accent];

  const card = (
    <div
      className={`group flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md ${accent.ring} ${
        featured ? "p-6 sm:p-7" : "p-5"
      }`}
    >
      <div className={`mb-4 flex items-center justify-center rounded-xl border ${accent.icon} ${featured ? "h-12 w-12" : "h-11 w-11"}`}>
        <Icon className={featured ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.75} />
      </div>
      <h2
        className={`font-black uppercase tracking-tight text-slate-900 ${
          featured ? "text-lg sm:text-xl" : "text-base"
        }`}
      >
        {entry.title}
      </h2>
      <p className={`mt-1.5 flex-1 leading-relaxed text-slate-500 ${featured ? "text-sm sm:text-base" : "text-sm"}`}>
        {entry.subtitle}
      </p>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {entry.roles}
      </p>
      <span
        className={`mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors ${accent.hover}`}
      >
        Enter portal
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </div>
  );

  if (entry.external) {
    return (
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {card}
      </a>
    );
  }

  return (
    <Link href={entry.href} className="block h-full">
      {card}
    </Link>
  );
}

export default function PortalGateway({ logoUrl }: Props) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-8">
        <header className="mb-10 text-center">
          <p className="font-university-roman text-xl uppercase tracking-[0.14em] text-rose-900 sm:text-2xl">
            Classic Venture Security
          </p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
            Pearzen ERP
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Select your portal entry
          </p>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-500">
            Each portal uses a separate sign-in path. Choose the entry that matches
            your role — credentials are not shared across portals.
          </p>
        </header>

        <section className="space-y-6">
          <div>
            <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-violet-600">
              Executive Portal
            </p>
            <PortalCard entry={EXECUTIVE_PORTAL} featured />
          </div>

          <div className="relative py-2">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <p className="relative mx-auto w-fit bg-white px-4 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
              Sub portals
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SUB_PORTALS.map((entry) => (
              <PortalCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-[10px] font-mono text-slate-400">
          Restricted access · Activity is audited
        </p>
      </main>
    </div>
  );
}
