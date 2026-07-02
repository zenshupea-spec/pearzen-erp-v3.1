import { isImmutableExecutiveRank } from '../../../packages/portal-rbac';

/**
 * HQ staff GPS geofence at login / verify-pin / middleware.
 * Disabled for CVS — staff may sign in remotely without Head Office coordinates.
 */
export const HEAD_OFFICE_GEOFENCE_ENABLED = false;

/**
 * Head Office geofence exemption policy (Audit §3.1.5 / R-AUTH-04).
 *
 * When {@link HEAD_OFFICE_GEOFENCE_ENABLED} is false, all ranks are exempt.
 * When enabled, MD and OD are exempt; other HO ranks must pass
 * `verifyHeadOfficeGeofenceForCompany` and hold a valid `pz_ho_geo_session`
 * cookie before protected routes load.
 */
export function isHeadOfficeGeofenceExempt(
  role: string | null | undefined,
): boolean {
  if (!HEAD_OFFICE_GEOFENCE_ENABLED) return true;
  return isImmutableExecutiveRank(role);
}
