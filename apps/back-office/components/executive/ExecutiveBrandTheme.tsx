'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import {
  cvsBrandTokensToCssProperties,
  DEFAULT_CVS_BRAND_TOKENS,
  type CvsBrandTokens,
} from '../../lib/cvs-brand-tokens';
import { fetchExecutiveBrandTokensAction } from '../../app/executive/brand-theme-actions';

export function ExecutiveBrandThemeProvider({
  initialTokens,
  children,
}: {
  initialTokens?: CvsBrandTokens;
  children: ReactNode;
}) {
  const [tokens, setTokens] = useState<CvsBrandTokens>(
    initialTokens ?? DEFAULT_CVS_BRAND_TOKENS,
  );

  const refreshTokens = useCallback(() => {
    fetchExecutiveBrandTokensAction()
      .then(setTokens)
      .catch(() => {
        /* keep prior tokens */
      });
  }, []);

  useEffect(() => {
    const onBrandUpdated = () => refreshTokens();
    window.addEventListener('executive-brand-updated', onBrandUpdated);
    window.addEventListener('storage', onBrandUpdated);
    return () => {
      window.removeEventListener('executive-brand-updated', onBrandUpdated);
      window.removeEventListener('storage', onBrandUpdated);
    };
  }, [refreshTokens]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      style={cvsBrandTokensToCssProperties(tokens)}
      data-cvs-brand-source={tokens.source}
    >
      {children}
    </div>
  );
}
