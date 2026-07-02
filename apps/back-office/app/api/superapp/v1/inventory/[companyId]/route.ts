import { NextResponse } from 'next/server';

import { assertSuperappServiceToken } from '../../../../../../lib/superapp-api-auth';
import { superappExportErrorStatus } from '../../../../../../lib/superapp-listing-consent';
import {
  buildSuperappInventoryPayload,
  parseSuperappInventoryVerticals,
} from '../../../../../../lib/superapp-inventory-export';

type RouteContext = { params: Promise<{ companyId: string }> };

function invalidCompanyId(companyId: string): boolean {
  return !/^[0-9a-f-]{36}$/i.test(companyId);
}

/** GET — published café menu, retail, and salon inventory for Pears (read-only). */
export async function GET(request: Request, context: RouteContext) {
  const authError = assertSuperappServiceToken(request);
  if (authError) return authError;

  const { companyId } = await context.params;
  if (invalidCompanyId(companyId)) {
    return NextResponse.json({ error: 'invalid_company_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const verticals = parseSuperappInventoryVerticals(url.searchParams.get('vertical'));

  try {
    const payload = await buildSuperappInventoryPayload({ companyId, verticals });
    return NextResponse.json({
      source: 'live',
      exportedAt: payload.exportedAt,
      payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory';
    return NextResponse.json(
      { error: 'inventory_failed', message },
      { status: superappExportErrorStatus(message) },
    );
  }
}
