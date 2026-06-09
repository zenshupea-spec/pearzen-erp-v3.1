import Link from 'next/link';
import { Building2, Home, MapPin, Megaphone, Users } from 'lucide-react';

import { getGuardVacanciesDesk, type GuardRankKey } from './actions';

export const dynamic = 'force-dynamic';

const RANK_STYLES: Record<GuardRankKey, string> = {
  CSO: 'bg-violet-50 text-violet-800 border-violet-200',
  OIC: 'bg-purple-50 text-purple-800 border-purple-200',
  SSO: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  JSO: 'bg-sky-50 text-sky-800 border-sky-200',
  LSO: 'bg-teal-50 text-teal-800 border-teal-200',
};

export default async function GuardVacanciesPage() {
  const { sites, totalGuardsNeeded, error } = await getGuardVacanciesDesk();

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 space-y-6">
      <header className="pt-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 shadow-sm">
              <Megaphone className="w-7 h-7 text-rose-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-slate-900">
                Open Vacancies &amp; Ads
              </h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                Site staffing gaps &bull; Rank requirements &bull; Recruitment pipeline
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <Home className="w-3.5 h-3.5" /> HQ Hub
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sites understaffed</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{sites.length}</p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Guards needed</p>
          <p className="mt-1 text-3xl font-black text-indigo-900">{totalGuardsNeeded}</p>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </p>
      ) : null}

      {sites.length === 0 && !error ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-8 py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-4 text-lg font-black uppercase tracking-wide text-emerald-900">
            No open guard vacancies
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            Every client site has the required JSO, OIC, and other ranks assigned.
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <article
              key={site.siteId}
              className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-rose-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900 leading-snug">
                    {site.siteName}
                  </h2>
                  {site.sectorManager ? (
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      SM: {site.sectorManager}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      No sector manager assigned
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700">
                  −{site.totalNeeded}
                </span>
              </div>

              <div className="flex items-start gap-2 text-sm text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="font-semibold leading-relaxed">{site.address}</p>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Guards needed
                </p>
                <div className="flex flex-wrap gap-2">
                  {site.rankGaps.map((gap) => (
                    <span
                      key={`${site.siteId}-${gap.rank}`}
                      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-black uppercase tracking-wide ${RANK_STYLES[gap.rank]}`}
                    >
                      {gap.needed} {gap.rank}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
