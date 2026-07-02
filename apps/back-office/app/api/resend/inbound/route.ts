import { NextResponse } from 'next/server';

import {
  processResendInboundWebhook,
  verifyResendWebhook,
} from '../../../../lib/forge-contact-inbox';

/** Resend inbound email webhook — receives mail sent to info@pearzen.tech. */
export async function POST(request: Request) {
  const payload = await request.text();

  if (!verifyResendWebhook(payload, request.headers)) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await processResendInboundWebhook(
    event as Parameters<typeof processResendInboundWebhook>[0],
  );

  if (!result.ok) {
    console.error('resend inbound webhook:', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, skipped: result.skipped ?? false });
}
