export type ShalomGuestDetailsInput = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests?: string;
  acceptedTerms: boolean;
  acceptedCancellation: boolean;
};

export type ShalomGuestDetailsNormalized = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
  acceptedTerms: true;
  acceptedCancellation: true;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUEST_NAME_MAX = 120;
const GUEST_PHONE_MAX = 32;
const NOTES_MAX = 1000;

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function phoneDigitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

export function validateShalomGuestDetails(
  input: ShalomGuestDetailsInput,
):
  | { ok: true; normalized: ShalomGuestDetailsNormalized }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const guestName = input.guestName.trim().replace(/\s+/g, ' ');
  if (!guestName) {
    fieldErrors.guestName = 'Please enter the guest name.';
  } else if (guestName.length < 2) {
    fieldErrors.guestName = 'Guest name must be at least 2 characters.';
  } else if (guestName.length > GUEST_NAME_MAX) {
    fieldErrors.guestName = `Guest name must be at most ${GUEST_NAME_MAX} characters.`;
  }

  const guestEmail = input.guestEmail.trim().toLowerCase();
  if (!guestEmail) {
    fieldErrors.guestEmail = 'Please enter an email address.';
  } else if (!EMAIL_PATTERN.test(guestEmail)) {
    fieldErrors.guestEmail = 'Please enter a valid email address.';
  } else if (guestEmail.length > 254) {
    fieldErrors.guestEmail = 'Email address is too long.';
  }

  const guestPhone = normalizePhone(input.guestPhone);
  if (!guestPhone) {
    fieldErrors.guestPhone = 'Please enter a phone number.';
  } else if (guestPhone.length > GUEST_PHONE_MAX) {
    fieldErrors.guestPhone = 'Phone number is too long.';
  } else if (phoneDigitCount(guestPhone) < 9) {
    fieldErrors.guestPhone = 'Please enter a valid phone number with at least 9 digits.';
  }

  const notes = (input.specialRequests ?? '').trim();
  if (notes.length > NOTES_MAX) {
    fieldErrors.specialRequests = `Special requests must be at most ${NOTES_MAX} characters.`;
  }

  if (!input.acceptedTerms) {
    fieldErrors.acceptedTerms = 'Please accept the Terms & Conditions to continue.';
  }

  if (!input.acceptedCancellation) {
    fieldErrors.acceptedCancellation =
      'Please confirm you understand the cancellation and refund policy.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    normalized: {
      guestName,
      guestEmail,
      guestPhone,
      notes,
      acceptedTerms: true,
      acceptedCancellation: true,
    },
  };
}

export type ShalomBookGuestDetailsPayload = ShalomGuestDetailsInput & {
  propertySlug: string;
  checkIn: string;
  checkOut: string;
};

export type ShalomBookGuestDetailsSummary = {
  propertySlug: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyRateLkr: number;
  totalLkr: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
};

export type ShalomBookGuestDetailsActionResult =
  | { ok: true; summary: ShalomBookGuestDetailsSummary }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

export function parseShalomBookGuestDetailsPayload(
  payload: unknown,
): ShalomBookGuestDetailsPayload | null {
  if (!isRecord(payload)) return null;

  return {
    propertySlug: readString(payload.propertySlug),
    checkIn: readString(payload.checkIn),
    checkOut: readString(payload.checkOut),
    guestName: readString(payload.guestName),
    guestEmail: readString(payload.guestEmail),
    guestPhone: readString(payload.guestPhone),
    specialRequests: readString(payload.specialRequests),
    acceptedTerms: readBoolean(payload.acceptedTerms),
    acceptedCancellation: readBoolean(payload.acceptedCancellation),
  };
}
