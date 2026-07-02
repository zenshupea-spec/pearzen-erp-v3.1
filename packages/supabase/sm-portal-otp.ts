import { createHash, timingSafeEqual } from 'crypto';

export { SM_PORTAL_OTP_LIFETIME_MS } from './portal-otp-lifetime';

function otpPepper(): string {
  return (
    process.env.SM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-sm-otp-pepper'
  );
}

/** One-way OTP digest stored in `sm_portal_auth.current_otp_hash`. */
export function hashSmPortalOtp(otp: string, epfNumber: string): string {
  const epf = epfNumber.trim().toUpperCase();
  const payload = `${epf}:${otp.trim()}:${otpPepper()}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function verifySmPortalOtp(
  otp: string,
  epfNumber: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash?.trim()) return false;
  const computed = hashSmPortalOtp(otp, epfNumber);
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash.trim(), 'hex'));
  } catch {
    return false;
  }
}

export function isSmPortalOtpActive(
  otpExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!otpExpiresAt) return false;
  const expiresMs = Date.parse(otpExpiresAt);
  return Number.isFinite(expiresMs) && nowMs < expiresMs;
}
