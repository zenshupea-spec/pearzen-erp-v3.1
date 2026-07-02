'use client';

import type { PayHereCheckoutFields } from '../../../../packages/cafe-customer-order/payhere';
import { payHereCheckoutUrl } from '../../../../packages/cafe-customer-order/payhere';

export async function startShalomPayHereCheckout(
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/shalom-public/payhere-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId }),
  });

  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    fields?: PayHereCheckoutFields;
    sandbox?: boolean;
  };

  if (!res.ok || !body.ok || !body.fields) {
    return { ok: false, error: body.error ?? 'Could not start card payment.' };
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = payHereCheckoutUrl(Boolean(body.sandbox));
  form.style.display = 'none';

  for (const [key, value] of Object.entries(body.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  return { ok: true };
}
