'use client';

import { Users } from 'lucide-react';

import type { SiteVacancyCard } from '../../hr/vacancies/actions';
import { useSecurityWebsite } from '../components/SecurityWebsiteContext';
import CareersLanguageSwitcher from './CareersLanguageSwitcher';
import VacancyCareerCard from './VacancyCareerCard';

type CareersPageClientProps = {
  sites: SiteVacancyCard[];
  error?: string;
};

export default function CareersPageClient({ sites, error }: CareersPageClientProps) {
  const { careersUi } = useSecurityWebsite();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
            {careersUi.careersEyebrow}
          </p>
          <h1 className="cv-heading-green mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {careersUi.careersTitle}
          </h1>
        </div>
        <CareersLanguageSwitcher />
      </div>

      {error ? (
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </p>
      ) : null}

      {sites.length === 0 && !error ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-8 py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-4 text-lg font-semibold text-emerald-900">{careersUi.careersNoVacanciesTitle}</p>
          <p className="mt-2 text-sm text-emerald-700">{careersUi.careersNoVacanciesBody}</p>
        </div>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {sites.map((site) => (
            <VacancyCareerCard
              key={site.siteId}
              siteId={site.siteId}
              area={site.area}
              city={site.city}
              district={site.district}
              siteLabels={site.siteLabels}
              rankGaps={site.rankGaps}
            />
          ))}
        </section>
      )}
    </div>
  );
}
