import Link from "next/link";
import {
  Briefcase,
  Building2,
  Crosshair,
  Layers,
  Shield,
} from "lucide-react";

import BrandWatermarkBackground from "../../components/portal/BrandWatermarkBackground";
import { guardPortalLoginUrl, smPortalLoginUrl } from "./portal-urls";

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

const ENTRIES: PortalEntry[] = [
  {
    id: "head-office",
    title: "Head Office Command Center",
    subtitle: "Authorised management & back-office staff only",
    roles: "MD · OD · HR · FM · HQ",
    href: "/login/head-office",
    icon: Building2,
    accent: "rose",
  },
  {
    id: "sm",
    title: "Sector Manager Portal",
    subtitle: "Roster, handovers, and site supervision",
    roles: "SM rank · EPF + PIN",
    href: smPortalLoginUrl(),
    external: true,
    icon: Briefcase,
    accent: "amber",
  },
  {
    id: "guard",
    title: "Guard Check-in",
    subtitle: "Field attendance and geofenced scans",
    roles: "Active guards · EPF credentials",
    href: guardPortalLoginUrl(),
    external: true,
    icon: Shield,
    accent: "emerald",
  },
  {
    id: "om",
    title: "OM Command Center",
    subtitle: "Tactical deployment, site allocation, SM assignments, and roster engine",
    roles: "Operations Manager · Google workspace",
    href: "/login/om",
    icon: Crosshair,
    accent: "sky",
  },
  {
    id: "tm",
    title: "TM Command Center",
    subtitle: "Shift verification, guard performance cards, and site GPS configuration",
    roles: "Territory Manager · Google workspace",
    href: "/login/tm",
    icon: Layers,
    accent: "violet",
  },
];

const ACCENT: Record<string, { ring: string; icon: string; hover: string }> = {
  rose: {
    ring: "hover:border-rose-300 hover:shadow-rose-100",
    icon: "bg-rose-50 text-rose-700 border-rose-100",
    hover: "group-hover:text-rose-700",
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
  sky: {
    ring: "hover:border-sky-300 hover:shadow-sky-100",
    icon: "bg-sky-50 text-sky-700 border-sky-100",
    hover: "group-hover:text-sky-700",
  },
  violet: {
    ring: "hover:border-violet-300 hover:shadow-violet-100",
    icon: "bg-violet-50 text-violet-700 border-violet-100",
    hover: "group-hover:text-violet-700",
  },
};

type Props = {
  logoUrl: string | null;
};

export default function PortalGateway({ logoUrl }: Props) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-8">
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

        <div className="grid gap-4 sm:grid-cols-2">
          {ENTRIES.map((entry) => {
            const Icon = entry.icon;
            const accent = ACCENT[entry.accent];
            const card = (
              <div
                className={`group flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md ${accent.ring}`}
              >
                <div
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl border ${accent.icon}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                  {entry.title}
                </h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                  {entry.subtitle}
                </p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {entry.roles}
                </p>
                <span
                  className={`mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors ${accent.hover}`}
                >
                  Enter portal
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </div>
            );

            if (entry.external) {
              return (
                <a
                  key={entry.id}
                  href={entry.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full"
                >
                  {card}
                </a>
              );
            }

            return (
              <Link key={entry.id} href={entry.href} className="block h-full">
                {card}
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-center text-[10px] font-mono text-slate-400">
          Restricted access · Activity is audited
        </p>
      </main>
    </div>
  );
}
