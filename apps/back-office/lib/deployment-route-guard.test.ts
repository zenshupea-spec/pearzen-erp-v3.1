import { describe, expect, it } from 'vitest';

import type { PearzenDeploymentMode } from './deployment-mode';
import {
  DEPLOYMENT_MODE_NOT_FOUND,
  deploymentModeRouteRedirect,
  isForgeDeployAllowedPath,
  isTenantErpForbiddenPlatformPath,
} from './deployment-route-guard';

function redirectFor(pathname: string, mode: PearzenDeploymentMode) {
  return deploymentModeRouteRedirect(pathname, mode);
}

describe('isForgeDeployAllowedPath', () => {
  it('allows Forge console, partners, marketing, and platform APIs', () => {
    expect(isForgeDeployAllowedPath('/forge')).toBe(true);
    expect(isForgeDeployAllowedPath('/forge/billing')).toBe(true);
    expect(isForgeDeployAllowedPath('/login/forge')).toBe(true);
    expect(isForgeDeployAllowedPath('/partners')).toBe(true);
    expect(isForgeDeployAllowedPath('/pearzen-website')).toBe(true);
    expect(isForgeDeployAllowedPath('/api/superapp/v1/inventory/x')).toBe(true);
    expect(isForgeDeployAllowedPath('/api/resend/inbound')).toBe(true);
    expect(isForgeDeployAllowedPath('/auth/callback')).toBe(true);
  });

  it('blocks tenant ERP portals on forge deploy', () => {
    expect(isForgeDeployAllowedPath('/om')).toBe(false);
    expect(isForgeDeployAllowedPath('/fm')).toBe(false);
    expect(isForgeDeployAllowedPath('/executive')).toBe(false);
    expect(isForgeDeployAllowedPath('/hq')).toBe(false);
    expect(isForgeDeployAllowedPath('/invoice-desk')).toBe(false);
    expect(isForgeDeployAllowedPath('/cafe-front')).toBe(false);
    expect(isForgeDeployAllowedPath('/api/cron/purge-verification-photos')).toBe(false);
  });
});

describe('deploymentModeRouteRedirect — forge profile', () => {
  it('returns 404 for tenant ERP and cron paths', () => {
    expect(redirectFor('/om', 'forge')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/fm/payroll', 'forge')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/api/cron/purge-verification-photos', 'forge')).toBe(
      DEPLOYMENT_MODE_NOT_FOUND,
    );
  });

  it('redirects non-forge login paths to /login/forge', () => {
    expect(redirectFor('/login/om', 'forge')).toBe('/login/forge');
  });

  it('allows Forge paths through', () => {
    expect(redirectFor('/forge/tenants', 'forge')).toBeNull();
    expect(redirectFor('/api/resend/inbound', 'forge')).toBeNull();
  });
});

describe('deploymentModeRouteRedirect — tenant-erp profile', () => {
  it('returns 404 for Forge console and platform marketing paths', () => {
    expect(redirectFor('/forge', 'tenant-erp')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/forge/billing', 'tenant-erp')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/login/forge', 'tenant-erp')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/partners', 'tenant-erp')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
    expect(redirectFor('/pearzen-website', 'tenant-erp')).toBe(DEPLOYMENT_MODE_NOT_FOUND);
  });

  it('allows tenant ERP paths through', () => {
    expect(redirectFor('/om', 'tenant-erp')).toBeNull();
    expect(redirectFor('/hq', 'tenant-erp')).toBeNull();
    expect(redirectFor('/login/hq', 'tenant-erp')).toBeNull();
  });
});

describe('deploymentModeRouteRedirect — unified-dev', () => {
  it('does not block any path', () => {
    expect(redirectFor('/om', 'unified-dev')).toBeNull();
    expect(redirectFor('/forge', 'unified-dev')).toBeNull();
  });
});

describe('isTenantErpForbiddenPlatformPath', () => {
  it('flags forge and platform marketing routes', () => {
    expect(isTenantErpForbiddenPlatformPath('/forge')).toBe(true);
    expect(isTenantErpForbiddenPlatformPath('/login/forge')).toBe(true);
    expect(isTenantErpForbiddenPlatformPath('/pearzen-website')).toBe(true);
    expect(isTenantErpForbiddenPlatformPath('/om')).toBe(false);
  });
});
