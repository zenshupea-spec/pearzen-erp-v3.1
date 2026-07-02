import { NextResponse } from 'next/server';

import { resolveCompanyIdForSession } from '../../../../lib/company-context-server';
import {
  downloadBulkDataWorkbook,
  requireManagingDirector,
  type BulkWorkbookDownloadMode,
} from '../../../executive/settings/bulk-import-actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseMode(raw: string | null): BulkWorkbookDownloadMode | null {
  if (raw === 'export' || raw === 'template') return raw;
  return null;
}

async function assertBulkMigrationDownloadAccess(mode: BulkWorkbookDownloadMode) {
  const { supabase } = await requireManagingDirector();
  if (mode !== 'export') return;

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    throw new Error('Tenant context required. Sign in on your company subdomain.');
  }
}

/** Streams migration workbook bytes — avoids server-action payload limits on large rosters. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = parseMode(url.searchParams.get('mode'));
  if (!mode) {
    return NextResponse.json({ error: 'Query param mode must be export or template.' }, { status: 400 });
  }

  if (url.searchParams.get('check') === '1') {
    try {
      await assertBulkMigrationDownloadAccess(mode);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed.';
      const status = /signed in|Managing Director|Tenant context/i.test(message) ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  try {
    const { filename, base64 } = await downloadBulkDataWorkbook(mode);
    const bytes = Buffer.from(base64, 'base64');

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed.';
    const status = /signed in|Managing Director|Tenant context/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
