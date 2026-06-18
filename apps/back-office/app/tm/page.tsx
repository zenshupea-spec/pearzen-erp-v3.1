import { Suspense } from 'react';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { canAccessHqHub } from '../../lib/hq-hub';
import TmCommandCenter from './TmCommandCenter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'TM Command Center — Classic Venture HQ',
  description: 'Territory manager shift verification, guard cards, and site GPS',
};

function TmLoading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </main>
  );
}

async function TmPageInner() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await fetchBackOfficeUserProfile(supabase, user) : null;

  return (
    <TmCommandCenter
      showDemoBanner={false}
      showHqHubLink={canAccessHqHub(profile?.role)}
    />
  );
}

export default function TmPage() {
  return (
    <Suspense fallback={<TmLoading />}>
      <TmPageInner />
    </Suspense>
  );
}
