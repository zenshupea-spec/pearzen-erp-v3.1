'use client';

import { useState } from 'react';
import { Building2, MapPin } from 'lucide-react';

import type { GuardRankKey } from '../../hr/vacancies/actions';
import { formatSiteLocalityLabel } from '../../../lib/site-locality';
import type { CareersSiteLabels } from '../../../lib/security-website-i18n';
import { useSecurityWebsite } from '../components/SecurityWebsiteContext';
import VacancyApplyModal from './VacancyApplyModal';

type RankGap = {
  rank: GuardRankKey;
  needed: number;
};

const RANK_STYLES: Record<GuardRankKey, string> = {
  CSO: 'bg-violet-50 text-violet-800 border-violet-200',
  OIC: 'bg-purple-50 text-purple-800 border-purple-200',
  SSO: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  JSO: 'bg-sky-50 text-sky-800 border-sky-200',
  LSO: 'bg-teal-50 text-teal-800 border-teal-200',
};

type VacancyCareerCardProps = {
  siteId: string;
  area?: string | null;
  city?: string | null;
  district?: string | null;
  siteLabels?: CareersSiteLabels;
  rankGaps: RankGap[];
};

export default function VacancyCareerCard({
  siteId,
  area,
  city,
  district,
  siteLabels,
  rankGaps,
}: VacancyCareerCardProps) {
  const [applyOpen, setApplyOpen] = useState(false);
  const { careersUi, careersLocale } = useSecurityWebsite();
  const siteLabel =
    siteLabels?.[careersLocale] ??
    formatSiteLocalityLabel(
      {
        area: area ?? null,
        city: city ?? null,
        district: district ?? null,
      },
      careersUi.careersLocationPending,
    );
  const localizedLocation = careersLocale !== 'en';

  const openApply = () => setApplyOpen(true);

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={openApply}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openApply();
          }
        }}
        className="flex h-full cursor-pointer flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-red-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <h2
                className={
                  localizedLocation
                    ? 'font-bold text-slate-900 leading-snug'
                    : 'font-bold uppercase tracking-wide text-slate-900 leading-snug'
                }
              >
                {siteLabel}
              </h2>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {careersUi.careersRanksNeeded}
          </p>
          <div className="flex flex-wrap gap-2">
            {rankGaps.map((gap) => (
              <span
                key={`${siteId}-${gap.rank}`}
                className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${RANK_STYLES[gap.rank]}`}
              >
                {gap.rank}
              </span>
            ))}
          </div>
        </div>

        <div className="cv-btn-green mt-auto w-full rounded-full py-2.5 text-center text-sm font-bold">
          {careersUi.careersApply}
        </div>
      </article>

      <VacancyApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        siteId={siteId}
        siteLabel={siteLabel}
        rankGaps={rankGaps}
      />
    </>
  );
}
