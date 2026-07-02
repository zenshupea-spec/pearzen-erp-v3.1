'use server';

import { revalidatePath } from 'next/cache';

import { setForgeAnchorTenantId } from '../../../../lib/forge-anchor-tenant-server';
import { assertForgeOperator } from '../../../../lib/forge-operator-server';
import {
  listSuperappExportCompanies,
  listSuperappExportJobs,
  runSuperappStoreProfileExport,
  type SuperappExportJobRecord,
} from '../../../../lib/superapp-store-export';
import {
  anchorPearsBundleJson,
  buildAnchorPearsExportBundleFromLatest,
  getSuperappAnchorReference,
  seedAnchorPearsExportProfile,
  type SuperappPearsExportBundle,
} from '../../../../lib/superapp-anchor-tenant';

export type SuperappExportCompanyRow = {
  id: string;
  name: string;
  slug: string | null;
  latestSnapshotAt: string | null;
};

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

export async function fetchSuperappExportsDashboard() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const [companies, jobs, anchorBundle, anchorReference] = await Promise.all([
      listSuperappExportCompanies(),
      listSuperappExportJobs(40),
      buildAnchorPearsExportBundleFromLatest(),
      getSuperappAnchorReference(),
    ]);

    return {
      success: true as const,
      companies,
      jobs,
      apiConfigured: Boolean(process.env.SUPERAPP_EXPORT_SERVICE_TOKEN?.trim()),
      anchorCompanyId: anchorReference?.companyId ?? null,
      anchorBundle,
      anchorReference,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load super-app exports';
    return {
      success: false as const,
      error: message,
      companies: [] as SuperappExportCompanyRow[],
      jobs: [] as SuperappExportJobRecord[],
      apiConfigured: Boolean(process.env.SUPERAPP_EXPORT_SERVICE_TOKEN?.trim()),
      anchorCompanyId: null as string | null,
      anchorBundle: null as SuperappPearsExportBundle | null,
      anchorReference: null,
    };
  }
}

export async function updateForgeAnchorTenantAction(companyId: string) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();
    if (!companyId?.trim()) throw new Error('Select an anchor tenant.');

    await setForgeAnchorTenantId(companyId.trim());

    revalidatePath('/forge/superapp/exports');

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update anchor tenant';
    return { success: false as const, error: message };
  }
}

export async function seedAnchorPearsExportAction() {
  try {
    assertServiceRoleConfigured();
    const operatorEmail = await assertForgeOperator();

    const bundle = await seedAnchorPearsExportProfile({ operatorEmail });

    revalidatePath('/forge/superapp/exports');

    return {
      success: true as const,
      bundle,
      json: anchorPearsBundleJson(bundle),
      filename: `${bundle.tenantSlug}-pears-export-${bundle.seededAt.slice(0, 10)}.json`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    return { success: false as const, error: message };
  }
}

export async function runSuperappStoreProfileExportAction(companyId: string) {
  try {
    assertServiceRoleConfigured();
    const operatorEmail = await assertForgeOperator();
    if (!companyId?.trim()) throw new Error('Missing company ID');

    const result = await runSuperappStoreProfileExport({
      companyId: companyId.trim(),
      requestedBy: operatorEmail,
    });

    revalidatePath('/forge/superapp/exports');

    return {
      success: true as const,
      jobId: result.job.id,
      snapshotId: result.snapshot.id,
      exportedAt: result.snapshot.payload.exportedAt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return { success: false as const, error: message };
  }
}
