'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import { provisionTenantDefaults } from '../../../../../../packages/supabase/tenant-provisioning';
import { getForgeOperatorEmails, isForgeOperatorEmail } from '../../../../lib/forge-access';

type TenantPayload = {
  companyName: string;
  slug: string;
  mdEmail: string;
  odEmail: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export type CreateTenantResult =
  | { success: true; companyId: string }
  | { success: false; error: string };

export async function createNewTenant(payload: TenantPayload): Promise<CreateTenantResult> {
  const companyName = payload.companyName.trim().toUpperCase();
  const slug = payload.slug.trim().toLowerCase();
  const mdEmail = normalizeEmail(payload.mdEmail);
  const odEmail = normalizeEmail(payload.odEmail);

  if (!companyName || !slug) {
    return { success: false, error: 'Company name and slug are required.' };
  }
  if (!mdEmail || !odEmail) {
    return { success: false, error: 'MD and OD portal emails are required.' };
  }
  if (mdEmail === odEmail) {
    return { success: false, error: 'MD and OD must use different Google sign-in emails.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isForgeOperatorEmail(user.email))) {
    return { success: false, error: 'You are not authorised to provision tenants in Forge.' };
  }

  try {
    const db = createSupabaseServiceClient();

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
      .insert([
        {
          name: companyName,
          slug,
          is_suspended: false,
        },
      ])
      .select('id')
      .single();

    if (insertError) throw new Error(insertError.message);

    await provisionTenantDefaults(db, company.id, companyName, {
      mdEmail,
      odEmail,
    });

    revalidatePath('/forge');

    return { success: true, companyId: company.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Tenant creation failed.';
    console.error('❌ SUPABASE ERROR (Create Tenant):', message);
    return { success: false, error: message };
  }
}

export async function fetchDefaultOdEmail(): Promise<string> {
  const operators = await getForgeOperatorEmails();
  return operators[0] ?? '';
}
