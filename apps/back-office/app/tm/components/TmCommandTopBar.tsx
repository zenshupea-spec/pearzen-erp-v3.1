'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';

const BACK_LINK_CLASS =
  'inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 transition hover:text-slate-800 sm:text-xs';

function TmCommandTopBarInner({
  showHqHubLink,
  backHref,
  backLabel,
  topBarExtra,
}: {
  showHqHubLink?: boolean;
  backHref?: string;
  backLabel?: string;
  topBarExtra?: React.ReactNode;
}) {
  const backLink = showHqHubLink ? (
    <Link href="/dashboard" className={BACK_LINK_CLASS}>
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">Return to HQ Hub</span>
    </Link>
  ) : backHref ? (
    <Link href={backHref} className={BACK_LINK_CLASS}>
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">{backLabel ?? 'Back to TM Command Center'}</span>
    </Link>
  ) : null;

  return (
    <div className="mb-5 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:mb-6">
      <div className="min-w-0 flex-1">{backLink ?? <span />}</div>
      {topBarExtra ? (
        <div className="ml-auto flex shrink-0 items-center justify-end">{topBarExtra}</div>
      ) : null}
    </div>
  );
}

export default function TmCommandTopBar(props: {
  showHqHubLink?: boolean;
  backHref?: string;
  backLabel?: string;
  topBarExtra?: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="mb-5 h-9 sm:mb-6" />}>
      <TmCommandTopBarInner {...props} />
    </Suspense>
  );
}
