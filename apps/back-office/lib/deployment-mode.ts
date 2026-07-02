/**
 * Back-office deployment profile — splits Forge control plane from tenant ERP deploys.
 *
 * Set on Vercel per project (FORGE_CVS_ISOLATION_STEPS.md S-5+):
 *   · unified-dev — local `npm run dev` (default when unset)
 *   · forge       — pearzen-forge-back-office (Forge / partners / pearzen.tech only)
 *   · tenant-erp  — pearzen-erp-v3-1-back-office (CVS + tenant staff portals only)
 *
 * Safe in middleware, server, and client bundles (no secrets).
 */

export const PEARZEN_DEPLOYMENT_MODES = [
  'unified-dev',
  'forge',
  'tenant-erp',
] as const;

export type PearzenDeploymentMode = (typeof PEARZEN_DEPLOYMENT_MODES)[number];

const MODE_SET = new Set<string>(PEARZEN_DEPLOYMENT_MODES);

export function normalizePearzenDeploymentMode(
  raw: string | null | undefined,
): PearzenDeploymentMode | null {
  const mode = raw?.trim().toLowerCase();
  if (!mode || !MODE_SET.has(mode)) return null;
  return mode as PearzenDeploymentMode;
}

/** Active profile — defaults to unified-dev when env is missing or invalid. */
export function readPearzenDeploymentMode(): PearzenDeploymentMode {
  return normalizePearzenDeploymentMode(process.env.PEARZEN_DEPLOYMENT_MODE) ?? 'unified-dev';
}

export function isUnifiedDevDeploy(mode = readPearzenDeploymentMode()): boolean {
  return mode === 'unified-dev';
}

export function isForgeDeploy(mode = readPearzenDeploymentMode()): boolean {
  return mode === 'forge';
}

export function isTenantErpDeploy(mode = readPearzenDeploymentMode()): boolean {
  return mode === 'tenant-erp';
}
