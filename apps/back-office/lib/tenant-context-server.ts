import "server-only";

import { cookies, headers } from "next/headers";

import {
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  normalizeTenantSlug,
  resolveTenantSlugFromHostAndCookie,
} from "./tenant-host";
import {
  resolveTenantCompany,
  type TenantCompany,
} from "./tenant-context";

export type { TenantCompany } from "./tenant-context";

export async function getTenantSlugFromRequest(): Promise<string | null> {
  const hdrs = await headers();
  const fromHeader = normalizeTenantSlug(hdrs.get(TENANT_SLUG_HEADER));
  if (fromHeader) return fromHeader;

  const cookieStore = await cookies();
  return resolveTenantSlugFromHostAndCookie(
    hdrs.get("host") ?? "",
    cookieStore.get(TENANT_SLUG_COOKIE)?.value,
  );
}

export async function resolveTenantCompanyFromRequest(): Promise<TenantCompany | null> {
  const slug = await getTenantSlugFromRequest();
  if (!slug) return null;
  return resolveTenantCompany(slug);
}
