import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultTenantSlugForPlatformHost,
  isTenantRedirectPlatformHost,
  isVercelDeployHost,
  resolveTenantSlugFromHostAndCookie,
} from './tenant-host';
import { isDedicatedForgeHost } from './forge-host';

describe('isVercelDeployHost', () => {
  it('detects Vercel preview deploy hostnames', () => {
    expect(isVercelDeployHost('pearzen-erp-v3-1-back-office.vercel.app')).toBe(true);
    expect(isVercelDeployHost('pearzen-erp-v3-1-back-office-git-main.vercel.app')).toBe(true);
    expect(isVercelDeployHost('erp.pearzen.tech')).toBe(false);
    expect(isVercelDeployHost('cvs.pearzen.tech')).toBe(false);
  });
});

describe('isTenantRedirectPlatformHost', () => {
  it('does not treat vercel.app as erp redirect host', () => {
    expect(isTenantRedirectPlatformHost('pearzen-erp-v3-1-back-office.vercel.app')).toBe(false);
    expect(isTenantRedirectPlatformHost('erp.pearzen.tech')).toBe(true);
  });
});

describe('resolveTenantSlugFromHostAndCookie on platform hosts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not default to cvs on vercel.app without cookie', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'cvs');
    expect(
      resolveTenantSlugFromHostAndCookie('pearzen-erp-v3-1-back-office.vercel.app', null, {
        allowDevFallback: false,
      }),
    ).toBeNull();
  });

  it('honours explicit cookie on vercel.app', () => {
    expect(
      resolveTenantSlugFromHostAndCookie(
        'pearzen-erp-v3-1-back-office.vercel.app',
        'acme',
        { allowDevFallback: false },
      ),
    ).toBe('acme');
  });
});

describe('defaultTenantSlugForPlatformHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null on vercel.app without cookie even when dev slug env is set', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'cvs');
    expect(
      defaultTenantSlugForPlatformHost(null, 'pearzen-erp-v3-1-back-office.vercel.app'),
    ).toBeNull();
  });

  it('uses cookie on vercel.app when present', () => {
    expect(
      defaultTenantSlugForPlatformHost('tenant-a', 'pearzen-erp-v3-1-back-office.vercel.app'),
    ).toBe('tenant-a');
  });

  it('returns null on erp.pearzen.tech without explicit redirect env', () => {
    vi.unstubAllEnvs();
    expect(defaultTenantSlugForPlatformHost(null, 'erp.pearzen.tech')).toBeNull();
  });

  it('uses FORGE_DEFAULT_REDIRECT_SLUG on erp host when set', () => {
    vi.stubEnv('FORGE_DEFAULT_REDIRECT_SLUG', 'cvs');
    expect(defaultTenantSlugForPlatformHost(null, 'erp.pearzen.tech')).toBe('cvs');
  });

  it('uses NEXT_PUBLIC_DEV_TENANT_SLUG on localhost only', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'demo');
    expect(defaultTenantSlugForPlatformHost(null, '127.0.0.1')).toBe('demo');
    expect(defaultTenantSlugForPlatformHost(null, 'erp.pearzen.tech')).toBeNull();
  });
});

describe('dedicated Forge hosts never inherit tenant cookie scope', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forge.pearzen.tech returns null slug even with cvs cookie', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(isDedicatedForgeHost('forge.pearzen.tech')).toBe(true);
    expect(resolveTenantSlugFromHostAndCookie('forge.pearzen.tech', 'cvs')).toBeNull();
  });
});
