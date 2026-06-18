import Link from 'next/link';
import { Award, FileCheck, ShieldCheck } from 'lucide-react';

import { getSecurityWebsitePageData } from '../actions';

export const metadata = {
  title: 'Compliance & Licensing | Classic Venture Security',
  description:
    'Ministry of Defence registration, EPF/ETF compliance, and government approvals for Classic Venture Security.',
};

const GOVERNMENT_APPROVALS = [
  'Ministry of Defence — Certificate of Registration & Annual License',
  'Registrar General of Companies — Certificate of Incorporation',
  'Department of Labour — Payment of EPF & ETF',
  'Department of Inland Revenue — Payment of Taxes',
  'Fire Service Department — Approval for Fire Extinguishers',
  'Sri Lanka Security Service Providers Association — Membership',
];

export default async function CompliancePage() {
  const { content } = await getSecurityWebsitePageData();
  const { compliance } = content;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
        Government approved
      </p>
      <h1 className="cv-heading-green mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
        Compliance & licensing
      </h1>
      <p className="mt-4 max-w-2xl text-base text-slate-600">
        Classic Venture maintains the registrations and memberships procurement teams expect — openly
        documented for your audit and vendor approval process.
      </p>

      <div className="mt-10 rounded-2xl border border-red-100 bg-red-50/50 p-6 md:p-8">
        <h2 className="text-lg font-semibold text-red-900">Approval from government establishments</h2>
        <ul className="mt-4 space-y-2">
          {GOVERNMENT_APPROVALS.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ShieldCheck className="h-8 w-8 text-red-700" />
          <h2 className="mt-4 font-semibold text-slate-900">Defence registration</h2>
          <p className="mt-2 text-sm text-slate-600">{compliance.siraRegistrationNumber}</p>
          <p className="text-sm text-slate-600">{compliance.siraValidUntil}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Award className="h-8 w-8 text-green-700" />
          <h2 className="mt-4 font-semibold text-slate-900">Insurance & labour</h2>
          <p className="mt-2 text-sm text-slate-600">{compliance.insuranceSummary}</p>
          {compliance.epfCompliant ? (
            <p className="mt-2 text-sm font-medium text-green-800">EPF/ETF compliant payroll</p>
          ) : null}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <FileCheck className="h-8 w-8 text-red-700" />
          <h2 className="mt-4 font-semibold text-slate-900">Company registration</h2>
          <p className="mt-2 text-sm text-slate-600">{compliance.companyRegistration}</p>
        </article>
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Operational commitments</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>
            Visiting officers island-wide on motorcycles and mobile phones — 24/7 emergency
            response
          </li>
          <li>
            Comprehensive Ministry of Defence training — fire fighting, first aid, communication,
            drill, and bomb disposal awareness
          </li>
          <li>
            Ministry of Defence Public Security training — including three consecutive &ldquo;Best
            Firer&rdquo; trophies
          </li>
          <li>December bonus for security personnel — unique in the industry</li>
          <li>Competitive pay above standard rates to retain experienced officers</li>
          <li>18 male hostels and 5 female hostels with subsidised welfare fund for personnel</li>
        </ul>
      </div>

      <div className="mt-10">
        <Link
          href="/security-website/pricing"
          className="cv-btn-primary inline-block rounded-full px-6 py-3 text-sm font-bold"
        >
          Request quote
        </Link>
      </div>
    </div>
  );
}
