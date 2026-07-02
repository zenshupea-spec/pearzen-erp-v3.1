'use server';

import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';

export async function fetchExecutiveBrandTokensAction() {
  return loadExecutiveBrandTokens();
}
