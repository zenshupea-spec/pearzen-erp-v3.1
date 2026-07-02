import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  devTenantSlugFromEnv,
  resolvePwaTenantSlugFromHostname,
} from './pwa-tenant-host';

describe('resolvePwaTenantSlugFromHostname', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not default to cvs on localhost without DEV_TENANT_SLUG', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', '');
    expect(resolvePwaTenantSlugFromHostname('127.0.0.1:3001')).toBeNull();
    expect(resolvePwaTenantSlugFromHostname('localhost:3001')).toBeNull();
  });

  it('uses NEXT_PUBLIC_DEV_TENANT_SLUG on localhost only', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'demo');
    expect(resolvePwaTenantSlugFromHostname('127.0.0.1:3001')).toBe('demo');
  });

  it('resolves CVS legacy check-in host cv.pearzen.tech', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(resolvePwaTenantSlugFromHostname('cv.pearzen.tech')).toBe('cvs');
  });

  it('resolves conventional check-in and SM hosts for new tenants', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(resolvePwaTenantSlugFromHostname('democheckin.pearzen.tech')).toBe('demo');
    expect(resolvePwaTenantSlugFromHostname('demosm.pearzen.tech')).toBe('demo');
  });

  it('returns null for unknown production hostnames', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(resolvePwaTenantSlugFromHostname('forge.pearzen.tech')).toBeNull();
    expect(resolvePwaTenantSlugFromHostname('erp.pearzen.tech')).toBeNull();
  });

  it('returns null for back-office portal hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(resolvePwaTenantSlugFromHostname('demohq.pearzen.tech')).toBeNull();
    expect(resolvePwaTenantSlugFromHostname('cvshq.pearzen.tech')).toBeNull();
  });

  it('resolves bare tenant subdomain', () => {
    vi.stubEnv('NEXT_PUBLIC_TENANT_BASE_DOMAIN', 'pearzen.tech');
    expect(resolvePwaTenantSlugFromHostname('demo.pearzen.tech')).toBe('demo');
  });
});

describe('devTenantSlugFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', '');
    expect(devTenantSlugFromEnv()).toBeNull();
  });
});
