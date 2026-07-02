import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isForgeDeploy,
  isTenantErpDeploy,
  isUnifiedDevDeploy,
  normalizePearzenDeploymentMode,
  readPearzenDeploymentMode,
} from './deployment-mode';

describe('deployment-mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes valid modes', () => {
    expect(normalizePearzenDeploymentMode('forge')).toBe('forge');
    expect(normalizePearzenDeploymentMode(' TENANT-ERP ')).toBe('tenant-erp');
    expect(normalizePearzenDeploymentMode('unified-dev')).toBe('unified-dev');
  });

  it('rejects unknown modes', () => {
    expect(normalizePearzenDeploymentMode('production')).toBeNull();
    expect(normalizePearzenDeploymentMode('')).toBeNull();
  });

  it('defaults to unified-dev when env is unset', () => {
    vi.unstubAllEnvs();
    expect(readPearzenDeploymentMode()).toBe('unified-dev');
    expect(isUnifiedDevDeploy()).toBe(true);
    expect(isForgeDeploy()).toBe(false);
    expect(isTenantErpDeploy()).toBe(false);
  });

  it('detects forge and tenant-erp profiles', () => {
    vi.stubEnv('PEARZEN_DEPLOYMENT_MODE', 'forge');
    expect(isForgeDeploy()).toBe(true);
    expect(isTenantErpDeploy()).toBe(false);

    vi.stubEnv('PEARZEN_DEPLOYMENT_MODE', 'tenant-erp');
    expect(isForgeDeploy()).toBe(false);
    expect(isTenantErpDeploy()).toBe(true);
  });
});
