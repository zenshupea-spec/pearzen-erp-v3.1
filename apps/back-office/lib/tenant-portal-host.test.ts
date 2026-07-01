import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveTenantSlugFromHostAndCookie } from './tenant-host';
import {
  conventionalTenantPortalProductionHosts,
  isTenantPortalAuthFlowPath,
  parseConventionalTenantPortalHost,
  parseCvsDedicatedHost,
  parseDedicatedPortalHost,
  parseTenantPortalHost,
  pathAllowedOnTenantPortalHost,
} from './tenant-portal-host';

describe('parseCvsDedicatedHost (legacy CVS production names)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('still resolves cvshq and cv check-in without convention map edits', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseCvsDedicatedHost('cvshq.pearzen.tech')).toEqual({
      tenantSlug: 'cvs',
      role: 'hq',
    });
    expect(parseCvsDedicatedHost('cv.pearzen.tech')).toEqual({
      tenantSlug: 'cvs',
      role: 'checkin',
    });
  });
});

describe('parseConventionalTenantPortalHost (new tenants)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves demohq.pearzen.tech to demo tenant HQ portal', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseConventionalTenantPortalHost('demohq.pearzen.tech')).toEqual({
      tenantSlug: 'demo',
      role: 'hq',
    });
  });

  it('resolves demoexec, demoom, and demotm', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseConventionalTenantPortalHost('demoexec.pearzen.tech')).toEqual({
      tenantSlug: 'demo',
      role: 'md',
    });
    expect(parseConventionalTenantPortalHost('demoom.pearzen.tech')).toEqual({
      tenantSlug: 'demo',
      role: 'om',
    });
    expect(parseConventionalTenantPortalHost('demotm.pearzen.tech')).toEqual({
      tenantSlug: 'demo',
      role: 'tm',
    });
  });

  it('does not treat bare tenant subdomains as dedicated portal hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseConventionalTenantPortalHost('demo.pearzen.tech')).toBeNull();
  });
});

describe('parseDedicatedPortalHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers CVS legacy map for cvshq over convention parser', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseDedicatedPortalHost('cvshq.pearzen.tech')).toEqual({
      tenantSlug: 'cvs',
      role: 'hq',
    });
  });

  it('falls back to convention for demo tenant hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseDedicatedPortalHost('demohq.pearzen.tech')).toEqual({
      tenantSlug: 'demo',
      role: 'hq',
    });
  });
});

describe('parseTenantPortalHost bindings', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds HQ binding for demohq.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    const binding = parseTenantPortalHost('demohq.pearzen.tech');
    expect(binding).toEqual({
      tenantSlug: 'demo',
      portal: 'hq',
      loginPath: '/login/hq',
      homePath: '/dashboard',
    });
  });

  it('ignores PWA-only conventional hosts on back-office parser', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(parseTenantPortalHost('demosm.pearzen.tech')).toBeNull();
    expect(parseTenantPortalHost('democheckin.pearzen.tech')).toBeNull();
  });
});

describe('resolveTenantSlugFromHostAndCookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves demo slug from demohq.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(
      resolveTenantSlugFromHostAndCookie('demohq.pearzen.tech', null, {
        allowDevFallback: false,
      }),
    ).toBe('demo');
  });
});

describe('conventionalTenantPortalProductionHosts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('generates demo portal DNS names from slug', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(conventionalTenantPortalProductionHosts('demo')).toEqual({
      hq: 'demohq.pearzen.tech',
      md: 'demoexec.pearzen.tech',
      om: 'demoom.pearzen.tech',
      tm: 'demotm.pearzen.tech',
      sm: 'demosm.pearzen.tech',
      checkin: 'democheckin.pearzen.tech',
    });
  });

  it('allows café and Shalom front login paths on HQ dedicated hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    const binding = parseTenantPortalHost('cvshq.pearzen.tech');
    expect(binding?.loginPath).toBe('/login/hq');
    expect(isTenantPortalAuthFlowPath('/login/cafe-front')).toBe(true);
    expect(isTenantPortalAuthFlowPath('/login/shalom-front')).toBe(true);
    expect(
      pathAllowedOnTenantPortalHost('/login/cafe-front', '', binding!),
    ).toBe(true);
    expect(
      pathAllowedOnTenantPortalHost('/cafe-front', '', binding!),
    ).toBe(true);
  });
});
