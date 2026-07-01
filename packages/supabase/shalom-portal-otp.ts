import { createHash, timingSafeEqual } from 'crypto';

export { SHALOM_PORTAL_OTP_LIFETIME_MS } from './portal-otp-lifetime';

function otpPepper(): string {
  return (
    process.env.SHALOM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-shalom-otp-pepper'
  );
}

/** One-way OTP digest stored in `shalom_portal_auth.current_otp_hash`. */
export function hashShalomPortalOtp(otp: string, epfNumber: string): string {
  const epf = epfNumber.trim().toUpperCase();
  const payload = `${epf}:${otp.trim()}:${otpPepper()}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function verifyShalomPortalOtp(
  otp: string,
  epfNumber: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash?.trim()) return false;
  const computed = hashShalomPortalOtp(otp, epfNumber);
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash.trim(), 'hex'));
  } catch {
    return false;
  }
}

export function isShalomPortalOtpActive(
  otpExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!otpExpiresAt) return false;
  const expiresMs = Date.parse(otpExpiresAt);
  return Number.isFinite(expiresMs) && nowMs < expiresMs;
}
