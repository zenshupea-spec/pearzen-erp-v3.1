import { isImmutableExecutiveRank } from '../../../packages/portal-rbac';

/** MD and OD may sign in and use portals from any location. */
export function isHeadOfficeGeofenceExempt(
  role: string | null | undefined,
): boolean {
  return isImmutableExecutiveRank(role);
}
