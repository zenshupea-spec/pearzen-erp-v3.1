'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Layers } from 'lucide-react';
import TmSubnav from './components/TmSubnav';
import TmDemoBanner from './components/TmDemoBanner';
import ShiftVerificationTab from '../om/ShiftVerificationTab';
import GuardCardsTab from '../om/guard-cards/GuardCardsTab';
import { tmTabFromSearchParam } from './lib/command-center-tabs';

export default function TmCommandCenter({
  showDemoBanner,
  showHqHubLink = false,
}: {
  showDemoBanner: boolean;
  showHqHubLink?: boolean;
}) {
  const searchParams = useSearchParams();
  const activeTab = tmTabFromSearchParam(searchParams.get('tab'));

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="relative z-10 mx-auto w-full min-w-0 max-w-7xl px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        {showHqHubLink ? (
          <Link
            href="/dashboard"
            className="mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Return to HQ Hub</span>
          </Link>
        ) : null}

        <header className="mb-5 border-b border-slate-200 pb-5 sm:mb-6 sm:pb-6">
          <div className="flex flex-wrap items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 sm:h-12 sm:w-12">
              <Layers className="h-5 w-5 text-violet-700 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                TM Command Center
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">
                Shift verification, guard performance cards, and site GPS configuration
              </p>
            </div>
          </div>
        </header>

        <TmSubnav />
        {showDemoBanner ? <TmDemoBanner /> : null}

        {activeTab === 'shift-verification' && <ShiftVerificationTab />}
        {activeTab === 'guard-cards' && <GuardCardsTab />}
      </div>
    </main>
  );
}
