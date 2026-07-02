import 'server-only';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { getPartnerForUserId } from './partner-portal-auth';
import type { ForgeServicePartner } from './forge-partners';

export async function requirePartnerSession(): Promise<{
  partner: ForgeServicePartner;
  userId: string;
  userEmail: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    throw new Error('Not signed in');
  }

  const partner = await getPartnerForUserId(user.id);
  if (!partner?.isActive) {
    throw new Error('Partner profile not found');
  }

  return {
    partner,
    userId: user.id,
    userEmail: user.email,
  };
}

export async function getPartnerScopedServerClient() {
  const { partner } = await requirePartnerSession();
  const supabase = await createSupabaseServerClient();
  return { supabase, partner };
}

export function partnerServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createSupabaseServiceClient();
}
