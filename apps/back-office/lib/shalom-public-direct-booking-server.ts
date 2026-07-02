import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import {
  createShalomDirectBookingFromPayload as createShalomDirectBookingCore,
  validateShalomBookGuestDetailsPayload as validateShalomBookGuestDetailsCore,
} from './shalom-public-direct-booking';
import { fetchPublishedListingWithAvailability } from './shalom-public-data';

async function callCreateShalomDirectBookingRpc(args: Record<string, unknown>) {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc('create_shalom_direct_booking', args);
  return { data: data as string | null, error };
}

export async function createShalomDirectBookingFromPayload(payload: unknown) {
  return createShalomDirectBookingCore(payload, {
    fetchListing: fetchPublishedListingWithAvailability,
    rpc: callCreateShalomDirectBookingRpc,
  });
}

export async function validateShalomBookGuestDetailsPayload(payload: unknown) {
  return validateShalomBookGuestDetailsCore(payload, {
    fetchListing: fetchPublishedListingWithAvailability,
  });
}

export type {
  CreateShalomDirectBookingResult,
  ShalomDirectBookingCreated,
} from './shalom-public-direct-booking';
