import { createHash } from 'node:crypto';

export type PayHereCheckoutFields = {
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  currency: string;
  amount: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  hash: string;
};

export function formatPayHereAmount(lkr: number): string {
  return lkr.toFixed(2);
}

export function payHereCheckoutHash(input: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  merchantSecret: string;
}): string {
  const secretHash = createHash('md5').update(input.merchantSecret).digest('hex').toUpperCase();
  const raw = `${input.merchantId}${input.orderId}${input.amount}${input.currency}${secretHash}`;
  return createHash('md5').update(raw).digest('hex').toUpperCase();
}

export function payHereNotifyHash(input: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  statusCode: string;
  merchantSecret: string;
}): string {
  const secretHash = createHash('md5').update(input.merchantSecret).digest('hex').toUpperCase();
  const raw = `${input.merchantId}${input.orderId}${input.amount}${input.currency}${input.statusCode}${secretHash}`;
  return createHash('md5').update(raw).digest('hex').toUpperCase();
}

export function payHereCheckoutUrl(sandbox: boolean): string {
  return sandbox
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';
}
