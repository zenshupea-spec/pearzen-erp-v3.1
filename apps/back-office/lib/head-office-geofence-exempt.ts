import { isImmutableExecutiveRank } from '../../../packages/portal-rbac';

/**
 * Head Office geofence exemption policy (Audit §3.1.5 / R-AUTH-04).
 *
 * Managing Director (MD) and Operations Director (OD) are exempt from GPS
 * geofence enforcement at NIC login, verify-pin, and middleware session checks.
 * All other HO ranks (HR, OM, FM, EA, etc.) must pass
 * `verifyHeadOfficeGeofenceForCompany` and hold a valid `pz_ho_geo_session`
 * cookie before protected routes load.
 *
 * Rationale: executive incident response and remote oversight. Exemption is
 * rank-based via `isImmutableExecutiveRank` — not configurable per tenant.
 */
export function isHeadOfficeGeofenceExempt(
  role: string | null | undefined,
): boolean {
  return isImmutableExecutiveRank(role);
}
