import { timingSafeEqual } from 'crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FLEET_TELEMATICS_COMPANY_ID_REQUIRED =
  'company_id is required for fleet telematics webhooks.';

export function verifyFleetTelematicsWebhookSecret(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided?.trim() || !expected.trim()) return false;
  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function normalizeFleetTelematicsCompanyId(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || !UUID_RE.test(value)) return null;
  return value.toLowerCase();
}

export function validateFleetTelematicsCompanyId(raw: unknown):
  | { ok: true; companyId: string }
  | { ok: false; error: string } {
  const companyId = normalizeFleetTelematicsCompanyId(raw);
  if (!companyId) {
    return { ok: false, error: FLEET_TELEMATICS_COMPANY_ID_REQUIRED };
  }
  return { ok: true, companyId };
}

export function readFleetTelematicsWebhookSecret(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return request.headers.get('x-fleet-telematics-secret')?.trim() ?? null;
}
