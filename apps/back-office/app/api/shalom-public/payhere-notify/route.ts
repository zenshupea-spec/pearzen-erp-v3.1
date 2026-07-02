import { NextResponse } from 'next/server';

import { handleShalomPayHereNotify } from '../../../../lib/shalom-public-payhere-notify-server';

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await handleShalomPayHereNotify(form);
  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    confirmed: result.confirmed,
    idempotent: result.idempotent ?? false,
  });
}
