import { createSupabaseServiceClient } from "../../../packages/supabase/service";

import { normalizeTenantSlug } from "./tenant-host";

export type TenantCompany = {
  id: string;
  name: string;
  slug: string;
  isSuspended: boolean;
};

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

