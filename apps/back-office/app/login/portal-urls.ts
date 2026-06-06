export {
  tenantPortalLoginUrl,
  tenantBaseDomain,
  normalizeTenantSlug,
} from "../../lib/tenant-host";

export function smPortalLoginUrl(): string {
  const base = process.env.NEXT_PUBLIC_SM_PWA_URL ?? "http://127.0.0.1:3003";
  return `${base.replace(/\/$/, "")}/login`;
}

export function guardPortalLoginUrl(): string {
  const base = process.env.NEXT_PUBLIC_FIELD_PWA_URL ?? "http://127.0.0.1:3001";
  return `${base.replace(/\/$/, "")}/login`;
}
