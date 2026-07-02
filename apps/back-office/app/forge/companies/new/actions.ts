'use server';

import { revalidatePath } from 'next/cache';

import { validateExecutiveRecoveryEmail } from '../../../../lib/head-office-portal-recovery-email';
import { upsertExecutivePortalRecoveryEmail } from '../../../../lib/head-office-portal-auth';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';
import { getForgeOperatorEmails, isForgeOperatorEmail } from '../../../../lib/forge-access';
import { assertForgeOperator } from '../../../../lib/forge-operator-server';
import {
  createForgeTenantRecord,
  type ForgeTenantProvisionResult,
} from '../../../../lib/forge-tenant-provision';

type TenantPayload = {
  companyName: string;
  slug: string;
  mdEmail: string;
  odEmail: string;
  mdRecoveryEmail: string;
  odRecoveryEmail: string;
  productBundle?: 'full_erp' | 'wfm_only';
};

export type CreateTenantResult = ForgeTenantProvisionResult;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function seedExecutiveRecoveryEmails(
  companyId: string,
  mdEmail: string,
  odEmail: string,
  mdRecoveryEmail: string,
  odRecoveryEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mdRecoveryCheck = validateExecutiveRecoveryEmail(mdEmail, mdRecoveryEmail);
  if (!mdRecoveryCheck.ok) {
    return { ok: false, error: `MD recovery email: ${mdRecoveryCheck.error}` };
  }
  const odRecoveryCheck = validateExecutiveRecoveryEmail(odEmail, odRecoveryEmail);
  if (!odRecoveryCheck.ok) {
    return { ok: false, error: `OD recovery email: ${odRecoveryCheck.error}` };
  }

  const db = createSupabaseServiceClient();
  for (const [empNumber, workEmail, recoveryEmail] of [
    ['MD-001', mdEmail, mdRecoveryCheck.recoveryEmail],
    ['OD-001', odEmail, odRecoveryCheck.recoveryEmail],
  ] as const) {
    const { data: employee } = await db
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('emp_number', empNumber)
      .maybeSingle();
    if (!employee?.id) continue;
    const seeded = await upsertExecutivePortalRecoveryEmail(
      String(employee.id),
      workEmail,
      recoveryEmail,
    );
    if (!seeded.ok) {
      return { ok: false, error: seeded.error ?? `Failed to seed recovery email for ${empNumber}.` };
    }
  }

  return { ok: true };
}

export async function createNewTenant(payload: TenantPayload): Promise<CreateTenantResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    return { success: false, error: 'You are not authorised to provision tenants in Forge.' };
  }

  const mdEmail = normalizeEmail(payload.mdEmail);
  const odEmail = normalizeEmail(payload.odEmail);
  const mdRecoveryEmail = normalizeEmail(payload.mdRecoveryEmail);
  const odRecoveryEmail = normalizeEmail(payload.odRecoveryEmail);

  const db = createSupabaseServiceClient();
  const result = await createForgeTenantRecord(db, {
    ...payload,
    mdEmail,
    odEmail,
    mdRecoveryEmail,
    odRecoveryEmail,
    actorEmail: user.email,
  });

  if (!result.success) {
    console.error('❌ SUPABASE ERROR (Create Tenant):', result.error);
    return result;
  }

  const recovery = await seedExecutiveRecoveryEmails(
    result.companyId,
    mdEmail,
    odEmail,
    mdRecoveryEmail,
    odRecoveryEmail,
  );

  if (!recovery.ok) {
    await db.from('companies').delete().eq('id', result.companyId);
    return { success: false, error: recovery.error };
  }

  revalidatePath('/forge');
  revalidatePath('/forge/tenants');
  revalidatePath('/forge/companies/new');

  return result;
}

export async function fetchDefaultOdEmail(): Promise<string> {
  await assertForgeOperator();
  const operators = await getForgeOperatorEmails();
  return operators[0] ?? '';
}
