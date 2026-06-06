import { cookies, headers } from "next/headers";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";

import {
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  normalizeTenantSlug,
} from "./tenant-host";

export type TenantCompany = {
  id: string;
  name: string;
  slug: string;
  isSuspended: boolean;
};

export async function getTenantSlugFromRequest(): Promise<string | null> {
  const hdrs = await headers();
  const fromHeader = normalizeTenantSlug(hdrs.get(TENANT_SLUG_HEADER));
  if (fromHeader) return fromHeader;

  const cookieStore = await cookies();
  return normalizeTenantSlug(cookieStore.get(TENANT_SLUG_COOKIE)?.value);
}

/** Service-role lookup — works on public login pages before auth. */
export async function resolveTenantCompany(
  slug: string,
): Promise<TenantCompany | null> {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return null;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, is_suspended")
    .eq("slug", normalized)
    .maybeSingle();

  if (error || !data?.id) return null;

  return {
    id: data.id as string,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? normalized),
    isSuspended: Boolean(data.is_suspended),
  };
}

export async function resolveTenantCompanyFromRequest(): Promise<TenantCompany | null> {
  const slug = await getTenantSlugFromRequest();
  if (!slug) return null;
  return resolveTenantCompany(slug);
}
