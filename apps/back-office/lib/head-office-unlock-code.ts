import { hashPortalPin, verifyPortalPin } from './head-office-portal-pin';

export const PORTAL_UNLOCK_CODE_LENGTH = 6;

export function isPortalUnlockCode(value: string): boolean {
  return new RegExp(`^\\d{${PORTAL_UNLOCK_CODE_LENGTH}}$`).test(value.trim());
}

export function validatePortalUnlockCode(
  code: string,
): { ok: true } | { ok: false; error: string } {
  if (!isPortalUnlockCode(code)) {
    return {
      ok: false,
      error: `Unlock code must be exactly ${PORTAL_UNLOCK_CODE_LENGTH} digits.`,
    };
  }
  if (/^(\d)\1+$/.test(code.trim())) {
    return { ok: false, error: 'Choose a less predictable unlock code.' };
  }
  return { ok: true };
}

export function hashPortalUnlockCode(code: string): string {
  return hashPortalPin(code.trim());
}

export function verifyPortalUnlockCode(code: string, stored: string): boolean {
  return verifyPortalPin(code.trim(), stored);
}
