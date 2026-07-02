/**
 * Route surface guards for PEARZEN_DEPLOYMENT_MODE (FORGE_CVS_ISOLATION S-6).
 * Pure helpers — middleware calls deploymentModeRouteRedirect().
 */

import {
  isForgeDeploy,
  isTenantErpDeploy,
  isUnifiedDevDeploy,
  readPearzenDeploymentMode,
  type PearzenDeploymentMode,
} from './deployment-mode';
import { isForgeOnlyPath } from './tenant-host';

/** Paths served on the Forge Vercel project (forge deploy profile). */
export function isForgeDeployAllowedPath(pathname: string): boolean {
  if (isForgeOnlyPath(pathname)) return true;
  if (pathname === '/pearzen-website' || pathname.startsWith('/pearzen-website/')) {
    return true;
  }
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/api/superapp/')) return true;
  if (pathname.startsWith('/api/resend/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

/** Platform console paths blocked on the tenant ERP Vercel project. */
export function isTenantErpForbiddenPlatformPath(pathname: string): boolean {
  return (
    pathname === '/forge' ||
    pathname.startsWith('/forge/') ||
    pathname === '/login/forge' ||
    pathname.startsWith('/login/forge/') ||
    pathname === '/partners' ||
    pathname.startsWith('/partners/') ||
    pathname === '/login/partners' ||
    pathname.startsWith('/login/partners/') ||
    pathname === '/pearzen-website' ||
    pathname.startsWith('/pearzen-website/')
  );
}

/** Middleware returns HTTP 404 when forge/tenant deploy blocks a path (S-18 / S-19). */
export const DEPLOYMENT_MODE_NOT_FOUND = '__deployment_mode_not_found__' as const;

export type DeploymentModeRouteResult =
  | typeof DEPLOYMENT_MODE_NOT_FOUND
  | string
  | null;

/**
 * When non-null, middleware should redirect or respond 404.
 * unified-dev → null (no deployment-mode blocking).
 */
export function deploymentModeRouteRedirect(
  pathname: string,
  mode: PearzenDeploymentMode = readPearzenDeploymentMode(),
): DeploymentModeRouteResult {
  if (isUnifiedDevDeploy(mode)) return null;

  if (isForgeDeploy(mode)) {
    if (isForgeDeployAllowedPath(pathname)) return null;
    if (pathname.startsWith('/login') && !pathname.startsWith('/login/forge')) {
      return '/login/forge';
    }
    return DEPLOYMENT_MODE_NOT_FOUND;
  }

  if (isTenantErpDeploy(mode)) {
    if (!isTenantErpForbiddenPlatformPath(pathname)) return null;
    return DEPLOYMENT_MODE_NOT_FOUND;
  }

  return null;
}
