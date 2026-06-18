import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Factory,
  Landmark,
  MapPinned,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Radar,
} from 'lucide-react';

import { getSecurityWebsitePageData } from '../actions';
import {
  SECURITY_INDUSTRY_SLUGS,
  SECURITY_SERVICE_SLUGS,
  SERVICE_SLUG_TO_TYPE,
} from '../../../lib/security-website-catalog';

const SERVICE_ICONS = [Shield, Users, ShieldCheck, Radar];
const INDUSTRY_ICONS = [Landmark, Building2, Factory];

const DELIVERY_STEPS = [
  {
    step: '01',
    title: 'Site assessment',
    description:
      'We walk your premises, review risk points, shift requirements, and stakeholder expectations.',
  },
  {
    step: '02',
    title: 'Recruit & vet',
    description:
      'Officers are selected against post requirements — background checks, rank alignment, and briefing on your post orders.',
  },
  {
    step: '03',
    title: 'Deploy on site',
    description:
      'Uniformed officers are deployed to site, briefed on your post orders, with relief cover arranged from the first shift.',
  },
  {
    step: '04',
    title: 'Supervise & audit',
    description:
      'Visiting officers conduct GPS-verified spot checks. Supervisors escalate incidents and confirm relief when guards are absent.',
  },
  {
    step: '05',
    title: 'Report & prove',
    description:
      'Attendance, patrols, and incidents are logged for your audit team — with optional client portal access for live visibility.',
  },
] as const;

const OPERATIONAL_ASSURANCE = [
  {
    icon: UserCheck,
    title: 'Relief within SLA',
    detail: 'Absent guards replaced per your service agreement — not left uncovered overnight.',
  },
  {
    icon: ShieldCheck,
    title: 'Rank-structured teams',
    detail: 'Supervisors, visiting officers, and static guards deployed to match site complexity.',
  },
  {
    icon: MapPinned,
    title: 'Island-wide deployment',
    detail: '170+ clients across seven regional hubs — Colombo, Kandy, Galle, and island-wide coverage.',
  },
  {
    icon: ClipboardCheck,
    title: 'Audit-ready documentation',
    detail: 'Post orders, handover notes, incident trails, and GPS logs for compliance reviews.',
  },
] as const;

export const metadata = {
  title: 'Our service model | Classic Venture Security',
  description:
    'How Classic Venture delivers trained security manpower across Sri Lanka — site assessment, deployment, supervision, and Pearzen-backed proof on every contract.',
};

export default async function SecurityOfferingsPage() {
  const { content } = await getSecurityWebsitePageData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">Our solutions</p>
      <h1 className="mt-2 text-3xl font-semibold uppercase tracking-tight text-slate-900 md:text-4xl max-md:text-2xl">
        Trained manpower, backed by proof
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
        Classic Venture is a manpower-first security provider. We put uniformed officers on your
        site, supervise them with visiting officers, and use Pearzen field technology so you never
        have to wonder who was actually there.
      </p>

      <nav className="mt-8 flex flex-wrap gap-2">
        {[
          { href: '#how-we-deliver', label: 'How we deliver' },
          { href: '#programmes', label: 'Programmes' },
          { href: '#industries', label: 'Industries' },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-800"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section id="how-we-deliver" className="scroll-mt-28 mt-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
          How we deliver
        </p>
        <h2 className="mt-2 text-2xl font-semibold uppercase tracking-tight text-slate-900 md:text-3xl">
          From assessment to accountable officers on site
        </h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Every contract follows the same disciplined model — people first, technology confirming
          what happened.
        </p>

        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {DELIVERY_STEPS.map((item) => (
            <li
              key={item.step}
              className="relative rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-red-700">
                {item.step}
              </span>
              <h3 className="mt-2 text-sm font-bold uppercase tracking-wide text-slate-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="programmes" className="scroll-mt-28 mt-16 border-t border-slate-100 pt-16">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">Manpower</p>
        <h2 className="mt-2 text-2xl font-semibold uppercase tracking-tight text-slate-900 md:text-3xl">
          {content.servicesTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">{content.servicesSubtitle}</p>

        <div className="mt-10 space-y-6">
          {SECURITY_SERVICE_SLUGS.map((slug, index) => {
            const detail = content.serviceDetails.find((s) => s.slug === slug);
            const card = content.services[index];
            const Icon = SERVICE_ICONS[index % SERVICE_ICONS.length];
            if (!detail) return null;
            return (
              <article
                key={slug}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <div className="grid gap-0 lg:grid-cols-[1fr_1.4fr]">
                  <div className="border-b border-slate-100 bg-slate-50 p-6 lg:border-b-0 lg:border-r">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-800 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-slate-900">
                      {card?.title ?? detail.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {card?.description ?? detail.description}
                    </p>
                    <Link
                      href={`/security-website/pricing?service=${SERVICE_SLUG_TO_TYPE[slug]}`}
                      className="mt-5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-red-700 hover:gap-2"
                    >
                      Request custom quotation <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <div className="grid gap-4 p-6 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Who it&apos;s for
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {detail.whoItsFor}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        What&apos;s included
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {detail.included}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Shift patterns
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {detail.shiftPatterns}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-16 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-red-50/40">
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="p-8 md:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
              Technology layer
            </p>
            <h2 className="mt-2 text-2xl font-semibold uppercase tracking-tight text-slate-900 md:text-3xl">
              Pearzen confirms what our officers do
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Manpower is the service — Pearzen is how we prove it. Every deployment can include
              GPS-verified check-in, supervisor audits, incident logging, and client portal access so
              stakeholders see coverage without chasing monthly reports.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Guards authenticate on site — geofenced, anti-spoofing check-in',
                'Visiting officers log GPS-verified supervisor visits',
                'Incidents captured in the field and tracked to resolution',
                'Clients get live attendance and emergency contact when portal is enabled',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-700" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/security-website"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-red-800 hover:gap-2"
            >
              See the platform on our homepage <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="border-t border-slate-200 bg-white p-8 md:p-10 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
              Operational assurance
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {OPERATIONAL_ASSURANCE.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <item.icon className="h-5 w-5 text-red-700" />
                  <h3 className="mt-3 text-sm font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="industries" className="scroll-mt-28 border-t border-slate-100 pt-16">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">Sectors</p>
        <h2 className="mt-2 text-2xl font-semibold uppercase tracking-tight text-slate-900 md:text-3xl">
          Industries we serve
        </h2>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Sector-specific guard programmes with deployment models tuned to your risks — manpower
          matched to how your site actually operates.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {SECURITY_INDUSTRY_SLUGS.map((slug, index) => {
            const detail = content.industryDetails.find((i) => i.slug === slug);
            const Icon = INDUSTRY_ICONS[index % INDUSTRY_ICONS.length];
            if (!detail) return null;
            return (
              <Link
                key={slug}
                href={`/security-website/industries/${slug}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{detail.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {detail.description}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-700">Typical deployment: </span>
                  {detail.typicalDeployment}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="mt-16 rounded-2xl bg-red-800 p-8 text-center text-white">
        <p className="text-lg font-semibold">Ready to scope manpower for your site?</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-red-100">
          We assess risk, recommend headcount and shift patterns, and include Pearzen monitoring so
          your stakeholders get proof from day one.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/security-website/pricing"
            className="inline-block rounded-full bg-yellow-400 px-6 py-2.5 text-sm font-bold text-red-950 hover:bg-yellow-300"
          >
            Request site assessment
          </Link>
        </div>
      </div>
    </div>
  );
}
