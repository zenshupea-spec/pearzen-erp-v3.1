import { NextResponse } from 'next/server';

import { payHereNotifyHash } from '../../../../../../packages/cafe-customer-order/payhere';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';

export async function POST(request: Request) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID?.trim();
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET?.trim();
  if (!merchantId || !merchantSecret) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const form = await request.formData();
  const orderId = String(form.get('order_id') ?? '').trim();
  const paymentId = String(form.get('payment_id') ?? '').trim();
  const amount = String(form.get('payhere_amount') ?? '').trim();
  const currency = String(form.get('payhere_currency') ?? '').trim();
  const statusCode = String(form.get('status_code') ?? '').trim();
  const md5sig = String(form.get('md5sig') ?? '').trim().toUpperCase();

  if (!orderId || !md5sig) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = payHereNotifyHash({
    merchantId,
    orderId,
    amount,
    currency,
    statusCode,
    merchantSecret,
  });

  if (expected !== md5sig) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  if (statusCode === '2') {
    const supabase = createSupabaseServiceClient();
    await supabase.rpc('confirm_cafe_order_payment', {
      p_order_id: orderId,
      p_gateway_payment_id: paymentId || null,
    });
  }

  return NextResponse.json({ ok: true });
}
