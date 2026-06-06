import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import TmSubnav from '../../tm/components/TmSubnav';
import OmDemoBanner from '../components/OmDemoBanner';
import GuardCardsTab from './GuardCardsTab';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Guard Performance Cards | TM Portal',
};

export default async function GuardCardsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto w-full min-w-0 max-w-[1600px] px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        <Link
          href="/dashboard"
          className="mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">Return to HQ Hub</span>
        </Link>

        <header className="mb-5 border-b border-slate-200 pb-5 sm:mb-6 sm:pb-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
              <Trophy className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                Guard performance cards
              </h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Field ratings · Rolling 12 months · OM blacklist control
              </p>
            </div>
          </div>
        </header>

        <TmSubnav />
        {!user && <OmDemoBanner />}
        <GuardCardsTab />
      </div>
    </main>
  );
}
