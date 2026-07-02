'use server';

import { PEARS_APP_FUTURE_HOST } from '../../../lib/pears-host';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import { listSuperappExportJobs, type SuperappExportJobRecord } from '../../../lib/superapp-store-export';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

type PearsAppSummary = {
  futureHost: string;
  listingCount: number;
  snapshotTenantCount: number;
  lastJob: SuperappExportJobRecord | null;
  apiConfigured: boolean;
};

export async function fetchPearsAppSummary() {
  try {
    await assertForgeOperator();
    const supabase = createSupabaseServiceClient();

    const [jobs, consentResult, snapshotResult] = await Promise.all([
      listSuperappExportJobs(1),
      supabase
        .from('superapp_listing_consent')
        .select('company_id, consented_at, list_products, list_booking'),
      supabase.from('superapp_store_snapshots').select('company_id'),
    ]);

    if (consentResult.error && consentResult.error.code !== '42P01') {
      throw new Error(consentResult.error.message);
    }
    if (snapshotResult.error && snapshotResult.error.code !== '42P01') {
      throw new Error(snapshotResult.error.message);
    }

    const listingCount = (consentResult.data ?? []).filter(
      (row) =>
        row.consented_at != null && (Boolean(row.list_products) || Boolean(row.list_booking)),
    ).length;

    const snapshotTenantCount = new Set(
      (snapshotResult.data ?? []).map((row) => String(row.company_id)),
    ).size;

    return {
      success: true as const,
      summary: {
        futureHost: PEARS_APP_FUTURE_HOST,
        listingCount,
        snapshotTenantCount,
        lastJob: jobs[0] ?? null,
        apiConfigured: Boolean(process.env.SUPERAPP_EXPORT_SERVICE_TOKEN?.trim()),
      } satisfies PearsAppSummary,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PEARS summary';
    return {
      success: false as const,
      error: message,
      summary: {
        futureHost: PEARS_APP_FUTURE_HOST,
        listingCount: 0,
        snapshotTenantCount: 0,
        lastJob: null,
        apiConfigured: Boolean(process.env.SUPERAPP_EXPORT_SERVICE_TOKEN?.trim()),
      } satisfies PearsAppSummary,
    };
  }
}
