import { EXECUTIVE_DESK_PATH, HQ_HUB_PATH, WFM_HUB_PATH } from './hq-hub';
import {
  GUARD_FIELD_PORTAL_ROUTE,
  MASTER_HUB_PILLARS,
  WFM_HUB_PILLARS,
  type MasterHubModule,
  type MasterHubPillar,
} from './master-hub-pillars';

export const PRODUCT_BUNDLES = ['full_erp', 'wfm_only'] as const;

export type ProductBundle = (typeof PRODUCT_BUNDLES)[number];

export { WFM_HUB_PATH };

/** Default hub module routes for WFM-only tenants (HR + FM + attendance). */
export const WFM_DEFAULT_ENABLED_MODULES = [
  '/hr',
  '/hr/mnr',
  '/fm',
  '/hq/deductions',
  '/hq/guard-proxy',
] as const;

const WFM_BLOCKED_PREFIXES = [
  '/om',
  '/tm',
  '/invoice-desk',
  '/security-website',
  '/shalom-public',
  '/executive',
  '/hq/audit',
  '/hq/sm-proxy',
] as const;

const PATHS_ALWAYS_ALLOWED = [
  '/wfm',
  '/salon',
  '/retail',
  '/settings',
  '/account',
  '/login',
  '/auth',
  '/shalom-public',
] as const;

export const PRODUCT_BUNDLE_LABELS: Record<ProductBundle, string> = {
  full_erp: 'Full ERP',
  wfm_only: 'WFM only',
};

export function isProductBundle(value: string): value is ProductBundle {
  return (PRODUCT_BUNDLES as readonly string[]).includes(value);
}

export function hubPathForBundle(bundle: ProductBundle): string {
  return bundle === 'wfm_only' ? WFM_HUB_PATH : HQ_HUB_PATH;
}

export function hubPillarsForBundle(bundle: ProductBundle): MasterHubPillar[] {
  return bundle === 'wfm_only' ? WFM_HUB_PILLARS : MASTER_HUB_PILLARS;
}

export function defaultEnabledModulesForBundle(bundle: ProductBundle): string[] | null {
  if (bundle === 'wfm_only') {
    return [...WFM_DEFAULT_ENABLED_MODULES];
  }
  return null;
}

export function normalizeEnabledModules(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const routes = raw.map((entry) => String(entry).trim()).filter(Boolean);
  return routes.length ? routes : null;
}

export function effectiveEnabledModules(
  bundle: ProductBundle,
  enabledModules: string[] | null,
): string[] | null {
  if (bundle === 'wfm_only') {
    return enabledModules?.length ? enabledModules : [...WFM_DEFAULT_ENABLED_MODULES];
  }
  return enabledModules;
}

export function isHubModuleEnabled(
  route: string,
  enabledModules: string[] | null,
): boolean {
  if (!enabledModules?.length) return true;
  return enabledModules.some(
    (mod) => route === mod || (mod !== '/' && route.startsWith(`${mod}/`)),
  );
}

function isPathAlwaysAllowed(pathname: string): boolean {
  return PATHS_ALWAYS_ALLOWED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPathCoveredByEnabledModules(
  pathname: string,
  modules: string[],
): boolean {
  if (isPathAlwaysAllowed(pathname)) return true;
  return modules.some(
    (mod) => pathname === mod || (mod !== '/' && pathname.startsWith(`${mod}/`)),
  );
}

/** Route gate for middleware — blocks non-WFM paths on wfm_only tenants. */
export function isTenantPathAllowedForBundle(
  pathname: string,
  bundle: ProductBundle,
  enabledModules: string[] | null,
): boolean {
  if (isPathAlwaysAllowed(pathname)) return true;

  if (bundle === 'wfm_only') {
    if (pathname === HQ_HUB_PATH || pathname.startsWith(`${HQ_HUB_PATH}/`)) {
      return false;
    }
    for (const blocked of WFM_BLOCKED_PREFIXES) {
      if (pathname === blocked || pathname.startsWith(`${blocked}/`)) {
        return false;
      }
    }
    const effective = effectiveEnabledModules(bundle, enabledModules);
    return effective ? isPathCoveredByEnabledModules(pathname, effective) : true;
  }

  if (!enabledModules?.length) return true;
  return isPathCoveredByEnabledModules(pathname, enabledModules);
}

export function filterHubPillarsByModules(
  pillars: MasterHubPillar[],
  enabledModules: string[] | null,
): MasterHubPillar[] {
  return pillars
    .map((pillar) => ({
      ...pillar,
      modules: pillar.modules.filter((mod) =>
        isHubModuleEnabled(mod.route, enabledModules),
      ),
    }))
    .filter((pillar) => pillar.modules.length > 0);
}

export function landingPathForRoleAndBundle(
  role: string | null | undefined,
  bundle: ProductBundle,
  profile?: { rbacGated?: boolean },
): string {
  const normalized = role?.trim().toUpperCase() ?? '';
  if (!normalized) return '/login';

  if (bundle === 'wfm_only') {
    if (normalized === 'OM' || normalized === 'TM') return '/login/hq?error=wfm_bundle_denied';
    return WFM_HUB_PATH;
  }

  if (normalized === 'MD' || normalized === 'OD') return EXECUTIVE_DESK_PATH;
  if (normalized === 'OM') return '/om';
  if (normalized === 'TM') return '/tm';
  if (normalized === 'HR' || normalized === 'FM' || normalized === 'EA' || profile?.rbacGated) {
    return HQ_HUB_PATH;
  }
  return '/login';
}

export function hubModuleLabel(route: string): string | null {
  const allModules: MasterHubModule[] = [
    ...MASTER_HUB_PILLARS.flatMap((pillar) => pillar.modules),
    ...WFM_HUB_PILLARS.flatMap((pillar) => pillar.modules),
  ];
  return allModules.find((mod) => mod.route === route)?.label ?? null;
}
