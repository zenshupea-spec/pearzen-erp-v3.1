import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { canAccessPathViaPortalRbac } from '../../../packages/portal-rbac';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from './hr-portal-access-server';
import { normalizePortalRole } from './portal-role-utils';

export type OmIntegrityActor = {
  user: User;
  profile: BackOfficeUserProfile;
  actorId: string;
  actorEmail: string;
  actorName: string;
};

function canPerformOmIntegrityWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'OM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/om', profile.portalRbac ?? undefined, {
      writeRequired: true,
    });
  }
  return false;
}

/** OM integrity desk — OM / MD / OD or rbacGated `/om` FULL write. */
export async function requireOmRole(): Promise<OmIntegrityActor> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canPerformOmIntegrityWrite(profile)) throw new Error('Forbidden');

  const actorName =
    profile.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : '') ||
    (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '') ||
    user.email?.split('@')[0] ||
    'Admin';

  return {
    user,
    profile,
    actorId: user.id,
    actorEmail: user.email ?? actorName,
    actorName,
  };
}
