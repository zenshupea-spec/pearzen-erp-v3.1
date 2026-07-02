import { NextResponse } from 'next/server';

import {
  assertMapsApiAccess,
  resolveGoogleMapsBrowserKey,
} from '../../../lib/maps-api-access';

/** Staff-only Maps JS key — R-MAPS-01 (never expose server-only env). */
export async function GET() {
  const access = await assertMapsApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = resolveGoogleMapsBrowserKey();
  if (!key) {
    return NextResponse.json({ key: null }, { status: 404 });
  }

  return NextResponse.json({ key });
}
