import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { resolveCompanyIdForSession } from './company-context-server';
import { resolveTenantCompany } from './tenant-context';
import {
  defaultEnabledModulesForBundle,
  effectiveEnabledModules,
  isProductBundle,
  normalizeEnabledModules,
  type ProductBundle,
} from './tenant-product-bundle';

export type TenantModuleContext = {
  companyId: string;
  productBundle: ProductBundle;
  enabledModules: string[] | null;
  effectiveModules: string[] | null;
};

async function fetchMdSettingsEnabledModules(
  companyId: string,
): Promise<string[] | null> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('md_settings')
    .select('enabled_modules')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.warn('tenant-product-bundle: md_settings read failed', error.message);
    return null;
  }

  return normalizeEnabledModules(data?.enabled_modules);
}

export async function fetchTenantModuleContextByCompanyId(
  companyId: string,
): Promise<TenantModuleContext | null> {
  if (!companyId?.trim()) return null;

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('companies')
    .select('id, product_bundle')
    .eq('id', companyId.trim())
    .maybeSingle();

  if (error || !data?.id) return null;

  const rawBundle = String(data.product_bundle ?? 'full_erp');
  const productBundle: ProductBundle = isProductBundle(rawBundle) ? rawBundle : 'full_erp';
  const enabledModules = await fetchMdSettingsEnabledModules(String(data.id));

  return {
    companyId: String(data.id),
    productBundle,
    enabledModules,
    effectiveModules: effectiveEnabledModules(productBundle, enabledModules),
  };
}

export async function fetchTenantModuleContextForSlug(
  slug: string,
): Promise<TenantModuleContext | null> {
  const tenant = await resolveTenantCompany(slug);
  if (!tenant?.id) return null;
  return fetchTenantModuleContextByCompanyId(tenant.id);
}

export async function fetchTenantModuleContextForSession(): Promise<TenantModuleContext | null> {
  const { createSupabaseServerClient } = await import('../../../packages/supabase/server');
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return null;
  return fetchTenantModuleContextByCompanyId(companyId);
}

export async function setTenantProductBundle(
  companyId: string,
  bundle: ProductBundle,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!companyId?.trim()) {
    return { success: false, error: 'Missing company ID.' };
  }
  if (!isProductBundle(bundle)) {
    return { success: false, error: 'Invalid product bundle.' };
  }

  const db = createSupabaseServiceClient();
  const { error: companyError } = await db
    .from('companies')
    .update({ product_bundle: bundle })
    .eq('id', companyId.trim());

  if (companyError) {
    return { success: false, error: companyError.message };
  }

  const enabledModules = defaultEnabledModulesForBundle(bundle);
  const { error: settingsError } = await db.from('md_settings').upsert(
    {
      company_id: companyId.trim(),
      enabled_modules: enabledModules,
    },
    { onConflict: 'company_id' },
  );

  if (settingsError) {
    return { success: false, error: settingsError.message };
  }

  return { success: true };
}
