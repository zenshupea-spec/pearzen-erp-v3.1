'use server';

import type { CafePortfolioGlance, ShalomHostGlance } from './finance-glance-types';

/** Thin server-action boundary — heavy café module loaded only on the server. */
export async function fetchCafePortfolioGlance(): Promise<CafePortfolioGlance> {
  const mod = await import('../cafe/actions');
  return mod.fetchCafePortfolioGlance();
}

/** Thin server-action boundary — Shalom module loaded only on the server. */
export async function fetchShalomHostGlance(
  year: number,
  month: number,
): Promise<ShalomHostGlance> {
  const mod = await import('../shalom-actions');
  return mod.fetchShalomHostGlance(year, month);
}
