import { NextResponse } from 'next/server';

import { createShalomPayHereCheckoutSession } from '../../../../lib/shalom-public-payhere-server';

export async function POST(request: Request) {
  let bookingId = '';
  try {
    const body = (await request.json()) as { bookingId?: string };
    bookingId = body.bookingId?.trim() ?? '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const result = await createShalomPayHereCheckoutSession(bookingId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    fields: result.fields,
    sandbox: result.sandbox,
  });
}
