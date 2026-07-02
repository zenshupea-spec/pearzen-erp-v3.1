'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { HQ_HUB_PATH } from '../../lib/hq-hub';
import { clearHqHubEntry, useHqHubEntry } from '../../lib/hq-hub-entry-session';

type Props = {
  className?: string;
};

export default function HqHubBackLinkWhenFromHub({
  className = 'mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs',
}: Props) {
  const fromHub = useHqHubEntry();
  if (!fromHub) return null;

  return (
    <Link
      href={HQ_HUB_PATH}
      className={className}
      onClick={() => clearHqHubEntry()}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">Return to HQ Hub</span>
    </Link>
  );
}
