import { isHeadOfficePasswordChangePath } from './head-office-portal-gate-paths';

/** Accept only same-origin staff portal paths for post-action redirects. */
export function resolveSafePortalReturnPath(
  returnTo: string | null | undefined,
  fallback: string,
): string {
  if (!returnTo) return fallback;

  const trimmed = returnTo.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  if (trimmed.startsWith('/login')) {
    return fallback;
  }
  if (isHeadOfficePasswordChangePath(trimmed)) {
    return fallback;
  }

  return trimmed;
}
