'use client';

import { Suspense } from 'react';
import HqHubBackLinkWhenFromHub from '../../../components/hq/HqHubBackLinkWhenFromHub';

const HQ_BACK_LINK_CLASS =
  'inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)] hover:text-[color:var(--cvs-accent)] sm:px-3 sm:text-xs';

function OmCommandTopBarInner({
  hqBackLink,
  topBarExtra,
}: {
  hqBackLink?: React.ReactNode | false;
  topBarExtra?: React.ReactNode;
}) {
  const backLink =
    hqBackLink === false ? null : (
      hqBackLink ?? <HqHubBackLinkWhenFromHub className={HQ_BACK_LINK_CLASS} />
    );

  return (
    <div className="mb-6 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:mb-8">
      <div className="min-w-0 flex-1">{backLink ?? <span />}</div>
      {topBarExtra ? (
        <div className="ml-auto flex shrink-0 items-center justify-end">{topBarExtra}</div>
      ) : null}
    </div>
  );
}

export default function OmCommandTopBar(props: {
  hqBackLink?: React.ReactNode | false;
  topBarExtra?: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="mb-6 h-9 sm:mb-8" />}>
      <OmCommandTopBarInner {...props} />
    </Suspense>
  );
}
