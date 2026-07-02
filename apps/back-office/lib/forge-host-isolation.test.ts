import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  dedicatedForgeHosts,
  isDedicatedForgeHost,
} from './forge-host';
import {
  dedicatedForgeHostErpRedirectPath,
  isForgeOnlyPath,
  resolveTenantSlugFromHostAndCookie,
} from './tenant-host';
import {
  parseTenantPortalHost,
  pathAllowedOnTenantPortalHost,
  tenantPortalPlatformPathRedirect,
} from './tenant-portal-host';

describe('dedicated Forge host detection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes forge and superadmin production hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(isDedicatedForgeHost('forge.pearzen.tech')).toBe(true);
    expect(isDedicatedForgeHost('superadmin.pearzen.tech')).toBe(true);
    expect(dedicatedForgeHosts()).toContain('forge.pearzen.tech');
  });

  it('does not treat CVS tenant portal hosts as Forge', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(isDedicatedForgeHost('cvshq.pearzen.tech')).toBe(false);
    expect(isDedicatedForgeHost('cvsom.pearzen.tech')).toBe(false);
  });
});

describe('resolveTenantSlugFromHostAndCookie on dedicated Forge hosts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ignores pearzen_tenant_slug cookie on forge.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(
      resolveTenantSlugFromHostAndCookie('forge.pearzen.tech', 'cvs', {
        allowDevFallback: false,
      }),
    ).toBeNull();
  });

  it('ignores cookie on superadmin.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(
      resolveTenantSlugFromHostAndCookie('superadmin.pearzen.tech', 'cvs', {
        allowDevFallback: false,
      }),
    ).toBeNull();
  });

  it('still resolves CVS dedicated portal hosts with cookie', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(
      resolveTenantSlugFromHostAndCookie('cvshq.pearzen.tech', 'cvs', {
        allowDevFallback: false,
      }),
    ).toBe('cvs');
  });
});

describe('dedicatedForgeHostErpRedirectPath (middleware matrix)', () => {
  it('redirects tenant ERP paths away from Forge host', () => {
    expect(dedicatedForgeHostErpRedirectPath('/om')).toBe('/forge');
    expect(dedicatedForgeHostErpRedirectPath('/fm/payroll')).toBe('/forge');
    expect(dedicatedForgeHostErpRedirectPath('/login/om')).toBe('/login/forge');
  });

  it('allows Forge console paths', () => {
    expect(dedicatedForgeHostErpRedirectPath('/forge')).toBeNull();
    expect(dedicatedForgeHostErpRedirectPath('/forge/billing')).toBeNull();
    expect(dedicatedForgeHostErpRedirectPath('/login/forge')).toBeNull();
    expect(dedicatedForgeHostErpRedirectPath('/pearzen-website')).toBeNull();
  });

  it('allows auth and API paths through', () => {
    expect(dedicatedForgeHostErpRedirectPath('/auth/callback')).toBeNull();
    expect(dedicatedForgeHostErpRedirectPath('/api/superapp/v1/inventory/x')).toBeNull();
  });
});

describe('isForgeOnlyPath', () => {
  it('matches Forge, partners, and Pearzen marketing routes', () => {
    expect(isForgeOnlyPath('/forge')).toBe(true);
    expect(isForgeOnlyPath('/forge/tenants')).toBe(true);
    expect(isForgeOnlyPath('/login/forge')).toBe(true);
    expect(isForgeOnlyPath('/partners')).toBe(true);
    expect(isForgeOnlyPath('/pearzen-website')).toBe(true);
    expect(isForgeOnlyPath('/om')).toBe(false);
    expect(isForgeOnlyPath('/hq')).toBe(false);
  });
});

describe('tenant portal host isolation from Forge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects /forge away from cvshq.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    const binding = parseTenantPortalHost('cvshq.pearzen.tech');
    expect(binding).not.toBeNull();
    expect(tenantPortalPlatformPathRedirect('/forge', binding!)).toBe('/dashboard');
    expect(tenantPortalPlatformPathRedirect('/forge/billing', binding!)).toBe('/dashboard');
  });

  it('allows HQ portal paths on cvshq.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    const binding = parseTenantPortalHost('cvshq.pearzen.tech');
    expect(binding).not.toBeNull();
    expect(tenantPortalPlatformPathRedirect('/hq', binding!)).toBeNull();
    expect(pathAllowedOnTenantPortalHost('/hq', '', binding!)).toBe(true);
  });
});

describe('middleware static contracts', () => {
  it('clears tenant slug cookie on dedicated Forge routes', () => {
    const middleware = readMiddlewareSource();
    expect(middleware).toContain('clearTenantSlugCookie(response)');
    expect(middleware).toContain('isDedicatedForgeHost(hostname)');
    expect(middleware).toContain('dedicatedForgeHostErpRedirectPath');
    expect(middleware).toContain('tenantPortalPlatformPathRedirect');
    expect(middleware).toContain('deploymentModeRouteRedirect');
  });
});

function readMiddlewareSource(): string {
  return readFileSync(join(process.cwd(), 'apps/back-office/middleware.ts'), 'utf8');
}
