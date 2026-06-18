/** Normalize café customer phone for lookup (digits only). */
export function normalizeCafePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isCafePhoneLookupReady(phone: string): boolean {
  return normalizeCafePhone(phone).length >= 9;
}

export type CafeCustomerLookup = {
  customerName: string;
  discountPct: number;
  totalSpentLkr: number;
  orderCount: number;
};

/** Apply loyalty discount percentage to a cart total. */
export function applyCafeCustomerDiscount(totalLkr: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct));
  const discounted = totalLkr * (1 - pct / 100);
  return Math.round(discounted * 100) / 100;
}
