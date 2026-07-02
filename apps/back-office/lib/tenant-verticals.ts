/** Tenant vertical module keys provisioned from SaaS Forge `/forge/modules`. */

export const TENANT_VERTICAL_KEYS = ['restaurant', 'salon', 'retail'] as const;

export type TenantVerticalKey = (typeof TENANT_VERTICAL_KEYS)[number];

export const TENANT_VERTICAL_STATUSES = ['inactive', 'active', 'suspended'] as const;

export type TenantVerticalStatus = (typeof TENANT_VERTICAL_STATUSES)[number];

export function isTenantVerticalKey(value: string): value is TenantVerticalKey {
  return (TENANT_VERTICAL_KEYS as readonly string[]).includes(value);
}

export function isTenantVerticalStatus(value: string): value is TenantVerticalStatus {
  return (TENANT_VERTICAL_STATUSES as readonly string[]).includes(value);
}

export type TenantVerticalDefinition = {
  key: TenantVerticalKey;
  label: string;
  shortLabel: string;
  productCode: string;
  syncsCafeModule: boolean;
  routeHint: string;
};

export const TENANT_VERTICAL_DEFINITIONS: TenantVerticalDefinition[] = [
  {
    key: 'restaurant',
    label: 'Restaurant / Café',
    shortLabel: 'Café',
    productCode: 'vertical_restaurant',
    syncsCafeModule: true,
    routeHint: '/executive/cafe · café-front · client menu',
  },
  {
    key: 'salon',
    label: 'Salon',
    shortLabel: 'Salon',
    productCode: 'vertical_salon',
    syncsCafeModule: false,
    routeHint: '/salon · bookings · POS · catalog',
  },
  {
    key: 'retail',
    label: 'Retail / E-commerce',
    shortLabel: 'Retail',
    productCode: 'vertical_retail',
    syncsCafeModule: false,
    routeHint: '/retail · inventory · checkout · orders',
  },
];

export function verticalIsEnabled(status: TenantVerticalStatus | null | undefined): boolean {
  return status === 'active';
}

export function verticalStatusLabel(status: TenantVerticalStatus | null | undefined): string {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  return 'Off';
}

export function verticalStatusBadgeClass(status: TenantVerticalStatus | null | undefined): string {
  if (status === 'active') return 'text-emerald-400';
  if (status === 'suspended') return 'text-amber-300';
  return 'text-slate-500';
}

export type TenantVerticalMap = Record<TenantVerticalKey, TenantVerticalStatus>;

export function emptyTenantVerticalMap(): TenantVerticalMap {
  return {
    restaurant: 'inactive',
    salon: 'inactive',
    retail: 'inactive',
  };
}
