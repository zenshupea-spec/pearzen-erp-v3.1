'use client';

import { CV_COVERAGE_REGIONS } from '../../../lib/security-website-brand';

export default function SecurityCoverageSection() {
  return (
    <section className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h2 className="cv-heading-green text-2xl font-semibold tracking-tight text-slate-900 uppercase">
          Districts covered island-wide
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          170+ clients across seven regional hubs — deploy officers anywhere in Sri Lanka at short
          notice.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CV_COVERAGE_REGIONS.map((region) => (
            <article
              key={region.name}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-sm font-bold uppercase tracking-wide text-red-700">
                {region.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{region.districts}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
