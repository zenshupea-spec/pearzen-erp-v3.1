'use server';

import {
  createShalomDirectBookingFromPayload,
  validateShalomBookGuestDetailsPayload,
  type CreateShalomDirectBookingResult,
} from '../../../lib/shalom-public-direct-booking-server';
import type { ShalomBookGuestDetailsActionResult } from '../../../lib/shalom-public-guest-details';

export async function validateShalomBookGuestDetailsAction(
  payload: unknown,
): Promise<ShalomBookGuestDetailsActionResult> {
  return validateShalomBookGuestDetailsPayload(payload);
}

export async function createShalomDirectBookingAction(
  payload: unknown,
): Promise<CreateShalomDirectBookingResult> {
  return createShalomDirectBookingFromPayload(payload);
}
