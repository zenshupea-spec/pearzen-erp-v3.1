'use server';

import { revalidatePath } from 'next/cache';

import {
  COMPANY_SUBSCRIPTION_STATUSES,
  type CompanySubscriptionStatus,
  isCompanySubscriptionStatus,
  subscriptionStatusFromFlags,
} from '../../../lib/company-subscription';
import {
  setTenantSubscriptionStatus,
  syncTenantSubscriptionFromBilling,
} from '../../../lib/company-subscription-server';
import { isForgeOperatorEmail } from '../../../lib/forge-access';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import {
  emptyForgeTenantExecutives,
  isForgeExecutive2faTarget,
  mapCompanyExecutives,
  resolveTenantExecutiveTarget,
  type ForgeExecutive2faTarget,
  type ForgeTenantExecutives,
} from '../../../lib/forge-tenant-executive-portal';
import {
  hasValidForge2faSessionForUser,
  verifyForgeTotpStepUp,
} from '../../../lib/forge-portal-auth';
import { adminResetHeadOfficeTotp } from '../../../lib/head-office-portal-auth';
import {
  PRODUCT_BUNDLES,
  PRODUCT_BUNDLE_LABELS,
  type ProductBundle,
  isProductBundle,
} from '../../../lib/tenant-product-bundle';
import { setTenantProductBundle } from '../../../lib/tenant-product-bundle-server';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

export type ForgeTenantRow = {
  id: string;
  name: string;
  slug: string | null;
  subscriptionStatus: CompanySubscriptionStatus;
  productBundle: ProductBundle;
  isActive: boolean;
  isSuspended: boolean;
  hasCafeModule: boolean;
  createdAt: string;
  executives: ForgeTenantExecutives;
};

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

async function loadExecutivesForTenants(
  companyIds: string[],
): Promise<Map<string, ForgeTenantExecutives>> {
  const executivesByCompany = new Map<string, ForgeTenantExecutives>();
  for (const companyId of companyIds) {
    executivesByCompany.set(companyId, emptyForgeTenantExecutives());
  }
  if (companyIds.length === 0) return executivesByCompany;

  const db = createSupabaseServiceClient();
  const { data: employees, error } = await db
    .from('employees')
    .select('id, company_id, full_name, email, rank')
    .in('company_id', companyIds)
    .eq('group', 'HEAD_OFFICE')
    .in('rank', ['MD', 'OD'])
    .eq('status', 'ACTIVE');

  if (error) throw new Error(error.message);
  if (!employees?.length) return executivesByCompany;

  const employeeIds = employees.map((row) => String(row.id));
  const { data: portalAuthRows, error: portalAuthError } = await db
    .from('head_office_portal_auth')
    .select('employee_id, work_email, two_factor_enabled')
    .in('employee_id', employeeIds);

  if (portalAuthError) throw new Error(portalAuthError.message);

  const portalAuthByEmployee = new Map(
    (portalAuthRows ?? []).map((row) => [
      String(row.employee_id),
      {
        employee_id: String(row.employee_id),
        work_email:
          typeof row.work_email === 'string' ? row.work_email : null,
        two_factor_enabled: Boolean(row.two_factor_enabled),
      },
    ]),
  );

  for (const companyId of companyIds) {
    executivesByCompany.set(
      companyId,
      mapCompanyExecutives(companyId, employees, portalAuthByEmployee),
    );
  }

  return executivesByCompany;
}

async function assertForgeOperatorWith2faStepUp(totpCode: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    return { error: 'Forge operator access required.' } as const;
  }

  if (!(await hasValidForge2faSessionForUser(user.email, user.last_sign_in_at))) {
    return {
      error: 'Complete Forge 2FA verification before using SaaS recovery tools.',
    } as const;
  }

  if (!/^\d{6}$/.test(totpCode.trim())) {
    return { error: 'Enter the 6-digit code from your authenticator.' } as const;
  }

  const totp = await verifyForgeTotpStepUp(user.email, totpCode.trim());
  if (!totp.ok) {
    return { error: totp.error ?? 'Invalid authenticator code.' } as const;
  }

  return { operatorEmail: user.email } as const;
}

function mapTenantRow(
  row: Record<string, unknown>,
  executives: ForgeTenantExecutives,
): ForgeTenantRow {
  const rawStatus = String(row.subscription_status ?? '');
  const subscriptionStatus = isCompanySubscriptionStatus(rawStatus)
    ? rawStatus
    : subscriptionStatusFromFlags({
        isActive: row.is_active as boolean | null | undefined,
        isSuspended: row.is_suspended as boolean | null | undefined,
      });

  const rawBundle = String(row.product_bundle ?? 'full_erp');

  return {
    id: String(row.id),
    name: String(row.name ?? 'Unknown tenant'),
    slug: row.slug != null ? String(row.slug) : null,
    subscriptionStatus,
    productBundle: isProductBundle(rawBundle) ? rawBundle : 'full_erp',
    isActive: row.is_active !== false,
    isSuspended: Boolean(row.is_suspended),
    hasCafeModule: Boolean(row.has_cafe_module),
    createdAt: String(row.created_at ?? ''),
    executives,
  };
}

