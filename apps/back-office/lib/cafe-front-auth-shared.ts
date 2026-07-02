export type CafeEmployeeRow = {
  id: string;
  full_name: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | null;
  status: string | null;
  group: string | null;
  rank: string | null;
  site: string | null;
  company_id: string | null;
};

export const CAFE_FRONT_EPF_MAX_LENGTH = 10;
/** Matches SM portal — Supabase Auth requires at least 6 characters. */
export const CAFE_FRONT_PIN_LENGTH = 6;
export const CAFE_FRONT_OTP_MAX_LENGTH = 6;
export { CAFE_PORTAL_OTP_LIFETIME_MS } from '../../../packages/supabase/portal-otp-lifetime';
export const CAFE_FRONT_AUTH_EMAIL_DOMAIN = 'pearzen.cafe';

const SUPABASE_AUTH_PASSWORD_MIN_LENGTH = 6;

export function cafeFrontAuthEmailDomain(): string {
  return process.env.CAFE_FRONT_AUTH_EMAIL_DOMAIN?.trim() || CAFE_FRONT_AUTH_EMAIL_DOMAIN;
}

export function cafeEmployeeEpfKey(employee: CafeEmployeeRow): string {
  const epf = employee.epf_no ?? employee.epf_num;
  return epf ? normalizeEpfNo(String(epf)) : '';
}

export function normalizeEpfNo(input: string): string {
  return input.trim().toUpperCase().slice(0, CAFE_FRONT_EPF_MAX_LENGTH);
}

export function epfAuthLocalPart(epf: string): string {
  return normalizeEpfNo(epf).toLowerCase();
}

export function cafeFrontAuthEmail(epf: string): string {
  return `${epfAuthLocalPart(epf)}@${cafeFrontAuthEmailDomain()}`;
}

export function isCafeFrontAuthEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${cafeFrontAuthEmailDomain().toLowerCase()}`);
}

function ensureCafeFrontAuthPasswordLength(password: string): string {
  if (password.length >= SUPABASE_AUTH_PASSWORD_MIN_LENGTH) return password;
  return `cafe-${password}`;
}

/** Provision-time bootstrap password — separate from field guard PWA (R-CAFE-AUTH-01). */
export function cafeFrontAuthPassword(epfOrKey: string): string {
  const fixed = process.env.CAFE_FRONT_AUTH_PASSWORD?.trim();
  if (fixed) return fixed;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CAFE_FRONT_AUTH_PASSWORD is required in production.');
  }

  const template = process.env.CAFE_FRONT_AUTH_PASSWORD_TEMPLATE;
  if (template) {
    return ensureCafeFrontAuthPasswordLength(
      template
        .replaceAll('{{epfNo}}', epfOrKey)
        .replaceAll('{{empNumber}}', epfOrKey),
    );
  }

  return ensureCafeFrontAuthPasswordLength(epfOrKey);
}

export function isCafeEmployee(employee: CafeEmployeeRow): boolean {
  const group = (employee.group ?? '').trim().toUpperCase();
  return group === 'CAFE';
}

export function isEmployeeActive(employee: CafeEmployeeRow): boolean {
  return (employee.status ?? '').trim().toUpperCase() === 'ACTIVE';
}

export function employeeRosterKey(employee: CafeEmployeeRow): string {
  if (employee.emp_number) return String(employee.emp_number).trim().toUpperCase();
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf != null) return String(epf).trim();
  return '';
}

export function isCafeOtpValid(
  authRecord: {
    current_otp: string | null;
    otp_expires_at: string | null;
  } | null,
): boolean {
  if (!authRecord?.current_otp || !authRecord.otp_expires_at) return false;
  return Date.now() < new Date(authRecord.otp_expires_at).getTime();
}
