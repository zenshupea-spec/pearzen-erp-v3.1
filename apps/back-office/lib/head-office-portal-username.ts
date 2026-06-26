import { normalizeNic } from './employee-nic';

/** Synthetic Supabase Auth email domain for NIC-based portal login. */
export const PORTAL_AUTH_EMAIL_DOMAIN = 'portal.pearzen.local';

export function normalizePortalLoginUsername(value: unknown): string {
  return normalizeNic(value);
}

export function isPortalAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${PORTAL_AUTH_EMAIL_DOMAIN}`);
}

export function portalAuthEmailFromUsername(username: string): string {
  const norm = normalizePortalLoginUsername(username);
  if (!norm) return '';
  return `${norm}@${PORTAL_AUTH_EMAIL_DOMAIN}`.toLowerCase();
}

export type PortalLoginIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'username'; value: string };

/** Head-office portals accept work email; legacy NIC username is still supported for dev. */
export function parsePortalLoginIdentifier(value: unknown): PortalLoginIdentifier | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    const at = email.indexOf('@');
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (!local || !domain || !domain.includes('.')) return null;
    return { kind: 'email', value: email };
  }

  const username = normalizePortalLoginUsername(trimmed);
  return username ? { kind: 'username', value: username } : null;
}
