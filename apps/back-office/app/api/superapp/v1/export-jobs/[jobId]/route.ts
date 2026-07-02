import { NextResponse } from 'next/server';

import { assertSuperappServiceToken } from '../../../../../../lib/superapp-api-auth';
import {
  fetchSuperappExportJob,
  fetchSuperappStoreSnapshotById,
} from '../../../../../../lib/superapp-store-export';

type RouteContext = { params: Promise<{ jobId: string }> };

function invalidUuid(value: string): boolean {
  return !/^[0-9a-f-]{36}$/i.test(value);
}

/** GET — export job status (+ snapshot payload when completed). Requires ?companyId= match. */
export async function GET(request: Request, context: RouteContext) {
  const authError = assertSuperappServiceToken(request);
  if (authError) return authError;

  const { jobId } = await context.params;
  if (invalidUuid(jobId)) {
    return NextResponse.json({ error: 'invalid_job_id' }, { status: 400 });
  }

  const companyId = new URL(request.url).searchParams.get('companyId')?.trim() ?? '';
  if (!companyId || invalidUuid(companyId)) {
    return NextResponse.json(
      {
        error: 'company_id_required',
        message: 'Pass ?companyId=<tenant-uuid> matching the export job row.',
      },
      { status: 400 },
    );
  }

  const job = await fetchSuperappExportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  }

  if (job.companyId !== companyId) {
    return NextResponse.json(
      {
        error: 'company_mismatch',
        message: 'Job does not belong to the requested company.',
      },
      { status: 403 },
    );
  }

  const snapshot = job.snapshotId
    ? await fetchSuperappStoreSnapshotById(job.snapshotId)
    : null;

  if (snapshot && snapshot.companyId !== companyId) {
    return NextResponse.json(
      {
        error: 'company_mismatch',
        message: 'Snapshot does not belong to the requested company.',
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    job,
    snapshot: snapshot
      ? {
          id: snapshot.id,
          exportedAt: snapshot.payload.exportedAt,
          payloadVersion: snapshot.payloadVersion,
          payload: snapshot.payload,
        }
      : null,
  });
}
