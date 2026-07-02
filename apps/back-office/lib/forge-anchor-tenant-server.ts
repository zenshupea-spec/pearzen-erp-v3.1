import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  isValidForgeAnchorCompanyId,
  resolveForgeAnchorTenantIdFromSettings,
  type ForgeAnchorTenant,
} from './forge-anchor-tenant';

export type { ForgeAnchorTenant } from './forge-anchor-tenant';

/** PEARS anchor company — forge_settings.anchor_tenant_id with CVS migration default. */
export async function getForgeAnchorTenantId(): Promise<string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return resolveForgeAnchorTenantIdFromSettings(null);
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('forge_settings')
    .select('anchor_tenant_id')
    .eq('singleton', true)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    console.error('getForgeAnchorTenantId:', error.message);
    return resolveForgeAnchorTenantIdFromSettings(null);
  }

  return resolveForgeAnchorTenantIdFromSettings(
    data?.anchor_tenant_id != null ? String(data.anchor_tenant_id) : null,
  );
}

export async function getForgeAnchorTenant(): Promise<ForgeAnchorTenant | null> {
  const companyId = await getForgeAnchorTenantId();
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('companies')
    .select('id, name, slug')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    console.error('getForgeAnchorTenant:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: String(data.id),
    name: String(data.name ?? 'Tenant'),
    slug: data.slug != null ? String(data.slug) : null,
  };
}

export async function setForgeAnchorTenantId(companyId: string): Promise<void> {
  const trimmed = companyId.trim();
  if (!isValidForgeAnchorCompanyId(trimmed)) {
    throw new Error('Invalid anchor tenant company id.');
  }

  const db = createSupabaseServiceClient();
  const { data: company, error: companyError } = await db
    .from('companies')
    .select('id')
    .eq('id', trimmed)
    .maybeSingle();

  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error('Company not found.');

  const { error } = await db.from('forge_settings').upsert(
    {
      singleton: true,
      anchor_tenant_id: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'singleton' },
  );

  if (error) throw new Error(error.message);
}
