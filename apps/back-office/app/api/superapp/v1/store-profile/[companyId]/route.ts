import { NextResponse } from 'next/server';

import {
  assertSuperappListingConsentForExport,
  superappExportErrorStatus,
} from '../../../../../../lib/superapp-listing-consent';
import { assertSuperappServiceToken } from '../../../../../../lib/superapp-api-auth';
import {
  buildSuperappStoreProfilePayload,
  fetchLatestSuperappStoreSnapshot,
  runSuperappStoreProfileExport,
} from '../../../../../../lib/superapp-store-export';

type RouteContext = { params: Promise<{ companyId: string }> };

function invalidCompanyId(companyId: string): boolean {
  return !/^[0-9a-f-]{36}$/i.test(companyId);
}

async function ensureListingConsent(companyId: string): Promise<NextResponse | null> {
  try {
    await assertSuperappListingConsentForExport(companyId);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Listing consent required.';
    return NextResponse.json(
      { error: 'listing_consent_required', message },
      { status: superappExportErrorStatus(message) },
    );
  }
}

/** GET — latest stored snapshot, or live payload when ?mode=live */
export async function GET(request: Request, context: RouteContext) {
  const authError = assertSuperappServiceToken(request);
  if (authError) return authError;

  const { companyId } = await context.params;
  if (invalidCompanyId(companyId)) {
    return NextResponse.json({ error: 'invalid_company_id' }, { status: 400 });
  }

  const consentError = await ensureListingConsent(companyId);
  if (consentError) return consentError;

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  if (mode === 'live') {
    try {
      const payload = await buildSuperappStoreProfilePayload(companyId);
      return NextResponse.json({
        source: 'live',
        snapshotId: null,
        exportedAt: payload.exportedAt,
        payload,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to build store profile';
      return NextResponse.json(
        { error: 'export_failed', message },
        { status: superappExportErrorStatus(message) },
      );
    }
  }

  const snapshot = await fetchLatestSuperappStoreSnapshot(companyId);
  if (!snapshot) {
    return NextResponse.json(
      {
        error: 'snapshot_not_found',
        message:
          'No store profile snapshot exists for this tenant. Run an export from Forge or POST to this endpoint.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    source: 'snapshot',
    snapshotId: snapshot.id,
    exportedAt: snapshot.payload.exportedAt,
    payloadVersion: snapshot.payloadVersion,
    payload: snapshot.payload,
  });
}

/** POST — run store profile export job (Pears sync / cron) */
export async function POST(request: Request, context: RouteContext) {
  const authError = assertSuperappServiceToken(request);
  if (authError) return authError;

  const { companyId } = await context.params;
  if (invalidCompanyId(companyId)) {
    return NextResponse.json({ error: 'invalid_company_id' }, { status: 400 });
  }

  const consentError = await ensureListingConsent(companyId);
  if (consentError) return consentError;

  try {
    const result = await runSuperappStoreProfileExport({
      companyId,
      requestedBy: 'superapp_api',
      requireConsent: false,
    });

    return NextResponse.json({
      jobId: result.job.id,
      status: result.job.status,
      snapshotId: result.snapshot.id,
      exportedAt: result.snapshot.payload.exportedAt,
      payload: result.snapshot.payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json(
      { error: 'export_failed', message },
      { status: superappExportErrorStatus(message) },
    );
  }
}
