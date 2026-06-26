/** Route Handler target for clearing portal cookies during page renders. */
export function buildHeadOfficePortalResetPath(nextPath: string): string {
  const safeNext =
    nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/login/hq';
  return `/auth/portal-reset?next=${encodeURIComponent(safeNext)}`;
}
