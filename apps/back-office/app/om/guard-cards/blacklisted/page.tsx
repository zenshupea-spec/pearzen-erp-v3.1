import Link from 'next/link';
import { ArrowLeft, Ban } from 'lucide-react';
import TmSubnav from '../../../tm/components/TmSubnav';
import { getBlacklistedGuards } from '../actions';
import OmDemoBanner from '../../components/OmDemoBanner';
import BlacklistedPanel from '../BlacklistedPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Blacklisted Guards | TM Portal',
};

export default async function BlacklistedGuardsPage() {
  const { entries, canApproveRemoval, error, isDemo } = await getBlacklistedGuards();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/om/guard-cards"
          className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to guard cards
        </Link>

        <header className="mb-6 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50">
              <Ban className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                Blacklisted
              </h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Removed from the board · MD may approve release
              </p>
            </div>
          </div>
        </header>

        <TmSubnav />

        {isDemo && <OmDemoBanner />}

        {error && (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        )}

        <BlacklistedPanel
          initialEntries={entries}
          canApproveRemoval={canApproveRemoval}
          isDemo={Boolean(isDemo)}
        />
      </div>
    </main>
  );
}
