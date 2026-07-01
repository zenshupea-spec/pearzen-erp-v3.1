/** Shalom front office portal — shared auth constants and row shapes (Step 8 schema). */

export const SHALOM_FRONT_AUTH_EMAIL_DOMAIN = 'shalom.pearzen.local';

export const SHALOM_FRONT_EPF_MAX_LENGTH = 10;
export const SHALOM_FRONT_PIN_LENGTH = 6;
export const SHALOM_FRONT_OTP_MAX_LENGTH = 6;
export { SHALOM_PORTAL_OTP_LIFETIME_MS } from '../../../packages/supabase/portal-otp-lifetime';

export const SHALOM_PORTAL_AUTH_TABLE = 'shalom_portal_auth' as const;
export const SHALOM_CARETAKER_ASSIGNMENTS_TABLE =
  'shalom_caretaker_property_assignments' as const;
export const SHALOM_PORTAL_DAILY_LOGINS_TABLE = 'shalom_portal_daily_logins' as const;

export type ShalomPortalAuthRow = {
  epf_number: string;
  pin_hash: string | null;
  current_otp_hash: string | null;
  otp_expires_at: string | null;
  needs_pin_setup: boolean;
  is_active: boolean;
  last_login_at: string | null;
  last_login_selfie_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ShalomCaretakerPropertyAssignmentRow = {
  id: string;
  epf_number: string;
  property_id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
};

export type ShalomPortalDailyLoginRow = {
  id: string;
  epf_number: string;
  login_date: string;
  company_id: string;
  login_count: number;
  created_at: string;
  updated_at: string;
};

export type ShalomPropertyRow = {
  id: string;
  company_id: string;
  name: string;
  location: string;
  caretaker_epf: string | null;
};

export type ShalomEmployeeRow = {
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

export const SHALOM_STAFF_GROUP = 'SHALOM';

export function shalomEmployeeEpfKey(employee: ShalomEmployeeRow): string {
  const epf = employee.epf_no ?? employee.epf_num ?? employee.emp_number;
  return epf ? normalizeShalomEpfNo(String(epf)) : '';
}

export function isShalomStaff(employee: ShalomEmployeeRow): boolean {
  const group = (employee.group ?? '').trim().toUpperCase();
  if (group === SHALOM_STAFF_GROUP) return true;
  const rank = (employee.rank ?? '').trim().toUpperCase();
  return rank === 'CARETAKER' || rank === 'SHALOM_CARETAKER';
}

export function isShalomEmployeeActive(employee: ShalomEmployeeRow): boolean {
  return (employee.status ?? '').trim().toUpperCase() === 'ACTIVE';
}

export function shalomFrontAuthEmailDomain(): string {
  return process.env.SHALOM_FRONT_AUTH_EMAIL_DOMAIN?.trim() || SHALOM_FRONT_AUTH_EMAIL_DOMAIN;
}

export function normalizeShalomEpfNo(input: string): string {
  return input.trim().toUpperCase().slice(0, SHALOM_FRONT_EPF_MAX_LENGTH);
}

export function shalomFrontAuthEmail(epf: string): string {
  return `${normalizeShalomEpfNo(epf).toLowerCase()}@${shalomFrontAuthEmailDomain()}`;
}

export function isShalomFrontAuthEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return email.trim().toLowerCase().endsWith(`@${shalomFrontAuthEmailDomain().toLowerCase()}`);
}

/** Calendar day in Asia/Colombo for daily login dots. */
export function shalomPortalLoginDateColombo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
