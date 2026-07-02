import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import StaffPortalChrome from '../../components/portal/StaffPortalChrome';
import RetailSubnav from './components/RetailSubnav';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { loginPathForStaffPortal } from '../../lib/portal-isolation';
import {
  assertRetailVerticalAccessForSession,
  canAccessRetailDesk,
} from '../../lib/retail-vertical-server';
import { hubPathForBundle } from '../../lib/tenant-product-bundle';
import { fetchTenantModuleContextForSession } from '../../lib/tenant-product-bundle-server';

export default async function RetailLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(loginPathForStaffPortal('hq'));
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessRetailDesk(profile.role) && !profile.rbacGated) {
    redirect(`${loginPathForStaffPortal('hq')}?error=retail_denied`);
  }

  const access = await assertRetailVerticalAccessForSession(profile.role);
  if ('error' in access) {
    const moduleContext = await fetchTenantModuleContextForSession();
    const hubPath = hubPathForBundle(moduleContext?.productBundle ?? 'full_erp');
    redirect(`${hubPath}?error=retail_vertical_inactive`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50 px-4 py-8 pb-24 font-sans text-slate-900 md:px-8">
      <StaffPortalChrome />
      <div className="mx-auto w-full max-w-6xl">
        <RetailSubnav />
        {children}
      </div>
    </main>
  );
}
