import type { NextRequest } from 'next/server';

import { isLocalDevHost } from './tenant-host';

/**
 * Local Forge dev — skip Google OAuth (Supabase Site URL may redirect to production).
 * Enabled on localhost in non-production. Set FORGE_DEV_SKIP_GOOGLE=false to disable.
 */
export function forgeLocalDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.FORGE_DEV_SKIP_GOOGLE === 'false') return false;
  return true;
}

export function isForgeLocalDevHost(hostname: string | null | undefined): boolean {
  if (!hostname || !forgeLocalDevBypassEnabled()) return false;
  return isLocalDevHost(hostname.split(':')[0]);
}

export async function isForgeLocalDevRequest(): Promise<boolean> {
  if (!forgeLocalDevBypassEnabled()) return false;
  const { headers } = await import('next/headers');
  const host = (await headers()).get('host') ?? '';
  return isForgeLocalDevHost(host);
}

export function isForgeLocalDevRequestFromReq(req: NextRequest): boolean {
  if (!forgeLocalDevBypassEnabled()) return false;
  return isForgeLocalDevHost(req.headers.get('host'));
}

/** On localhost, PIN / 2FA / unlock gates are skipped after password sign-in. */
export function forgeLocalDevSkipsSecurityGates(): boolean {
  return forgeLocalDevBypassEnabled();
}
