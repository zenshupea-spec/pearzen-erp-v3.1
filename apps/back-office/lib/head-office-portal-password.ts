/** Temporary OTP issued by OD/MD (easy to read aloud). */
export const HO_PORTAL_OTP_LENGTH = 6;

/** How long a provisioned OTP stays valid in the portal UI countdown. */
export const HO_PORTAL_OTP_LIFETIME_MS = 10 * 60 * 1000;

/** Permanent portal password after OTP setup. */
export const HO_PORTAL_PASSWORD_MIN_LENGTH = 15;

/** @deprecated Use HO_PORTAL_OTP_LENGTH for OTP flows. */
export const HO_PORTAL_PIN_LENGTH = HO_PORTAL_OTP_LENGTH;

export const HO_PORTAL_PASSWORD_HINT =
  'At least 15 characters with uppercase, lowercase, a number, and a symbol.';

export function isHeadOfficeOtpCode(value: string): boolean {
  return new RegExp(`^\\d{${HO_PORTAL_OTP_LENGTH}}$`).test(value.trim());
}

export function validateHeadOfficePortalPassword(
  password: string,
  options?: { minLength?: number },
): { ok: true } | { ok: false; error: string } {
  const trimmed = password.trim();
  const minLength = options?.minLength ?? HO_PORTAL_PASSWORD_MIN_LENGTH;
  if (trimmed.length < minLength) {
    return {
      ok: false,
      error: `Password must be at least ${minLength} characters.`,
    };
  }
  if (!/[A-Z]/.test(trimmed)) {
    return { ok: false, error: 'Password must include an uppercase letter.' };
  }
  if (!/[a-z]/.test(trimmed)) {
    return { ok: false, error: 'Password must include a lowercase letter.' };
  }
  if (!/[0-9]/.test(trimmed)) {
    return { ok: false, error: 'Password must include a number.' };
  }
  if (!/[^A-Za-z0-9]/.test(trimmed)) {
    return { ok: false, error: 'Password must include a symbol.' };
  }
  return { ok: true };
}
