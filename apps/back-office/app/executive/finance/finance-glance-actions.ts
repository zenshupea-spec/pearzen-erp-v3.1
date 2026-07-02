'use server';

import { fetchShalomHostGlance as loadShalomHostGlance } from '../shalom-glance-actions';
import type { CafePortfolioGlance, ShalomHostGlance } from './finance-glance-types';

/** Thin server-action boundary — heavy café module loaded only on the server. */
export async function fetchCafePortfolioGlance(
  year: number,
  month: number,
): Promise<CafePortfolioGlance> {
  const mod = await import('../cafe/actions');
  return mod.fetchCafePortfolioGlance(year, month);
}

export async function fetchShalomHostGlance(
  year: number,
  month: number,
): Promise<ShalomHostGlance> {
  return loadShalomHostGlance(year, month);
}
