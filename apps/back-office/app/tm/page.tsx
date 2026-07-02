import { Suspense } from 'react';
import PortalLoadingScreen from '../../../../packages/pwa-shell/PortalLoadingScreen';
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
  return <PortalLoadingScreen accent="slate" fullscreen={false} className="min-h-screen" />;
}

async function TmPageInner() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await fetchBackOfficeUserProfile(supabase, user) : null;

  return (
    <TmCommandCenter showHqHubLink={canAccessHqHub(profile?.role)} />
  );
}

export default function TmPage() {
  return (
    <Suspense fallback={<TmLoading />}>
      <TmPageInner />
    </Suspense>
  );
}
