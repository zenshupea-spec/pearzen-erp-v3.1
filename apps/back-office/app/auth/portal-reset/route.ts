import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseRouteClient } from '../../../../../packages/supabase/route';
import { clearHeadOfficePortalSessionOnResponse } from '../../../lib/head-office-portal-sign-out';

export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get('next') ?? '/login/hq';
  const nextPath =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/login/hq';

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  clearHeadOfficePortalSessionOnResponse(response);

  const supabase = createSupabaseRouteClient(request, response);
  await supabase.auth.signOut();

  return response;
}
