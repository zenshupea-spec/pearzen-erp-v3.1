import { NextResponse } from 'next/server';

import {
  formatPayHereAmount,
  payHereCheckoutHash,
  type PayHereCheckoutFields,
} from '../../../../../../packages/cafe-customer-order/payhere';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';

function menuBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CUSTOMER_MENU_URL?.trim() ||
    process.env.NEXT_PUBLIC_CLIENT_PWA_URL?.trim() ||
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '');
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Customer', last: 'Guest' };
  if (parts.length === 1) return { first: parts[0], last: 'Customer' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export async function POST(request: Request) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID?.trim();
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET?.trim();
  if (!merchantId || !merchantSecret) {
    return NextResponse.json(
      { ok: false, error: 'Card payments are not configured yet. Please contact the café.' },
      { status: 503 },
    );
  }

  let orderId = '';
  try {
    const body = (await request.json()) as { orderId?: string };
    orderId = body.orderId?.trim() ?? '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'Order id required.' }, { status: 400 });
  }

  const companyId = process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim();
  const supabase = createSupabaseServiceClient();
  const { data: order, error } = await supabase
    .from('cafe_customer_orders')
    .select(
      'id, company_id, customer_name, customer_phone, delivery_address, total_lkr, status, payment_status, fulfillment_type, items',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 404 });
  }

  if (companyId && order.company_id !== companyId) {
    return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 404 });
  }

  if (order.status !== 'PLACED' || order.payment_status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'This order is not awaiting payment.' }, { status: 409 });
  }

  const amount = formatPayHereAmount(Number(order.total_lkr) || 0);
  const currency = 'LKR';
  const { first, last } = splitName(order.customer_name ?? '');
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSummary =
    items.length > 0
      ? items
          .map((row: { name?: string; qty?: number }) => `${row.qty ?? 1}× ${row.name ?? 'Item'}`)
          .join(', ')
      : 'Café order';

  const base = menuBaseUrl();
  const fields: PayHereCheckoutFields = {
    merchant_id: merchantId,
    return_url: `${base}/order/complete?order_id=${orderId}`,
    cancel_url: `${base}/order/cancelled?order_id=${orderId}`,
    notify_url: `${base}/api/payhere/notify`,
    order_id: orderId,
    items: itemSummary.slice(0, 250),
    currency,
    amount,
    first_name: first.slice(0, 50),
    last_name: last.slice(0, 50),
    email: 'orders@tasha.lk',
    phone: String(order.customer_phone ?? '').slice(0, 20),
    address: String(order.delivery_address ?? 'Colombo').slice(0, 100),
    city: 'Colombo',
    country: 'Sri Lanka',
    hash: payHereCheckoutHash({
      merchantId,
      orderId,
      amount,
      currency,
      merchantSecret,
    }),
  };

  const sandbox = process.env.PAYHERE_SANDBOX !== 'false';

  return NextResponse.json({ ok: true, fields, sandbox });
}
