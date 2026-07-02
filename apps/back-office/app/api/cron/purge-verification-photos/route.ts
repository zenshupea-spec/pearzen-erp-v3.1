import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/server';
import { purgeVerificationPhotos } from '../../../../../../packages/supabase/purge-verification-photos';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const result = await purgeVerificationPhotos(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purge failed';
    console.error('purge-verification-photos cron:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