export async function fetchForgeTenants() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('companies')
      .select('id, name, slug, subscription_status, product_bundle, is_active, is_suspended, has_cafe_module, created_at')
      .neq('name', 'HQ_MASTER_ACCOUNT')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    const tenants = (data ?? []).map((row) =>
      mapTenantRow(row as Record<string, unknown>, emptyForgeTenantExecutives()),
    );

    await Promise.all(tenants.map((tenant) => syncTenantSubscriptionFromBilling(tenant.id)));

    const { data: refreshed, error: refreshError } = await supabase
      .from('companies')
      .select('id, name, slug, subscription_status, product_bundle, is_active, is_suspended, has_cafe_module, created_at')
      .neq('name', 'HQ_MASTER_ACCOUNT')
      .order('name', { ascending: true });

    if (refreshError) throw new Error(refreshError.message);

    const companyIds = (refreshed ?? []).map((row) => String(row.id));
    const executivesByCompany = await loadExecutivesForTenants(companyIds);

    return {
      success: true as const,
      tenants: (refreshed ?? []).map((row) => {
        const companyId = String(row.id);
        return mapTenantRow(
          row as Record<string, unknown>,
          executivesByCompany.get(companyId) ?? emptyForgeTenantExecutives(),
        );
      }),
      statusOptions: COMPANY_SUBSCRIPTION_STATUSES,
      bundleOptions: PRODUCT_BUNDLES,
      bundleLabels: PRODUCT_BUNDLE_LABELS,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tenants';
    return {
      success: false as const,
      error: message,
      tenants: [],
      statusOptions: COMPANY_SUBSCRIPTION_STATUSES,
      bundleOptions: PRODUCT_BUNDLES,
      bundleLabels: PRODUCT_BUNDLE_LABELS,
    };
  }
}

export async function updateForgeTenantProductBundle(
  companyId: string,
  bundle: ProductBundle,
) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    if (!companyId?.trim()) throw new Error('Missing company ID');
    if (!isProductBundle(bundle)) throw new Error('Invalid product bundle');

    const result = await setTenantProductBundle(companyId.trim(), bundle);
    if (!result.success) throw new Error(result.error);

    revalidatePath('/forge');
    revalidatePath('/forge/tenants');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update product bundle';
    return { success: false as const, error: message };
  }
}

export async function updateForgeTenantSubscriptionStatus(
  companyId: string,
  status: CompanySubscriptionStatus,
) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    if (!companyId?.trim()) throw new Error('Missing company ID');
    if (!isCompanySubscriptionStatus(status)) throw new Error('Invalid subscription status');

    const result = await setTenantSubscriptionStatus(companyId.trim(), status);
    if (!result.success) throw new Error(result.error);

    revalidatePath('/forge');
    revalidatePath('/forge/tenants');
    revalidatePath('/forge/billing');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update status';
    return { success: false as const, error: message };
  }
}

export async function forgeAdminClearTenantExecutive2faAction(
  companyId: string,
  target: ForgeExecutive2faTarget,
  totpCode: string,
) {
  try {
    assertServiceRoleConfigured();

    const gate = await assertForgeOperatorWith2faStepUp(totpCode);
    if ('error' in gate) {
      return { success: false as const, error: gate.error };
    }

    const scopedCompanyId = companyId?.trim();
    if (!scopedCompanyId) throw new Error('Missing company ID');
    if (!isForgeExecutive2faTarget(target)) throw new Error('Invalid executive target');

    const executivesByCompany = await loadExecutivesForTenants([scopedCompanyId]);
    const executives =
      executivesByCompany.get(scopedCompanyId) ?? emptyForgeTenantExecutives();
    const slot = resolveTenantExecutiveTarget(executives, target);

    if (!slot.employeeId) {
      return {
        success: false as const,
        error: `No ${target.toUpperCase()} executive found for this tenant.`,
      };
    }
    if (!slot.twoFactorEnabled) {
      return {
        success: false as const,
        error: `${target.toUpperCase()} does not have 2FA enabled.`,
      };
    }

    const reset = await adminResetHeadOfficeTotp(slot.employeeId);
    if (!reset.ok) {
      return { success: false as const, error: reset.error ?? 'Failed to clear 2FA.' };
    }

    const db = createSupabaseServiceClient();
    const { error: auditError } = await db.from('executive_audit_logs').insert({
      company_id: scopedCompanyId,
      actor_email: gate.operatorEmail,
      action_type: 'FORGE_ADMIN_CLEAR_EXECUTIVE_2FA',
      entity: 'HEAD_OFFICE_PORTAL_AUTH',
      details: {
        target,
        employeeId: slot.employeeId,
        executiveEmail: slot.email,
        clearedBy: gate.operatorEmail,
      },
    });

    if (auditError) {
      console.error('forgeAdminClearTenantExecutive2faAction audit:', auditError.message);
      return {
        success: false as const,
        error: '2FA was cleared but the audit ledger could not be updated.',
      };
    }

    revalidatePath('/forge/tenants');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear executive 2FA';
    return { success: false as const, error: message };
  }
}

export async function syncForgeTenantBillingStatus(companyId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    if (!companyId?.trim()) throw new Error('Missing company ID');

    const nextStatus = await syncTenantSubscriptionFromBilling(companyId.trim());

    revalidatePath('/forge/tenants');
    revalidatePath('/forge/billing');

    return { success: true as const, subscriptionStatus: nextStatus };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync billing status';
    return { success: false as const, error: message };
  }
}
