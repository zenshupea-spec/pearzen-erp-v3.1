import type { NextRequest } from 'next/server';

import { isLocalDevHost } from './tenant-host';

/**
 * Local portal dev helpers — used by Forge local bypass only.
 * Head Office executives (MD/OD) always complete the full OTP → password → 2FA chain.
 * Set PORTAL_DEV_SKIP_SECURITY=false to disable Forge localhost shortcuts.
 */
export function portalLocalDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.PORTAL_DEV_SKIP_SECURITY === 'false') return false;
  return true;
}

export function isPortalLocalDevHost(hostname: string | null | undefined): boolean {
  if (!hostname || !portalLocalDevBypassEnabled()) return false;
  return isLocalDevHost(hostname.split(':')[0]);
}

export async function isPortalLocalDevRequest(): Promise<boolean> {
  if (!portalLocalDevBypassEnabled()) return false;
  const { headers } = await import('next/headers');
  const host = (await headers()).get('host') ?? '';
  return isPortalLocalDevHost(host);
}

export function isPortalLocalDevRequestFromReq(req: NextRequest): boolean {
  if (!portalLocalDevBypassEnabled()) return false;
  return isPortalLocalDevHost(req.headers.get('host'));
}

export function portalLocalDevSkipsSecurityGates(): boolean {
  return portalLocalDevBypassEnabled();
}
