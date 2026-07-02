import type { SupabaseClient } from '@supabase/supabase-js';

import {
  provisionTenantDefaults,
  type TenantProductBundle,
} from '../../../packages/supabase/tenant-provisioning';
import { validateExecutiveRecoveryEmail } from './head-office-portal-recovery-email';
import { writeForgeAuditLog } from './forge-audit-log';
import {
  assertForgeTenantCreated,
  assertForgeTenantInsertPayload,
  assertForgeTenantSlugAllowed,
} from './forge-tenant-provision-guard';
import { normalizeTenantSlug } from './tenant-host';

export type ForgeTenantProvisionInput = {
  companyName: string;
  slug: string;
  mdEmail: string;
  odEmail: string;
  mdRecoveryEmail: string;
  odRecoveryEmail: string;
  productBundle?: TenantProductBundle;
  actorEmail: string;
};

export type ForgeTenantProvisionResult =
  | { success: true; companyId: string }
  | { success: false; error: string };

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function createForgeTenantRecord(
  db: SupabaseClient,
  input: ForgeTenantProvisionInput,
): Promise<ForgeTenantProvisionResult> {
  const companyName = input.companyName.trim().toUpperCase();
  const slug = normalizeTenantSlug(input.slug);
  const mdEmail = normalizeEmail(input.mdEmail);
  const odEmail = normalizeEmail(input.odEmail);
  const mdRecoveryEmail = normalizeEmail(input.mdRecoveryEmail);
  const odRecoveryEmail = normalizeEmail(input.odRecoveryEmail);
  const productBundle: TenantProductBundle =
    input.productBundle === 'wfm_only' ? 'wfm_only' : 'full_erp';

  if (!companyName || !slug) {
    return {
      success: false,
      error: 'Company name and a valid slug (lowercase letters, numbers, hyphens) are required.',
    };
  }

  try {
    assertForgeTenantSlugAllowed(slug);
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid tenant slug.',
    };
  }

  if (!mdEmail || !odEmail) {
    return { success: false, error: 'MD and OD portal emails are required.' };
  }
  if (mdEmail === odEmail) {
    return { success: false, error: 'MD and OD must use different Google sign-in emails.' };
  }

  const mdRecoveryCheck = validateExecutiveRecoveryEmail(mdEmail, mdRecoveryEmail);
  if (!mdRecoveryCheck.ok) {
    return { success: false, error: `MD recovery email: ${mdRecoveryCheck.error}` };
  }
  const odRecoveryCheck = validateExecutiveRecoveryEmail(odEmail, odRecoveryEmail);
  if (!odRecoveryCheck.ok) {
    return { success: false, error: `OD recovery email: ${odRecoveryCheck.error}` };
  }
  if (mdRecoveryCheck.recoveryEmail === odRecoveryCheck.recoveryEmail) {
    return { success: false, error: 'MD and OD recovery emails must be different.' };
  }

  const insertPayload = {
    name: companyName,
    slug,
    is_suspended: false,
    subscription_status: 'trial',
    product_bundle: productBundle,
  };

  try {
    assertForgeTenantInsertPayload(insertPayload);
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid tenant insert payload.',
    };
  }

  const { data: slugConflict } = await db
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugConflict?.id) {
    return { success: false, error: `Slug "${slug}" is already in use.` };
  }

  const { data: company, error: insertError } = await db
    .from('companies')
    .insert([insertPayload])
    .select('id')
    .single();

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  try {
    assertForgeTenantCreated(company.id, slug);

    await provisionTenantDefaults(db, company.id, companyName, { mdEmail, odEmail }, productBundle);

    await writeForgeAuditLog(
      {
        actorEmail: input.actorEmail,
        actionType: 'FORGE_TENANT_PROVISIONED',
        targetCompanyId: company.id,
        details: {
          slug,
          companyName,
          productBundle,
        },
      },
      db,
    );

    return { success: true, companyId: company.id };
  } catch (error: unknown) {
    await db.from('companies').delete().eq('id', company.id);
    const message = error instanceof Error ? error.message : 'Tenant provisioning failed.';
    return { success: false, error: message };
  }
}
