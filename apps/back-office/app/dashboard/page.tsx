import { redirect } from 'next/navigation';

import MasterHubView from '../../components/hq/MasterHubView';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile, portalPathForRole } from '../../lib/hr-portal-access-server';
import { canAccessHqHub } from '../../lib/hq-hub';
import { loginPathForRole } from '../../lib/portal-isolation';
import { getMasterHubBadges } from '../../lib/master-hub-actions';
import { hubPillarsForBundle, WFM_HUB_PATH } from '../../lib/tenant-product-bundle';
import { resolveMasterHubBranding } from '../../lib/master-hub-branding';
import { fetchTenantModuleContextForSession } from '../../lib/tenant-product-bundle-server';
import { resolveTenantCompanyFromRequest } from '../../lib/tenant-context-server';

export const dynamic = 'force-dynamic';

export default async function HqMasterHubPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login/hq');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;

  if (!role) {
    redirect('/login?error=no_portal_rank');
  }

  const moduleContext = await fetchTenantModuleContextForSession();
  if (moduleContext?.productBundle === 'wfm_only') {
    redirect(WFM_HUB_PATH);
  }

  if (!canAccessHqHub(role) && !profile.rbacGated) {
    const fallback = portalPathForRole(role, profile) ?? loginPathForRole(role, profile);
    redirect(fallback.startsWith('/login') ? `${fallback}?error=wrong_portal` : fallback);
  }

  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'User';
  const badges = await getMasterHubBadges();
  const bundle = moduleContext?.productBundle ?? 'full_erp';
  const tenant = await resolveTenantCompanyFromRequest();
  const hubBranding = resolveMasterHubBranding({
    tenantName: tenant?.name,
    tenantSlug: tenant?.slug,
  });

  return (
    <MasterHubView
      role={role}
      profileName={profileName}
      badges={badges}
      pillars={hubPillarsForBundle(bundle)}
      hubTitle={hubBranding.hubTitle}
      hubSubtitle={hubBranding.hubSubtitle}
      brandLabel={hubBranding.brandLabel}
      enabledModules={moduleContext?.effectiveModules ?? null}
      showExecutiveDeskLink={role === 'MD' || role === 'OD'}
      rbacGated={profile.rbacGated}
      portalRbac={profile.portalRbac}
    />
  );
}
