/** SM trip row used for fuel surplus (Maps route km vs claimed km). */
export type SmFuelTripRow = {
  verification_status: string;
  km_claimed: number | null;
  route_km: number | null;
  fuel_amount: number | null;
};

/** Excess km on unverified trips — route_km from Maps; full claimed km when route missing. */
export function surplusKmForTrip(row: SmFuelTripRow): number {
  if (String(row.verification_status).toUpperCase() === 'APPROVED') return 0;

  const claimed = Number(row.km_claimed ?? 0);
  if (!Number.isFinite(claimed) || claimed <= 0) return 0;

  const route = Number(row.route_km ?? 0);
  if (!Number.isFinite(route) || route <= 0) return claimed;

  return Math.max(0, claimed - route);
}

/** LKR surplus recovered next period — prefers km delta × rate; falls back to logged fuel_amount. */
export function surplusLkrForTrip(row: SmFuelTripRow, fuelPerKmLkr: number): number {
  if (String(row.verification_status).toUpperCase() === 'APPROVED') return 0;

  const rate = Math.max(0, fuelPerKmLkr);
  const kmSurplus = surplusKmForTrip(row);
  const route = Number(row.route_km ?? 0);

  if (route > 0 && rate > 0 && kmSurplus > 0) {
    return Math.round(kmSurplus * rate);
  }

  const fuelAmount = Number(row.fuel_amount ?? 0);
  if (Number.isFinite(fuelAmount) && fuelAmount > 0) {
    return Math.round(fuelAmount);
  }

  if (rate > 0 && kmSurplus > 0) {
    return Math.round(kmSurplus * rate);
  }

  return 0;
}

export function totalFuelSurplusLkr(
  trips: SmFuelTripRow[],
  fuelPerKmLkr: number,
): number {
  return trips.reduce((sum, row) => sum + surplusLkrForTrip(row, fuelPerKmLkr), 0);
}

/** Net fuel advance issued in month M+1 after prior-month surplus clawback. */
export function netSmFuelAdvanceLkr(
  grossAdvanceLkr: number,
  priorMonthSurplusLkr: number,
  fuelSurplusCorrection: boolean,
): { grossAdvanceLkr: number; clawbackLkr: number; netAdvanceLkr: number; excessClawbackLkr: number } {
  const gross = Math.max(0, Math.round(grossAdvanceLkr));
  const clawback = fuelSurplusCorrection ? Math.max(0, Math.round(priorMonthSurplusLkr)) : 0;
  const netAdvanceLkr = Math.max(0, gross - clawback);
  const excessClawbackLkr = Math.max(0, clawback - gross);
  return { grossAdvanceLkr: gross, clawbackLkr: clawback, netAdvanceLkr, excessClawbackLkr };
}
