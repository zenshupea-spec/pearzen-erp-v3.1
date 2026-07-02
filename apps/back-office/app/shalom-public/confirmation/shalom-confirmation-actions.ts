'use server';

import {
  sendShalomGuestConfirmationEmailForBookingId,
  shalomGuestConfirmationEmailAvailable,
} from '../../../lib/shalom-public-confirmation-server';

export type ResendShalomConfirmationEmailResult = {
  ok: boolean;
  emailed: boolean;
  message: string;
};

export async function resendShalomGuestConfirmationEmailAction(
  bookingId: string,
): Promise<ResendShalomConfirmationEmailResult> {
  const normalizedId = bookingId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizedId,
    )
  ) {
    return { ok: false, emailed: false, message: 'Invalid booking reference.' };
  }

  if (!shalomGuestConfirmationEmailAvailable()) {
    return {
      ok: true,
      emailed: false,
      message: 'Email is not configured on this server. Your booking is still confirmed.',
    };
  }

  const result = await sendShalomGuestConfirmationEmailForBookingId(normalizedId);
  if (!result.ok) {
    return {
      ok: false,
      emailed: false,
      message: result.error ?? 'Could not send confirmation email.',
    };
  }

  if (!result.emailed) {
    return {
      ok: true,
      emailed: false,
      message: 'Email is not configured on this server. Your booking is still confirmed.',
    };
  }

  return {
    ok: true,
    emailed: true,
    message: 'Confirmation email sent. Check your inbox in a minute.',
  };
}
