'use client';

import Link from 'next/link';
import { ArrowRight, Calculator } from 'lucide-react';

import {
  SERVICE_SLUG_TO_TYPE,
  isSecurityServiceSlug,
  type SecurityIndustrySlug,
  type SecurityServiceSlug,
} from '../../../lib/security-website-catalog';
import type { SecurityWebsiteIndustryDetail, SecurityWebsiteServiceDetail } from '../../../lib/security-website-types';
import SecurityCostEstimator from './SecurityCostEstimator';
import { useSecurityWebsite } from './SecurityWebsiteContext';

type ServiceProps = {
  kind: 'service';
  detail: SecurityWebsiteServiceDetail;
  slug: SecurityServiceSlug;
};

type IndustryProps = {
  kind: 'industry';
  detail: SecurityWebsiteIndustryDetail;
  slug: SecurityIndustrySlug;
};

export default function SecurityDetailPage(props: ServiceProps | IndustryProps) {
  const { ui } = useSecurityWebsite();

  if (props.kind === 'service') {
    const { detail, slug } = props;
    const serviceType = SERVICE_SLUG_TO_TYPE[slug];

    return (
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-600">
          {ui.navServices}
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          {detail.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          {detail.description}
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Who it&apos;s for
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.whoItsFor}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              What&apos;s included
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.included}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Shift patterns
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.shiftPatterns}</p>
          </article>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href={`/security-website/pricing?service=${serviceType}`}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white"
          >
            <Calculator className="h-4 w-4" />
            {ui.getEstimate}
          </Link>
          <Link
            href={`/security-website/pricing?service=${serviceType}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800"
          >
            {ui.requestAssessment}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {detail.faq.length > 0 ? (
          <div className="mt-16">
            <h2 className="text-xl font-semibold text-slate-900">FAQ</h2>
            <div className="mt-6 space-y-4">
              {detail.faq.map((item) => (
                <div key={item.question} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-900">{item.question}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-16">
          <SecurityCostEstimator initial={{ serviceType }} />
        </div>
      </div>
    );
  }

  const { detail, slug } = props;
  const recommendedSlug = detail.recommendedServiceSlug;
  const serviceType =
    recommendedSlug && isSecurityServiceSlug(recommendedSlug)
      ? SERVICE_SLUG_TO_TYPE[recommendedSlug]
      : 'static';

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-600">
        {ui.navIndustries}
      </p>
      <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
        {detail.title}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
        {detail.description}
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Sector risks
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.risks}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Typical deployment
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {detail.typicalDeployment}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Compliance
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {detail.complianceNotes}
          </p>
        </article>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href={`/security-website/services/${detail.recommendedServiceSlug}`}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800"
        >
          View recommended service
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href={`/security-website/pricing?service=${serviceType}`}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white"
        >
          <Calculator className="h-4 w-4" />
          {ui.getEstimate}
        </Link>
      </div>

      <div className="mt-16">
        <SecurityCostEstimator initial={{ serviceType }} />
      </div>
    </div>
  );
}
