import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { CVS_COMPANY_ID } from './company-ids';
import { createForgeTenantRecord } from './forge-tenant-provision';

const hasServiceRole = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
);

function createTestServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function countCvsEmployees(db: SupabaseClient) {
  const { count, error } = await db
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

describe.skipIf(!hasServiceRole)(
  'createForgeTenantRecord integration (S-31)',
  () => {
    const createdCompanyIds: string[] = [];
    const slug = `forge-s31-${Date.now()}`;

    afterEach(async () => {
      if (!createdCompanyIds.length) return;
      const db = createTestServiceClient();
      for (const id of createdCompanyIds.splice(0)) {
        await db.from('companies').delete().eq('id', id);
      }
    });

    it('inserts a new tenant without changing CVS employee count', async () => {
      const db = createTestServiceClient();
      const before = await countCvsEmployees(db);

      const result = await createForgeTenantRecord(db, {
        companyName: 'FORGE S31 DEMO TENANT',
        slug,
        mdEmail: 'md-s31-demo@pearzen.test',
        odEmail: 'od-s31-demo@pearzen.test',
        mdRecoveryEmail: 'md-recovery-s31@pearzen.test',
        odRecoveryEmail: 'od-recovery-s31@pearzen.test',
        productBundle: 'wfm_only',
        actorEmail: 'forge-s31-test@pearzen.test',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      createdCompanyIds.push(result.companyId);
      expect(result.companyId).not.toBe(CVS_COMPANY_ID);

      const after = await countCvsEmployees(db);
      expect(after).toBe(before);

      const { data: row } = await db
        .from('companies')
        .select('id, slug')
        .eq('id', result.companyId)
        .maybeSingle();
      expect(row?.slug).toBe(slug);
    });

    it('rejects reserved CVS slug', async () => {
      const db = createTestServiceClient();
      const before = await countCvsEmployees(db);

      const result = await createForgeTenantRecord(db, {
        companyName: 'SHOULD FAIL',
        slug: 'cvs',
        mdEmail: 'md-blocked@pearzen.test',
        odEmail: 'od-blocked@pearzen.test',
        mdRecoveryEmail: 'md-blocked-recovery@pearzen.test',
        odRecoveryEmail: 'od-blocked-recovery@pearzen.test',
        actorEmail: 'forge-s31-test@pearzen.test',
      });

      expect(result.success).toBe(false);
      const after = await countCvsEmployees(db);
      expect(after).toBe(before);
    });
  },
);
