'use server';

import { revalidatePath } from 'next/cache';

import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { isMdRank } from '../../../lib/head-office-portal-lockout';
import {
  fetchSuperappListingConsent,
  upsertSuperappListingConsent,
  type SuperappListingConsent,
} from '../../../lib/superapp-listing-consent';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

async function requireMdForSuperappConsent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new Error('Please sign in again.');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isMdRank(profile.role)) {
    throw new Error('Only the Managing Director can manage Pears marketplace consent.');
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) throw new Error('Tenant company not resolved for this session.');

  return { companyId, userEmail: user.email };
}

function revalidateSuperappConsentPaths() {
  revalidatePath('/settings/superapp');
  revalidatePath('/settings/public-website');
  revalidatePath('/dashboard');
}

export async function fetchSuperappConsentSettings() {
  try {
    const { companyId } = await requireMdForSuperappConsent();
    const consent = await fetchSuperappListingConsent(companyId);

    return {
      success: true as const,
      companyId,
      consent,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load Pears consent';
    return {
      success: false as const,
      error: message,
      companyId: null as string | null,
      consent: null as SuperappListingConsent | null,
    };
  }
}

export async function saveSuperappConsentSettings(input: {
  optIn: boolean;
  listProducts: boolean;
  listBooking: boolean;
}) {
  try {
    const { companyId, userEmail } = await requireMdForSuperappConsent();

    if (input.optIn && !input.listProducts && !input.listBooking) {
      return {
        success: false as const,
        error: 'Select at least one listing type — products or booking.',
      };
    }

    const consent = await upsertSuperappListingConsent({
      companyId,
      optIn: input.optIn,
      listProducts: input.listProducts,
      listBooking: input.listBooking,
      consentedByEmail: userEmail,
    });

    revalidateSuperappConsentPaths();
    return { success: true as const, consent };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save consent';
    return { success: false as const, error: message };
  }
}
