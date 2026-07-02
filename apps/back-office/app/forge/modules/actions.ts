'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  emptyTenantVerticalMap,
  isTenantVerticalKey,
  isTenantVerticalStatus,
  TENANT_VERTICAL_DEFINITIONS,
  type TenantVerticalKey,
  type TenantVerticalMap,
  type TenantVerticalStatus,
} from '../../../lib/tenant-verticals';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

export type ForgeModuleTenant = {
  id: string;
  name: string;
  slug: string | null;
  hasCafeModule: boolean;
  verticals: TenantVerticalMap;
};

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('You are not authorised to manage tenant modules in Forge.');
  }
}

function mapVerticalStatus(value: string | null | undefined): TenantVerticalStatus {
  if (isTenantVerticalStatus(String(value ?? ''))) {
    return value as TenantVerticalStatus;
  }
  return 'inactive';
}

function buildTenantVerticalMap(
  rows: Array<{ vertical: string; status: string }>,
  hasCafeModule: boolean,
): TenantVerticalMap {
  const verticals = emptyTenantVerticalMap();

  for (const row of rows) {
    if (isTenantVerticalKey(row.vertical)) {
      verticals[row.vertical] = mapVerticalStatus(row.status);
    }
  }

  if (hasCafeModule && verticals.restaurant === 'inactive') {
    verticals.restaurant = 'active';
  }

  return verticals;
}

function revalidateModulePaths() {
  revalidatePath('/forge');
  revalidatePath('/forge/modules');
  revalidatePath('/forge/tenants');
}

export async function fetchModuleTenants() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();

    const supabase = createSupabaseServiceClient();
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name, slug, has_cafe_module')
      .neq('name', 'HQ_MASTER_ACCOUNT')
      .order('name', { ascending: true });

    if (companiesError) throw new Error(companiesError.message);

    const companyIds = (companies ?? []).map((row) => String(row.id));
    let subscriptionRows: Array<{ company_id: string; vertical: string; status: string }> = [];

    if (companyIds.length > 0) {
      const { data, error } = await supabase
        .from('tenant_vertical_subscriptions')
        .select('company_id, vertical, status')
        .in('company_id', companyIds);

      if (error && error.code !== '42P01') throw new Error(error.message);
      subscriptionRows = (data ?? []) as typeof subscriptionRows;
    }

    const rowsByCompany = subscriptionRows.reduce<Map<string, typeof subscriptionRows>>(
      (map, row) => {
        const companyId = String(row.company_id);
        const bucket = map.get(companyId) ?? [];
        bucket.push(row);
        map.set(companyId, bucket);
        return map;
      },
      new Map(),
    );

    const tenants: ForgeModuleTenant[] = (companies ?? []).map((row) => {
      const companyId = String(row.id);
      const hasCafeModule = Boolean(row.has_cafe_module);
      const verticalRows = rowsByCompany.get(companyId) ?? [];

      return {
        id: companyId,
        name: String(row.name ?? 'Unknown tenant'),
        slug: row.slug != null ? String(row.slug) : null,
        hasCafeModule,
        verticals: buildTenantVerticalMap(verticalRows, hasCafeModule),
      };
    });

    return {
      success: true as const,
      tenants,
      verticals: TENANT_VERTICAL_DEFINITIONS,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tenant modules';
    return {
      success: false as const,
      error: message,
      tenants: [],
      verticals: TENANT_VERTICAL_DEFINITIONS,
    };
  }
}

export async function setTenantVerticalStatus(input: {
  companyId: string;
  vertical: TenantVerticalKey;
  enabled: boolean;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();

    const companyId = input.companyId?.trim();
    if (!companyId) throw new Error('Missing company ID');
    if (!isTenantVerticalKey(input.vertical)) throw new Error('Invalid vertical');

    const nextStatus: TenantVerticalStatus = input.enabled ? 'active' : 'inactive';
    const supabase = createSupabaseServiceClient();

    const { error } = await supabase.from('tenant_vertical_subscriptions').upsert(
      {
        company_id: companyId,
        vertical: input.vertical,
        status: nextStatus,
        started_at: input.enabled ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,vertical' },
    );

    if (error) throw new Error(error.message);

    revalidateModulePaths();

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update module';
    return { success: false as const, error: message };
  }
}

/** @deprecated Use setTenantVerticalStatus — kept for compatibility. */
export async function toggleTenantModule(companyId: string, currentStatus: boolean) {
  return setTenantVerticalStatus({
    companyId,
    vertical: 'restaurant',
    enabled: !currentStatus,
  });
}
