/**
 * Tenant Pears marketplace listing consent — MD opt-in flags per company.
 */

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import { isSuperappListingActive, type SuperappListingConsent } from './superapp-listing-consent-shared';

export {
  isSuperappListingActive,
  superappExportErrorStatus,
  type SuperappListingConsent,
} from './superapp-listing-consent-shared';

function mapConsentRow(row: Record<string, unknown>): SuperappListingConsent {
  return {
    companyId: String(row.company_id),
    consentedAt: row.consented_at != null ? String(row.consented_at) : null,
    listProducts: Boolean(row.list_products),
    listBooking: Boolean(row.list_booking),
    consentedByEmail:
      row.consented_by_email != null ? String(row.consented_by_email) : null,
    updatedAt: String(row.updated_at ?? ''),
  };
}

/** Throws when tenant has not opted in — same gate as inventory export (R-SUPERAPP-01). */
export async function assertSuperappListingConsentForExport(
  companyId: string,
): Promise<SuperappListingConsent> {
  const consent = await fetchSuperappListingConsent(companyId);
  if (!isSuperappListingActive(consent)) {
    throw new Error('Listing consent not granted for this tenant.');
  }
  return consent!;
}

export async function fetchSuperappListingConsent(
  companyId: string,
): Promise<SuperappListingConsent | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_listing_consent')
    .select('company_id, consented_at, list_products, list_booking, consented_by_email, updated_at')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }

  return data ? mapConsentRow(data as Record<string, unknown>) : null;
}

export async function upsertSuperappListingConsent(input: {
  companyId: string;
  listProducts: boolean;
  listBooking: boolean;
  consentedByEmail: string;
  optIn: boolean;
}): Promise<SuperappListingConsent> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const row = {
    company_id: input.companyId,
    consented_at: input.optIn ? now : null,
    list_products: input.optIn ? input.listProducts : false,
    list_booking: input.optIn ? input.listBooking : false,
    consented_by_email: input.optIn ? input.consentedByEmail : null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('superapp_listing_consent')
    .upsert(row, { onConflict: 'company_id' })
    .select('company_id, consented_at, list_products, list_booking, consented_by_email, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return mapConsentRow(data as Record<string, unknown>);
}

export async function listSuperappListingConsents(): Promise<SuperappListingConsent[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('superapp_listing_consent')
    .select('company_id, consented_at, list_products, list_booking, consented_by_email, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapConsentRow(row as Record<string, unknown>));
}
